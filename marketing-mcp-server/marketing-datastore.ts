/**
 * File: marketing-datastore.ts
 * Role: Primary datastore for the Competitor Intelligence & Diff Engine architecture.
 * 
 * Description:
 * In a highly competitive digital marketing environment, tracking minute changes to
 * a competitor's pricing tiers or feature pages can provide a massive tactical advantage.
 * This module acts as the core SQLite persistence layer for the agentic browser extension.
 * 
 * By storing deterministic hashes of competitor landing pages locally, the extension 
 * can instantly detect when a competitor pivots their strategy or alters pricing, entirely
 * avoiding the need to perform expensive, real-time web scraping during a user's prompt.
 * 
 * We utilize 'better-sqlite3' for extremely fast, synchronous local data access, 
 * ensuring the MCP (Model Context Protocol) queries from the agent return in milliseconds.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a tracked competitor entity within the Marketing schema.
 */
export interface CompetitorTracking {
  /** Unique primary key (e.g., UUID or hashed domain) */
  id: string;
  /** The name of the competing company (e.g., 'Stripe', 'Vercel') */
  company_name: string;
  /** The absolute URL being monitored (e.g., their /pricing page) */
  target_url: string;
  /** SHA-256 hash of the sanitized DOM text to detect silent copy/feature changes */
  page_text_hash: string;
  /** Serialized JSON array of the extracted pricing tiers for structured comparison */
  pricing_tier_json: string;
  /** Epoch timestamp representing the last successful scrape cycle */
  last_scraped_timestamp: number;
}

/**
 * MarketingDatastore class responsible for managing all SQLite connection transactions.
 * It encapsulates the schema definition and strictly typed CRUD operations.
 */
export class MarketingDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for competitor tracking.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'marketing-intelligence.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Creates the Competitor_Tracking schema.
   * The schema is flattened for speed. The pricing_tier_json field allows the LLM 
   * to easily parse structured historical arrays without requiring expensive SQL JOINs.
   */
  private initializeSchema(): void {
    const createTableStmt = `
      CREATE TABLE IF NOT EXISTS Competitor_Tracking (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        target_url TEXT NOT NULL,
        page_text_hash TEXT NOT NULL,
        pricing_tier_json TEXT NOT NULL,
        last_scraped_timestamp INTEGER NOT NULL
      );
    `;
    
    // Add an index on company_name to accelerate MCP lookups
    const createIndexStmt = `
      CREATE INDEX IF NOT EXISTS idx_company_name ON Competitor_Tracking(company_name);
    `;

    this.db.exec(createTableStmt);
    this.db.exec(createIndexStmt);
    console.log("[Marketing Datastore] Competitor Intelligence schema initialized.");
  }

  /**
   * Inserts or completely overwrites a competitor's tracking record.
   * 
   * @param record - The comprehensive CompetitorTracking object.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertCompetitor(record: CompetitorTracking): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Competitor_Tracking (
        id, company_name, target_url, page_text_hash, pricing_tier_json, last_scraped_timestamp
      ) VALUES (
        @id, @company_name, @target_url, @page_text_hash, @pricing_tier_json, @last_scraped_timestamp
      )
      ON CONFLICT(id) DO UPDATE SET
        company_name = excluded.company_name,
        target_url = excluded.target_url,
        page_text_hash = excluded.page_text_hash,
        pricing_tier_json = excluded.pricing_tier_json,
        last_scraped_timestamp = excluded.last_scraped_timestamp
    `);

    try {
      stmt.run(record);
      return true;
    } catch (err) {
      console.error("[Marketing Datastore] Failed to upsert competitor record:", err);
      return false;
    }
  }

  /**
   * Retrieves all competitor records whose scrape timestamp is older than the given cutoff.
   * Used strictly by the background cron job to manage the bi-weekly update cycle.
   * 
   * @param olderThanTimestamp - The epoch time threshold.
   * @returns CompetitorTracking[] - Array of stale records needing an update.
   */
  public getStaleRecords(olderThanTimestamp: number): CompetitorTracking[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Competitor_Tracking 
      WHERE last_scraped_timestamp < ?
    `);
    
    return stmt.all(olderThanTimestamp) as CompetitorTracking[];
  }

  /**
   * Fetches the current pricing and text hash data for a specific competitor.
   * This provides the "Fast Path" for the agentic extension to instantly detect changes.
   * 
   * @param companyName - The target company to query (e.g., 'Acme Corp').
   * @returns CompetitorTracking | undefined - The record if found.
   */
  public getCompetitorRecord(companyName: string): CompetitorTracking | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM Competitor_Tracking 
      WHERE company_name LIKE ?
    `);
    
    return stmt.get(`%${companyName}%`) as CompetitorTracking | undefined;
  }

  /**
   * Retrieves all known competitor updates from the local cache.
   * Enables the 'get_market_updates' MCP tool to provide a bird's-eye view.
   * 
   * @returns CompetitorTracking[] - Array of all tracked competitors.
   */
  public getAllMarketUpdates(): CompetitorTracking[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Competitor_Tracking
      ORDER BY last_scraped_timestamp DESC
    `);
    
    return stmt.all() as CompetitorTracking[];
  }
}
