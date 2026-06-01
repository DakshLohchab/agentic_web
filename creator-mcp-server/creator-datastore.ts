/**
 * File: creator-datastore.ts
 * Role: Primary datastore for the Creator & Brand Communications architecture.
 * 
 * Description:
 * Navigating modern social media platforms programmatically is incredibly brittle due to 
 * aggressive dynamic rendering and anti-bot measures. This module establishes a local 
 * SQLite datastore designed to cache audience mentions and queued content workflows.
 * 
 * By maintaining the Brand_Mentions and Content_Queue tables locally, the agentic browser 
 * extension can rapidly triage negative sentiment or schedule cross-platform posts without 
 * having to repeatedly render heavy React/Vue dashboards like Twitter, YouTube, or TikTok.
 * 
 * We utilize 'better-sqlite3' for guaranteed synchronous execution, ensuring that when 
 * the primary LLM requires audience sentiment data, the I/O layer returns instantaneously.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a scraped audience mention or brand engagement.
 */
export interface BrandMention {
  /** Unique primary key (often a hashed composite of the platform + post URL) */
  id: string;
  /** The social platform where the mention occurred (e.g., 'Twitter', 'TikTok') */
  platform: string;
  /** The public handle of the author (e.g., '@techreviewer') */
  author_handle: string;
  /** The raw text content of the post or comment */
  content_text: string;
  /** Normalized sentiment score (-1.0 to 1.0) indicating the tone of the mention */
  sentiment: number;
  /** Boolean flag indicating if the post requires human moderation (e.g., severe toxicity) */
  flagged_for_mod: number; // 0 for false, 1 for true
  /** Epoch timestamp of when the post was originally published */
  timestamp: number;
}

/**
 * Interface representing a multimedia asset queued for cross-platform distribution.
 */
export interface ContentQueue {
  /** Unique primary key for the scheduled asset */
  id: string;
  /** The absolute path to the local video or image asset (e.g., '/assets/vlog_final.mp4') */
  asset_path: string;
  /** Serialized JSON array of target platforms (e.g., '["YouTube", "TikTok"]') */
  target_platforms_json: string;
  /** Lifecycle execution state (e.g., 'PENDING', 'UPLOADING', 'PUBLISHED', 'FAILED') */
  post_status: string;
  /** Epoch timestamp representing when the asset should be publicly pushed */
  scheduled_time: number;
}

/**
 * CreatorDatastore class responsible for managing strict SQLite connection pooling 
 * and schema execution for the brand communications environment.
 */
export class CreatorDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for creator tracking.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'brand-communications.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the dual-schema tables for tracking brand mentions and the content queue.
   */
  private initializeSchema(): void {
    const createMentionsStmt = `
      CREATE TABLE IF NOT EXISTS Brand_Mentions (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        author_handle TEXT NOT NULL,
        content_text TEXT NOT NULL,
        sentiment REAL NOT NULL,
        flagged_for_mod INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `;
    
    const createQueueStmt = `
      CREATE TABLE IF NOT EXISTS Content_Queue (
        id TEXT PRIMARY KEY,
        asset_path TEXT NOT NULL,
        target_platforms_json TEXT NOT NULL,
        post_status TEXT NOT NULL,
        scheduled_time INTEGER NOT NULL
      );
    `;

    this.db.exec(createMentionsStmt);
    this.db.exec(createQueueStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_platform ON Brand_Mentions(platform);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_mod_flag ON Brand_Mentions(flagged_for_mod);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_post_status ON Content_Queue(post_status);`);
    
    console.log("[Creator Datastore] Mentions and Content Queue schemas initialized successfully.");
  }

  /**
   * Upserts an intercepted brand mention into the local cache.
   * 
   * @param mention - The BrandMention object representing the social post.
   * @returns boolean - True if the transaction succeeded.
   */
  public logMention(mention: BrandMention): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Brand_Mentions (
        id, platform, author_handle, content_text, sentiment, flagged_for_mod, timestamp
      ) VALUES (
        @id, @platform, @author_handle, @content_text, @sentiment, @flagged_for_mod, @timestamp
      )
      ON CONFLICT(id) DO UPDATE SET
        sentiment = excluded.sentiment,
        flagged_for_mod = excluded.flagged_for_mod
    `);

    try {
      stmt.run(mention);
      return true;
    } catch (err) {
      console.error("[Creator Datastore] Failed to log brand mention:", err);
      return false;
    }
  }

  /**
   * Queries the Content Queue for posts that are scheduled to go live.
   * 
   * @param beforeTimestamp - The epoch time threshold (e.g., current time).
   * @returns ContentQueue[] - Array of queued assets ready for publishing.
   */
  public queryPendingContent(beforeTimestamp: number): ContentQueue[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Content_Queue 
      WHERE post_status = 'PENDING' AND scheduled_time <= ?
      ORDER BY scheduled_time ASC
    `);
    
    try {
      return stmt.all(beforeTimestamp) as ContentQueue[];
    } catch (err) {
      console.error("[Creator Datastore] Error querying pending content:", err);
      return [];
    }
  }

  /**
   * Retrieves mentions that have been explicitly flagged for human moderation.
   * This provides the "Fast Path" for the agent to instantly triage toxic comments.
   * 
   * @returns BrandMention[] - Array of mentions requiring review.
   */
  public getModQueue(): BrandMention[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Brand_Mentions 
      WHERE flagged_for_mod = 1
      ORDER BY timestamp DESC
    `);
    
    try {
      return stmt.all() as BrandMention[];
    } catch (err) {
      console.error("[Creator Datastore] Error fetching moderation queue:", err);
      return [];
    }
  }

  /**
   * Queries the datastore for recent brand mentions, allowing for general sentiment analysis.
   * 
   * @param limit - Maximum number of recent mentions to return.
   * @returns BrandMention[] - Array of recent mentions.
   */
  public getRecentMentions(limit: number = 20): BrandMention[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Brand_Mentions 
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    
    try {
      return stmt.all(limit) as BrandMention[];
    } catch (err) {
      console.error("[Creator Datastore] Error fetching recent mentions:", err);
      return [];
    }
  }
}
