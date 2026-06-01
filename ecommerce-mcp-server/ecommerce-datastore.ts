/**
 * File: ecommerce-datastore.ts
 * Role: Primary datastore for the E-Commerce & Retail Intelligence architecture.
 * 
 * Description:
 * E-commerce navigation presents a massive token drain for LLM agents. 
 * E-commerce sites are heavily paginated, littered with dynamic "Flash Sale" banners,
 * and frequently obscure exact product availability behind complex variants (e.g., size/color).
 * If an agent navigates a live storefront visually to compare prices across Amazon, Shopify, 
 * and Walmart, it will trigger anti-bot Captchas and exhaust context windows quickly.
 * 
 * This module establishes a hyper-fast local SQLite datastore designed to cache competitive 
 * product pricing, stock availability, and promotional coupon codes. By querying this 
 * local 'Fast Path', the agent can instantly deduce the optimal purchasing route before 
 * firing a single browser 'navigate' action.
 * 
 * Powered by 'better-sqlite3' for guaranteed synchronous execution, ensuring that 
 * market-evaluation MCP tool calls resolve in milliseconds.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a tracked retail product across multiple vendors.
 */
export interface TrackedProduct {
  /** Unique primary key (often the standardized UPC, ASIN, or product slug) */
  id: string;
  /** Human-readable product name (e.g., 'Sony WH-1000XM5 Headphones') */
  product_name: string;
  /** The specific retailer offering this price (e.g., 'Amazon', 'BestBuy') */
  vendor_name: string;
  /** The direct URL to the product detail page */
  product_url: string;
  /** The current live price (in USD) */
  current_price: number;
  /** Boolean indicating if the product is actively in stock */
  in_stock: boolean;
  /** Epoch timestamp of the last successful background pricing sync */
  last_audited: number;
}

/**
 * Interface representing an active promotional code or discount coupon.
 */
export interface PromotionalCoupon {
  /** Unique primary key (e.g., 'AMAZON-SUMMER-20') */
  id: string;
  /** The exact string required at checkout (e.g., 'SAVE20') */
  coupon_code: string;
  /** The retailer this code applies to */
  vendor_name: string;
  /** Absolute discount amount or percentage (e.g., '20% OFF' or '$15 OFF') */
  discount_value: string;
  /** Boolean tracking if the code successfully worked on the last automated attempt */
  is_verified_working: boolean;
  /** Epoch timestamp of when the coupon was last tested */
  last_tested: number;
}

/**
 * EcommerceDatastore class responsible for managing strict SQLite connection pooling 
 * and executing synchronous schema operations for the retail environment.
 */
export class EcommerceDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for e-commerce pricing and promotions.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'ecommerce-intelligence.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the optimized tables for tracking retail products and active coupons.
   * WAL (Write-Ahead Logging) is enabled via PRAGMA to ensure background scrapers 
   * don't lock the database during an active agentic query.
   */
  private initializeSchema(): void {
    this.db.pragma('journal_mode = WAL');

    const createProductStmt = `
      CREATE TABLE IF NOT EXISTS Product_Tracker (
        id TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        product_url TEXT NOT NULL,
        current_price REAL NOT NULL,
        in_stock INTEGER NOT NULL,
        last_audited INTEGER NOT NULL
      );
    `;
    
    const createCouponStmt = `
      CREATE TABLE IF NOT EXISTS Coupon_Vault (
        id TEXT PRIMARY KEY,
        coupon_code TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        discount_value TEXT NOT NULL,
        is_verified_working INTEGER NOT NULL,
        last_tested INTEGER NOT NULL
      );
    `;

    this.db.exec(createProductStmt);
    this.db.exec(createCouponStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_product_name ON Product_Tracker(product_name);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_coupon ON Coupon_Vault(vendor_name);`);
    
    console.log("[E-Commerce Datastore] Product Tracker and Coupon Vault schemas initialized successfully.");
  }

  /**
   * Upserts the latest pricing and stock status for a specific retail product.
   * 
   * @param product - The TrackedProduct object representing the current market state.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertProduct(product: TrackedProduct): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Product_Tracker (
        id, product_name, vendor_name, product_url, current_price, in_stock, last_audited
      ) VALUES (
        @id, @product_name, @vendor_name, @product_url, @current_price, @in_stock, @last_audited
      )
      ON CONFLICT(id) DO UPDATE SET
        current_price = excluded.current_price,
        in_stock = excluded.in_stock,
        last_audited = excluded.last_audited
    `);

    try {
      // Convert boolean to integer (1 or 0) for SQLite compatibility
      const payload = {
        ...product,
        in_stock: product.in_stock ? 1 : 0
      };
      stmt.run(payload);
      return true;
    } catch (err) {
      console.error("[E-Commerce Datastore] Failed to upsert product pricing:", err);
      return false;
    }
  }

  /**
   * Retrieves the absolute cheapest available vendor for a specific product.
   * This is the critical "Fast Path" query. Before the LLM agent clicks around Amazon, 
   * it hits this function to instantly determine if Walmart or BestBuy is currently cheaper.
   * 
   * @param productName - The target item (e.g., 'Sony WH-1000XM5').
   * @returns TrackedProduct | undefined - The cheapest, in-stock vendor profile.
   */
  public getCheapestAvailableVendor(productName: string): TrackedProduct | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM Product_Tracker 
      WHERE product_name LIKE ? AND in_stock = 1
      ORDER BY current_price ASC 
      LIMIT 1
    `);
    
    try {
      const result = stmt.get(`%${productName}%`) as any;
      if (!result) return undefined;

      return {
        ...result,
        in_stock: result.in_stock === 1
      };
    } catch (err) {
      console.error(`[E-Commerce Datastore] Error querying cheapest vendor for ${productName}:`, err);
      return undefined;
    }
  }

  /**
   * Upserts a discovered promotional code into the Coupon Vault.
   * 
   * @param coupon - The PromotionalCoupon object to cache.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertCoupon(coupon: PromotionalCoupon): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Coupon_Vault (
        id, coupon_code, vendor_name, discount_value, is_verified_working, last_tested
      ) VALUES (
        @id, @coupon_code, @vendor_name, @discount_value, @is_verified_working, @last_tested
      )
      ON CONFLICT(id) DO UPDATE SET
        is_verified_working = excluded.is_verified_working,
        last_tested = excluded.last_tested
    `);

    try {
      const payload = {
        ...coupon,
        is_verified_working: coupon.is_verified_working ? 1 : 0
      };
      stmt.run(payload);
      return true;
    } catch (err) {
      console.error("[E-Commerce Datastore] Failed to upsert coupon code:", err);
      return false;
    }
  }

  /**
   * Queries the datastore for verified working coupons for a specific checkout flow.
   * 
   * @param vendorName - The target retailer (e.g., 'Amazon').
   * @returns PromotionalCoupon[] - Array of active coupons.
   */
  public getVerifiedCoupons(vendorName: string): PromotionalCoupon[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Coupon_Vault 
      WHERE vendor_name LIKE ? AND is_verified_working = 1
      ORDER BY last_tested DESC
    `);
    
    try {
      const results = stmt.all(`%${vendorName}%`) as any[];
      return results.map(row => ({
        ...row,
        is_verified_working: row.is_verified_working === 1
      }));
    } catch (err) {
      console.error(`[E-Commerce Datastore] Error fetching coupons for ${vendorName}:`, err);
      return [];
    }
  }
}
