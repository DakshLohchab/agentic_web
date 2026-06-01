/**
 * File: research-datastore.ts
 * Role: Primary local datastore for the Deep Researcher & Cross-Tab Synthesis Engine.
 * 
 * Description:
 * In an agentic environment, cross-referencing vast amounts of technical documentation, 
 * financial prospectuses, or academic papers sequentially is profoundly slow. This datastore 
 * creates a rapid local knowledge graph. By heavily indexing extracted markdown summaries 
 * and pre-parsed JSON tables, the LLM can instantly synthesize complex topics without 
 * relying on sluggish browser navigation.
 * 
 * Furthermore, the Citation_Authority schema acts as a real-time trust ledger, 
 * ensuring the agent does not hallucinate facts from untrustworthy domains.
 * 
 * We use 'better-sqlite3' for synchronous, blocking-free SQLite queries. This guarantees 
 * that when the MCP server requests intelligence, the I/O operations execute in 
 * microseconds, optimizing the LLM's context window population.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a comprehensive research document extraction.
 */
export interface ResearchMatrix {
  /** Unique primary key (often a deterministic hash of the document_url) */
  id: string;
  /** A broad categorization key used to cluster related documents (e.g., 'quantum_computing') */
  topic_key: string;
  /** The absolute source URL of the parsed document */
  document_url: string;
  /** The heavily condensed, LLM-ready markdown summary of the text */
  extracted_markdown_summary: string;
  /** Any structural tables or datasets found in the text, serialized as JSON */
  clean_json_table_payload: string;
  /** A cryptographic hash of the raw text to detect silent document revisions */
  text_hash: string;
  /** Epoch timestamp representing the last successful parallel scraping validation */
  last_verified: number;
}

/**
 * Interface representing a domain's trust and citation authority score.
 */
export interface CitationAuthority {
  /** Unique primary key (typically the base domain name) */
  id: string;
  /** The URL being evaluated */
  citation_url: string;
  /** The parent domain or academic journal hosting the document */
  upstream_source_url: string;
  /** HTTP status code from the last connection attempt (e.g., 200, 403) */
  validator_status_code: number;
  /** Epoch timestamp of the domain's WHOIS creation date (older = generally more trustworthy) */
  whois_creation_timestamp: number;
  /** A normalized score (0.0 to 1.0) indicating the domain's factual reliability */
  trust_score: number;
}

/**
 * ResearchDatastore class responsible for managing all SQLite connection transactions.
 * It encapsulates the dual schema definition and strictly typed bulk operations.
 */
export class ResearchDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for deep research caching.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'research-intelligence.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Creates the Research_Matrix and Citation_Authority schemas.
   * We apply strict indexing to 'topic_key' and 'trust_score' to guarantee 
   * sub-millisecond query fulfillment for the MCP integration layer.
   */
  private initializeSchema(): void {
    // Schema 1: The Content Matrix
    const createMatrixStmt = `
      CREATE TABLE IF NOT EXISTS Research_Matrix (
        id TEXT PRIMARY KEY,
        topic_key TEXT NOT NULL,
        document_url TEXT NOT NULL,
        extracted_markdown_summary TEXT NOT NULL,
        clean_json_table_payload TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        last_verified INTEGER NOT NULL
      );
    `;
    
    // Schema 2: The Trust Ledger
    const createCitationStmt = `
      CREATE TABLE IF NOT EXISTS Citation_Authority (
        id TEXT PRIMARY KEY,
        citation_url TEXT NOT NULL,
        upstream_source_url TEXT NOT NULL,
        validator_status_code INTEGER NOT NULL,
        whois_creation_timestamp INTEGER NOT NULL,
        trust_score REAL NOT NULL
      );
    `;

    this.db.exec(createMatrixStmt);
    this.db.exec(createCitationStmt);

    // Create fast lookup indices
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_topic_key ON Research_Matrix(topic_key);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_trust_score ON Citation_Authority(trust_score);`);
    
    console.log("[Research Datastore] Schemas and indices initialized successfully.");
  }

  /**
   * Executes a bulk insert/update operation using SQLite transactions.
   * Ingesting 50 documents at once via a single transaction is vastly more performant 
   * than sequential inserts, saving immense I/O overhead.
   * 
   * @param matrices - Array of ResearchMatrix objects to batch insert.
   * @returns boolean - True if the transaction succeeded.
   */
  public bulkUpsertResearchMatrix(matrices: ResearchMatrix[]): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Research_Matrix (
        id, topic_key, document_url, extracted_markdown_summary, clean_json_table_payload, text_hash, last_verified
      ) VALUES (
        @id, @topic_key, @document_url, @extracted_markdown_summary, @clean_json_table_payload, @text_hash, @last_verified
      )
      ON CONFLICT(id) DO UPDATE SET
        topic_key = excluded.topic_key,
        extracted_markdown_summary = excluded.extracted_markdown_summary,
        clean_json_table_payload = excluded.clean_json_table_payload,
        text_hash = excluded.text_hash,
        last_verified = excluded.last_verified
    `);

    // Wrap the batch in a synchronous transaction
    const insertMany = this.db.transaction((records: ResearchMatrix[]) => {
      for (const record of records) {
        stmt.run(record);
      }
    });

    try {
      insertMany(matrices);
      return true;
    } catch (err) {
      console.error("[Research Datastore] Failed to execute bulk upsert on Research Matrix:", err);
      return false;
    }
  }

  /**
   * Upserts a single citation authority record into the trust ledger.
   * 
   * @param authority - The CitationAuthority object.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertCitationAuthority(authority: CitationAuthority): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Citation_Authority (
        id, citation_url, upstream_source_url, validator_status_code, whois_creation_timestamp, trust_score
      ) VALUES (
        @id, @citation_url, @upstream_source_url, @validator_status_code, @whois_creation_timestamp, @trust_score
      )
      ON CONFLICT(id) DO UPDATE SET
        validator_status_code = excluded.validator_status_code,
        trust_score = excluded.trust_score
    `);

    try {
      stmt.run(authority);
      return true;
    } catch (err) {
      console.error("[Research Datastore] Failed to upsert citation authority:", err);
      return false;
    }
  }

  /**
   * Pulls structural data matrices for a specific research topic.
   * This is the vital "Fast Path" query. It allows the agent to synthesize
   * massive cross-tab correlations instantly from local memory.
   * 
   * @param topicKey - The topic keyword to filter by.
   * @returns ResearchMatrix[] - Array of matching research records.
   */
  public queryMatrixByTopic(topicKey: string): ResearchMatrix[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Research_Matrix 
      WHERE topic_key = ? 
      ORDER BY last_verified DESC
    `);
    
    try {
      return stmt.all(topicKey) as ResearchMatrix[];
    } catch (err) {
      console.error(`[Research Datastore] Error querying topic ${topicKey}:`, err);
      return [];
    }
  }

  /**
   * Validates a source domain against the local trust ledger.
   * 
   * @param domainUrl - The base URL of the domain being queried.
   * @returns CitationAuthority | undefined - The trust profile, or undefined if unrated.
   */
  public getSourceAuthority(domainUrl: string): CitationAuthority | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM Citation_Authority 
      WHERE citation_url LIKE ? 
      LIMIT 1
    `);
    
    try {
      return stmt.get(`%${domainUrl}%`) as CitationAuthority | undefined;
    } catch (err) {
      console.error(`[Research Datastore] Error checking source authority for ${domainUrl}:`, err);
      return undefined;
    }
  }
}
