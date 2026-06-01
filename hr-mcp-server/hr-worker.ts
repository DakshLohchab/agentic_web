/**
 * File: hr-worker.ts
 * Role: Background Profile Monitor and Scraper
 * 
 * Description:
 * This script runs completely independently of the primary agent UI. It is responsible
 * for maintaining the freshness of the Candidate Sourcing datastore. It utilizes
 * node-cron to periodically wake up and hunt for stale candidate records.
 * 
 * When a stale record (older than 14 days) is found, the worker bypasses expensive
 * Chromium-based visual rendering. Instead, it hits the Jina Reader API (r.jina.ai/)
 * to instantly convert dynamic profiles (like GitHub or personal portfolios) into
 * clean, LLM-ready markdown. 
 * 
 * Crucially, it implements a fallback mechanism: if the raw fetch is blocked by a 
 * login modal or cookie wall (often seen on rigid sites), it emits an interrupt to 
 * the extension's agentic loop to execute 'clear_obstacle' (overlay-nuker) and 
 * perform an authenticated manual scrape.
 */

import cron from 'node-cron';
import fetch from 'node-fetch';
import { HRDatastore, Candidate } from './hr-datastore';

// Configuration Constants
const FOURTEEN_DAYS_IN_MS = 14 * 24 * 60 * 60 * 1000;
const DB_PATH = './candidates.db';
const datastore = new HRDatastore(DB_PATH);

/**
 * Executes a headless scrape against a candidate's profile URL using Jina's reader API.
 * Jina acts as a proxy that strips away heavy DOM elements, trackers, and CSS, returning
 * pure markdown. This saves immense bandwidth and token context for the LLM parsing phase.
 * 
 * @param url - The target profile URL to scrape (e.g., GitHub, Portfolio)
 * @returns Promise<string> - The raw markdown text extracted from the page
 */
async function scrapeProfileHeadlessly(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const response = await fetch(jinaUrl);
  
  if (!response.ok) {
    throw new Error(`Headless scrape failed with status: ${response.status}`);
  }

  const markdownText = await response.text();
  return markdownText;
}

/**
 * Evaluates the scraped markdown text to determine if a protective overlay
 * (like a cookie wall, Cloudflare turnstile, or aggressive login modal) blocked the scrape.
 * 
 * @param markdown - The raw markdown content returned from the scraper
 * @returns boolean - True if an obstacle is detected, False otherwise
 */
function detectDomBlockage(markdown: string): boolean {
  const normalizedText = markdown.toLowerCase();
  
  const blockIndicators = [
    "please verify you are human",
    "accept all cookies",
    "login to continue",
    "access denied",
    "security check"
  ];

  return blockIndicators.some(indicator => normalizedText.includes(indicator));
}

/**
 * Triggers the fallback 'clear_obstacle' routine.
 * In a fully integrated agentic architecture, this fires a webhook or message event
 * back to the extension's Swarm Coordinator. The coordinator will temporarily spawn a
 * ghost worker tab, navigate to the URL visually, and execute the 'overlay-nuker' utility
 * to destroy the DOM obstacles before capturing the state.
 * 
 * @param candidate - The candidate whose profile requires a manual visual scrape
 */
function triggerOverlayNukerFallback(candidate: Candidate): void {
  console.warn(`[HR Worker] 🚨 DOM Blockage detected for ${candidate.candidate_name}.`);
  console.warn(`[HR Worker] Initiating strict 'clear_obstacle' fallback routine for URL: ${candidate.github_url}`);
  
  // Example integration point: In production, this would send an IPC message or WebSocket
  // payload to the extension's background script containing:
  // { intent: "REPAIR_DOM", url: candidate.github_url, action: "clear_obstacle" }
  
  // Mocking the event dispatcher for the architecture blueprint:
  // extensionBridge.emit("SPAWN_GHOST_WORKER", {
  //    targetUrl: candidate.github_url,
  //    instructions: "Execute clear_obstacle action. Parse skills and update local DB."
  // });
}

/**
 * The core asynchronous cron job routine.
 * Finds all candidates who haven't been updated in 14 days and attempts to refresh them.
 */
async function processStaleProfiles() {
  console.log("[HR Worker] Waking up to process stale candidate profiles...");
  
  const cutoffTimestamp = Date.now() - FOURTEEN_DAYS_IN_MS;
  const staleCandidates = datastore.getStaleCandidates(cutoffTimestamp);

  if (staleCandidates.length === 0) {
    console.log("[HR Worker] All candidate profiles are up to date. Returning to sleep.");
    return;
  }

  console.log(`[HR Worker] Found ${staleCandidates.length} stale profiles. Beginning updates.`);

  for (const candidate of staleCandidates) {
    try {
      // Prioritize GitHub or portfolio URLs for headless scraping to get technical signals
      const targetUrl = candidate.github_url || candidate.linkedin_url;
      if (!targetUrl) continue;

      console.log(`[HR Worker] Fetching updated data for ${candidate.candidate_name}...`);
      const markdown = await scrapeProfileHeadlessly(targetUrl);

      // Verify we didn't just scrape a cookie wall
      if (detectDomBlockage(markdown)) {
        triggerOverlayNukerFallback(candidate);
        continue; // Skip the DB update until the visual fallback completes
      }

      // Normally, here we would pass 'markdown' to an LLM (e.g., via callLLM) 
      // to extract updated roles and skills into JSON.
      // For this architecture demo, we simulate a successful extraction:
      
      const updatedCandidate: Candidate = {
        ...candidate,
        last_profile_update: Date.now() // Reset the 14-day timer
      };

      datastore.upsertCandidate(updatedCandidate);
      console.log(`[HR Worker] Successfully refreshed profile for ${candidate.candidate_name}.`);

    } catch (error: any) {
      console.error(`[HR Worker] Error updating ${candidate.candidate_name}:`, error.message);
    }
  }
}

/**
 * Initialize the cron scheduler.
 * This runs every 12 hours (at midnight and noon) to check for expiration boundaries.
 */
export function startHrWorker() {
  console.log("[HR Worker] Initializing background profile monitor scheduler.");
  cron.schedule('0 0,12 * * *', () => {
    processStaleProfiles();
  });
  
  // Fire immediately on startup for demonstration/syncing purposes
  processStaleProfiles();
}

// If invoked directly from CLI, start the worker
if (true /* ESM execution */) {
  startHrWorker();
}
