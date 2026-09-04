const Database = require('better-sqlite3');
const path = require('path');
const { SEPTEMBER_2026_BUDGET_LINES, INITIAL_BUDGET_MAPPINGS } = require('./budget-seed');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'expenses.db');
const db = new Database(dbPath);

// Performance & storage optimizations
db.pragma('journal_mode = WAL');        // WAL: better read concurrency, no exclusive write locks
db.pragma('synchronous = NORMAL');      // safe with WAL, faster than FULL
db.pragma('temp_store = MEMORY');       // temp tables in memory, not disk
db.pragma('mmap_size = 30000000');      // 30MB memory-mapped I/O

// One-time migration: enable auto_vacuum (requires full VACUUM to activate on existing DB)
const avMode = db.pragma('auto_vacuum', { simple: true });
if (avMode === 0) {                     // 0 = NONE (SQLite default, never been set)
  db.pragma('auto_vacuum = INCREMENTAL');
  db.exec('VACUUM');                    // rebuild DB with new setting — runs once ever
}

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

  CREATE TABLE IF NOT EXISTS merchant_patterns (
    description    TEXT PRIMARY KEY,
    category       TEXT,
    expense_type   TEXT,
    payment_method TEXT,
    frequency      INTEGER,
    last_rebuilt   TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    month      TEXT NOT NULL CHECK(month GLOB '[A-Z]*_[0-9][0-9][0-9][0-9]'),
    person     TEXT NOT NULL CHECK(person IN ('Pooja','Kunal')),
    section    TEXT NOT NULL,
    category   TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK(kind IN ('expense','investment')),
    amount     REAL NOT NULL CHECK(typeof(amount) IN ('integer','real') AND amount >= 0 AND amount < 9e999),
    sort_order INTEGER NOT NULL CHECK(sort_order >= 0),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(month, person, section, category)
  );

  CREATE TABLE IF NOT EXISTS budget_category_mappings (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    section              TEXT NOT NULL,
    budget_category      TEXT NOT NULL,
    transaction_category TEXT NOT NULL,
    kind                 TEXT NOT NULL CHECK(kind IN ('expense','investment')),
    created_at           TEXT DEFAULT (datetime('now')),
    UNIQUE(section, budget_category, transaction_category),
    UNIQUE(kind, transaction_category)
  );
`);

const insertBudgetLine = db.prepare(`
  INSERT OR IGNORE INTO budgets (month, person, section, category, kind, amount, sort_order)
  VALUES (@month, @person, @section, @category, @kind, @amount, @sort_order)
`);
const insertBudgetMapping = db.prepare(`
  INSERT OR IGNORE INTO budget_category_mappings (section, budget_category, transaction_category, kind)
  VALUES (@section, @budget_category, @transaction_category, @kind)
`);

db.transaction(() => {
  const seedKey = 'budget_seed_september_2026_v1';
  const seeded = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(seedKey);
  if (seeded) return;

  const hasSeptemberBudget = db.prepare(
    `SELECT 1 FROM budgets WHERE month = 'September_2026' LIMIT 1`
  ).get();
  if (!hasSeptemberBudget) {
    for (const line of SEPTEMBER_2026_BUDGET_LINES) insertBudgetLine.run(line);
    for (const mapping of INITIAL_BUDGET_MAPPINGS) insertBudgetMapping.run(mapping);
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(seedKey, 'applied');
})();

db.transaction(() => {
  const version = '2026-09-04-budget-history-v1';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version)) return;
  const sourcePeople = db.prepare(`SELECT person, COUNT(*) count FROM budgets WHERE month='September_2026' GROUP BY person`).all();
  if (sourcePeople.length !== 2 || sourcePeople.some(row => !row.count)) {
    throw new Error('September 2026 budget source is incomplete');
  }
  const targets = ['January','February','March','April','May','June','July','August'].map(month => `${month}_2026`);
  const exists = db.prepare('SELECT 1 FROM budgets WHERE month = ? AND person = ? LIMIT 1');
  const copy = db.prepare(`
    INSERT INTO budgets (month, person, section, category, kind, amount, sort_order, created_at, updated_at)
    SELECT ?, person, section, category, kind, amount, sort_order, datetime('now'), datetime('now')
    FROM budgets WHERE month = 'September_2026' AND person = ?
  `);
  for (const month of targets) {
    for (const person of ['Pooja', 'Kunal']) {
      if (!exists.get(month, person)) copy.run(month, person);
    }
  }
  db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
})();

db.pragma('incremental_vacuum(100)');   // reclaim up to 100 free pages on each startup

module.exports = db;
