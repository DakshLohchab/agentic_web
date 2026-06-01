/**
 * File: finance-datastore.ts
 * Role: Primary datastore for the Financial Ledger & Real-Time Valuation Spot Tracker.
 * 
 * Description:
 * Financial operations in an agentic workflow require absolute precision and ultra-low 
 * latency. Relying on the LLM to actively browse trading view sites or manually fetch 
 * stock/commodity tickers for every portfolio prompt is dangerously slow and token-heavy.
 * 
 * This module establishes a highly secure, local SQLite persistence layer. It tracks 
 * two critical vectors: real-time asset valuations (fiat, equity, commodities) and 
 * an immutable compliance audit trail for transaction tracking. 
 * 
 * We use 'better-sqlite3' configured with 'WAL' (Write-Ahead Logging) to ensure 
 * complete transactional isolation. This guarantees that background worker price 
 * updates never lock the database when the primary agent executes a read query.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a tracked financial asset and its current valuation metrics.
 */
export interface AssetLedger {
  /** Unique primary key (e.g., UUID or the explicit ticker symbol) */
  id: string;
  /** The standard market ticker symbol (e.g., 'AAPL', 'BTC', 'XAU') */
  asset_symbol: string;
  /** Broad categorization (e.g., 'Equity', 'Cryptocurrency', 'Commodity') */
  asset_class: string;
  /** The fiat or base currency the asset is priced against (e.g., 'USD') */
  currency_denomination: string;
  /** The absolute, real-time spot value of the asset */
  current_spot_value: number;
  /** The 24-hour percentage change in valuation */
  daily_percentage_delta: number;
  /** Epoch timestamp of the last successful spot price fetch */
  last_reported_timestamp: number;
}

/**
 * Interface representing an immutable compliance record for transaction auditing.
 */
export interface ComplianceAuditTrail {
  /** Unique primary key for the audit record */
  id: string;
  /** Secure cryptographic hash of the underlying blockchain or banking transaction */
  transaction_hash: string;
  /** The counterparty or business entity involved */
  business_entity: string;
  /** The absolute monetary value of the expense */
  expense_value: number;
  /** Boolean/String flag indicating if the expense is cleared for tax deduction */
  tax_deductible_status: string;
  /** Hashed signature of the raw receipt page DOM to prevent tampering */
  page_receipt_hash: string;
}

/**
 * FinanceDatastore class responsible for managing strict SQLite connection pooling.
 */
export class FinanceDatastore {
  private db: Database.Database;

  /**
   * Initializes the highly-isolated SQLite database for financial tracking.
   * 
   * @param dbPath - The absolute or relative path to the SQLite file.
   */
  constructor(dbPath: string = path.join(__dirname, 'financial-ledger.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    
    // Enable Write-Ahead Logging (WAL) for maximum concurrency and data safety
    this.db.pragma('journal_mode = WAL');
    
    this.initializeSchema();
  }

  /**
   * Generates the dual-schema tables for tracking asset metrics and compliance audits.
   */
  private initializeSchema(): void {
    const createLedgerStmt = `
      CREATE TABLE IF NOT EXISTS Asset_Ledger (
        id TEXT PRIMARY KEY,
        asset_symbol TEXT NOT NULL,
        asset_class TEXT NOT NULL,
        currency_denomination TEXT NOT NULL,
        current_spot_value REAL NOT NULL,
        daily_percentage_delta REAL NOT NULL,
        last_reported_timestamp INTEGER NOT NULL
      );
    `;
    
    const createAuditStmt = `
      CREATE TABLE IF NOT EXISTS Compliance_Audit_Trail (
        id TEXT PRIMARY KEY,
        transaction_hash TEXT NOT NULL,
        business_entity TEXT NOT NULL,
        expense_value REAL NOT NULL,
        tax_deductible_status TEXT NOT NULL,
        page_receipt_hash TEXT NOT NULL
      );
    `;

    this.db.exec(createLedgerStmt);
    this.db.exec(createAuditStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_asset_symbol ON Asset_Ledger(asset_symbol);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_business_entity ON Compliance_Audit_Trail(business_entity);`);
    
    console.log("[Finance Datastore] Asset Ledger and Audit Trail schemas initialized successfully.");
  }

  /**
   * Upserts multiple asset valuations within a single, strictly isolated transaction.
   * This ensures that multi-asset portfolio updates do not result in fragmented reads.
   * 
   * @param assets - Array of AssetLedger objects containing the latest spot prices.
   * @returns boolean - True if the bulk transaction committed successfully.
   */
  public bulkUpdateAssetValuations(assets: AssetLedger[]): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Asset_Ledger (
        id, asset_symbol, asset_class, currency_denomination, current_spot_value, daily_percentage_delta, last_reported_timestamp
      ) VALUES (
        @id, @asset_symbol, @asset_class, @currency_denomination, @current_spot_value, @daily_percentage_delta, @last_reported_timestamp
      )
      ON CONFLICT(id) DO UPDATE SET
        current_spot_value = excluded.current_spot_value,
        daily_percentage_delta = excluded.daily_percentage_delta,
        last_reported_timestamp = excluded.last_reported_timestamp
    `);

    // Wrap the batch in a synchronous, atomic transaction
    const updateMany = this.db.transaction((records: AssetLedger[]) => {
      for (const record of records) {
        stmt.run(record);
      }
    });

    try {
      updateMany(assets);
      return true;
    } catch (err) {
      console.error("[Finance Datastore] Failed to execute bulk asset valuation transaction:", err);
      return false;
    }
  }

  /**
   * Logs an immutable compliance record into the audit trail.
   * 
   * @param audit - The ComplianceAuditTrail object to persist.
   * @returns boolean - True if the record was securely written.
   */
  public logComplianceAudit(audit: ComplianceAuditTrail): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Compliance_Audit_Trail (
        id, transaction_hash, business_entity, expense_value, tax_deductible_status, page_receipt_hash
      ) VALUES (
        @id, @transaction_hash, @business_entity, @expense_value, @tax_deductible_status, @page_receipt_hash
      )
    `);

    try {
      stmt.run(audit);
      return true;
    } catch (err) {
      console.error("[Finance Datastore] Failed to log compliance audit:", err);
      return false;
    }
  }

  /**
   * Queries the absolute latest spot valuation for a specific asset ticker.
   * This is the "Fast Path" query used by the agent to instantly build portfolio reports.
   * 
   * @param assetSymbol - The market ticker (e.g., 'AAPL').
   * @returns AssetLedger | undefined - The valuation record, if tracking.
   */
  public querySpotValuation(assetSymbol: string): AssetLedger | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM Asset_Ledger 
      WHERE asset_symbol = ? 
      LIMIT 1
    `);
    
    try {
      return stmt.get(assetSymbol) as AssetLedger | undefined;
    } catch (err) {
      console.error(`[Finance Datastore] Error querying spot value for ${assetSymbol}:`, err);
      return undefined;
    }
  }

  /**
   * Pulls structural historical strings matching receipt vectors for a given entity.
   * 
   * @param businessEntity - The counterparty entity to search for.
   * @returns ComplianceAuditTrail[] - Array of matched audit records.
   */
  public fetchComplianceHistory(businessEntity: string): ComplianceAuditTrail[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Compliance_Audit_Trail 
      WHERE business_entity LIKE ?
    `);
    
    try {
      return stmt.all(`%${businessEntity}%`) as ComplianceAuditTrail[];
    } catch (err) {
      console.error(`[Finance Datastore] Error fetching compliance history for ${businessEntity}:`, err);
      return [];
    }
  }
}
