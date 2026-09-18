const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { createBudgetService } = require('../budget-service');
const {
  createDailyEmailService,
  reportingPeriod,
  renderReminder,
  renderReport,
} = require('../daily-email-service');

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

const renderPeriod = {
  reportDate: '2026-09-17',
  displayDate: '17 September 2026',
  month: 'September_2026',
};

const renderFixture = {
  period: renderPeriod,
  dailyExpenses: [
    { description: 'Groceries', category: 'Food', paid_by: 'Pooja', amount: 1000 },
    { description: 'Taxi', category: 'Transport', paid_by: 'Kunal', amount: 500 },
  ],
  dailyExpenseTotal: 1500,
  dailyExpenseCount: 2,
  dailyInvestments: [{ description: 'SIP', category: 'Investment', paid_by: 'Pooja', amount: 3000 }],
  dailyInvestmentTotal: 3000,
  monthExpenseTotal: 2200,
  monthInvestmentTotal: 5000,
  budget: {
    configured: true,
    expenseBudget: 10000,
    actualSpending: 2200,
    remaining: 7800,
    usage: 0.22,
    unmappedTotal: 250,
  },
};

test('renders the reminder with prior-day date, both recipients prompt, and Add Expenses link', () => {
  const reminder = renderReminder({ period: renderPeriod, baseUrl: 'https://expense.example' });
  assert.equal(reminder.subject, 'Expense Tracker — Daily Reminder');
  assert.match(reminder.text, /17 September 2026/);
  assert.match(reminder.text, /Pooja and Kunal, please finish adding expenses for 17 September 2026/);
  assert.match(reminder.text, /9:00 p\.m\./i);
  assert.match(reminder.html, /Pooja and Kunal, please finish adding expenses for/);
  assert.match(reminder.html, /https:\/\/expense\.example\/?\?tab=add/);
});

test('renders a populated report in plain text and safe HTML', () => {
  const report = renderReport(renderFixture, { baseUrl: 'https://expense.example' });
  assert.equal(report.subject, 'Expense Tracker — Daily Report');
  assert.match(report.text, /17 September 2026/);
  assert.match(report.text, /Yesterday's expenses: ₹1,500/);
  assert.match(report.text, /Month to date: ₹2,200 of ₹10,000/);
  assert.match(report.text, /Investments yesterday: ₹3,000/);
  assert.match(report.text, /Investments month to date: ₹5,000/);
  assert.match(report.text, /Unmapped expenses: ₹250/);
  assert.match(report.text, /Groceries.*Food.*Pooja.*₹1,000/);
  assert.match(report.html, /Unmapped expenses/);
  assert.match(report.html, /https:\/\/expense\.example\/?\?tab=dashboard/);
  assert.match(report.html, /https:\/\/expense\.example\/?\?tab=budget/);
});

test('escapes database-derived labels in HTML output', () => {
  const report = renderReport({
    ...renderFixture,
    dailyExpenses: [{ description: '<script>alert(1)</script>', category: 'A & B', paid_by: 'Pooja', amount: 10 }],
  }, { baseUrl: 'https://expense.example' });
  assert.match(report.text, /<script>alert\(1\)<\/script>/);
  assert.match(report.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(report.html, /<script>/);
  assert.match(report.html, /A &amp; B/);
});

test('renders explicit empty transaction states and no-budget state', () => {
  const report = renderReport({
    ...renderFixture,
    dailyExpenses: [],
    dailyExpenseCount: 0,
    dailyExpenseTotal: 0,
    dailyInvestments: [],
    dailyInvestmentTotal: 0,
    budget: { configured: false },
  }, { baseUrl: 'https://expense.example' });
  assert.match(report.text, /No expenses recorded for 17 September 2026/);
  assert.match(report.text, /No investments recorded for 17 September 2026/);
  assert.match(report.text, /No budget configured/);
  assert.match(report.html, /No expenses recorded/);
  assert.match(report.html, /No investments recorded/);
  assert.match(report.html, /No budget configured/);
});

test('labels a negative remaining budget as overspent', () => {
  const report = renderReport({
    ...renderFixture,
    budget: { ...renderFixture.budget, actualSpending: 12000, remaining: -2000, usage: 1.2, unmappedTotal: 0 },
  }, { baseUrl: 'https://expense.example' });
  assert.match(report.text, /Overspent: ₹2,000/);
  assert.match(report.text, /120% used/);
  assert.match(report.html, /Overspent: ₹2,000/);
});
