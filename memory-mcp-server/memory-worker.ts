import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'spatial-memory.db');

export function initMemoryDB() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ui_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      goal TEXT NOT NULL,
      semantic_layout_hash TEXT NOT NULL,
      winning_action TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_domain ON ui_memories(domain);

    CREATE TABLE IF NOT EXISTS user_learnt_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      rule_key TEXT NOT NULL,
      extracted_rule_text TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_domain_rules ON user_learnt_rules(domain);
  `);
  return db;
}

export function storeMemory(domain: string, goal: string, layout_hash: string, winning_action: string) {
  const db = initMemoryDB();
  const stmt = db.prepare(`
    INSERT INTO ui_memories (domain, goal, semantic_layout_hash, winning_action, timestamp)
    VALUES (@domain, @goal, @semantic_layout_hash, @winning_action, @timestamp)
  `);
  stmt.run({
    domain,
    goal,
    semantic_layout_hash: layout_hash,
    winning_action,
    timestamp: Date.now()
  });
  db.close();
}

export function queryMemory(domain: string, goal: string) {
  const db = initMemoryDB();
  const stmt = db.prepare(`
    SELECT winning_action FROM ui_memories 
    WHERE domain = ? AND goal LIKE ? 
    ORDER BY timestamp DESC 
    LIMIT 1
  `);
  const result = stmt.get(domain, `%${goal}%`) as any;
  db.close();
  return result ? result.winning_action : null;
}

export function storeLearntRule(domain: string, rule_key: string, extracted_rule_text: string) {
  const db = initMemoryDB();
  const stmt = db.prepare(`
    INSERT INTO user_learnt_rules (domain, rule_key, extracted_rule_text, timestamp)
    VALUES (@domain, @rule_key, @extracted_rule_text, @timestamp)
  `);
  stmt.run({
    domain,
    rule_key,
    extracted_rule_text,
    timestamp: Date.now()
  });
  db.close();
}

export function queryLearntRules(domain: string) {
  const db = initMemoryDB();
  const stmt = db.prepare(`
    SELECT extracted_rule_text FROM user_learnt_rules 
    WHERE domain = ? 
    ORDER BY timestamp DESC
  `);
  const results = stmt.all(domain) as any[];
  db.close();
  return results.map(r => r.extracted_rule_text);
}

