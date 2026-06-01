/**
 * File: pr-datastore.ts
 * Role: Primary datastore for the PR & Media Monitoring architecture.
 * 
 * Description:
 * This module is the foundational data layer for the agentic PR system. It leverages 
 * SQLite to store media mentions locally with extreme read/write efficiency. By maintaining 
 * a structured cache of articles, journalists, and sentiment scores, the agentic browser 
 * extension can execute hyper-personalized email pitching and trend analysis instantly, 
 * completely bypassing the slow latency of searching Google News in real-time.
 * 
 * We use 'better-sqlite3' for robust, synchronous local I/O operations, ensuring
 * our MCP server remains blocking-free and lightning fast when requested by the primary LLM.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a Media Mention entity within the PR schema.
 */
export interface MediaMention {
  /** Unique primary key (often a UUID or a deterministic hash of the URL) */
  id: string;
  /** The name of the journalist who authored the piece */
  journalist_name: string;
  /** The publishing outlet (e.g., 'TechCrunch', 'Wired') */
  outlet: string;
  /** Absolute URL pointing to the published article */
  article_url: string;
  /** SHA-256 hash of the extracted article text to detect silent ninja-edits by the publisher */
  extracted_text_hash: string;
  /** Normalized sentiment score (-1.0 to 1.0) indicating the article's tone */
  sentiment_score: number;
  /** Epoch timestamp of when the article was originally published */
  publication_date: number;
  /** Epoch timestamp representing the last time the background worker validated this link */
  last_checked: number;
}

/**
 * PRDatastore class responsible for managing SQLite connection pooling and schema execution.
 */
export class PRDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for media tracking.
   * 
   * @param dbPath - The absolute or relative path to the SQLite file.
   */
  constructor(dbPath: string = path.join(__dirname, 'pr-mentions.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the schema for tracking media mentions.
   * The schema is explicitly structured to support fast lookups by journalist name,
   * which is the critical access pattern when the agent is drafting PR pitch emails.
   */
  private initializeSchema(): void {
    const createTableStmt = `
      CREATE TABLE IF NOT EXISTS Media_Mentions (
        id TEXT PRIMARY KEY,
        journalist_name TEXT NOT NULL,
        outlet TEXT NOT NULL,
        article_url TEXT NOT NULL,
        extracted_text_hash TEXT NOT NULL,
        sentiment_score REAL NOT NULL,
        publication_date INTEGER NOT NULL,
        last_checked INTEGER NOT NULL
      );
    `;
    
    // We add an index on journalist_name to drastically accelerate the generate_pitch_context MCP tool
    const createIndexStmt = `
      CREATE INDEX IF NOT EXISTS idx_journalist_name ON Media_Mentions(journalist_name);
    `;

    this.db.exec(createTableStmt);
    this.db.exec(createIndexStmt);
    console.log("[PR Datastore] Media Mentions schema initialized successfully.");
  }

  /**
   * Upserts an article mention into the local SQLite database.
   * If an article with the same ID already exists (e.g., it was updated by the publisher),
   * the record's hash and sentiment are gracefully updated.
   * 
   * @param mention - The complete MediaMention object to insert or update.
   * @returns boolean - True if the transaction succeeded.
   */
  public logMention(mention: MediaMention): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Media_Mentions (
        id, journalist_name, outlet, article_url, extracted_text_hash, sentiment_score, publication_date, last_checked
      ) VALUES (
        @id, @journalist_name, @outlet, @article_url, @extracted_text_hash, @sentiment_score, @publication_date, @last_checked
      )
      ON CONFLICT(id) DO UPDATE SET
        journalist_name = excluded.journalist_name,
        outlet = excluded.outlet,
        extracted_text_hash = excluded.extracted_text_hash,
        sentiment_score = excluded.sentiment_score,
        last_checked = excluded.last_checked
    `);

    try {
      stmt.run(mention);
      return true;
    } catch (err) {
      console.error("[PR Datastore] Failed to log media mention:", err);
      return false;
    }
  }

  /**
   * Queries the database for the most recently published articles across all outlets.
   * Useful for the agent to generate a "Morning PR Briefing".
   * 
   * @param limit - The maximum number of recent articles to retrieve.
   * @returns MediaMention[] - Array of recently published articles.
   */
  public queryRecentMentions(limit: number = 10): MediaMention[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Media_Mentions 
      ORDER BY publication_date DESC 
      LIMIT ?
    `);
    
    try {
      return stmt.all(limit) as MediaMention[];
    } catch (err) {
      console.error("[PR Datastore] Error querying recent mentions:", err);
      return [];
    }
  }

  /**
   * Retrieves the historical article coverage for a specific journalist.
   * This is the vital "Fast Path" query used when drafting highly personalized emails,
   * allowing the agent to reference the journalist's exact recent works.
   * 
   * @param journalistName - The exact string matching the journalist's name.
   * @param limit - How many historical articles to pull (default 3 for pitch context).
   * @returns MediaMention[] - List of articles authored by the journalist, sorted by newest first.
   */
  public getJournalistHistory(journalistName: string, limit: number = 3): MediaMention[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Media_Mentions 
      WHERE journalist_name = ? 
      ORDER BY publication_date DESC 
      LIMIT ?
    `);
    
    try {
      return stmt.all(journalistName, limit) as MediaMention[];
    } catch (err) {
      console.error(`[PR Datastore] Error fetching history for ${journalistName}:`, err);
      return [];
    }
  }
}
