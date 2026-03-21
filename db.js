const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'expenses.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    date           TEXT NOT NULL,
    amount         REAL NOT NULL,
    description    TEXT,
    payment_method TEXT,
    paid_by        TEXT,
    expense_type   TEXT,
    category       TEXT,
    mood           TEXT,
    impulse        TEXT,
    remarks        TEXT,
    month          TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lists (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    list_name TEXT NOT NULL,
    value     TEXT NOT NULL,
    UNIQUE(list_name, value)
  );

  CREATE TABLE IF NOT EXISTS salaries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    person     TEXT NOT NULL,
    month      TEXT NOT NULL,
    amount     REAL NOT NULL DEFAULT 0,
    notes      TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(person, month)
  );

  CREATE TABLE IF NOT EXISTS transaction_audit (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_id      INTEGER NOT NULL,
    action     TEXT NOT NULL,
    snapshot   TEXT NOT NULL,
    changed_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
