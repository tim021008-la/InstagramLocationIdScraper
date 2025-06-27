/**
 * @fileoverview A Node.js script to recursively scrape Instagram location data using Puppeteer.
 *
 * This script automates the process of:
 * 1. Launching a headless Chromium browser.
 * 2. Checking for a previously saved session file to resume scraping.
 * 3. Systematically navigating through all pagination links (e.g., ?page=2, ?page=3).
 * 4. Scraping the URLs for all cities found across all pages.
 * 5. Visiting each city URL one by one.
 * 6. For each city, repeating the pagination process to find all specific locations.
 * 7. Scraping the name and URL of each specific location.
 * 8. Aggregating all the collected data into a structured JSON object.
 * 9. Saving the final data to a local file upon completion or if a fatal error occurs.
 *
 * @author tim021008-la
 * @version 1.1.0
 *
 * @requires puppeteer - For browser automation and web scraping.
 * @requires fs - Node.js built-in module for file system operations (e.g., writing files).
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

// --- SCRIPT CONFIGURATION ---

// The starting point for the scraper. This should be a country-level "explore locations" URL.
const START_URL = 'https://www.instagram.com/explore/locations/DE/germany/';

// The name of the file where the final JSON data will be saved.
const OUTPUT_FILE = 'instagram_locations.json';

// A setting to limit the number of cities to scrape. Useful for quick tests and to avoid being rate-limited.
// Set this to `null` to disable the limit and scrape all cities found.
const CITY_LIMIT = null; // Set back to null for a full run, or a number for testing.

/**
 * A utility function to pause the script's execution for a random amount of time.
 * @param {number} minMs - The minimum number of milliseconds to wait.
 * @param {number} maxMs - The maximum number of milliseconds to wait.
 * @returns {Promise<void>}
 */
function sleep(minMs, maxMs) {
    const duration = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    console.log(`[INFO] Waiting for ${(duration / 1000).toFixed(1)} seconds...`);
    return new Promise(resolve => setTimeout(resolve, duration));
}


/**
 * A generic function to scrape data from a paginated source with retries and delays.
 * It navigates through ?page=1, ?page=2, etc., until no new data is found.
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance.
 * @param {string} baseUrl - The base URL for the pages to scrape.
 * @param {Function} extractDataOnPage - A function to be executed in the browser context to extract data from a single page.
 * @returns {Promise<any[]>} A promise that resolves to an array of all unique items found.
 */
async function scrapeAllPages(browser, baseUrl, extractDataOnPage) {
    let currentPage = 1;
    let keepGoing = true;
    const allItems = new Set();
    const collectedItems = [];
    const maxRetries = 3;

    while (keepGoing) {
        const urlToScrape = `${baseUrl.replace(/\/$/, '')}/?page=${currentPage}`;
        let success = false;
        let attempts = 0;

        while (!success && attempts < maxRetries) {
            attempts++;
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            
            try {
                console.log(`[INFO] Scraping page: ${urlToScrape} (Attempt ${attempts})`);
                await page.goto(urlToScrape, { waitUntil: 'networkidle2', timeout: 90000 }); // Increased timeout
                const itemsOnPage = await page.evaluate(extractDataOnPage, baseUrl);
                success = true; // If we get here, the page loaded successfully.

                if (itemsOnPage.length === 0) {
                    keepGoing = false;
                } else {
                    let newItemsFoundCount = 0;
                    itemsOnPage.forEach(item => {
                        const itemKey = JSON.stringify(item);
                        if (!allItems.has(itemKey)) {
                            allItems.add(itemKey);
                            collectedItems.push(item);
                            newItemsFoundCount++;
                        }
                    });
                    
                    if (newItemsFoundCount === 0) {
                        console.log('[INFO] No new items found on this page. Ending pagination.');
                        keepGoing = false;
                    } else {
                        currentPage++;
                    }
                }
            } catch (error) {
                console.error(`[ERROR] Attempt ${attempts} failed for ${urlToScrape}. Reason: ${error.message}`);
                if (attempts >= maxRetries) {
                    // Throw an error to be caught by the main try/catch block, which will save progress and exit.
                    throw new Error(`All ${maxRetries} attempts failed for ${urlToScrape}. Aborting script.`);
                } else {
                    // Exponential backoff: wait longer after each failed attempt.
                    const baseDelay = 2000; // 2 seconds
                    const exponentialDelay = baseDelay * Math.pow(2, attempts - 1);
                    console.log(`[INFO] Implementing exponential backoff for retry...`);
                    // Wait for the calculated delay plus a random "jitter" of up to 1 second
                    await sleep(exponentialDelay, exponentialDelay + 1000);
                }
            } finally {
                await page.close();
            }
        }
        if (keepGoing) {
             // Add a delay between successful page scrapes to be polite
            await sleep(2000, 5000);
        }
    }
    return collectedItems;
}

/**
 * Scrapes all city URLs from the main country page by handling pagination.
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance.
 * @returns {Promise<string[]>} A promise that resolves to an array of unique city URLs.
 */
async function scrapeCityUrls(browser) {
    console.log(`[INFO] Starting to scrape all city pages from: ${START_URL}`);
    
    // This function will be executed in the browser to extract city URLs from one page.
    const extractCities = (countryUrl) => {
        const urls = [];
        const anchors = document.querySelectorAll('main a');
        anchors.forEach(anchor => {
            if (anchor.href && anchor.href.startsWith('https://www.instagram.com/explore/locations/') && anchor.href !== countryUrl) {
                urls.push(anchor.href);
            }
        });
        return urls;
    };
    
    const cityUrls = await scrapeAllPages(browser, START_URL, extractCities);

    console.log(`[SUCCESS] Found ${cityUrls.length} unique city links across all pages.`);
    return cityUrls;
}

/**
 * Scrapes all specific location details for a given city page by handling pagination.
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance.
 * @param {string} cityUrl - The base URL of the city page to scrape.
 * @returns {Promise<object[]>} A promise that resolves to an array of location objects ({name, url}).
 */
async function scrapeLocationsForCity(browser, cityUrl) {
    console.log(`\n--- Scraping All Pages for City: ${cityUrl} ---`);
    
    // This function will be executed in the browser to extract location details from one page.
    const extractLocations = () => {
        const data = [];
        const anchors = document.querySelectorAll('main a');
        anchors.forEach(anchor => {
            const name = anchor.textContent.trim();
            const url = anchor.href;

            if (name && url && url.startsWith('https://www.instagram.com/explore/locations/')) {
                data.push({ name, url });
            }
        });
        return data;
    };

    const locations = await scrapeAllPages(browser, cityUrl, extractLocations);

    console.log(`[SUCCESS] Found ${locations.length} unique locations in this city.`);
    return locations;
}

/**
 * The main orchestrator function. It controls the entire scraping workflow from start to finish.
 */
async function main() {
    console.log('[START] Launching scraping process...');

    let finalData = {};
    // Check if a progress file exists to resume from a previous session.
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            console.log(`[INFO] Found existing data file. Attempting to resume session...`);
            const savedData = fs.readFileSync(OUTPUT_FILE, 'utf8');
            finalData = JSON.parse(savedData);
            console.log(`[INFO] Successfully loaded ${Object.keys(finalData).length} previously scraped cities.`);
        } catch (e) {
            console.error(`[ERROR] Could not parse existing data file. Starting fresh.`, e);
            finalData = {};
        }
    }

    // Add `--no-sandbox` and `--disable-setuid-sandbox` arguments for running in a container or as root.
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    try {
        // Step 1: Get all city URLs by processing all paginated results.
        let allCityUrls = await scrapeCityUrls(browser);
        
        // Filter out cities that have already been scraped in a previous session.
        const previouslyScrapedCityNames = Object.keys(finalData);
        let cityUrlsToScrape = allCityUrls.filter(url => {
            const urlParts = url.split('/').filter(Boolean);
            const cityName = urlParts[urlParts.length - 1];
            return !previouslyScrapedCityNames.includes(cityName);
        });
        console.log(`[INFO] Total cities found: ${allCityUrls.length}. Cities remaining to scrape: ${cityUrlsToScrape.length}`);


        // Step 2: Apply the CITY_LIMIT if it's set.
        if (CITY_LIMIT && cityUrlsToScrape.length > CITY_LIMIT) {
            console.warn(`[WARN] Limiting scrape to the first ${CITY_LIMIT} remaining cities as configured.`);
            cityUrlsToScrape = cityUrlsToScrape.slice(0, CITY_LIMIT);
        }

        // Step 3: Loop through each city URL and scrape all its locations via pagination.
        let cityCounter = 0;
        for (const cityUrl of cityUrlsToScrape) {
            cityCounter++;
            console.log(`\n[PROGRESS] Scraping city ${cityCounter} of ${cityUrlsToScrape.length}...`);
            const urlParts = cityUrl.split('/').filter(Boolean);
            const cityName = urlParts[urlParts.length - 1];

            const locations = await scrapeLocationsForCity(browser, cityUrl);
            finalData[cityName] = locations;

             // Add a delay before moving to the next city
            if (cityCounter < cityUrlsToScrape.length) {
                await sleep(3000, 6000);
            }
        }

        // Step 4: Save the completed data structure to a JSON file.
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
        console.log(`\n[COMPLETE] Scraping finished. All data saved to ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('\n[FATAL] A critical error occurred during the scraping process. Saving progress...');
        // In case of a fatal crash, save whatever data has been collected so far.
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
        console.log(`[INFO] Progress saved to ${OUTPUT_FILE}. You can restart the script to resume.`);
        console.error(error.message);
    } finally {
        await browser.close();
        console.log('[END] Browser closed.');
    }
}

// Execute the main function to start the script.
main();
