/**
 * File: property-datastore.ts
 * Role: Primary datastore for the Real Estate & Property Aggregation architecture.
 * 
 * Description:
 * Hunting for real estate requires sifting through thousands of property listings across 
 * aggregators like Zillow, Redfin, or LoopNet. If an LLM agent tries to manually search, 
 * apply filters, and parse heavily paginated DOM grids in real-time, the token-burn and 
 * latency will be astronomical.
 * 
 * This module establishes a local SQLite datastore designed to cache pre-scraped property 
 * inventory. By maintaining the Property_Listings table, the agent can instantly filter 
 * properties locally (e.g., "Find all commercial zones under $500k") completely bypassing 
 * the massive overhead of active web scraping.
 * 
 * Powered by 'better-sqlite3' for strictly synchronous, high-speed execution, ensuring 
 * the Model Context Protocol (MCP) server can evaluate market constraints in milliseconds.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a cached real estate property listing.
 */
export interface PropertyListing {
  /** Unique primary key (e.g., MLS number or hashed address) */
  id: string;
  /** The standardized physical street address */
  address: string;
  /** The local municipal zoning classification (e.g., 'Residential', 'Commercial', 'Mixed-Use') */
  zoning_type: string;
  /** The absolute, real-time asking price of the property */
  current_price: number;
  /** Serialized JSON array tracking historical price cuts or hikes over time */
  price_history_json: string;
  /** Integer representing how long the property has been actively listed */
  days_on_market: number;
  /** Epoch timestamp representing the last successful scrape cycle */
  last_scraped: number;
}

/**
 * PropertyDatastore class responsible for managing strict SQLite connection pooling 
 * and schema execution for the real estate environment.
 */
export class PropertyDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for property inventory caching.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'real-estate-aggregation.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the schema for tracking property listings.
   * The schema is explicitly structured to support fast aggregate queries based on 
   * zoning types and dynamic pricing.
   */
  private initializeSchema(): void {
    const createListingStmt = `
      CREATE TABLE IF NOT EXISTS Property_Listings (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        zoning_type TEXT NOT NULL,
        current_price REAL NOT NULL,
        price_history_json TEXT NOT NULL,
        days_on_market INTEGER NOT NULL,
        last_scraped INTEGER NOT NULL
      );
    `;

    this.db.exec(createListingStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_zoning ON Property_Listings(zoning_type);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_price ON Property_Listings(current_price);`);
    
    console.log("[Property Datastore] Property Listings schema initialized successfully.");
  }

  /**
   * Upserts an active property listing into the local cache.
   * Maintains the critical price history matrix.
   * 
   * @param listing - The PropertyListing object representing the inventory state.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertListing(listing: PropertyListing): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Property_Listings (
        id, address, zoning_type, current_price, price_history_json, days_on_market, last_scraped
      ) VALUES (
        @id, @address, @zoning_type, @current_price, @price_history_json, @days_on_market, @last_scraped
      )
      ON CONFLICT(id) DO UPDATE SET
        current_price = excluded.current_price,
        price_history_json = excluded.price_history_json,
        days_on_market = excluded.days_on_market,
        last_scraped = excluded.last_scraped
    `);

    try {
      stmt.run(listing);
      return true;
    } catch (err) {
      console.error("[Property Datastore] Failed to upsert property listing:", err);
      return false;
    }
  }

  /**
   * Queries the datastore using specific constraints (e.g., Max Price and Zoning Type).
   * This provides the "Fast Path" for the agent to filter irrelevant properties locally.
   * 
   * @param maxPrice - The absolute ceiling budget.
   * @param zoningType - The targeted zoning classification (e.g., 'Commercial').
   * @param limit - Maximum number of properties to return.
   * @returns PropertyListing[] - Array of matching real estate properties.
   */
  public queryListingsByParameters(maxPrice: number, zoningType: string, limit: number = 10): PropertyListing[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Property_Listings 
      WHERE current_price <= ? AND zoning_type LIKE ?
      ORDER BY current_price ASC 
      LIMIT ?
    `);
    
    try {
      return stmt.all(maxPrice, `%${zoningType}%`, limit) as PropertyListing[];
    } catch (err) {
      console.error(`[Property Datastore] Error querying properties for ${zoningType} under $${maxPrice}:`, err);
      return [];
    }
  }

  /**
   * Retrieves all stale properties that require a headless price update.
   * Used strictly by the background cron job to manage the continuous scrape cycle.
   * 
   * @param olderThanTimestamp - The epoch time threshold (e.g., 24 hours ago).
   * @returns PropertyListing[] - Array of stale listings.
   */
  public getStaleListings(olderThanTimestamp: number): PropertyListing[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Property_Listings 
      WHERE last_scraped < ?
    `);
    
    return stmt.all(olderThanTimestamp) as PropertyListing[];
  }
}
