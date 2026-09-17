const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const test = require('node:test');

const {
  createBudgetService,
  combineBudgetResponses,
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
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, amount REAL NOT NULL, description TEXT,
      payment_method TEXT, paid_by TEXT, expense_type TEXT, category TEXT, mood TEXT,
      impulse TEXT, remarks TEXT, month TEXT
    );
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
  assert.throws(() => validateMonth('Sept_2026'), /Month must use Month_YYYY/);
  assert.throws(() => validateMonth('september_2026'), /Month must use Month_YYYY/);
  assert.throws(() => validateMonth('September_26'), /Month must use Month_YYYY/);
  assert.throws(() => validateMonth('January_2026_extra'), /Month must use Month_YYYY/);
  assert.equal(validatePerson('all', { allowAll: true }), 'all');
  assert.throws(() => validatePerson('Common', { allowAll: true }), /Person must be/);
  assert.equal(lineStatus({ budget: 100, actual: 0, hasMappings: true }), 'no_activity');
  assert.equal(lineStatus({ budget: 100, actual: 79, hasMappings: true }), 'on_track');
  assert.equal(lineStatus({ budget: 100, actual: 80, hasMappings: true }), 'watch');
  assert.equal(lineStatus({ budget: 100, actual: 101, hasMappings: true }), 'over_budget');
  assert.equal(lineStatus({ budget: 0, actual: 1, hasMappings: true }), 'unbudgeted');
  assert.equal(lineStatus({ budget: 100, actual: 50, hasMappings: false }), 'mapping_needed');
});

test('returns null usage for a zero budget and identifies an explicitly recorded zero salary', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent'] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Home', category: 'House Rent', kind: 'expense', amount: 0, sort_order: 0 });
  insertMapping(db, { section: 'Home', budget_category: 'House Rent', transaction_category: 'Rent', kind: 'expense' });
  db.prepare(`INSERT INTO salaries (person, month, amount) VALUES (?, ?, ?)`).run('Pooja', 'September_2026', 0);

  const response = service.getBudget({ month: 'September_2026', person: 'Pooja' });
  assert.equal(response.sections[0].lines[0].usage, null);
  assert.equal(response.summary.usage, null);
  assert.equal(response.summary.salary, 0);
  assert.equal(response.hasSalary, true);
  db.close();
});

test('combines same-key personal lines and requires both salaries for a complete Combined salary', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent'] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Home', category: 'House Rent', kind: 'expense', amount: 100, sort_order: 0 });
  insertLine(db, { month: 'September_2026', person: 'Kunal', section: 'Home', category: 'House Rent', kind: 'expense', amount: 300, sort_order: 0 });
  insertMapping(db, { section: 'Home', budget_category: 'House Rent', transaction_category: 'Rent', kind: 'expense' });
  const addTransaction = db.prepare(`INSERT INTO transactions (amount, paid_by, category, month) VALUES (?, ?, ?, ?)`);
  addTransaction.run(80, 'Pooja', 'Rent', 'September_2026');
  addTransaction.run(260, 'Kunal', 'Rent', 'September_2026');
  db.prepare(`INSERT INTO salaries (person, month, amount) VALUES (?, ?, ?)`).run('Pooja', 'September_2026', 0);

  const pooja = service.getBudget({ month: 'September_2026', person: 'Pooja' });
  const kunal = service.getBudget({ month: 'September_2026', person: 'Kunal' });
  const combined = combineBudgetResponses(pooja, kunal);
  const line = combined.sections[0].lines[0];
  assert.equal(combined.sections[0].lines.length, 1);
  assert.equal(line.budget, 400);
  assert.equal(line.actual, 340);
  assert.equal(line.variance, 60);
  assert.equal(line.usage, 0.85);
  assert.deepEqual(line.mappings, ['Rent']);
  assert.equal(line.status, 'watch');
  assert.equal(combined.hasSalary, false);
  assert.equal(service.getBudget({ month: 'September_2026', person: 'all' }).hasSalary, false);
  db.close();
});

test('splits household-pool spending equally across both personal budgets', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Outside Food'] });
  for (const person of ['Pooja', 'Kunal']) {
    insertLine(db, { month: 'September_2026', person, section: 'Food', category: 'Dining', kind: 'expense', amount: 1000, sort_order: 0 });
  }
  insertMapping(db, { section: 'Food', budget_category: 'Dining', transaction_category: 'Outside Food', kind: 'expense' });
  db.prepare(`INSERT INTO transactions (amount, paid_by, category, month) VALUES (?, ?, ?, ?)`)
    .run(800, 'Household Pool', 'Outside Food', 'September_2026');

  assert.equal(service.getBudget({ month: 'September_2026', person: 'Pooja' }).summary.actualSpending, 400);
  assert.equal(service.getBudget({ month: 'September_2026', person: 'Kunal' }).summary.actualSpending, 400);
  assert.equal(service.getBudget({ month: 'September_2026', person: 'all' }).summary.actualSpending, 800);
  db.close();
});

test('unmapped expenses reconcile Actual spending and preserve household shares', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent', 'Groceries'] });
  for (const person of ['Pooja', 'Kunal']) {
    insertLine(db, { month: 'September_2026', person, section: 'Home', category: 'House Rent', kind: 'expense', amount: 1000, sort_order: 0 });
  }
  insertMapping(db, { section: 'Home', budget_category: 'House Rent', transaction_category: 'Rent', kind: 'expense' });
  const addTransaction = db.prepare(`INSERT INTO transactions (date, amount, description, paid_by, category, month) VALUES (?, ?, ?, ?, ?, ?)`);
  addTransaction.run('1 September 2026', 100, 'Rent', 'Pooja', 'Rent', 'September_2026');
  addTransaction.run('2 September 2026', 50, 'Pooja groceries', 'Pooja', 'Groceries', 'September_2026');
  addTransaction.run('3 September 2026', 70, 'Kunal groceries', 'Kunal', 'Groceries', 'September_2026');
  addTransaction.run('4 September 2026', 80, 'Shared groceries', 'Household Pool', 'Groceries', 'September_2026');
  addTransaction.run('5 September 2026', 999, 'Refund', 'Pooja', 'Refunded', 'September_2026');
  addTransaction.run('6 September 2026', 888, 'Fund', 'Pooja', 'Investment', 'September_2026');
  addTransaction.run('7 September 2026', 30, 'Unknown payer', '', 'Utilities', 'September_2026');

  const pooja = service.getBudget({ month: 'September_2026', person: 'Pooja' });
  const combined = service.getBudget({ month: 'September_2026', person: 'all' });

  assert.deepEqual(pooja.unmappedExpenses, { total: 90, categories: [{ category: 'Groceries', total: 90 }] });
  assert.equal(pooja.summary.actualSpending, 190);
  assert.deepEqual(combined.unmappedExpenses, {
    total: 230,
    categories: [{ category: 'Groceries', total: 200 }, { category: 'Utilities', total: 30 }],
  });
  assert.equal(combined.summary.actualSpending, 330);

  const details = service.getBudgetTransactions({
    month: 'September_2026', person: 'all', section: 'Miscellaneous', budgetCategory: 'Unmapped expenses', kind: 'expense',
  });
  assert.equal(details.total, 230);
  assert.deepEqual(details.transactionCategories, ['Groceries', 'Utilities']);
  assert.deepEqual(details.transactions.map(row => ({ description: row.description, countedAmount: row.countedAmount })), [
    { description: 'Pooja groceries', countedAmount: 50 },
    { description: 'Kunal groceries', countedAmount: 70 },
    { description: 'Shared groceries', countedAmount: 80 },
    { description: 'Unknown payer', countedAmount: 30 },
  ]);
  db.close();
});

test('budget transaction details reconcile personal spending including half of household-pool amounts', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Outside Food'] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Food', category: 'Dining', kind: 'expense', amount: 1000, sort_order: 0 });
  insertMapping(db, { section: 'Food', budget_category: 'Dining', transaction_category: 'Outside Food', kind: 'expense' });
  const addTransaction = db.prepare(`
    INSERT INTO transactions (date, amount, description, payment_method, paid_by, expense_type, category, month)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  addTransaction.run('2 September 2026', 300, 'Dinner', 'HDFC_Credit_Card', 'Pooja', 'Pooja_Personal', 'Outside Food', 'September_2026');
  addTransaction.run('3 September 2026', 800, 'Groceries', 'SBI_Debit_Card', 'Household Pool', 'Common_50_50', 'Outside Food', 'September_2026');
  addTransaction.run('4 September 2026', 250, 'Kunal lunch', 'Cash', 'Kunal', 'Kunal_Personal', 'Outside Food', 'September_2026');

  const result = service.getBudgetTransactions({
    month: 'September_2026', person: 'Pooja', section: 'Food', budgetCategory: 'Dining', kind: 'expense',
  });

  assert.equal(result.total, 700);
  assert.deepEqual(result.transactionCategories, ['Outside Food']);
  assert.deepEqual(result.transactions.map(row => ({ description: row.description, amount: row.amount, countedAmount: row.countedAmount })), [
    { description: 'Dinner', amount: 300, countedAmount: 300 },
    { description: 'Groceries', amount: 800, countedAmount: 400 },
  ]);
  db.close();
});

test('combined budget transaction details include both people and count household-pool amounts once', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent'] });
  for (const person of ['Pooja', 'Kunal']) {
    insertLine(db, { month: 'September_2026', person, section: 'Home', category: 'House Rent', kind: 'expense', amount: 1000, sort_order: 0 });
  }
  insertMapping(db, { section: 'Home', budget_category: 'House Rent', transaction_category: 'Rent', kind: 'expense' });
  const addTransaction = db.prepare(`INSERT INTO transactions (date, amount, description, paid_by, category, month) VALUES (?, ?, ?, ?, ?, ?)`);
  addTransaction.run('1 September 2026', 1000, 'Pooja rent', 'Pooja', 'Rent', 'September_2026');
  addTransaction.run('1 September 2026', 1200, 'Kunal rent', 'Kunal', 'Rent', 'September_2026');
  addTransaction.run('1 September 2026', 400, 'Shared repair', 'Household Pool', 'Rent', 'September_2026');

  const result = service.getBudgetTransactions({
    month: 'September_2026', person: 'all', section: 'Home', budgetCategory: 'House Rent', kind: 'expense',
  });

  assert.equal(result.total, 2600);
  assert.deepEqual(result.transactions.map(row => row.countedAmount), [1000, 1200, 400]);
  db.close();
});

test('combined transaction details include only people who contribute that budget line', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent'] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Home', category: 'House Rent', kind: 'expense', amount: 1000, sort_order: 0 });
  insertMapping(db, { section: 'Home', budget_category: 'House Rent', transaction_category: 'Rent', kind: 'expense' });
  const addTransaction = db.prepare(`INSERT INTO transactions (date, amount, description, paid_by, category, month) VALUES (?, ?, ?, ?, ?, ?)`);
  addTransaction.run('1 September 2026', 1000, 'Pooja rent', 'Pooja', 'Rent', 'September_2026');
  addTransaction.run('1 September 2026', 1200, 'Kunal rent', 'Kunal', 'Rent', 'September_2026');
  addTransaction.run('1 September 2026', 400, 'Shared repair', 'Household Pool', 'Rent', 'September_2026');

  const budgetLine = service.getBudget({ month: 'September_2026', person: 'all' }).sections[0].lines[0];
  const result = service.getBudgetTransactions({
    month: 'September_2026', person: 'all', section: 'Home', budgetCategory: 'House Rent', kind: 'expense',
  });

  assert.equal(result.total, budgetLine.actual);
  assert.deepEqual(result.transactions.map(row => ({ paidBy: row.paid_by, countedAmount: row.countedAmount })), [
    { paidBy: 'Pooja', countedAmount: 1000 },
    { paidBy: 'Household Pool', countedAmount: 200 },
  ]);
  db.close();
});

test('budget transaction details exclude categories that Budget Actual excludes', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Settlement'] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Home', category: 'Transfers', kind: 'expense', amount: 1000, sort_order: 0 });
  insertMapping(db, { section: 'Home', budget_category: 'Transfers', transaction_category: 'Settlement', kind: 'expense' });
  db.prepare(`INSERT INTO transactions (date, amount, description, paid_by, category, month) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('1 September 2026', 800, 'Monthly settlement', 'Pooja', 'Settlement', 'September_2026');

  const budgetLine = service.getBudget({ month: 'September_2026', person: 'Pooja' }).sections[0].lines[0];
  const result = service.getBudgetTransactions({
    month: 'September_2026', person: 'Pooja', section: 'Home', budgetCategory: 'Transfers', kind: 'expense',
  });

  assert.equal(budgetLine.actual, 0);
  assert.equal(result.total, budgetLine.actual);
  assert.deepEqual(result.transactions, []);
  db.close();
});

test('future transaction details use Investment transactions for the selected person', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Investment'] });
  db.prepare(`INSERT INTO transactions (date, amount, description, paid_by, category, month) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('5 September 2026', 5000, 'Mutual fund', 'Kunal', 'Investment', 'September_2026');

  const result = service.getBudgetTransactions({
    month: 'September_2026', person: 'Kunal', section: 'Future', budgetCategory: '20% of salary', kind: 'investment',
  });

  assert.equal(result.total, 5000);
  assert.deepEqual(result.transactionCategories, ['Investment']);
  assert.equal(result.transactions[0].description, 'Mutual fund');
  db.close();
});

test('future allocations default to twenty percent but preserve higher manual budgets', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Investment'] });
  for (const [person, salary, invested] of [['Pooja', 100000, 25000], ['Kunal', 50000, 5000]]) {
    insertLine(db, { month: 'September_2026', person, section: 'Home', category: 'Placeholder', kind: 'expense', amount: 0, sort_order: 0 });
    db.prepare(`INSERT INTO salaries (person, month, amount) VALUES (?, ?, ?)`).run(person, 'September_2026', salary);
    db.prepare(`INSERT INTO transactions (amount, paid_by, category, month) VALUES (?, ?, ?, ?)`).run(invested, person, 'Investment', 'September_2026');
  }
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Future', category: 'Investment goal', kind: 'investment', amount: 30000, sort_order: 0 });

  const pooja = service.getBudget({ month: 'September_2026', person: 'Pooja' });
  assert.deepEqual(pooja.future, {
    people: [{ person: 'Pooja', hasSalary: true, salary: 100000, minimum: 20000, target: 30000, actual: 25000, difference: -5000, usage: 25000 / 30000, status: 'below_target' }],
  });
  assert.equal(pooja.summary.plannedInvestments, 30000);
  assert.equal(pooja.summary.actualInvestments, 25000);

  const combined = service.getBudget({ month: 'September_2026', person: 'all' });
  assert.deepEqual(combined.future.people, [
    { person: 'Pooja', hasSalary: true, salary: 100000, minimum: 20000, target: 30000, actual: 25000, difference: -5000, usage: 25000 / 30000, status: 'below_target' },
    { person: 'Kunal', hasSalary: true, salary: 50000, minimum: 10000, target: 10000, actual: 5000, difference: -5000, usage: 0.5, status: 'below_target' },
  ]);
  assert.equal(combined.summary.plannedInvestments, 40000);
  assert.equal(combined.summary.actualInvestments, 30000);
  db.close();
});

test('future target stays unavailable when salary is missing', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: [] });
  insertLine(db, { month: 'September_2026', person: 'Kunal', section: 'Home', category: 'Placeholder', kind: 'expense', amount: 0, sort_order: 0 });
  insertLine(db, { month: 'September_2026', person: 'Kunal', section: 'Future', category: 'Investment goal', kind: 'investment', amount: 15000, sort_order: 0 });
  db.prepare(`INSERT INTO transactions (amount, paid_by, category, month) VALUES (?, ?, ?, ?)`).run(1200, 'Kunal', 'Investment', 'September_2026');

  assert.deepEqual(service.getBudget({ month: 'September_2026', person: 'Kunal' }).future, {
    people: [{ person: 'Kunal', hasSalary: false, salary: 0, minimum: null, target: null, storedAllocation: 15000, actual: 1200, difference: null, usage: null, status: 'salary_missing' }],
  });
  const summary = service.getBudget({ month: 'September_2026', person: 'Kunal' }).summary;
  assert.equal(summary.plannedInvestments, null);
  assert.equal(summary.actualInvestments, 1200);
  db.close();
});

test('copyBudget raises a copied Future allocation to the target month salary minimum', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: [] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Home', category: 'Rent', kind: 'expense', amount: 30000, sort_order: 0 });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Future', category: 'Investment goal', kind: 'investment', amount: 10000, sort_order: 0 });
  db.prepare(`INSERT INTO salaries (person, month, amount) VALUES (?, ?, ?)`).run('Pooja', 'September_2026', 50000);
  db.prepare(`INSERT INTO salaries (person, month, amount) VALUES (?, ?, ?)`).run('Pooja', 'October_2026', 100000);

  service.copyBudget({ sourceMonth: 'September_2026', targetMonth: 'October_2026', person: 'Pooja' });

  assert.equal(db.prepare(`SELECT amount FROM budgets WHERE month = 'October_2026' AND person = 'Pooja' AND section = 'Future'`).get().amount, 20000);
  assert.equal(service.getBudget({ month: 'October_2026', person: 'Pooja' }).future.people[0].target, 20000);
  db.close();
});

test('replaceBudget rejects a manual Future allocation below twenty percent of salary', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: [] });
  db.prepare(`INSERT INTO salaries (person, month, amount) VALUES (?, ?, ?)`).run('Pooja', 'September_2026', 100000);
  const ordinary = { section: 'Home', category: 'Rent', kind: 'expense', amount: 40000, sort_order: 0 };
  const future = { section: 'Future', category: 'Investment goal', kind: 'investment', amount: 19999, sort_order: 0 };

  assert.throws(
    () => service.replaceBudget({ month: 'September_2026', person: 'Pooja', lines: [ordinary, future] }),
    /Future allocation must be at least 20% of salary/
  );
  assert.deepEqual(
    service.replaceBudget({ month: 'September_2026', person: 'Pooja', lines: [ordinary, { ...future, amount: 25000 }] }),
    { saved: true, count: 2 }
  );
  db.close();
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
  assert.throws(() => service.replaceBudget({
    month: 'September_2026', person: 'Pooja',
    lines: [{ ...base, section: 'Miscellaneous', category: 'Unmapped expenses' }],
  }), /reserved/i);
  assert.throws(() => service.replaceBudget({ month: 'September_2026', person: 'Common', lines: [base] }), /Person must be/);
  assert.throws(() => service.replaceBudget({ month: '2026-09', person: 'Pooja', lines: [base] }), /Month must use Month_YYYY/);
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM budgets WHERE month = 'September_2026' AND person = 'Pooja'`).get().count, 1);
  assert.deepEqual(service.replaceBudget({ month: 'September_2026', person: 'Pooja', lines: [base] }), { saved: true, count: 1 });
  assert.deepEqual(db.prepare(`SELECT section, category, amount FROM budgets WHERE month = 'September_2026' AND person = 'Pooja'`).all(), [{ section: 'Household', category: 'Rent', amount: 100 }]);
  db.close();
});

test('replaceBudget removes a mapping only after its final budget line is deleted', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent'] });
  const line = { month: 'September_2026', section: 'Home', category: 'House Rent', kind: 'expense', amount: 100, sort_order: 0 };
  insertLine(db, { ...line, person: 'Pooja' });
  insertLine(db, { ...line, person: 'Kunal' });
  insertMapping(db, { section: 'Home', budget_category: 'House Rent', transaction_category: 'Rent', kind: 'expense' });

  service.replaceBudget({ month: 'September_2026', person: 'Pooja', lines: [] });
  assert.equal(db.prepare('SELECT COUNT(*) count FROM budget_category_mappings').get().count, 1);

  service.replaceBudget({ month: 'September_2026', person: 'Kunal', lines: [] });
  assert.equal(db.prepare('SELECT COUNT(*) count FROM budget_category_mappings').get().count, 0);
  db.close();
});

test('attributes mapped lines and reports eligible unmapped expenses separately', () => {
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
  assert.equal(pooja.summary.expenseBudget, 111177); assert.equal(pooja.summary.actualSpending, 29789); assert.equal(pooja.summary.variance, 81388);
  assert.equal(pooja.summary.salary, 337292); assert.equal(pooja.summary.netMonthlySavings, 307503);
  assert.equal(pooja.summary.plannedInvestments, 337292 * 0.2); assert.equal(pooja.summary.actualInvestments, 0);
  assert.equal(pooja.sections[0].lines[0].actual, 21000); assert.equal(pooja.sections[0].lines[0].usage, 21000 / 111177); assert.equal(pooja.sections[1].lines[0].actual, 2000); assert.equal(pooja.unmappedCount, 0);
  assert.deepEqual(pooja.unmappedExpenses, {
    total: 8789,
    categories: [{ category: 'Unmapped', total: 6789 }, { category: 'SIP', total: 2000 }],
  });
  const kunal = service.getBudget({ month: 'September_2026', person: 'Kunal' });
  const combined = service.getBudget({ month: 'September_2026', person: 'all' });
  assert.equal(combined.summary.expenseBudget, 226824); assert.equal(combined.summary.actualSpending, pooja.summary.actualSpending + kunal.summary.actualSpending);
  assert.equal(combined.summary.plannedInvestments, null); assert.equal(combined.summary.actualInvestments, 0);
  assert.deepEqual(combined.sections.map(section => section.section), ['Home', 'Investments', 'Lifestyle']);
  db.close();
});

test('replaceMappings validates complete replacements and preserves existing mappings on failure', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent', 'Petrol'] });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Home', category: 'House Rent', kind: 'expense', amount: 100, sort_order: 0 });
  insertLine(db, { month: 'September_2026', person: 'Pooja', section: 'Transport', category: 'Fuel', kind: 'expense', amount: 100, sort_order: 1 });
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

test('replaceMappings rejects a target that is not a real budget line', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Rent'] });

  assert.throws(
    () => service.replaceMappings({
      section: 'Ghost', budgetCategory: 'Missing line', kind: 'expense', transactionCategories: ['Rent'],
    }),
    error => error.code === 'not_found' && /Budget line not found/.test(error.message)
  );
  assert.equal(db.prepare('SELECT COUNT(*) count FROM budget_category_mappings').get().count, 0);
  db.close();
});

test('replaceMappings rejects the reserved synthetic unmapped row', () => {
  const db = createFixture();
  const service = createBudgetService(db, { validCategories: ['Groceries'] });
  assert.throws(() => service.replaceMappings({
    section: 'Miscellaneous', budgetCategory: 'Unmapped expenses', kind: 'expense', transactionCategories: ['Groceries'],
  }), /reserved/i);
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
  const beforeSameMonth = db.prepare(`SELECT person, amount FROM budgets WHERE month = 'September_2026' ORDER BY person`).all();
  assert.throws(() => service.copyBudget({ sourceMonth: 'September_2026', targetMonth: 'September_2026', person: 'all', replace: true }), /Source and target months must differ/);
  assert.deepEqual(db.prepare(`SELECT person, amount FROM budgets WHERE month = 'September_2026' ORDER BY person`).all(), beforeSameMonth);
  for (const replace of ['true', 1, null]) {
    assert.throws(() => service.copyBudget({ sourceMonth: 'September_2026', targetMonth: 'October_2026', person: 'Pooja', replace }), /Replace must be a boolean/);
  }
  assert.throws(() => service.copyBudget({ sourceMonth: 'September_2026', targetMonth: 'October_2026', person: 'Pooja' }), error => error.code === 'conflict');
  db.close();
});
