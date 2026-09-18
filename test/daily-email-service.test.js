const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { createBudgetService } = require('../budget-service');
const { createDailyEmailService, reportingPeriod } = require('../daily-email-service');

test('uses the previous Asia Kolkata calendar day', () => {
  assert.deepEqual(reportingPeriod(new Date('2026-09-18T15:45:00.000Z')), {
    reportDate: '2026-09-17',
    displayDate: '17 September 2026',
    month: 'September_2026',
  });
});

test('keeps month-to-date data in the previous day month at a month boundary', () => {
  assert.deepEqual(reportingPeriod(new Date('2026-10-01T15:30:00.000Z')), {
    reportDate: '2026-09-30',
    displayDate: '30 September 2026',
    month: 'September_2026',
  });
});

function createFixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, amount REAL NOT NULL,
      description TEXT, payment_method TEXT, paid_by TEXT, expense_type TEXT,
      category TEXT, mood TEXT, impulse TEXT, remarks TEXT, month TEXT
    );
    CREATE TABLE budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL, person TEXT NOT NULL,
      section TEXT NOT NULL, category TEXT NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL,
      sort_order INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), UNIQUE(month, person, section, category)
    );
    CREATE TABLE budget_category_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, budget_category TEXT NOT NULL,
      transaction_category TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(section, budget_category, transaction_category), UNIQUE(kind, transaction_category)
    );
    CREATE TABLE salaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, person TEXT NOT NULL, month TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0, notes TEXT, created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(person, month)
    );
    CREATE TABLE lists (id INTEGER PRIMARY KEY AUTOINCREMENT, list_name TEXT NOT NULL, value TEXT NOT NULL,
      UNIQUE(list_name, value));
  `);
  return db;
}

test('aggregates previous-day and month-to-date expense and investment data', () => {
  const db = createFixture();
  const month = 'September_2026';
  const addTransaction = db.prepare(`INSERT INTO transactions
    (date, amount, description, paid_by, category, month) VALUES (?, ?, ?, ?, ?, ?)`);
  addTransaction.run('17 September 2026', 1000, 'Groceries', 'Household Pool', 'Groceries', month);
  addTransaction.run('17 September 2026', 500, 'Taxi', 'Pooja', 'Taxi', month);
  addTransaction.run('10 September 2026', 700, 'Utilities', 'Kunal', 'Utilities', month);
  addTransaction.run('17 September 2026', 3000, 'Investment', 'Pooja', 'Investment', month);
  addTransaction.run('10 September 2026', 2000, 'Investment', 'Kunal', 'Investment', month);
  addTransaction.run('18 September 2026', 400, 'Late taxi', 'Pooja', 'Taxi', month);
  addTransaction.run('18 September 2026', 400, 'Late unmapped', 'Pooja', 'Late category', month);
  addTransaction.run('18 August 2026', 999, 'Out of day', 'Pooja', 'Taxi', 'August_2026');
  addTransaction.run('17 September 2026', 9999, 'Card payment', 'Pooja', 'Credit Card Payment', month);
  addTransaction.run('17 September 2026', 9999, 'Settlement', 'Pooja', 'Settlement', month);
  addTransaction.run('17 September 2026', 9999, 'Refunded', 'Pooja', 'Refunded', month);

  const addBudget = db.prepare(`INSERT INTO budgets
    (month, person, section, category, kind, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  addBudget.run(month, 'Pooja', 'Home', 'Monthly expenses', 'expense', 5000, 0);
  addBudget.run(month, 'Kunal', 'Home', 'Monthly expenses', 'expense', 5000, 0);
  const addMapping = db.prepare(`INSERT INTO budget_category_mappings
    (section, budget_category, transaction_category, kind) VALUES (?, ?, ?, ?)`);
  for (const category of ['Groceries', 'Taxi', 'Utilities']) {
    addMapping.run('Home', 'Monthly expenses', category, 'expense');
  }

  const budgetService = createBudgetService(db, { validCategories: ['Groceries', 'Taxi', 'Utilities'] });
  const service = createDailyEmailService({
    db,
    budgetService,
    transport: {},
    config: {},
    now: () => new Date('2026-09-18T15:45:00.000Z'),
  });
  const data = service.getReportData();

  assert.equal(data.dailyExpenseTotal, 1500);
  assert.equal(data.dailyExpenseCount, 2);
  assert.deepEqual(data.dailyExpenses.map(row => row.description), ['Groceries', 'Taxi']);
  assert.equal(data.dailyInvestmentTotal, 3000);
  assert.equal(data.monthExpenseTotal, 2200);
  assert.equal(data.monthInvestmentTotal, 5000);
  assert.equal(data.budget.expenseBudget, 10000);
  assert.equal(data.budget.actualSpending, 2200);
  assert.equal(data.budget.remaining, 7800);
  assert.equal(data.budget.usage, 0.22);
  assert.equal(data.budget.unmappedTotal, 0);
  for (const excluded of ['Credit Card Payment', 'Settlement', 'Refunded', 'Investment']) {
    assert.equal(data.dailyExpenses.some(row => row.category === excluded), false);
  }
});

test('bounds a late Household Pool row by contributing budget ownership', () => {
  const db = createFixture();
  const month = 'September_2026';
  const addTransaction = db.prepare(`INSERT INTO transactions
    (date, amount, description, paid_by, category, month) VALUES (?, ?, ?, ?, ?, ?)`);
  addTransaction.run('17 September 2026', 100, 'Rent', 'Pooja', 'Rent', month);
  addTransaction.run('18 September 2026', 400, 'Late shared rent', 'Household Pool', 'Rent', month);
  db.prepare(`INSERT INTO budgets (month, person, section, category, kind, amount, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(month, 'Pooja', 'Home', 'Rent', 'expense', 10000, 0);
  db.prepare(`INSERT INTO budget_category_mappings
    (section, budget_category, transaction_category, kind) VALUES (?, ?, ?, ?)`)
    .run('Home', 'Rent', 'Rent', 'expense');

  const realBudgetService = createBudgetService(db, { validCategories: ['Rent'] });
  let capturedBudget;
  const service = createDailyEmailService({
    db,
    budgetService: { getBudget(args) {
      capturedBudget = realBudgetService.getBudget(args);
      return capturedBudget;
    } },
    transport: {},
    config: {},
    now: () => new Date('2026-09-18T15:45:00.000Z'),
  });
  const data = service.getReportData();

  assert.equal(data.budget.actualSpending, 100);
  assert.equal(data.budget.remaining, 9900);
  assert.equal(data.budget.usage, 0.01);
  assert.equal(data.budget.unmappedTotal, 0);
  assert.equal(capturedBudget.sections[0].lines[0].actual, 100);
});

test('keeps a late personal row from a non-contributing budget owner unmapped', () => {
  const db = createFixture();
  const month = 'September_2026';
  const addTransaction = db.prepare(`INSERT INTO transactions
    (date, amount, description, paid_by, category, month) VALUES (?, ?, ?, ?, ?, ?)`);
  addTransaction.run('17 September 2026', 100, 'Rent', 'Pooja', 'Rent', month);
  addTransaction.run('18 September 2026', 400, 'Late Kunal rent', 'Kunal', 'Rent', month);
  db.prepare(`INSERT INTO budgets (month, person, section, category, kind, amount, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(month, 'Pooja', 'Home', 'Rent', 'expense', 10000, 0);
  db.prepare(`INSERT INTO budget_category_mappings
    (section, budget_category, transaction_category, kind) VALUES (?, ?, ?, ?)`)
    .run('Home', 'Rent', 'Rent', 'expense');

  const realBudgetService = createBudgetService(db, { validCategories: ['Rent'] });
  let capturedBudget;
  const service = createDailyEmailService({
    db,
    budgetService: { getBudget(args) {
      capturedBudget = realBudgetService.getBudget(args);
      return capturedBudget;
    } },
    transport: {},
    config: {},
    now: () => new Date('2026-09-18T15:45:00.000Z'),
  });
  const data = service.getReportData();

  assert.equal(data.budget.actualSpending, 100);
  assert.equal(data.budget.remaining, 9900);
  assert.equal(data.budget.usage, 0.01);
  assert.equal(data.budget.unmappedTotal, 0);
  assert.equal(capturedBudget.sections[0].lines[0].actual, 100);
});
