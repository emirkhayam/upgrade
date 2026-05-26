const Database = require('better-sqlite3');
const path = require('path');

const dataDir = process.env.DATA_DIR || __dirname;
const db = new Database(path.join(dataDir, 'camp.db'));

// WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS streams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    date_start TEXT NOT NULL,
    date_end   TEXT NOT NULL,
    capacity   INTEGER NOT NULL,
    price      INTEGER NOT NULL DEFAULT 19998,
    is_active  INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    stream_id    INTEGER NOT NULL REFERENCES streams(id),
    child_name   TEXT NOT NULL,
    child_age    INTEGER NOT NULL,
    parent_phone TEXT NOT NULL,
    parent_name  TEXT DEFAULT '',
    status       TEXT DEFAULT 'pending',
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS speakers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    role       TEXT DEFAULT '',
    category   TEXT DEFAULT '',
    bio        TEXT DEFAULT '',
    photo      TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active  INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS stars (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    title       TEXT DEFAULT '',
    description TEXT DEFAULT '',
    photo       TEXT DEFAULT '',
    category    TEXT DEFAULT '',
    sort_order  INTEGER DEFAULT 0,
    is_active   INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS media (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL DEFAULT 'photo',
    title      TEXT DEFAULT '',
    category   TEXT DEFAULT '',
    url        TEXT DEFAULT '',
    thumbnail  TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active  INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations: add missing columns to bookings
const bookingMigrations = [
  ['gender', "TEXT DEFAULT ''"],
  ['parent_city', "TEXT DEFAULT ''"],
  ['parent_email', "TEXT DEFAULT ''"],
  ['alt_phone', "TEXT DEFAULT ''"],
  ['tshirt_size', "TEXT DEFAULT ''"],
  ['health', "TEXT DEFAULT ''"],
  ['allergies', "TEXT DEFAULT ''"],
  ['about_child', "TEXT DEFAULT ''"],
  ['wishes', "TEXT DEFAULT ''"],
];
for (const [col, def] of bookingMigrations) {
  try {
    db.prepare(`SELECT ${col} FROM bookings LIMIT 1`).get();
  } catch {
    db.exec(`ALTER TABLE bookings ADD COLUMN ${col} ${def}`);
    console.log(`Migration: added ${col} column to bookings`);
  }
}

// Seed streams if empty
const count = db.prepare('SELECT COUNT(*) as c FROM streams').get();
if (count.c === 0) {
  const insert = db.prepare(
    'INSERT INTO streams (name, date_start, date_end, capacity, price) VALUES (?, ?, ?, ?, ?)'
  );
  const streams = [
    ['Поток 1', '2026-06-20', '2026-06-30', 80, 19998],
    ['Поток 2', '2026-06-30', '2026-07-10', 80, 19998],
    ['Поток 3', '2026-07-10', '2026-07-20', 80, 19998],
    ['Поток 4', '2026-07-20', '2026-07-30', 80, 19998],
    ['Поток 5', '2026-07-30', '2026-08-09', 80, 19998],
    ['Поток 6', '2026-08-09', '2026-08-19', 80, 19998],
    ['Поток 7', '2026-08-19', '2026-08-29', 80, 19998],
  ];
  const tx = db.transaction(() => {
    for (const s of streams) insert.run(...s);
  });
  tx();
  console.log('Seeded 7 streams');
}

module.exports = db;
