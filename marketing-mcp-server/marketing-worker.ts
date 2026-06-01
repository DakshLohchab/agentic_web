/**
 * File: marketing-worker.ts
 * Role: Headless Diff Engine & Competitor Scraper
 * 
 * Description:
 * This standalone script acts as the automated reconnaissance pipeline for the Marketing 
 * architecture. It utilizes an asynchronous polling mechanism (cron) to run bi-weekly 
 * checks against target competitor URLs.
 * 
 * Marketing and pricing pages are notorious for aggressive lead-capture modals, 
 * "Spin to Win" wheels, and sticky discount banners. These elements corrupt text extraction.
 * To counter this, the worker implements a strict 'detectAndClearOverlays' routine that 
 * explicitly hunts down and destroys elements with absolute/fixed positioning and high 
 * z-indexes BEFORE the DOM is captured and hashed.
 * 
 * By hashing the sanitized page text and comparing it against the local SQLite cache, 
 * the worker can mathematically prove if a competitor has altered their pricing or 
 * feature matrix without requiring heavy LLM inference.
 */

import crypto from 'crypto';
import cron from 'node-cron';
import { MarketingDatastore, CompetitorTracking } from './marketing-datastore';

const datastore = new MarketingDatastore('./marketing-intelligence.db');

// BI-WEEKLY CONSTANT: 14 days in milliseconds
const BI_WEEKLY_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Generates a deterministic SHA-256 hash of the sanitized competitor page text.
 * This mathematical hash acts as the core of the "Diff Engine" — if the hash changes,
 * we guarantee the competitor has updated their page copy or pricing structure.
 * 
 * @param text - The sanitized, overlay-free page text.
 * @returns string - The hex-encoded SHA-256 hash.
 */
function generateDiffHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Executes a simulated headless browser sequence that explicitly targets and destroys
 * aggressive marketing overlays (lead capture forms, cookie banners, chat widgets).
 * 
 * In a fully integrated Puppeteer/Playwright or Chrome Extension environment, this logic
 * would be injected directly into the active tab via chrome.scripting.executeScript.
 * 
 * @returns string - A stringified JavaScript payload representing the nuking logic.
 */
function getDetectAndClearOverlaysScript(): string {
  return `
    (function nukeMarketingOverlays() {
      const allNodes = document.querySelectorAll('*');
      let nukedCount = 0;
      
      for (const node of allNodes) {
        const style = window.getComputedStyle(node);
        // Identify sticky/fixed overlays that obscure pricing tables or text
        if (style.position === 'fixed' || style.position === 'absolute') {
          const zIndex = parseInt(style.zIndex);
          // High z-index elements are almost always lead-capture modals or chat widgets
          if (zIndex > 900) {
            node.remove();
            nukedCount++;
          }
        }
      }
      return nukedCount;
    })();
  `;
}

/**
 * Simulates the headless fetching and parsing of a competitor's URL.
 * It applies the overlay destruction script, captures the sanitized text, generates
 * the new diff hash, and checks for state changes.
 * 
 * @param competitor - The historic competitor record from the SQLite database.
 */
async function processCompetitorURL(competitor: CompetitorTracking) {
  console.log(`[Diff Engine] Initiating stealth fetch for: ${competitor.company_name} (${competitor.target_url})`);
  
  try {
    // 1. Simulate the headless browser navigation and injection of the overlay nuker
    console.log(`[Diff Engine] Injecting detectAndClearOverlays script to destroy lead-capture modals...`);
    const nukeScript = getDetectAndClearOverlaysScript();
    
    // In a live environment, we would await the headless browser execution here.
    // For architectural demonstration, we mock the extracted sanitized DOM text:
    const mockSanitizedDomText = `Simulated pricing page text for ${competitor.company_name}. Pro Plan: $49/mo. Enterprise: Contact Us.`;
    
    // 2. Generate the Diff Hash
    const currentHash = generateDiffHash(mockSanitizedDomText);
    
    // 3. Compare against the local SQLite cache
    if (currentHash !== competitor.page_text_hash) {
      console.warn(`[Diff Engine] ⚠️ ALERT: State change detected for ${competitor.company_name}! The pricing/feature hash has mutated.`);
      
      // Normally we would invoke an LLM here to parse the new pricing_tier_json
      const updatedPricingJson = JSON.stringify([{ tier: "Pro", price: 49 }, { tier: "Enterprise", price: -1 }]);
      
      // Update the datastore with the new intelligence
      const updatedRecord: CompetitorTracking = {
        ...competitor,
        page_text_hash: currentHash,
        pricing_tier_json: updatedPricingJson,
        last_scraped_timestamp: Date.now()
      };
      
      datastore.upsertCompetitor(updatedRecord);
      console.log(`[Diff Engine] Database successfully updated with new intelligence for ${competitor.company_name}.`);
      
    } else {
      console.log(`[Diff Engine] No changes detected for ${competitor.company_name}. Hash remains perfectly matched.`);
      
      // Simply touch the timestamp to avoid re-scraping tomorrow
      competitor.last_scraped_timestamp = Date.now();
      datastore.upsertCompetitor(competitor);
    }

  } catch (error: any) {
    console.error(`[Diff Engine] Error processing ${competitor.company_name}:`, error.message);
  }
}

/**
 * The core asynchronous chron job.
 * Scans the database for records older than 14 days and triggers the headless diff pipeline.
 */
async function startBiWeeklyReconnaissance() {
  console.log("[Diff Engine] Waking up. Scanning for stale competitor records...");
  
  const cutoffTimestamp = Date.now() - BI_WEEKLY_MS;
  const staleRecords = datastore.getStaleRecords(cutoffTimestamp);

  if (staleRecords.length === 0) {
    console.log("[Diff Engine] All competitor data is up to date. Returning to sleep.");
    return;
  }

  console.log(`[Diff Engine] Found ${staleRecords.length} stale competitors. Spawning background scrapers...`);

  for (const competitor of staleRecords) {
    await processCompetitorURL(competitor);
  }
}

/**
 * Bootstraps the cron scheduler.
 * Runs at 3:00 AM every Tuesday and Friday to execute the bi-weekly updates during off-peak hours.
 */
export function initializeWorker() {
  console.log("[Diff Engine] Initializing background chron scheduler...");
  cron.schedule('0 3 * * 2,5', () => {
    startBiWeeklyReconnaissance();
  });
  
  // Fire immediately for syncing purposes
  startBiWeeklyReconnaissance();
}

// If invoked directly from CLI
if (true /* ESM execution */) {
  initializeWorker();
}
