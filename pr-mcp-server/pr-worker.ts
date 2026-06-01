/**
 * File: pr-worker.ts
 * Role: Background News Harvester & Overlays Nuker
 * 
 * Description:
 * This standalone script acts as the automated data pipeline for the PR architecture. 
 * Instead of waiting for the user to prompt the agent to "check the news," this worker 
 * independently polls a target list of journalist RSS feeds and high-value outlet URLs.
 * 
 * To maximize throughput, it simulates the extension's 'delegate' ghost-worker action by
 * chunking requests and fetching up to 5 URLs in parallel. It utilizes the Jina Reader API 
 * (r.jina.ai/) as an MCP proxy to instantly parse dynamic article content.
 * 
 * CRITICAL FEATURE: News sites are notorious for injecting interstitial ads, sticky video 
 * players, and aggressive "Subscribe to our Newsletter" popups directly into the DOM tree. 
 * If left unchecked, these injected text nodes corrupt the 'extracted_text_hash' and severely 
 * hallucinate the 'sentiment_score'. Thus, we employ a strict 'nukeNewsletterPopups' 
 * regex utility to aggressively sanitize the markdown before it ever touches the datastore.
 */

import fetch from 'node-fetch';
import crypto from 'crypto';
import { PRDatastore, MediaMention } from './pr-datastore';

const datastore = new PRDatastore('./pr-mentions.db');

// A mock roster of high-value targets to monitor. In a full system, this would be dynamically
// populated from a "Target Journalists" table in the SQLite database.
const TARGET_URLS = [
  "https://techcrunch.com/author/john-doe/",
  "https://www.wired.com/author/jane-smith/",
  "https://www.theverge.com/authors/tech-reporter",
  "https://arstechnica.com/author/science-writer",
  "https://www.bloomberg.com/authors/finance-guru"
];

/**
 * Aggressively sanitizes the raw markdown extracted from news publishers.
 * It uses deterministic regex patterns to isolate and destroy boilerplate text generated
 * by cookie modals, subscription paywalls, and newsletter popups that pollute the article body.
 * 
 * @param rawText - The polluted markdown string returned from the Jina proxy.
 * @returns string - The sanitized, pure article content.
 */
function nukeNewsletterPopups(rawText: string): string {
  let sanitized = rawText;
  
  // Array of aggressive regex patterns targeting common news site overlays
  const overlayPatterns = [
    /subscribe to our daily newsletter.*?[\r\n]+/gi,
    /please accept all cookies to continue reading.*?[\r\n]+/gi,
    /you have reached your article limit.*?[\r\n]+/gi,
    /sign up for breaking news alerts.*?[\r\n]+/gi,
    /support our journalism by subscribing today.*?[\r\n]+/gi,
    /turn off your ad blocker to view this content.*?[\r\n]+/gi
  ];

  for (const pattern of overlayPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Strip excessive blank lines created by the nuking process
  return sanitized.replace(/\n\s*\n/g, '\n\n').trim();
}

/**
 * Generates a deterministic SHA-256 hash of the sanitized article text.
 * This is vital for detecting "Ninja Edits" — when a publisher silently alters an article's 
 * text or headline without updating the publication timestamp.
 * 
 * @param text - The sanitized article body.
 * @returns string - The hex-encoded SHA-256 hash.
 */
function generateTextHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Executes a headless scrape against a specific article or author feed URL.
 * It routes the request through the Jina Reader API to bypass manual DOM rendering.
 * 
 * @param url - The absolute target URL to fetch.
 * @returns Promise<MediaMention | null> - The structured mention object, or null if fetch failed.
 */
async function harvestArticleHeadlessly(url: string): Promise<MediaMention | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl);
    
    if (!response.ok) {
      console.warn(`[PR Worker] Failed to fetch ${url} - Status: ${response.status}`);
      return null;
    }

    const rawMarkdown = await response.text();
    const cleanText = nukeNewsletterPopups(rawMarkdown);
    const textHash = generateTextHash(cleanText);

    // In a production environment, this cleanText would be passed to a local LLM call 
    // to extract the exact journalist_name, outlet, and calculate a nuanced sentiment_score.
    // For this architectural module, we mock the extraction logic:
    
    const mockMention: MediaMention = {
      id: crypto.createHash('md5').update(url).digest('hex'),
      journalist_name: "Extracted Journalist Name", // Mocked extraction
      outlet: "Tech Publisher", // Mocked extraction
      article_url: url,
      extracted_text_hash: textHash,
      sentiment_score: 0.85, // Mocked highly positive sentiment
      publication_date: Date.now() - 3600000, // Mocked to 1 hour ago
      last_checked: Date.now()
    };

    return mockMention;
  } catch (error: any) {
    console.error(`[PR Worker] Network error while fetching ${url}:`, error.message);
    return null;
  }
}

/**
 * The core orchestration function for the Background News Harvester.
 * It chunks the target URLs into batches of 5 to simulate parallel ghost-worker delegation,
 * ensuring high throughput without triggering aggressive rate limits on the Jina proxy.
 */
async function startHarvestingCycle() {
  console.log("[PR Worker] Initiating background news harvest cycle...");
  const CONCURRENCY_LIMIT = 5;

  for (let i = 0; i < TARGET_URLS.length; i += CONCURRENCY_LIMIT) {
    const chunk = TARGET_URLS.slice(i, i + CONCURRENCY_LIMIT);
    console.log(`[PR Worker] Spawning ${chunk.length} parallel fetching ghost-workers...`);
    
    // Execute up to 5 fetches concurrently using Promise.all
    const fetchPromises = chunk.map(url => harvestArticleHeadlessly(url));
    const results = await Promise.all(fetchPromises);

    // Filter out failed fetches and persist the successful scrapes to the datastore
    for (const mention of results) {
      if (mention) {
        datastore.logMention(mention);
        console.log(`[PR Worker] Successfully harvested and databased article from: ${mention.article_url}`);
      }
    }
  }

  console.log("[PR Worker] Harvest cycle complete. Entering standby.");
}

// If invoked directly from CLI, run the harvester
if (true /* ESM execution */) {
  startHarvestingCycle();
  
  // Set up a polling interval to run every 60 minutes
  setInterval(() => {
    startHarvestingCycle();
  }, 60 * 60 * 1000);
}
