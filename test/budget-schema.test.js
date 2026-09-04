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
