const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

let db;
let databasePath;

test.beforeEach(() => {
  databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'expense-budget-')), 'expenses.db');
  process.env.DB_PATH = databasePath;
  delete require.cache[require.resolve('../db')];
  db = require('../db');
});

test.afterEach(() => {
  db?.close();
  delete require.cache[require.resolve('../db')];
  delete process.env.DB_PATH;
  fs.rmSync(path.dirname(databasePath), { recursive: true, force: true });
});

test('creates constrained budget tables', () => {
  const budgetColumns = db.prepare('PRAGMA table_info(budgets)').all().map(row => row.name);
  assert.deepEqual(budgetColumns, [
    'id', 'month', 'person', 'section', 'category', 'kind', 'amount',
    'sort_order', 'created_at', 'updated_at'
  ]);
  assert.throws(() => db.prepare(`
    INSERT INTO budgets (month, person, section, category, kind, amount, sort_order)
    VALUES ('September_2026', 'Someone', 'Lifestyle', 'Dining Out / Pub', 'expense', 100, 1)
  `).run(), /CHECK constraint failed/);
  assert.throws(() => db.prepare(`
    INSERT INTO budgets (month, person, section, category, kind, amount, sort_order)
    VALUES ('September_2026', 'Pooja', 'Lifestyle', 'Dining Out / Pub', 'expense', 100, 1)
  `).run(), /UNIQUE constraint failed/);
  ["'not a number'", '-1', '1e999'].forEach((amount, index) => {
    assert.throws(() => db.prepare(`
      INSERT INTO budgets (month, person, section, category, kind, amount, sort_order)
      VALUES ('October_2026', 'Pooja', 'Validation', 'Validation ${index}', 'expense', ${amount}, 0)
    `).run(), /CHECK constraint failed/);
  });
});

test('creates constrained mapping table', () => {
  const mappingColumns = db.prepare('PRAGMA table_info(budget_category_mappings)').all().map(row => row.name);
  assert.deepEqual(mappingColumns, [
    'id', 'section', 'budget_category', 'transaction_category', 'kind', 'created_at'
  ]);
  const insertMapping = db.prepare(`
    INSERT INTO budget_category_mappings (section, budget_category, transaction_category, kind)
    VALUES (?, ?, 'Shared category', ?)
  `);
  insertMapping.run('Mapping test', 'Expense category', 'expense');
  insertMapping.run('Mapping test', 'Investment category', 'investment');
  assert.throws(
    () => insertMapping.run('Mapping test', 'Another expense category', 'expense'),
    /UNIQUE constraint failed/
  );
});

test('database invariant normalizes only SBI debit transactions and survives restart', () => {
  const insert = db.prepare(`
    INSERT INTO transactions
      (date, amount, description, payment_method, paid_by, expense_type, category, month)
    VALUES (?, 100, ?, ?, 'Kunal', 'Kunal_Personal', 'Outside Food', 'September_2026')
  `);
  insert.run('1 September 2026', 'SBI row', 'SBI_Debit_Card');
  insert.run('1 September 2026', 'HDFC row', 'HDFC_Debit_Card');

  assert.deepEqual(
    db.prepare(`SELECT description, paid_by, expense_type FROM transactions ORDER BY id`).all(),
    [
      { description: 'SBI row', paid_by: 'Household Pool', expense_type: 'Common_50_50' },
      { description: 'HDFC row', paid_by: 'Kunal', expense_type: 'Kunal_Personal' },
    ]
  );

  db.close();
  delete require.cache[require.resolve('../db')];
  db = require('../db');
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM transactions WHERE paid_by = 'Household Pool'`).get().count, 1);
});

test('seeds September totals exactly once', () => {
  const totals = db.prepare(`
    SELECT person, SUM(amount) total FROM budgets
    WHERE month = 'September_2026' AND kind = 'expense' GROUP BY person
  `).all();
  assert.deepEqual(totals, [
    { person: 'Kunal', total: 115647 },
    { person: 'Pooja', total: 111177 },
  ]);
  assert.equal(db.prepare(`SELECT SUM(amount) total FROM budgets WHERE month='September_2026'`).get().total, 226824);
  assert.equal(db.prepare(`
    SELECT amount FROM budgets
    WHERE month = 'September_2026' AND person = 'Pooja' AND section = 'OTT Subscription' AND category = 'Spotify'
  `).get().amount, 0);
  const before = db.prepare('SELECT COUNT(*) count FROM budgets').get().count;
  delete require.cache[require.resolve('../db')];
  db.close();
  db = require('../db');
  assert.equal(db.prepare('SELECT COUNT(*) count FROM budgets').get().count, before);
});

test('backfills January through August from September exactly once without storing Combined', () => {
  const months = ['January','February','March','April','May','June','July','August'].map(m => `${m}_2026`);
  const source = db.prepare(`SELECT person, section, category, kind, amount, sort_order FROM budgets WHERE month='September_2026' ORDER BY person, section, sort_order, category`).all();
  for (const month of months) {
    const rows = db.prepare(`SELECT person, section, category, kind, amount, sort_order FROM budgets WHERE month=? ORDER BY person, section, sort_order, category`).all(month);
    assert.deepEqual(rows, source);
    assert.deepEqual(db.prepare(`SELECT person, SUM(amount) total FROM budgets WHERE month=? AND kind='expense' GROUP BY person ORDER BY person`).all(month), [
      { person: 'Kunal', total: 115647 }, { person: 'Pooja', total: 111177 },
    ]);
  }
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM budgets WHERE person='all'`).get().count, 0);
  assert.ok(db.prepare(`SELECT 1 FROM schema_migrations WHERE version='2026-09-04-budget-history-v1'`).get());
  const before = db.prepare('SELECT COUNT(*) count FROM budgets').get().count;
  db.close(); delete require.cache[require.resolve('../db')]; db = require('../db');
  assert.equal(db.prepare('SELECT COUNT(*) count FROM budgets').get().count, before);
});

test('historical backfill never overwrites an existing month and person slice', () => {
  db.close();
  const Database = require('better-sqlite3');
  const raw = new Database(databasePath);
  raw.prepare(`DELETE FROM schema_migrations WHERE version='2026-09-04-budget-history-v1'`).run();
  raw.prepare(`DELETE FROM budgets WHERE month='August_2026' AND person='Pooja'`).run();
  raw.prepare(`INSERT INTO budgets (month,person,section,category,kind,amount,sort_order) VALUES ('August_2026','Pooja','Custom','Protected','expense',123,0)`).run();
  raw.close(); delete require.cache[require.resolve('../db')]; db = require('../db');
  assert.deepEqual(db.prepare(`SELECT section,category,amount FROM budgets WHERE month='August_2026' AND person='Pooja'`).all(), [
    { section: 'Custom', category: 'Protected', amount: 123 },
  ]);
});

test('historical migration is not recorded when a September person source is missing', () => {
  db.close();
  const Database = require('better-sqlite3');
  const raw = new Database(databasePath);
  raw.prepare(`DELETE FROM schema_migrations WHERE version='2026-09-04-budget-history-v1'`).run();
  raw.prepare(`DELETE FROM budgets WHERE person='Kunal'`).run();
  raw.close(); delete require.cache[require.resolve('../db')];
  assert.throws(() => require('../db'), /September 2026 budget source is incomplete/);
  const check = new Database(databasePath);
  assert.equal(check.prepare(`SELECT COUNT(*) count FROM schema_migrations WHERE version='2026-09-04-budget-history-v1'`).get().count, 0);
  check.close(); db = null;
});

test('does not restore seed defaults removed by the user after restart', () => {
  db.prepare(`
    DELETE FROM budget_category_mappings
    WHERE section = 'Household Expenses'
      AND budget_category = 'House Rent'
      AND transaction_category = 'Rent'
      AND kind = 'expense'
  `).run();
  db.prepare(`
    DELETE FROM budgets
    WHERE month = 'September_2026' AND person = 'Pooja'
      AND section = 'Household Expenses' AND category = 'House Rent'
  `).run();

  db.close();
  delete require.cache[require.resolve('../db')];
  db = require('../db');

  assert.equal(db.prepare(`
    SELECT COUNT(*) count FROM budget_category_mappings
    WHERE section = 'Household Expenses' AND budget_category = 'House Rent'
      AND transaction_category = 'Rent' AND kind = 'expense'
  `).get().count, 0);
  assert.equal(db.prepare(`
    SELECT COUNT(*) count FROM budgets
    WHERE month = 'September_2026' AND person = 'Pooja'
      AND section = 'Household Expenses' AND category = 'House Rent'
  `).get().count, 0);
});
