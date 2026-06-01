/**
 * File: media-datastore.ts
 * Role: Primary datastore for the Entertainment & Media Curation architecture.
 * 
 * Description:
 * Attempting to procure event tickets (e.g., Ticketmaster, SeatGeek) via a live agentic 
 * browser session is extremely difficult. Ticketing platforms utilize dynamic queue rooms, 
 * anti-bot captchas, and volatile pricing maps. An LLM executing raw 'wait' and 'refresh' 
 * loops in an active tab will inevitably burn through context tokens and trigger bot defenses.
 * 
 * This module establishes a local SQLite datastore designed to cache background-polled 
 * ticket pricing and curated media assets. By querying this cache, the agent can instantly 
 * inform the user when a queue has opened or prices have dropped, completely avoiding 
 * active-tab hallucination loops.
 * 
 * Powered by 'better-sqlite3' to provide blocking-free, synchronous I/O when the Model 
 * Context Protocol (MCP) server evaluates availability.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a monitored live event or concert ticket.
 */
export interface EventTicket {
  /** Unique primary key (often a hashed composite of venue and date) */
  id: string;
  /** The standardized name of the arena or venue (e.g., 'Madison Square Garden') */
  venue_name: string;
  /** Epoch timestamp representing the actual event start time */
  event_date: number;
  /** Current state of the purchasing queue (e.g., 'PRE_QUEUE', 'OPEN', 'SOLD_OUT') */
  queue_status: string;
  /** The lowest secondary-market or face-value price detected (in USD) */
  lowest_resale_price: number;
  /** Epoch timestamp of the last successful background polling cycle */
  last_checked: number;
}

/**
 * Interface representing a saved media bookmark or curated playlist asset.
 */
export interface CuratedFeedAsset {
  /** Unique primary key (typically the asset URL hash) */
  id: string;
  /** The title of the article, video, or audio track */
  asset_title: string;
  /** Serialized JSON array of categorical tags (e.g., '["music", "live_performance"]') */
  tags_json: string;
  /** The direct URL to the media asset */
  source_url: string;
  /** Lifecycle state (e.g., 'UNREAD', 'ARCHIVED') */
  archived_status: string;
}

/**
 * MediaDatastore class responsible for managing strict SQLite connection pooling 
 * and schema execution for the entertainment environment.
 */
export class MediaDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for media and ticket tracking.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'media-curation.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the dual-schema tables for tracking volatile tickets and curated media.
   */
  private initializeSchema(): void {
    const createTicketsStmt = `
      CREATE TABLE IF NOT EXISTS Event_Tickets (
        id TEXT PRIMARY KEY,
        venue_name TEXT NOT NULL,
        event_date INTEGER NOT NULL,
        queue_status TEXT NOT NULL,
        lowest_resale_price REAL NOT NULL,
        last_checked INTEGER NOT NULL
      );
    `;
    
    const createCuratedStmt = `
      CREATE TABLE IF NOT EXISTS Curated_Feeds (
        id TEXT PRIMARY KEY,
        asset_title TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        source_url TEXT NOT NULL,
        archived_status TEXT NOT NULL
      );
    `;

    this.db.exec(createTicketsStmt);
    this.db.exec(createCuratedStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_venue ON Event_Tickets(venue_name);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_status ON Event_Tickets(queue_status);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_archived ON Curated_Feeds(archived_status);`);
    
    console.log("[Media Datastore] Ticket Matrix and Curated Feeds schemas initialized successfully.");
  }

  /**
   * Upserts the latest pricing and queue status for a tracked event.
   * Maintains the baseline for sudden price drops.
   * 
   * @param ticket - The EventTicket object representing the current market state.
   * @returns boolean - True if the transaction succeeded.
   */
  public updateTicketPricing(ticket: EventTicket): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Event_Tickets (
        id, venue_name, event_date, queue_status, lowest_resale_price, last_checked
      ) VALUES (
        @id, @venue_name, @event_date, @queue_status, @lowest_resale_price, @last_checked
      )
      ON CONFLICT(id) DO UPDATE SET
        queue_status = excluded.queue_status,
        lowest_resale_price = excluded.lowest_resale_price,
        last_checked = excluded.last_checked
    `);

    try {
      stmt.run(ticket);
      return true;
    } catch (err) {
      console.error("[Media Datastore] Failed to update ticket pricing:", err);
      return false;
    }
  }

  /**
   * Queries the datastore for live events matching specific venue constraints.
   * This provides the "Fast Path" for the agent to instantly verify availability.
   * 
   * @param venueName - The target venue to filter.
   * @returns EventTicket[] - Array of matching event states.
   */
  public queryTicketAvailability(venueName: string): EventTicket[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Event_Tickets 
      WHERE venue_name LIKE ?
      ORDER BY lowest_resale_price ASC
    `);
    
    try {
      return stmt.all(`%${venueName}%`) as EventTicket[];
    } catch (err) {
      console.error(`[Media Datastore] Error fetching tickets for ${venueName}:`, err);
      return [];
    }
  }

  /**
   * Retrieves active, unarchived media assets matching a specific tag.
   * 
   * @param tag - The targeted metadata tag (e.g., 'podcast').
   * @returns CuratedFeedAsset[] - Array of relevant bookmarks.
   */
  public queryCuratedAssets(tag: string): CuratedFeedAsset[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Curated_Feeds 
      WHERE archived_status = 'UNREAD' AND tags_json LIKE ?
      ORDER BY id DESC
    `);
    
    try {
      return stmt.all(`%${tag}%`) as CuratedFeedAsset[];
    } catch (err) {
      console.error(`[Media Datastore] Error fetching curated assets for tag ${tag}:`, err);
      return [];
    }
  }
}
