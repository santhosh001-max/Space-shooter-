// db.js - SQLite connection + schema bootstrap
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'game.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schema.sql');

const isNewDb = !fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables + seed data on first run
if (isNewDb) {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  console.log('Database created and seeded at', DB_PATH);
} else {
  // Make sure tables exist even if the file existed but was empty
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema.replace(/INSERT INTO[\s\S]*$/i, '')); // just (re)create tables, skip re-seeding

  // Migrate older databases (created before "shield" / "best_score" existed)
  const tryAddColumn = (table, column, definition) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }
    catch (e) { /* column already exists - ignore */ }
  };
  tryAddColumn('spaceships', 'shield', 'INTEGER NOT NULL DEFAULT 0');
  tryAddColumn('players', 'best_score', 'INTEGER NOT NULL DEFAULT 0');
}

module.exports = db;
