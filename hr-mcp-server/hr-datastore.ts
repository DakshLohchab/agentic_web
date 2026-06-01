/**
 * File: hr-datastore.ts
 * Role: Primary datastore for the Candidate Sourcing & ATS Synchronization module.
 * 
 * Description:
 * This file handles the initialization and interactions with the local SQLite database.
 * In a high-volume HR parsing architecture, maintaining a local cache of candidate
 * profiles drastically reduces network latency and API costs. By keeping candidates
 * stored locally, the agentic browser extension can rapidly filter and query
 * candidates before deciding to open active browser tabs or spawn new scraping workers.
 * 
 * We use 'better-sqlite3' for extremely fast, synchronous local database access,
 * ensuring our MCP (Model Context Protocol) queries do not suffer from asynchronous overhead
 * when serving the primary agent.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a Candidate entity within the ATS synchronization schema.
 */
export interface Candidate {
  /** Unique identifier for the candidate */
  id: string;
  /** Full name of the candidate */
  candidate_name: string;
  /** The most recent job title or role the candidate holds */
  current_role: string;
  /** JSON stringified array of technical and soft skills parsed from their profile */
  parsed_skills_json: string;
  /** URL to the candidate's GitHub profile for technical verification */
  github_url: string;
  /** URL to the candidate's LinkedIn profile for career history */
  linkedin_url: string;
  /** Epoch timestamp (in milliseconds) representing the last time the profile was scraped */
  last_profile_update: number;
}

/**
 * HRDatastore class responsible for managing all database transactions.
 * It provides strict typings and encapsulates the SQLite connection pool.
 */
export class HRDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database and creates the required schema if it does not exist.
   * 
   * @param dbPath - The file path where the SQLite database should be stored.
   */
  constructor(dbPath: string = path.join(__dirname, 'candidates.db')) {
    // Open the SQLite database. If the file doesn't exist, better-sqlite3 creates it.
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Creates the initial Candidates table schema to cache candidate entities.
   * We store parsed_skills_json as a TEXT field since SQLite lacks a native JSON array type,
   * but it allows for robust LIKE queries or application-side parsing.
   */
  private initializeSchema(): void {
    const createTableStmt = `
      CREATE TABLE IF NOT EXISTS Candidates (
        id TEXT PRIMARY KEY,
        candidate_name TEXT NOT NULL,
        current_role TEXT,
        parsed_skills_json TEXT,
        github_url TEXT,
        linkedin_url TEXT,
        last_profile_update INTEGER
      );
    `;
    this.db.exec(createTableStmt);
    console.log("[HR Datastore] Schema initialized successfully.");
  }

  /**
   * Upserts a candidate record into the local SQLite database.
   * If a candidate with the same ID exists, their information is updated.
   * This is critical for the background caching loop to keep profiles fresh.
   * 
   * @param candidate - The complete Candidate object to insert or update.
   * @returns boolean - True if the operation succeeded.
   */
  public upsertCandidate(candidate: Candidate): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Candidates (
        id, candidate_name, current_role, parsed_skills_json, github_url, linkedin_url, last_profile_update
      ) VALUES (
        @id, @candidate_name, @current_role, @parsed_skills_json, @github_url, @linkedin_url, @last_profile_update
      )
      ON CONFLICT(id) DO UPDATE SET
        candidate_name = excluded.candidate_name,
        current_role = excluded.current_role,
        parsed_skills_json = excluded.parsed_skills_json,
        github_url = excluded.github_url,
        linkedin_url = excluded.linkedin_url,
        last_profile_update = excluded.last_profile_update
    `);

    try {
      stmt.run(candidate);
      return true;
    } catch (err) {
      console.error("[HR Datastore] Failed to upsert candidate:", err);
      return false;
    }
  }

  /**
   * Queries the datastore for candidates that possess a specific skill.
   * This provides the "Fast Path" for the agentic extension to instantly find matches.
   * 
   * @param skill - The skill string to search for (e.g., 'TypeScript', 'React').
   * @returns Candidate[] - An array of candidate records matching the skill criteria.
   */
  public queryCandidatesBySkill(skill: string): Candidate[] {
    // We utilize SQLite's LIKE operator to search the serialized JSON string.
    // In a massive production system, this could be migrated to SQLite's JSON1 extension
    // or a dedicated text search index (FTS5) for better performance.
    const stmt = this.db.prepare(`
      SELECT * FROM Candidates 
      WHERE parsed_skills_json LIKE ?
    `);

    try {
      // Adding wildcards to match the skill anywhere in the JSON array string
      const results = stmt.all(`%${skill}%`) as Candidate[];
      return results;
    } catch (err) {
      console.error("[HR Datastore] Error querying candidates by skill:", err);
      return [];
    }
  }

  /**
   * Retrieves all candidates whose profiles have not been updated since the provided timestamp.
   * Used exclusively by the background cron job to identify stale records.
   * 
   * @param olderThanTimestamp - The epoch timestamp threshold.
   * @returns Candidate[] - List of stale candidates.
   */
  public getStaleCandidates(olderThanTimestamp: number): Candidate[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Candidates 
      WHERE last_profile_update < ?
    `);
    
    return stmt.all(olderThanTimestamp) as Candidate[];
  }
}
