/**
 * File: legal-datastore.ts
 * Role: Primary datastore for the Legal Compliance & Policy Auditing architecture.
 * 
 * Description:
 * Monitoring corporate Terms of Service (TOS) updates or active court dockets manually 
 * is highly tedious. If an LLM agent attempts to scrape and read a 40-page legal document 
 * in real-time on every query, it will rapidly exhaust token limits and incur massive latency.
 * 
 * This module establishes a local SQLite datastore designed to cache exact cryptographic 
 * hashes of legal texts and court filings. By maintaining the TOS_Archive and Court_Dockets 
 * tables, the agent can instantly compare historical hashes to definitively answer if a 
 * policy has been silently updated, completely bypassing live text extraction.
 * 
 * We utilize 'better-sqlite3' for guaranteed synchronous execution, ensuring that when 
 * the primary LLM executes a legal verification tool, the I/O layer returns instantaneously.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing an archived corporate Terms of Service or Privacy Policy.
 */
export interface TOSArchive {
  /** Unique primary key (often a hashed composite of the company + document URL) */
  id: string;
  /** The standard corporate entity name (e.g., 'OpenAI', 'Google') */
  company_name: string;
  /** The direct URL to the public legal document */
  document_url: string;
  /** Cryptographic hash (SHA-256) of the pure, whitespace-stripped legal text */
  full_text_hash: string;
  /** Condensed string summarizing the last detected legal delta (if any) */
  delta_summary: string;
  /** Epoch timestamp of the last successful auditing cycle */
  last_audited: number;
}

/**
 * Interface representing a monitored active court docket or regulatory filing.
 */
export interface CourtDocket {
  /** Unique primary key (typically the exact case number) */
  id: string;
  /** The standardized legal case tracking number (e.g., '1:23-cv-01234') */
  case_number: string;
  /** The judicial branch or regulatory board (e.g., 'SDNY', 'FTC') */
  court_branch: string;
  /** A highly-condensed summary or raw text of the most recent filing */
  latest_filing_text: string;
  /** Epoch timestamp of when the filing was officially recorded */
  filing_date: number;
}

/**
 * LegalDatastore class responsible for managing strict SQLite connection pooling 
 * and schema execution for the legal compliance environment.
 */
export class LegalDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for legal auditing.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'legal-compliance.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the dual-schema tables for tracking TOS hashes and active dockets.
   */
  private initializeSchema(): void {
    const createTOSStmt = `
      CREATE TABLE IF NOT EXISTS TOS_Archive (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        document_url TEXT NOT NULL,
        full_text_hash TEXT NOT NULL,
        delta_summary TEXT NOT NULL,
        last_audited INTEGER NOT NULL
      );
    `;
    
    const createDocketStmt = `
      CREATE TABLE IF NOT EXISTS Court_Dockets (
        id TEXT PRIMARY KEY,
        case_number TEXT NOT NULL,
        court_branch TEXT NOT NULL,
        latest_filing_text TEXT NOT NULL,
        filing_date INTEGER NOT NULL
      );
    `;

    this.db.exec(createTOSStmt);
    this.db.exec(createDocketStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_company ON TOS_Archive(company_name);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_case_num ON Court_Dockets(case_number);`);
    
    console.log("[Legal Datastore] TOS Archive and Court Dockets schemas initialized successfully.");
  }

  /**
   * Retrieves an archived TOS record by company name to perform a diff comparison.
   * 
   * @param companyName - The targeted corporate entity.
   * @returns TOSArchive | undefined - The cached legal record.
   */
  public getTOSRecord(companyName: string): TOSArchive | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM TOS_Archive 
      WHERE company_name LIKE ? 
      LIMIT 1
    `);
    
    try {
      return stmt.get(`%${companyName}%`) as TOSArchive | undefined;
    } catch (err) {
      console.error(`[Legal Datastore] Error querying TOS record for ${companyName}:`, err);
      return undefined;
    }
  }

  /**
   * Upserts a corporate TOS record, logging the latest cryptographic text hash.
   * 
   * @param record - The TOSArchive object representing the latest audit state.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertTOSRecord(record: TOSArchive): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO TOS_Archive (
        id, company_name, document_url, full_text_hash, delta_summary, last_audited
      ) VALUES (
        @id, @company_name, @document_url, @full_text_hash, @delta_summary, @last_audited
      )
      ON CONFLICT(id) DO UPDATE SET
        full_text_hash = excluded.full_text_hash,
        delta_summary = excluded.delta_summary,
        last_audited = excluded.last_audited
    `);

    try {
      stmt.run(record);
      return true;
    } catch (err) {
      console.error("[Legal Datastore] Failed to upsert TOS record:", err);
      return false;
    }
  }

  /**
   * Upserts a new filing or update into an active court docket.
   * 
   * @param docket - The CourtDocket object representing the latest legal filing.
   * @returns boolean - True if the transaction succeeded.
   */
  public logCourtFiling(docket: CourtDocket): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Court_Dockets (
        id, case_number, court_branch, latest_filing_text, filing_date
      ) VALUES (
        @id, @case_number, @court_branch, @latest_filing_text, @filing_date
      )
      ON CONFLICT(id) DO UPDATE SET
        latest_filing_text = excluded.latest_filing_text,
        filing_date = excluded.filing_date
    `);

    try {
      stmt.run(docket);
      return true;
    } catch (err) {
      console.error("[Legal Datastore] Failed to log court filing:", err);
      return false;
    }
  }

  /**
   * Queries the datastore for active court dockets matching specific parameters.
   * 
   * @param courtBranch - The target judicial branch (e.g., 'SDNY').
   * @returns CourtDocket[] - Array of active legal cases.
   */
  public queryActiveDockets(courtBranch: string): CourtDocket[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Court_Dockets 
      WHERE court_branch LIKE ?
      ORDER BY filing_date DESC
    `);
    
    try {
      return stmt.all(`%${courtBranch}%`) as CourtDocket[];
    } catch (err) {
      console.error(`[Legal Datastore] Error fetching dockets for branch ${courtBranch}:`, err);
      return [];
    }
  }
}
