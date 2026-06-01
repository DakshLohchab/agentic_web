/**
 * File: tech-worker.ts
 * Role: Cloud Polling Worker & DOM Sanitizer
 * 
 * Description:
 * This standalone background daemon handles the headless synchronization of massive 
 * developer datasets (like Pull Request diffs) and cloud billing tables (AWS/GCP) 
 * into the local SQLite cache.
 * 
 * To prevent the LLM agent from crashing its context window by trying to parse a 
 * 10,000-line Datadog log in the active tab, this worker runs asynchronously via a 
 * cron schedule. It pulls raw views, condenses them using regex/heuristics, and stores 
 * the highly-summarized markdown.
 * 
 * OBSTRUCTION HANDLING BLOCK:
 * Enterprise observability tools (Datadog, AWS Console, GitLab) aggressively deploy 
 * UI overlays such as "Session Expiring In 5 Minutes", "Take a Tour of New Features", 
 * or "Provide Feedback" modals. These z-index overlays block the headless extraction 
 * of HTML tables and code blocks. This worker implements a strict 'sanitizeEnterpriseDOM' 
 * script to surgically wipe these blockers before the underlying text is parsed.
 */

import crypto from 'crypto';
import cron from 'node-cron';
import { TechDatastore, PRDiffCache, CloudCostLedger } from './tech-datastore';

const datastore = new TechDatastore('./devops-observability.db');

// Mock target URLs representing PRs and Cloud Billing Dashboards
const TARGET_ENDPOINTS = [
  { type: 'PR', url: 'https://github.com/acme/core-api/pull/105' },
  { type: 'BILLING', url: 'https://console.aws.amazon.com/cost-management/home' }
];

/**
 * Executes a simulated browser script that explicitly targets and obliterates 
 * enterprise dashboard modals (e.g., "Session Expiring", "Feature Tour").
 * 
 * In a real automated Puppeteer/Playwright session, this payload is injected into 
 * the active DOM *before* the stack traces or billing tables are serialized.
 * 
 * @returns string - A stringified JavaScript payload representing the destructive logic.
 */
function getSanitizeEnterpriseDOMScript(): string {
  return `
    (function sanitizeEnterpriseDOM() {
      const allNodes = document.querySelectorAll('*');
      let obliteratedCount = 0;
      
      for (const node of allNodes) {
        const style = window.getComputedStyle(node);
        const pos = style.position;
        
        // Target fixed/absolute positioning common in enterprise SaaS modals
        if (pos === 'fixed' || pos === 'absolute') {
          const zIndex = parseInt(style.zIndex);
          const text = (node.textContent || "").toLowerCase();
          
          // Heuristic detection: Elevated z-index + specific nag keywords
          const isNag = text.includes("session expir") || 
                        text.includes("new feature") || 
                        text.includes("take a tour") ||
                        text.includes("feedback");
                        
          if ((!isNaN(zIndex) && zIndex > 100) || isNag) {
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
 * Simulates a headless fetch operation for a Github/Gitlab Pull Request.
 * Condenses a massive code diff down into a tight markdown summary.
 * 
 * @param url - The target PR URL.
 * @returns Promise<PRDiffCache | null> - The cached PR state.
 */
async function syncPRHeadlessly(url: string): Promise<PRDiffCache | null> {
  console.log(`[Tech Worker] Initiating headless diff scrape for PR: ${url}`);
  
  try {
    // 1. Simulate the headless injection of the DOM sanitizer
    console.log(`[Tech Worker] Executing 'sanitizeEnterpriseDOM' to clear Feature Tour modals...`);
    const nukeScript = getSanitizeEnterpriseDOMScript();
    
    // Simulate network parsing latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    // 2. Generate simulated condensed markdown
    // In production, the raw diff text would be passed to a specialized NLP/regex layer
    const mockSummary = "```diff\n- const timeout = 5000;\n+ const timeout = 30000;\n```\n**Summary:** Increased global timeout to prevent gateway errors.";
    
    // Simulate detecting an API key or vulnerable pattern in the diff
    const isVulnerable = Math.random() < 0.1 ? 1 : 0; 

    const prRecord: PRDiffCache = {
      id: crypto.createHash('md5').update(url).digest('hex'),
      repo_name: "acme/core-api", // Mocked extraction
      pr_number: 105,             // Mocked extraction
      diff_summary_markdown: mockSummary,
      security_flags: isVulnerable,
      last_polled: Date.now()
    };

    return prRecord;
  } catch (error: any) {
    console.error(`[Tech Worker] Network error while parsing PR diff:`, error.message);
    return null;
  }
}

/**
 * Simulates a headless fetch operation targeting an AWS/GCP cost dashboard.
 * Evaluates the rolling spend and flags anomalies based on heuristic spikes.
 * 
 * @param url - The billing dashboard URL.
 * @returns Promise<CloudCostLedger | null> - The evaluated billing line item.
 */
async function syncBillingHeadlessly(url: string): Promise<CloudCostLedger | null> {
  console.log(`[Tech Worker] Polling cloud cost management dashboard at: ${url}`);
  
  try {
    console.log(`[Tech Worker] Wiping 'Session Expiring' overlays before extracting billing tables...`);
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 500));
    
    // Simulate extracting a current spend figure
    const mockSpend = 12050.75 + (Math.random() * 5000);
    
    // Anomaly logic: If spend > $15,000, flag it as a massive runaway spike
    const isAnomaly = mockSpend > 15000 ? 1 : 0;

    const costRecord: CloudCostLedger = {
      id: crypto.createHash('md5').update(`${url}_${Date.now()}`).digest('hex'),
      service_name: "AWS EC2 AutoScaling",
      resource_id: "arn:aws:autoscaling:us-east-1:123456789",
      current_spend: parseFloat(mockSpend.toFixed(2)),
      anomaly_spike: isAnomaly,
      timestamp: Date.now()
    };

    return costRecord;
  } catch (error: any) {
    console.error(`[Tech Worker] Error parsing cloud billing dashboard:`, error.message);
    return null;
  }
}

/**
 * The core asynchronous orchestration loop.
 * Routes endpoints to the correct headless extraction pipeline.
 */
async function startObservabilityPolling() {
  console.log("[Tech Worker] Waking up. Polling DevOps observability endpoints...");

  for (const endpoint of TARGET_ENDPOINTS) {
    if (endpoint.type === 'PR') {
      const prData = await syncPRHeadlessly(endpoint.url);
      if (prData) {
        datastore.upsertPRCache(prData);
        console.log(`[Tech Worker] ✅ Synchronized PR ${prData.repo_name}#${prData.pr_number}`);
      }
    } else if (endpoint.type === 'BILLING') {
      const costData = await syncBillingHeadlessly(endpoint.url);
      if (costData) {
        datastore.insertCloudCost(costData);
        if (costData.anomaly_spike) {
          console.warn(`[Tech Worker] ⚠️ RUNAWAY SPEND ANOMALY DETECTED on ${costData.service_name}: $${costData.current_spend}`);
        }
      }
    }
  }

  console.log("[Tech Worker] Polling loop complete. Yielding thread.");
}

/**
 * Bootstraps the background polling task.
 * Runs every hour to maintain fresh observability state without crushing local resources.
 */
export function initializeTechWorker() {
  console.log("[Tech Worker] Initializing Developer & Cloud Observability Automator...");
  cron.schedule('0 * * * *', () => {
    startObservabilityPolling();
  });
  
  // Fire immediately for initial syncing
  startObservabilityPolling();
}

// If invoked directly from CLI
if (true /* ESM execution */) {
  initializeTechWorker();
}
