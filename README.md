Instagram Location Scraper Documentation
========================================

**Version:** 1.0.0

**Author:** tim021008-la

### **1\. Overview**

This Node.js script is a powerful and resilient web scraper designed to recursively collect location data from Instagram's "Explore Locations" pages. It starts from a high-level country page, automatically discovers all the cities listed by navigating through all available pages, and then proceeds to visit each city page to gather a complete list of all specific locations (e.g., parks, restaurants, landmarks).

The entire process is automated using Puppeteer, which controls a headless Chrome browser. The script is built to be robust, incorporating delays, a multi-attempt retry mechanism, and exponential backoff to handle network errors and rate-limiting gracefully. The final output is a well-structured JSON file, perfect for analysis or use in other applications.

### **2\. Features**

*   **Recursive Scraping:** Traverses from a country-level page down to individual location pages.
    
*   **Systematic Pagination:** Reliably navigates through all pages using the ?page=X parameter, instead of relying on fragile infinite scrolling.
    
*   **Robust Error Handling:**
    
    *   **Retry Mechanism:** Automatically retries failed page loads up to 3 times.
        
    *   **Exponential Backoff:** Intelligently waits for progressively longer durations between failed retries to effectively handle rate-limiting.
        
*   **Polite Operation:** Incorporates randomized delays between requests to mimic human behavior and reduce server load.
    
*   **Structured JSON Output:** Saves data in a clean, human-readable JSON format, organized by city.
    
*   **Configurable:** Easily change the target URL, output file, and scraping limits for testing.
    

### **3\. Requirements**

Before running the script, you must have the following installed on your system:

*   [**Node.js**](https://nodejs.org/en/): (Version 14.x or newer recommended)
    
*   [**npm**](https://www.npmjs.com/get-npm): (Node.js Package Manager, typically installed with Node.js)
    

### **4\. Configuration**

You can customize the scraper's behavior by editing the configuration variables at the top of the scraper.js file.

*   START\_URL: The initial URL for the scraper. This should be the "Explore Locations" page for a specific country.
    
*   OUTPUT\_FILE: The filename for the resulting JSON data.
    
*   CITY\_LIMIT: A number that limits how many cities will be scraped. This is very useful for testing to ensure the scraper is working without waiting for a full run. To scrape all available cities, set this value to null.
    

### **5\. How It Works**

The script is orchestrated by the main() function and relies on a generic, reusable scrapeAllPages() function for its core logic:

1.  **Launch Browser:** Puppeteer launches a headless instance of Chromium.
    
2.  **Scrape City URLs:** The scrapeCityUrls() function is called. It uses scrapeAllPages() to systematically navigate through ?page=1, ?page=2, etc., of the main country URL until no new cities are found.
    
3.  **Retry & Backoff Logic:** If any page navigation fails (e.g., due to a timeout), the scrapeAllPages function will retry up to two more times. The delay between these retries increases exponentially (e.g., ~2s, then ~4s) to allow the server to recover.
    
4.  **Iterate and Scrape Locations:** The main function loops through the complete list of city URLs gathered in the first phase.
    
5.  **Scrape Location Data:** For each city, the scrapeLocationsForCity() function is called. It re-uses the same robust scrapeAllPages() function to navigate through all of the city's pages and collect the names and URLs of all specific locations.
    
6.  **Polite Delays:** The script automatically waits for a few seconds between most page requests and before starting on a new city to avoid overwhelming the server.
    
7.  **Save to File:** Once all cities (up to the CITY\_LIMIT) have been processed, the final data object is converted into a formatted JSON string and saved to the OUTPUT\_FILE.
    
8.  **Close Browser:** The finally block ensures the browser instance is always closed to free up system resources, even if an error occurred.
    

### **6\. Output Format**

The final output is a single JSON file (instagram\_locations.json by default). The data is structured as an object where each top-level key is a city's name, and the value is an array of location objects found within that city.

### **Disclaimer**

*   Web scraping can be against the terms of service of some websites. Always scrape responsibly and ethically.
    
*   Websites like Instagram frequently update their structure. If this script stops working, it is likely due to a change in the HTML layout or class names on their site, which would require updating the selectors in the page.evaluate() functions.
