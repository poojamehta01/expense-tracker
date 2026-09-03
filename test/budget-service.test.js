const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const test = require('node:test');

const {
  createBudgetService,
  validateMonth,
  validatePerson,
  lineStatus,
} = require('../budget-service');

function createFixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL, person TEXT NOT NULL, section TEXT NOT NULL, category TEXT NOT NULL,
      kind TEXT NOT NULL, amount REAL NOT NULL, sort_order INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(month, person, section, category)
    );
    CREATE TABLE budget_category_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL, budget_category TEXT NOT NULL, transaction_category TEXT NOT NULL,
      kind TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(section, budget_category, transaction_category), UNIQUE(kind, transaction_category)
    );
    CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL NOT NULL, paid_by TEXT, category TEXT, month TEXT);
    CREATE TABLE salaries (id INTEGER PRIMARY KEY AUTOINCREMENT, person TEXT NOT NULL, month TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, UNIQUE(person, month));
    CREATE TABLE lists (id INTEGER PRIMARY KEY AUTOINCREMENT, list_name TEXT NOT NULL, value TEXT NOT NULL, UNIQUE(list_name, value));
  `);
  return db;
}

function insertLine(db, line) {
  db.prepare(`INSERT INTO budgets (month, person, section, category, kind, amount, sort_order)
    VALUES (@month, @person, @section, @category, @kind, @amount, @sort_order)`).run(line);
}

function insertMapping(db, mapping) {
  db.prepare(`INSERT INTO budget_category_mappings (section, budget_category, transaction_category, kind)
    VALUES (@section, @budget_category, @transaction_category, @kind)`).run(mapping);
}

test('validates month, person, and budget line status', () => {
  assert.equal(validateMonth('September_2026'), 'September_2026');
  assert.throws(() => validateMonth('2026-09'), /Month must use Month_YYYY/);
  assert.equal(validatePerson('all', { allowAll: true }), 'all');
  assert.throws(() => validatePerson('Common', { allowAll: true }), /Person must be/);
  assert.equal(lineStatus({ budget: 100, actual: 0, hasMappings: true }), 'no_activity');
  assert.equal(lineStatus({ budget: 100, actual: 79, hasMappings: true }), 'on_track');
  assert.equal(lineStatus({ budget: 100, actual: 80, hasMappings: true }), 'watch');
  assert.equal(lineStatus({ budget: 100, actual: 101, hasMappings: true }), 'over_budget');
  assert.equal(lineStatus({ budget: 0, actual: 1, hasMappings: true }), 'unbudgeted');
  assert.equal(lineStatus({ budget: 100, actual: 50, hasMappings: false }), 'mapping_needed');
});

test('replaceBudget validates every line before atomically replacing existing rows', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent'] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Existing', category: 'Line', kind: 'expense', amount: 100, sort_order: 0 });
  const base = { section: 'Household', category: 'Rent', kind: 'expense', amount: 100, sort_order: 0 };
  for (const invalidLine of [{ ...base, amount: -1 }, { ...base, amount: NaN }, { ...base, amount: Infinity }, { ...base, kind: 'invalid' }, { ...base, section: ' ' }, { ...base, category: ' ' }, { ...base, sort_order: 1.5 }]) {
    assert.throws(() => service.replaceBudget({ month: 'September_2026', person: 'Pooja', lines: [invalidLine] }));
    assert.equal(db.prepare(`SELECT COUNT(*) count FROM budgets WHERE month = 'September_2026' AND person = 'Pooja'`).get().count, 1);
  }
  assert.throws(() => service.replaceBudget({ month: 'September_2026', person: 'Pooja', lines: [base, { ...base, amount: 200 }] }), /Duplicate budget line/);
  assert.throws(() => service.replaceBudget({ month: 'September_2026', person: 'Common', lines: [base] }), /Person must be/);
  assert.throws(() => service.replaceBudget({ month: '2026-09', person: 'Pooja', lines: [base] }), /Month must use Month_YYYY/);
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM budgets WHERE month = 'September_2026' AND person = 'Pooja'`).get().count, 1);
  assert.deepEqual(service.replaceBudget({ month: 'September_2026', person: 'Pooja', lines: [base] }), { saved: true, count: 1 });
  assert.deepEqual(db.prepare(`SELECT section, category, amount FROM budgets WHERE month = 'September_2026' AND person = 'Pooja'`).all(), [{ section: 'Household', category: 'Rent', amount: 100 }]);
  db.close();
});

test('attributes only mapped qualifying transactions and separates investment totals', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent', 'Outside Food', 'SIP', 'Unmapped'] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Home', category: 'House Rent', kind: 'expense', amount: 111177, sort_order: 0 });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Investments', category: 'Index Fund', kind: 'investment', amount: 1000, sort_order: 1 });
  insertLine(db, { month: 'September_2026', person: 'Kunal', section: 'Lifestyle', category: 'Dining', kind: 'expense', amount: 115647, sort_order: 0 });
  insertMapping(db, { section: 'Home', budget_category: 'House Rent', transaction_category: 'Rent', kind: 'expense' });
  insertMapping(db, { section: 'Lifestyle', budget_category: 'Dining', transaction_category: 'Outside Food', kind: 'expense' });
  insertMapping(db, { section: 'Investments', budget_category: 'Index Fund', transaction_category: 'SIP', kind: 'investment' });
  const addTransaction = db.prepare(`INSERT INTO transactions (amount, paid_by, category, month) VALUES (?, ?, ?, ?)`);
  addTransaction.run(21000, 'Pooja', 'Rent', 'September_2026');
  addTransaction.run(500, 'Kunal', 'Outside Food', 'September_2026');
  addTransaction.run(2000, 'Pooja', 'SIP', 'September_2026');
  for (const category of ['Credit Card Payment', 'Settlement', 'Refunded']) addTransaction.run(9999, 'Pooja', category, 'September_2026');
  addTransaction.run(12345, 'Pooja', 'Rent', 'October_2026');
  addTransaction.run(6789, 'Pooja', 'Unmapped', 'September_2026');
  db.prepare(`INSERT INTO salaries (person, month, amount) VALUES (?, ?, ?)`).run('Pooja', 'September_2026', 337292);
  const pooja = service.getBudget({ month: 'September_2026', person: 'Pooja' });
  assert.equal(pooja.month, 'September_2026'); assert.equal(pooja.person, 'Pooja'); assert.equal(pooja.hasBudget, true); assert.equal(pooja.hasSalary, true);
  assert.equal(pooja.summary.expenseBudget, 111177); assert.equal(pooja.summary.actualSpending, 21000); assert.equal(pooja.summary.variance, 90177);
  assert.equal(pooja.summary.salary, 337292); assert.equal(pooja.summary.netMonthlySavings, 316292);
  assert.equal(pooja.summary.plannedInvestments, 1000); assert.equal(pooja.summary.actualInvestments, 2000);
  assert.equal(pooja.sections[0].lines[0].actual, 21000); assert.equal(pooja.sections[0].lines[0].usage, 21000 / 111177); assert.equal(pooja.sections[1].lines[0].actual, 2000); assert.equal(pooja.unmappedCount, 0);
  const kunal = service.getBudget({ month: 'September_2026', person: 'Kunal' });
  const combined = service.getBudget({ month: 'September_2026', person: 'all' });
  assert.equal(combined.summary.expenseBudget, 226824); assert.equal(combined.summary.actualSpending, pooja.summary.actualSpending + kunal.summary.actualSpending);
  assert.equal(combined.summary.plannedInvestments, 1000); assert.equal(combined.summary.actualInvestments, 2000);
  assert.deepEqual(combined.sections.map(section => section.section), ['Home', 'Investments', 'Lifestyle']);
  db.close();
});

test('replaceMappings validates complete replacements and preserves existing mappings on failure', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent', 'Petrol'] });
  insertMapping(db, { section: 'Home', budget_category: 'House Rent', transaction_category: 'Rent', kind: 'expense' });
  assert.deepEqual(service.replaceMappings({ section: 'Home', budgetCategory: 'House Rent', kind: 'expense', transactionCategories: ['Rent', 'Petrol'] }), { saved: true, count: 2 });
  assert.throws(() => service.replaceMappings({ section: 'Home', budgetCategory: 'House Rent', kind: 'expense', transactionCategories: ['Unknown'] }), /Unknown transaction category/);
  assert.deepEqual(db.prepare(`SELECT transaction_category FROM budget_category_mappings ORDER BY transaction_category`).all(), [{ transaction_category: 'Petrol' }, { transaction_category: 'Rent' }]);
  assert.throws(() => service.replaceMappings({ section: 'Transport', budgetCategory: 'Fuel', kind: 'expense', transactionCategories: ['Rent'] }), /already mapped/);
  assert.deepEqual(service.replaceMappings({ section: 'Home', budgetCategory: 'House Rent', kind: 'expense', transactionCategories: [] }), { saved: true, count: 0 });
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM budget_category_mappings`).get().count, 0);
  db.prepare(`INSERT INTO lists (list_name, value) VALUES ('categories', 'Custom')`).run();
  assert.deepEqual(service.replaceMappings({ section: 'Home', budgetCategory: 'House Rent', kind: 'expense', transactionCategories: ['Custom'] }), { saved: true, count: 1 });
  db.close();
});

test('copyBudget copies selected people, handles conflicts, and leaves global mappings alone', () => {
  const db = createFixture(); const service = createBudgetService(db, { validCategories: [] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Home', category: 'Rent', kind: 'expense', amount: 100, sort_order: 0 });
  insertLine(db, { month: 'September_2026', person: 'Kunal', section: 'Home', category: 'Rent', kind: 'expense', amount: 200, sort_order: 0 });
  insertMapping(db, { section: 'Home', budget_category: 'Rent', transaction_category: 'Rent', kind: 'expense' });
  assert.throws(() => service.copyBudget({ sourceMonth: 'August_2026', targetMonth: 'October_2026', person: 'all', replace: false }), error => error.code === 'not_found');
  assert.deepEqual(service.copyBudget({ sourceMonth: 'September_2026', targetMonth: 'October_2026', person: 'all', replace: false }), { saved: true, count: 2 });
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM budget_category_mappings`).get().count, 1);
  assert.throws(() => service.copyBudget({ sourceMonth: 'September_2026', targetMonth: 'October_2026', person: 'Pooja', replace: false }), error => error.code === 'conflict');
  assert.deepEqual(service.copyBudget({ sourceMonth: 'September_2026', targetMonth: 'October_2026', person: 'Pooja', replace: true }), { saved: true, count: 1 });
  assert.equal(db.prepare(`SELECT amount FROM budgets WHERE month = 'October_2026' AND person = 'Kunal'`).get().amount, 200);
  db.close();
});
