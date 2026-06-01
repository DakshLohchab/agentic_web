/**
 * File: logistics-datastore.ts
 * Role: Primary datastore for the Travel & Logistics Engineering architecture.
 * 
 * Description:
 * In automated logistics and travel procurement, dynamically shifting pricing matrices 
 * and unpredictable shipment delays require a hyper-responsive data layer. If an LLM 
 * attempts to manually browse flight aggregators or tracking portals in real-time, the 
 * latency (and bot-protection captchas) will shatter the user experience.
 * 
 * This module establishes a unified local SQLite datastore to cache historical itinerary 
 * pricing routes and maintain active shipment vectors. By caching this locally, the 
 * agent can establish a baseline for "dynamic_price" before it attempts to execute a live 
 * booking, ensuring the user is never overcharged by hidden surge fees.
 * 
 * Powered by 'better-sqlite3' for guaranteed synchronous, blocking-free I/O execution, 
 * ensuring Model Context Protocol (MCP) queries return in milliseconds.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a cached travel route or freight itinerary.
 */
export interface ItineraryMatrix {
  /** Unique primary key (often a hashed composite of origin, destination, and date) */
  id: string;
  /** A standardized route identifier (e.g., 'JFK-LHR-2026-10-14') */
  route_signature: string;
  /** Method of transport (e.g., 'AIR', 'OCEAN_FREIGHT', 'RAIL') */
  transport_mode: string;
  /** The baseline fluctuating price observed during the scrape */
  dynamic_price: number;
  /** Serialized JSON or string representing parsed hidden fees/taxes */
  hidden_fees: string;
  /** Epoch timestamp of the last successful pricing extraction */
  last_checked: number;
}

/**
 * Interface representing an active parcel or freight shipment in transit.
 */
export interface ActiveShipment {
  /** Unique primary key (typically the tracking number itself) */
  id: string;
  /** Standardized logistics tracking string */
  tracking_number: string;
  /** The corporate carrier (e.g., 'FedEx', 'Maersk', 'DHL') */
  carrier: string;
  /** The latest known lifecycle state (e.g., 'IN_TRANSIT', 'CUSTOMS_DELAY') */
  status_checkpoint: string;
  /** Geographic string or GeoJSON of the last scanned location */
  location_coords: string;
  /** Epoch timestamp of the last known carrier update */
  updated_at: number;
}

/**
 * LogisticsDatastore class responsible for managing strict SQLite connection pooling 
 * and schema execution for the travel and freight environment.
 */
export class LogisticsDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for logistics tracking.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'logistics-engineering.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the dual-schema tables for tracking itineraries and active shipments.
   */
  private initializeSchema(): void {
    const createItineraryStmt = `
      CREATE TABLE IF NOT EXISTS Itinerary_Matrix (
        id TEXT PRIMARY KEY,
        route_signature TEXT NOT NULL,
        transport_mode TEXT NOT NULL,
        dynamic_price REAL NOT NULL,
        hidden_fees TEXT NOT NULL,
        last_checked INTEGER NOT NULL
      );
    `;
    
    const createShipmentStmt = `
      CREATE TABLE IF NOT EXISTS Active_Shipments (
        id TEXT PRIMARY KEY,
        tracking_number TEXT NOT NULL,
        carrier TEXT NOT NULL,
        status_checkpoint TEXT NOT NULL,
        location_coords TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `;

    this.db.exec(createItineraryStmt);
    this.db.exec(createShipmentStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_route_sig ON Itinerary_Matrix(route_signature);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tracking_num ON Active_Shipments(tracking_number);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_status_checkpoint ON Active_Shipments(status_checkpoint);`);
    
    console.log("[Logistics Datastore] Itinerary Matrix and Shipment schemas initialized successfully.");
  }

  /**
   * Upserts pricing data for a specific travel or freight route.
   * Maintains the baseline for dynamic pricing detection.
   * 
   * @param matrix - The ItineraryMatrix object representing the route pricing state.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertRoutePricing(matrix: ItineraryMatrix): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Itinerary_Matrix (
        id, route_signature, transport_mode, dynamic_price, hidden_fees, last_checked
      ) VALUES (
        @id, @route_signature, @transport_mode, @dynamic_price, @hidden_fees, @last_checked
      )
      ON CONFLICT(id) DO UPDATE SET
        dynamic_price = excluded.dynamic_price,
        hidden_fees = excluded.hidden_fees,
        last_checked = excluded.last_checked
    `);

    try {
      stmt.run(matrix);
      return true;
    } catch (err) {
      console.error("[Logistics Datastore] Failed to upsert route pricing:", err);
      return false;
    }
  }

  /**
   * Queries the datastore for active shipments that are currently flagged with delays.
   * This provides the "Fast Path" for the agent to instantly notify users of logistical failures.
   * 
   * @returns ActiveShipment[] - Array of delayed shipments.
   */
  public queryDelayedShipments(): ActiveShipment[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Active_Shipments 
      WHERE status_checkpoint LIKE '%DELAY%' OR status_checkpoint LIKE '%EXCEPTION%'
      ORDER BY updated_at DESC
    `);
    
    try {
      return stmt.all() as ActiveShipment[];
    } catch (err) {
      console.error("[Logistics Datastore] Error fetching delayed shipments:", err);
      return [];
    }
  }

  /**
   * Upserts the tracking status for an active shipment into the local cache.
   * 
   * @param shipment - The ActiveShipment object representing the parcel state.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertShipmentStatus(shipment: ActiveShipment): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Active_Shipments (
        id, tracking_number, carrier, status_checkpoint, location_coords, updated_at
      ) VALUES (
        @id, @tracking_number, @carrier, @status_checkpoint, @location_coords, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        status_checkpoint = excluded.status_checkpoint,
        location_coords = excluded.location_coords,
        updated_at = excluded.updated_at
    `);

    try {
      stmt.run(shipment);
      return true;
    } catch (err) {
      console.error("[Logistics Datastore] Failed to upsert shipment status:", err);
      return false;
    }
  }

  /**
   * Retrieves the historical pricing matrix for a specific route signature.
   * 
   * @param routeSignature - The exact route identifier (e.g., 'JFK-LHR').
   * @returns ItineraryMatrix[] - Historical pricing records for the route.
   */
  public getRouteMatrix(routeSignature: string): ItineraryMatrix[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Itinerary_Matrix 
      WHERE route_signature LIKE ? 
      ORDER BY dynamic_price ASC
    `);
    
    try {
      return stmt.all(`%${routeSignature}%`) as ItineraryMatrix[];
    } catch (err) {
      console.error(`[Logistics Datastore] Error fetching route matrix for ${routeSignature}:`, err);
      return [];
    }
  }
}
