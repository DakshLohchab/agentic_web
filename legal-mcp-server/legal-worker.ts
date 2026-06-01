/**
 * File: legal-worker.ts
 * Role: Headless Policy Diff Worker & Hashing Engine
 * 
 * Description:
 * This standalone background daemon handles the headless synchronization of corporate 
 * Terms of Service (TOS) policies and active government regulatory dockets.
 * 
 * To detect silent liability shifts (where a company alters their privacy policy without 
 * notifying users), this script runs a continuous polling loop. It scrapes target legal 
 * pages, strips all formatting, generates a SHA-256 cryptographic hash of the pure text, 
 * and compares it against the local SQLite datastore. If the hash diverges, an anomaly 
 * alert is triggered for the primary agent.
 * 
 * OBSTRUCTION HANDLING BLOCK (Cookie Walls & Chatbots):
 * Modern legal pages are frequently obscured by massive "We value your privacy" cookie 
 * consent banners and sticky "Chat with Legal Support" widgets. These z-index overlays 
 * block the headless extraction of the underlying TOS text. This worker implements an 
 * explicit 'flattenLegalOverlays' script to surgically wipe these blockers before the 
 * semantic DOM is read.
 */

import crypto from 'crypto';
import cron from 'node-cron';
import { LegalDatastore, TOSArchive, CourtDocket } from './legal-datastore';

const datastore = new LegalDatastore('./legal-compliance.db');

// Mock roster of target corporate legal pages and court docket RSS feeds
const TARGET_LEGAL_PAGES = [
  { company: 'OpenAI', url: 'https://openai.com/policies/terms-of-use' },
  { company: 'Google', url: 'https://policies.google.com/terms' }
];

const TARGET_COURT_DOCKETS = [
  "https://www.courtlistener.com/api/rest/v3/dockets/?court=nysd" // SDNY Mock Feed
];

/**
 * Executes a simulated browser script that explicitly targets and obliterates 
 * corporate legal page obstructions (e.g., GDPR Cookie walls, Intercom chat widgets).
 * 
 * In a real automated Chrome session, this payload is injected into the active DOM 
 * *before* the legal text is serialized and passed into the Hashing Engine.
 * 
 * @returns string - A stringified JavaScript payload representing the destructive logic.
 */
function getFlattenLegalOverlaysScript(): string {
  return `
    (function flattenLegalOverlays() {
      const allNodes = document.querySelectorAll('*');
      let obliteratedCount = 0;
      
      for (const node of allNodes) {
        const style = window.getComputedStyle(node);
        const pos = style.position;
        
        // Target sticky widgets and full-screen consent banners
        if (pos === 'fixed' || pos === 'absolute' || pos === 'sticky') {
          const zIndex = parseInt(style.zIndex);
          const innerText = node.textContent ? node.textContent.toLowerCase() : "";
          
          // Heuristic detection: high z-index + consent/support keywords
          const isObstruction = innerText.includes("accept cookies") || 
                                innerText.includes("manage preferences") || 
                                innerText.includes("chat with");
                                 
          if ((!isNaN(zIndex) && zIndex > 90) || isObstruction) {
            node.remove();
            obliteratedCount++;
          }
        }
      }
      return obliteratedCount;
    })();
  `;
}

/**
 * Simulates a headless fetch and cryptographic diff operation for a corporate TOS page.
 * Applies the UI sanitization script, extracts the text, and checks for silent changes.
 * 
 * @param config - The targeted company and their policy URL.
 * @returns Promise<TOSArchive | null> - The evaluated legal state.
 */
async function auditPolicyHeadlessly(config: { company: string, url: string }): Promise<TOSArchive | null> {
  console.log(`[Legal Worker] Initiating headless audit for ${config.company} TOS...`);
  
  try {
    // 1. Simulate the headless injection of the DOM sanitizer
    console.log(`[Legal Worker] [${config.company}] Executing 'flattenLegalOverlays' to wipe GDPR consent banners...`);
    const nukeScript = getFlattenLegalOverlaysScript();
    
    // Simulate network parsing latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    // 2. Generate simulated raw text extraction
    // In production, this would be the actual stripped textContent of the <body>
    const mockRawText = `Terms of Service for ${config.company}. You agree to arbitration... (Simulated Legal Text Block v1.2)`;
    
    // 3. Cryptographic Hashing Engine
    // Strip all whitespaces, tabs, and newlines to prevent false-positives from minor formatting changes
    const strippedText = mockRawText.replace(/\s+/g, '');
    const newHash = crypto.createHash('sha256').update(strippedText).digest('hex');
    
    let deltaSummary = "No Changes Detected";
    const existingRecord = datastore.getTOSRecord(config.company);

    // Simulate a silent liability change for demonstration purposes (10% chance)
    const isSilentUpdate = Math.random() < 0.1;
    let finalHash = newHash;

    if (existingRecord) {
      if (existingRecord.full_text_hash !== newHash || isSilentUpdate) {
        console.warn(`[Legal Worker] ⚠️ SILENT LIABILITY SHIFT DETECTED for ${config.company}! Hash divergence triggered.`);
        deltaSummary = "ALERT: Cryptographic Hash Mismatch! Potential Arbitration Clause Update Detected.";
        finalHash = isSilentUpdate ? crypto.createHash('sha256').update("SILENT_UPDATE_TRIGGERED").digest('hex') : newHash;
      }
    }

    const archiveRecord: TOSArchive = {
      id: crypto.createHash('md5').update(config.url).digest('hex'),
      company_name: config.company,
      document_url: config.url,
      full_text_hash: finalHash,
      delta_summary: deltaSummary,
      last_audited: Date.now()
    };

    return archiveRecord;
  } catch (error: any) {
    console.error(`[Legal Worker] Network error while parsing TOS:`, error.message);
    return null;
  }
}

/**
 * Simulates a concurrent fetch operation targeting government regulatory or court dockets.
 * 
 * @param docketUrl - The target REST API or RSS feed.
 * @returns Promise<CourtDocket | null> - The parsed legal filing.
 */
async function auditDocketHeadlessly(docketUrl: string): Promise<CourtDocket | null> {
  console.log(`[Legal Worker] Polling active court dockets: ${docketUrl}`);
  
  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 500));
    
    // Simulate parsing a new legal filing
    const mockCaseNumber = `1:26-cv-${Math.floor(Math.random() * 9999)}`;
    const mockFilingText = "MOTION to Dismiss filed by Defendant. (Simulated Docket Entry)";

    const docketRecord: CourtDocket = {
      id: mockCaseNumber, // Using case number as ID
      case_number: mockCaseNumber,
      court_branch: "SDNY",
      latest_filing_text: mockFilingText,
      filing_date: Date.now()
    };

    return docketRecord;
  } catch (error: any) {
    console.error(`[Legal Worker] Error parsing court docket API:`, error.message);
    return null;
  }
}

/**
 * The core asynchronous orchestration loop.
 * Executes parallel headless tasks for both corporate policy diffing and court docket tracking.
 */
async function startLegalAuditingLoop() {
  console.log("[Legal Worker] Waking up. Executing continuous legal auditing cycles...");

  // Phase 1: Policy Diff Engine (Cryptographic Hash Comparisons)
  const policyPromises = TARGET_LEGAL_PAGES.map(config => auditPolicyHeadlessly(config));
  const policyResults = await Promise.all(policyPromises);
  
  for (const record of policyResults) {
    if (record) {
      datastore.upsertTOSRecord(record);
      console.log(`[Legal Worker] ✅ Synced TOS for ${record.company_name} | Hash: ${record.full_text_hash.substring(0,8)}...`);
    }
  }

  // Phase 2: Active Court Docket Syncing
  const docketPromises = TARGET_COURT_DOCKETS.map(url => auditDocketHeadlessly(url));
  const docketResults = await Promise.all(docketPromises);

  for (const docket of docketResults) {
    if (docket) {
      datastore.logCourtFiling(docket);
      console.log(`[Legal Worker] ✅ Synced Docket ${docket.case_number}: ${docket.latest_filing_text}`);
    }
  }

  console.log("[Legal Worker] Auditing loop complete. Yielding thread.");
}

/**
 * Bootstraps the background polling task.
 * Runs daily to maintain compliance monitoring without burning unnecessary bandwidth.
 */
export function initializeLegalWorker() {
  console.log("[Legal Worker] Initializing Legal Compliance & Policy Auditing Automator...");
  // Run once every 24 hours at 2:00 AM
  cron.schedule('0 2 * * *', () => {
    startLegalAuditingLoop();
  });
  
  // Fire immediately for initial syncing
  startLegalAuditingLoop();
}

// If invoked directly from CLI
if (true /* ESM execution */) {
  initializeLegalWorker();
}
