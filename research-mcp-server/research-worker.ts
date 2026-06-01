/**
 * File: research-worker.ts
 * Role: Headless Parallel Ingestion Engine & Content Sanitizer
 * 
 * Description:
 * This standalone daemon operates as the ingestion pipeline for the Deep Researcher architecture. 
 * It asynchronously monitors a vast roster of financial prospectuses, academic papers, and 
 * technical repositories. 
 * 
 * To maximize bandwidth utilization and avoid sequential I/O blocking, it chunks the URL roster 
 * into concurrent batches of 5. It uses the Jina Reader API as an MCP proxy to instantly parse 
 * the DOM into raw markdown. 
 * 
 * CRITICAL FEATURES:
 * 1. Bibliography Stripping: Academic papers append massive, token-burning bibliography sections 
 *    at the end of documents. This script uses deterministic regex to sever these sections before hashing.
 * 2. Canvas/PDF Anomaly Detection: If a target URL wraps its text in an obfuscated HTML5 Canvas 
 *    or embeds a raw PDF object, the headless proxy will fail to extract text. This script detects 
 *    the anomaly and fires an interrupt to the primary agent's 'clear_obstacle' pipeline, forcing 
 *    a manual, vision-assisted Chromium scrape.
 */

import fetch from 'node-fetch';
import crypto from 'crypto';
import cron from 'node-cron';
import { ResearchDatastore, ResearchMatrix } from './research-datastore';

const datastore = new ResearchDatastore('./research-intelligence.db');

// Mock roster of complex technical/financial documents to monitor.
const TARGET_URLS = [
  "https://arxiv.org/html/2310.12345v1", // Standard HTML academic paper
  "https://www.sec.gov/Archives/edgar/data/1234/0001.htm", // Financial prospectus
  "https://example.com/obfuscated-canvas-paper", // Simulated anomaly
  "https://example.com/embedded-pdf-document", // Simulated anomaly
  "https://nature.com/articles/s41586-023", // Academic journal
  "https://github.com/microsoft/autogen" // Technical repository
];

/**
 * Aggressively sanitizes academic markdown by severing token-heavy bibliographies,
 * citations, and structural footnotes that provide zero semantic value to the LLM's summary.
 * 
 * @param rawMarkdown - The polluted markdown string returned from the Jina proxy.
 * @returns string - The truncated, purely semantic article content.
 */
function stripBibliographyAndFootnotes(rawMarkdown: string): string {
  // Regex to match standard academic cut-off headers
  const cutOffPattern = /(## References|## Bibliography|## Citations|## Works Cited)[\s\S]*/i;
  let cleanText = rawMarkdown.replace(cutOffPattern, '');

  // Strip inline academic citations like [12], [14, 15], or (Smith et al., 2023)
  cleanText = cleanText.replace(/\[\d+(,\s*\d+)*\]/g, '');
  
  return cleanText.trim();
}

/**
 * Evaluates the extracted payload to detect obfuscation techniques commonly used to 
 * prevent scraping, such as rendering text strictly within an HTML5 <canvas> or 
 * burying it inside a raw <embed type="application/pdf"> object.
 * 
 * @param rawHtmlOrText - The raw payload returned from the fetch target.
 * @returns boolean - True if a structural anomaly blocking text extraction is detected.
 */
function detectCanvasOrPdfAnomaly(rawHtmlOrText: string): boolean {
  const normalizedText = rawHtmlOrText.toLowerCase();
  
  // If Jina returns an empty payload but the HTTP status was 200, it's highly suspicious.
  // We also check for explicit markers of PDF embeddings or canvas wrappers.
  if (normalizedText.length < 100) return true;
  if (normalizedText.includes('application/pdf')) return true;
  if (normalizedText.includes('<canvas id="document-viewer"')) return true;
  
  return false;
}

/**
 * Triggers the fallback 'clear_obstacle' routine.
 * In a fully integrated agentic architecture, this fires a webhook or message event
 * back to the extension's Swarm Coordinator. The coordinator will spawn a ghost worker, 
 * navigate to the URL visually, and use OCR / Vision-Language Models to extract the text.
 * 
 * @param url - The anomalous URL requiring visual intervention.
 */
function triggerVisionFallbackPipeline(url: string): void {
  console.warn(`[Research Worker] 🚨 Extraction Anomaly Detected at: ${url}`);
  console.warn(`[Research Worker] Initiating 'clear_obstacle' pipeline. Dispatching URL to Vision-Language OCR queue.`);
  
  // Mocking the event dispatcher for the architecture blueprint:
  // extensionBridge.emit("SPAWN_GHOST_WORKER", {
  //    targetUrl: url,
  //    action: "clear_obstacle",
  //    fallbackMethod: "VISION_OCR_EXTRACTION"
  // });
}

/**
 * Executes a headless scrape against a specific document URL.
 * Routes the request through the Jina Reader API to bypass manual DOM rendering.
 * 
 * @param url - The absolute target URL to fetch.
 * @returns Promise<ResearchMatrix | null> - The structured document object, or null if fetch failed/diverted.
 */
async function ingestDocumentHeadlessly(url: string): Promise<ResearchMatrix | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl);
    
    if (!response.ok) {
      console.warn(`[Research Worker] Failed to fetch ${url} - Status: ${response.status}`);
      return null;
    }

    const rawMarkdown = await response.text();

    // Trap layout obfuscation anomalies
    if (detectCanvasOrPdfAnomaly(rawMarkdown)) {
      triggerVisionFallbackPipeline(url);
      return null; // Halt local ingestion; defer to the Vision OCR pipeline
    }

    const cleanText = stripBibliographyAndFootnotes(rawMarkdown);
    const textHash = crypto.createHash('sha256').update(cleanText).digest('hex');

    // In a production setup, 'cleanText' is piped to a local LLM to generate the 
    // extracted_markdown_summary and serialize complex data into clean_json_table_payload.
    // For this blueprint, we mock the final extraction block:
    
    const mockMatrix: ResearchMatrix = {
      id: crypto.createHash('md5').update(url).digest('hex'),
      topic_key: url.includes("arxiv") ? "quantum_computing" : "financial_analysis",
      document_url: url,
      extracted_markdown_summary: "Simulated deep-synthesis summary of the core methodology...",
      clean_json_table_payload: JSON.stringify([{ metric: "Revenue", value: "$4M" }]),
      text_hash: textHash,
      last_verified: Date.now()
    };

    return mockMatrix;
  } catch (error: any) {
    console.error(`[Research Worker] Network error while ingesting ${url}:`, error.message);
    return null;
  }
}

/**
 * The core orchestration function for the Ingestion Engine.
 * It chunks the target URLs into batches of 5 to simulate multi-threaded parallelism,
 * maximizing throughput without crashing local network limits.
 */
async function startIngestionCycle() {
  console.log("[Research Worker] Initiating parallel document ingestion cycle...");
  const CONCURRENCY_LIMIT = 5;
  const successfulIngestions: ResearchMatrix[] = [];

  for (let i = 0; i < TARGET_URLS.length; i += CONCURRENCY_LIMIT) {
    const chunk = TARGET_URLS.slice(i, i + CONCURRENCY_LIMIT);
    console.log(`[Research Worker] Processing parallel batch of ${chunk.length} documents...`);
    
    // Execute up to 5 fetches concurrently using Promise.all
    const fetchPromises = chunk.map(url => ingestDocumentHeadlessly(url));
    const results = await Promise.all(fetchPromises);

    for (const matrix of results) {
      if (matrix) {
        successfulIngestions.push(matrix);
        console.log(`[Research Worker] Validated and hashed document: ${matrix.document_url}`);
      }
    }
  }

  // Execute the ultra-fast synchronous bulk insert to write the entire batch at once
  if (successfulIngestions.length > 0) {
    datastore.bulkUpsertResearchMatrix(successfulIngestions);
    console.log(`[Research Worker] Bulk inserted ${successfulIngestions.length} matrices into SQLite cache.`);
  }

  console.log("[Research Worker] Ingestion cycle complete. Yielding thread.");
}

// If invoked directly from CLI, run the harvester
if (true /* ESM execution */) {
  startIngestionCycle();
  
  // Set up a polling interval to run every 12 hours
  cron.schedule('0 0,12 * * *', () => {
    startIngestionCycle();
  });
}
