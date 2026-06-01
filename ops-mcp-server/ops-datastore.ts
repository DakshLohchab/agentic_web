/**
 * File: ops-datastore.ts
 * Role: Primary datastore for the E-commerce & Hardware Procurement architecture.
 * 
 * Description:
 * In automated hardware procurement, searching multiple e-commerce vendors (like Amazon, 
 * Robu, and Robocraze) for the lowest price is a highly redundant and latency-heavy 
 * operation. This module acts as the core SQLite persistence layer for the agentic browser 
 * extension.
 * 
 * By maintaining a local inventory cache of previously discovered components, their 
 * vendors, and latest prices, the extension can instantly route the user directly to the 
 * cheapest 'product_url', entirely bypassing the web search phase and conserving LLM tokens.
 * 
 * We utilize 'better-sqlite3' for extremely fast, synchronous local data access, 
 * ensuring the MCP (Model Context Protocol) queries from the agent return in milliseconds.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a cached inventory component within the Operations schema.
 */
export interface InventoryCache {
  /** Unique primary key (typically a UUID or MD5 hash of component + vendor) */
  id: string;
  /** The generic or specific name of the hardware component (e.g., 'ESP32 Cam') */
  component_name: string;
  /** The name of the e-commerce vendor (e.g., 'Amazon', 'Robu') */
  vendor_name: string;
  /** The direct absolute URL to the product purchasing page */
  product_url: string;
  /** The lowest observed price during the last scrape */
  lowest_price: number;
  /** The availability of the product (e.g., 'In Stock', 'Out of Stock') */
  stock_status: string;
  /** Epoch timestamp representing the last successful scrape cycle */
  last_updated: number;
}

/**
 * OpsDatastore class responsible for managing all SQLite connection transactions.
 * It encapsulates the schema definition and strictly typed CRUD operations tailored 
 * for procurement intelligence.
 */
export class OpsDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for the inventory cache.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'procurement-inventory.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Creates the Inventory_Cache schema.
   * The schema is explicitly structured to support lightning-fast aggregate queries,
   * allowing the system to instantly find the MIN(lowest_price) for a given component.
   */
  private initializeSchema(): void {
    const createTableStmt = `
      CREATE TABLE IF NOT EXISTS Inventory_Cache (
        id TEXT PRIMARY KEY,
        component_name TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        product_url TEXT NOT NULL,
        lowest_price REAL NOT NULL,
        stock_status TEXT NOT NULL,
        last_updated INTEGER NOT NULL
      );
    `;
    
    // Add an index on component_name to drastically accelerate the agent's MCP queries
    const createIndexStmt = `
      CREATE INDEX IF NOT EXISTS idx_component_name ON Inventory_Cache(component_name);
    `;

    this.db.exec(createTableStmt);
    this.db.exec(createIndexStmt);
    console.log("[Ops Datastore] Inventory Cache schema initialized.");
  }

  /**
   * Inserts or updates a specific vendor's pricing record for a component.
   * Used exclusively by the multi-threaded price scraper worker to keep data fresh.
   * 
   * @param record - The comprehensive InventoryCache object.
   * @returns boolean - True if the transaction succeeded.
   */
  public updateComponentPrice(record: InventoryCache): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Inventory_Cache (
        id, component_name, vendor_name, product_url, lowest_price, stock_status, last_updated
      ) VALUES (
        @id, @component_name, @vendor_name, @product_url, @lowest_price, @stock_status, @last_updated
      )
      ON CONFLICT(id) DO UPDATE SET
        component_name = excluded.component_name,
        vendor_name = excluded.vendor_name,
        product_url = excluded.product_url,
        lowest_price = excluded.lowest_price,
        stock_status = excluded.stock_status,
        last_updated = excluded.last_updated
    `);

    try {
      stmt.run(record);
      return true;
    } catch (err) {
      console.error("[Ops Datastore] Failed to update component price:", err);
      return false;
    }
  }

  /**
   * Identifies the absolute cheapest vendor for a specific hardware component.
   * This is the "Fast Path" query. When the user asks to "buy an ESP32", the agent 
   * executes this query to instantly find the lowest price and navigates straight to checkout.
   * 
   * @param componentName - The generic component to search for (e.g., 'ESP32').
   * @returns InventoryCache | undefined - The cheapest in-stock record, or undefined if none exist.
   */
  public queryCheapestVendor(componentName: string): InventoryCache | undefined {
    // We use a LIKE clause to allow fuzzy matching, order by the lowest price, 
    // and explicitly filter out vendors where the item is out of stock.
    const stmt = this.db.prepare(`
      SELECT * FROM Inventory_Cache 
      WHERE component_name LIKE ? 
      AND stock_status != 'Out of Stock'
      ORDER BY lowest_price ASC 
      LIMIT 1
    `);
    
    return stmt.get(`%${componentName}%`) as InventoryCache | undefined;
  }

  /**
   * Retrieves all inventory records whose scrape timestamp is older than the given cutoff.
   * Used strictly by the background cron job to manage the bi-weekly update cycle.
   * 
   * @param olderThanTimestamp - The epoch time threshold (e.g., 14 days ago).
   * @returns InventoryCache[] - Array of stale inventory records needing an update.
   */
  public getStaleInventory(olderThanTimestamp: number): InventoryCache[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Inventory_Cache 
      WHERE last_updated < ?
    `);
    
    return stmt.all(olderThanTimestamp) as InventoryCache[];
  }
}
