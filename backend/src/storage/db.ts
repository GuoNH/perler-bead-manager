import { DatabaseSync } from "node:sqlite";

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      color TEXT NOT NULL DEFAULT '',
      current_stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '颗',
      note TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      image_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reverted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS consumption_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      bead_id TEXT NOT NULL REFERENCES inventory_items(id),
      count INTEGER NOT NULL CHECK (count >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_consumption_bead ON consumption_lines(bead_id);
    CREATE INDEX IF NOT EXISTS idx_consumption_submission ON consumption_lines(submission_id);
  `);
  return db;
}
