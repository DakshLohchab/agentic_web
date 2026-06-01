/**
 * File: admin-datastore.ts
 * Role: Primary datastore for the Enterprise Admin & SaaS Synchronization Automator.
 * 
 * Description:
 * In enterprise SaaS ecosystems, synchronizing data across siloed administrative dashboards
 * (like Salesforce, HubSpot, or Jira) via web automation requires perfect state management. 
 * This module acts as the SQLite persistence layer for mapping payload structures to specific 
 * DOM selectors on target SaaS platforms.
 * 
 * By maintaining the SaaS_Sync_Map and Form_Submission_Cache, the agentic browser extension 
 * can securely store mid-flight form states. If a web workflow is interrupted by an 
 * authentication wall or session timeout, the state_recovery_token ensures the agent 
 * can seamlessly resume data injection without data loss.
 * 
 * We use 'better-sqlite3' for robust, synchronous local I/O operations, guaranteeing 
 * that structural payload queries requested by the MCP server return instantly.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a structural map for automating a specific SaaS platform.
 */
export interface SaasSyncMap {
  /** Unique primary key mapping to a specific dashboard view (e.g., 'salesforce_lead_entry') */
  id: string;
  /** The generic name of the SaaS platform (e.g., 'Salesforce', 'HubSpot') */
  saas_platform_name: string;
  /** The specific stage in the automation pipeline (e.g., 'auth', 'data_entry', 'review') */
  pipeline_stage: string;
  /** Serialized JSON schema outlining the exact data payload required for this view */
  payload_mapping_json: string;
  /** Serialized JSON object mapping payload keys to precise CSS/XPath target locators */
  target_endpoint_selectors: string;
  /** Epoch timestamp representing the last successful synchronization to this mapping */
  last_synchronized: number;
}

/**
 * Interface representing a cached state of an active or pending form submission.
 */
export interface FormSubmissionCache {
  /** Unique primary key for the specific automation transaction */
  id: string;
  /** Business-level tracker ID (e.g., a Lead ID or Ticket Number) */
  tracker_id: string;
  /** The target SaaS platform type this payload is destined for */
  platform_type: string;
  /** Serialized JSON containing the raw business data to be injected into the DOM */
  injection_payload: string;
  /** Execution state enum (e.g., 'PENDING', 'IN_FLIGHT', 'FIREWALLED', 'SUCCESS') */
  execution_status_flag: string;
  /** Cryptographic token used to resume the automation flow if interrupted by a multi-page form */
  state_recovery_token: string;
}

/**
 * AdminDatastore class responsible for managing SQLite connection pooling and schema execution.
 */
export class AdminDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for SaaS synchronization tracking.
   * 
   * @param dbPath - The absolute or relative path to the SQLite file.
   */
  constructor(dbPath: string = path.join(__dirname, 'enterprise-sync.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the dual-schema tables for tracking maps and mid-flight form submissions.
   */
  private initializeSchema(): void {
    const createMapStmt = `
      CREATE TABLE IF NOT EXISTS SaaS_Sync_Map (
        id TEXT PRIMARY KEY,
        saas_platform_name TEXT NOT NULL,
        pipeline_stage TEXT NOT NULL,
        payload_mapping_json TEXT NOT NULL,
        target_endpoint_selectors TEXT NOT NULL,
        last_synchronized INTEGER NOT NULL
      );
    `;
    
    const createCacheStmt = `
      CREATE TABLE IF NOT EXISTS Form_Submission_Cache (
        id TEXT PRIMARY KEY,
        tracker_id TEXT NOT NULL,
        platform_type TEXT NOT NULL,
        injection_payload TEXT NOT NULL,
        execution_status_flag TEXT NOT NULL,
        state_recovery_token TEXT NOT NULL
      );
    `;

    this.db.exec(createMapStmt);
    this.db.exec(createCacheStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_saas_platform ON SaaS_Sync_Map(saas_platform_name);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_status_flag ON Form_Submission_Cache(execution_status_flag);`);
    
    console.log("[Admin Datastore] SaaS Synchronization schemas initialized successfully.");
  }

  /**
   * Upserts a structural configuration map for a SaaS target.
   * 
   * @param mapData - The comprehensive SaasSyncMap object.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertSaasMap(mapData: SaasSyncMap): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO SaaS_Sync_Map (
        id, saas_platform_name, pipeline_stage, payload_mapping_json, target_endpoint_selectors, last_synchronized
      ) VALUES (
        @id, @saas_platform_name, @pipeline_stage, @payload_mapping_json, @target_endpoint_selectors, @last_synchronized
      )
      ON CONFLICT(id) DO UPDATE SET
        pipeline_stage = excluded.pipeline_stage,
        payload_mapping_json = excluded.payload_mapping_json,
        target_endpoint_selectors = excluded.target_endpoint_selectors,
        last_synchronized = excluded.last_synchronized
    `);

    try {
      stmt.run(mapData);
      return true;
    } catch (err) {
      console.error("[Admin Datastore] Failed to upsert SaaS map:", err);
      return false;
    }
  }

  /**
   * Saves or updates a localized snapshot of a mid-flight form submission.
   * Crucial for maintaining state across nested iframes or multi-page wizard flows.
   * 
   * @param cache - The FormSubmissionCache object to persist.
   * @returns boolean - True if the transaction succeeded.
   */
  public saveFormSnapshot(cache: FormSubmissionCache): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Form_Submission_Cache (
        id, tracker_id, platform_type, injection_payload, execution_status_flag, state_recovery_token
      ) VALUES (
        @id, @tracker_id, @platform_type, @injection_payload, @execution_status_flag, @state_recovery_token
      )
      ON CONFLICT(id) DO UPDATE SET
        injection_payload = excluded.injection_payload,
        execution_status_flag = excluded.execution_status_flag,
        state_recovery_token = excluded.state_recovery_token
    `);

    try {
      stmt.run(cache);
      return true;
    } catch (err) {
      console.error("[Admin Datastore] Failed to save form snapshot:", err);
      return false;
    }
  }

  /**
   * Queries the structural element locators for a specific SaaS dashboard.
   * This is the "Fast Path" tool executed by the agent to understand a dashboard's
   * layout before ever loading the page visually.
   * 
   * @param platformName - The name of the SaaS platform (e.g., 'Salesforce').
   * @returns SaasSyncMap[] - Array of pipeline stage maps for the platform.
   */
  public queryStepConfigurations(platformName: string): SaasSyncMap[] {
    const stmt = this.db.prepare(`
      SELECT * FROM SaaS_Sync_Map 
      WHERE saas_platform_name = ?
      ORDER BY pipeline_stage ASC
    `);
    
    try {
      return stmt.all(platformName) as SaasSyncMap[];
    } catch (err) {
      console.error(`[Admin Datastore] Error fetching configurations for ${platformName}:`, err);
      return [];
    }
  }

  /**
   * Retrieves a specific mid-flight form payload to resume an interrupted automation.
   * 
   * @param recoveryToken - The secure cryptographic token tied to the session.
   * @returns FormSubmissionCache | undefined - The cached payload, if found.
   */
  public getSnapshotByToken(recoveryToken: string): FormSubmissionCache | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM Form_Submission_Cache 
      WHERE state_recovery_token = ? 
      LIMIT 1
    `);
    
    try {
      return stmt.get(recoveryToken) as FormSubmissionCache | undefined;
    } catch (err) {
      console.error(`[Admin Datastore] Error verifying recovery token:`, err);
      return undefined;
    }
  }
}
