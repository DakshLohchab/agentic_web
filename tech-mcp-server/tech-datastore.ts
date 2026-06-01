/**
 * File: tech-datastore.ts
 * Role: Primary datastore for the Developer & Cloud Observability architecture.
 * 
 * Description:
 * Modern DevOps environments require instantaneous visibility into Pull Request (PR) states 
 * and runaway cloud billing (AWS, GCP, Azure). If an LLM agent attempts to manually scroll 
 * through a 10,000-line Datadog log file or a massive GitHub PR diff in the active browser tab, 
 * it will instantly exhaust its token context window and crash.
 * 
 * This module establishes a local SQLite datastore designed to cache highly-condensed, 
 * pre-summarized markdown representations of PR diffs and rolling cloud expenses. 
 * By querying this local ledger, the agent can instantly answer complex observability 
 * prompts (e.g., "Why did our AWS bill spike today?") without expensive live DOM scraping.
 * 
 * Powered by 'better-sqlite3' for strictly synchronous execution, ensuring zero-latency 
 * I/O performance when the agent's MCP server issues read queries.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a cached, pre-summarized Pull Request diff.
 */
export interface PRDiffCache {
  /** Unique primary key (e.g., Composite of repo_name + pr_number) */
  id: string;
  /** The standard repository string (e.g., 'org/repo-name') */
  repo_name: string;
  /** The integer ID of the Pull Request */
  pr_number: number;
  /** A highly-condensed markdown string summarizing the core logic changes */
  diff_summary_markdown: string;
  /** Boolean flag (1/0) indicating if the diff contains sensitive/vulnerable code patterns */
  security_flags: number;
  /** Epoch timestamp of the last successful background sync */
  last_polled: number;
}

/**
 * Interface representing a rolling ledger of cloud infrastructure expenses.
 */
export interface CloudCostLedger {
  /** Unique primary key (e.g., Composite of resource_id + timestamp day) */
  id: string;
  /** The cloud provider/service (e.g., 'AWS EC2', 'GCP BigQuery') */
  service_name: string;
  /** The exact ARN or instance ID generating the cost */
  resource_id: string;
  /** The total accrued spend for the billing cycle (in USD) */
  current_spend: number;
  /** Boolean flag (1/0) triggered if the spend delta exceeds the baseline threshold */
  anomaly_spike: number;
  /** Epoch timestamp indicating when the billing data was captured */
  timestamp: number;
}

/**
 * TechDatastore class responsible for managing strict SQLite connection pooling 
 * and schema execution for the DevOps observability environment.
 */
export class TechDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for developer and cloud tracking.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'devops-observability.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the dual-schema tables for tracking PR diffs and cloud expenses.
   */
  private initializeSchema(): void {
    const createPrStmt = `
      CREATE TABLE IF NOT EXISTS PR_Diff_Cache (
        id TEXT PRIMARY KEY,
        repo_name TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        diff_summary_markdown TEXT NOT NULL,
        security_flags INTEGER NOT NULL,
        last_polled INTEGER NOT NULL
      );
    `;
    
    const createCostStmt = `
      CREATE TABLE IF NOT EXISTS Cloud_Cost_Ledger (
        id TEXT PRIMARY KEY,
        service_name TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        current_spend REAL NOT NULL,
        anomaly_spike INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `;

    this.db.exec(createPrStmt);
    this.db.exec(createCostStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_repo_name ON PR_Diff_Cache(repo_name);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_service_name ON Cloud_Cost_Ledger(service_name);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_anomaly ON Cloud_Cost_Ledger(anomaly_spike);`);
    
    console.log("[Tech Datastore] PR Diff Cache and Cloud Cost Ledger schemas initialized successfully.");
  }

  /**
   * Upserts the condensed summary of a GitHub/GitLab Pull Request.
   * 
   * @param prCache - The PRDiffCache object representing the code state.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertPRCache(prCache: PRDiffCache): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO PR_Diff_Cache (
        id, repo_name, pr_number, diff_summary_markdown, security_flags, last_polled
      ) VALUES (
        @id, @repo_name, @pr_number, @diff_summary_markdown, @security_flags, @last_polled
      )
      ON CONFLICT(id) DO UPDATE SET
        diff_summary_markdown = excluded.diff_summary_markdown,
        security_flags = excluded.security_flags,
        last_polled = excluded.last_polled
    `);

    try {
      stmt.run(prCache);
      return true;
    } catch (err) {
      console.error("[Tech Datastore] Failed to upsert PR cache:", err);
      return false;
    }
  }

  /**
   * Inserts a new billing line item into the cloud cost ledger.
   * Used to establish historical baselines for anomaly detection.
   * 
   * @param costLine - The CloudCostLedger object representing the resource spend.
   * @returns boolean - True if the transaction succeeded.
   */
  public insertCloudCost(costLine: CloudCostLedger): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Cloud_Cost_Ledger (
        id, service_name, resource_id, current_spend, anomaly_spike, timestamp
      ) VALUES (
        @id, @service_name, @resource_id, @current_spend, @anomaly_spike, @timestamp
      )
      ON CONFLICT(id) DO UPDATE SET
        current_spend = excluded.current_spend,
        anomaly_spike = excluded.anomaly_spike,
        timestamp = excluded.timestamp
    `);

    try {
      stmt.run(costLine);
      return true;
    } catch (err) {
      console.error("[Tech Datastore] Failed to insert cloud cost:", err);
      return false;
    }
  }

  /**
   * Queries the local cache for a specific Pull Request's condensed summary.
   * This is the "Fast Path" tool executed by the agent to understand code changes instantly.
   * 
   * @param repoName - The target repository (e.g., 'acme/core-api').
   * @param prNumber - The PR ID.
   * @returns PRDiffCache | undefined - The cached summary if available.
   */
  public queryPRDiff(repoName: string, prNumber: number): PRDiffCache | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM PR_Diff_Cache 
      WHERE repo_name = ? AND pr_number = ?
      LIMIT 1
    `);
    
    try {
      return stmt.get(repoName, prNumber) as PRDiffCache | undefined;
    } catch (err) {
      console.error(`[Tech Datastore] Error fetching PR diff for ${repoName}#${prNumber}:`, err);
      return undefined;
    }
  }

  /**
   * Retrieves cloud billing records that have been flagged as anomalous spikes.
   * 
   * @returns CloudCostLedger[] - Array of runaway billing line items.
   */
  public queryCostAnomalies(): CloudCostLedger[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Cloud_Cost_Ledger 
      WHERE anomaly_spike = 1
      ORDER BY timestamp DESC
    `);
    
    try {
      return stmt.all() as CloudCostLedger[];
    } catch (err) {
      console.error("[Tech Datastore] Error fetching cloud anomalies:", err);
      return [];
    }
  }
}
