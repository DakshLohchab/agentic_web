/**
 * File: academic-datastore.ts
 * Role: Primary datastore for the Academic Success Framework & LMS Deadline Synchronization module.
 * 
 * Description:
 * Modern Learning Management Systems (LMS) like Canvas, Blackboard, and Moodle often have 
 * convoluted UI architectures that are extremely token-expensive for an LLM agent to parse 
 * repeatedly. This module establishes a unified local SQLite datastore to cache academic 
 * milestones and aggregate research bibliographies.
 * 
 * By maintaining local state, the agent can proactively evaluate upcoming deadlines and 
 * surface relevant prior art for assignments without enduring the massive latency penalty 
 * of executing live web searches or deeply nested iframe scraping during core interactions.
 * 
 * Powered by 'better-sqlite3' for guaranteed synchronous execution, ensuring the Model 
 * Context Protocol (MCP) server returns precise schema answers instantaneously.
 */

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Interface representing a scheduled academic milestone or assignment constraint.
 */
export interface CourseDeadline {
  /** Unique primary key (often a hashed composite of course_code + assignment_title) */
  id: string;
  /** The standardized university course string (e.g., 'CS401', 'PHYS205') */
  course_code: string;
  /** The semantic title of the assignment or exam */
  assignment_title: string;
  /** Epoch timestamp representing the absolute final submission constraint */
  target_due_date: number;
  /** A normalized float (0.0 to 1.0) indicating the assignment's impact on the final grade */
  priority_weight: number;
  /** Execution lifecycle state (e.g., 'PENDING', 'SUBMITTED', 'GRADED', 'LATE') */
  submission_status_flag: string;
  /** Epoch timestamp of the last successful LMS synchronization */
  last_synced: number;
}

/**
 * Interface representing a cached academic paper or technical patent citation.
 */
export interface PriorArtBibliography {
  /** Unique primary key (typically the DOI or arXiv ID) */
  id: string;
  /** The full published title of the document */
  paper_title: string;
  /** Serialized JSON array of contributing authors or researchers */
  author_array_json: string;
  /** Standardized citation identifier (e.g., IEEE, APA) */
  citation_key: string;
  /** Integer representing the academic influence/impact factor */
  referenced_by_count: number;
  /** Direct link to the source PDF or publisher portal */
  document_link: string;
}

/**
 * AcademicDatastore class responsible for managing strict SQLite connection pooling 
 * and schema execution for the learning management environment.
 */
export class AcademicDatastore {
  private db: Database.Database;

  /**
   * Initializes the SQLite database for academic tracking.
   * 
   * @param dbPath - The absolute or relative file path to the SQLite DB.
   */
  constructor(dbPath: string = path.join(__dirname, 'academic-success.db')) {
    this.db = new Database(dbPath, { verbose: console.log });
    this.initializeSchema();
  }

  /**
   * Generates the dual-schema tables for tracking milestones and prior art.
   */
  private initializeSchema(): void {
    const createDeadlinesStmt = `
      CREATE TABLE IF NOT EXISTS Course_Deadlines (
        id TEXT PRIMARY KEY,
        course_code TEXT NOT NULL,
        assignment_title TEXT NOT NULL,
        target_due_date INTEGER NOT NULL,
        priority_weight REAL NOT NULL,
        submission_status_flag TEXT NOT NULL,
        last_synced INTEGER NOT NULL
      );
    `;
    
    const createPriorArtStmt = `
      CREATE TABLE IF NOT EXISTS Prior_Art_Bibliographies (
        id TEXT PRIMARY KEY,
        paper_title TEXT NOT NULL,
        author_array_json TEXT NOT NULL,
        citation_key TEXT NOT NULL,
        referenced_by_count INTEGER NOT NULL,
        document_link TEXT NOT NULL
      );
    `;

    this.db.exec(createDeadlinesStmt);
    this.db.exec(createPriorArtStmt);

    // Fast lookup indices for MCP tool integration
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_course_code ON Course_Deadlines(course_code);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_status_flag ON Course_Deadlines(submission_status_flag);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_citation_key ON Prior_Art_Bibliographies(citation_key);`);
    
    console.log("[Academic Datastore] LMS and Prior Art schemas initialized successfully.");
  }

  /**
   * Upserts an academic deadline into the local syllabus cache.
   * 
   * @param deadline - The CourseDeadline object representing the assignment state.
   * @returns boolean - True if the transaction succeeded.
   */
  public upsertCourseDeadline(deadline: CourseDeadline): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO Course_Deadlines (
        id, course_code, assignment_title, target_due_date, priority_weight, submission_status_flag, last_synced
      ) VALUES (
        @id, @course_code, @assignment_title, @target_due_date, @priority_weight, @submission_status_flag, @last_synced
      )
      ON CONFLICT(id) DO UPDATE SET
        target_due_date = excluded.target_due_date,
        priority_weight = excluded.priority_weight,
        submission_status_flag = excluded.submission_status_flag,
        last_synced = excluded.last_synced
    `);

    try {
      stmt.run(deadline);
      return true;
    } catch (err) {
      console.error("[Academic Datastore] Failed to upsert course deadline:", err);
      return false;
    }
  }

  /**
   * Queries the datastore for approaching academic milestones that are still pending.
   * This provides the "Fast Path" for the agent to instantly generate a weekly schedule.
   * 
   * @param limit - Maximum number of upcoming deadlines to return.
   * @returns CourseDeadline[] - Array of pending assignments ordered by imminent due date.
   */
  public fetchApproachingMilestones(limit: number = 10): CourseDeadline[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Course_Deadlines 
      WHERE submission_status_flag = 'PENDING'
      ORDER BY target_due_date ASC 
      LIMIT ?
    `);
    
    try {
      return stmt.all(limit) as CourseDeadline[];
    } catch (err) {
      console.error("[Academic Datastore] Error fetching approaching milestones:", err);
      return [];
    }
  }

  /**
   * Retrieves stale course timelines that require a headless LMS sync.
   * Used strictly by the background cron job.
   * 
   * @param olderThanTimestamp - The epoch time threshold (e.g., 14 days ago).
   * @returns CourseDeadline[] - Array of stale assignments.
   */
  public getStaleCourseTimelines(olderThanTimestamp: number): CourseDeadline[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Course_Deadlines 
      WHERE last_synced < ?
    `);
    
    return stmt.all(olderThanTimestamp) as CourseDeadline[];
  }

  /**
   * Queries the local prior art index for relevant bibliographies.
   * 
   * @param queryKeyword - A broad topic or citation key to search for.
   * @returns PriorArtBibliography[] - Array of matching academic papers.
   */
  public lookupPriorArtCache(queryKeyword: string): PriorArtBibliography[] {
    const stmt = this.db.prepare(`
      SELECT * FROM Prior_Art_Bibliographies 
      WHERE paper_title LIKE ? OR citation_key LIKE ?
      ORDER BY referenced_by_count DESC
      LIMIT 5
    `);
    
    try {
      return stmt.all(`%${queryKeyword}%`, `%${queryKeyword}%`) as PriorArtBibliography[];
    } catch (err) {
      console.error(`[Academic Datastore] Error looking up prior art for ${queryKeyword}:`, err);
      return [];
    }
  }
}
