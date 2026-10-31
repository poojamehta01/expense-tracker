const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, lists, row } = require('./helpers/mcp-fixture');
const { createFinanceService } = require('../finance-service');
const { createMcpFinance } = require('../mcp/finance');
let f, shared, finance;
test.beforeEach(() => {
  f = fixture(); shared = createFinanceService(f.db);
  finance = createMcpFinance({ db: f.db, financeService: shared, lists, now: () => new Date('2026-10-31T20:00:00Z') });
});
test.afterEach(() => f.close());

test('budget details and investments page rows while keeping complete totals', () => {
  shared.addTransactions(Array.from({ length: 205 }, (_, i) => row({ date: '2 September 2026', category: 'Rent', description: `Rent ${i}` })));
  const input = { month: 'September_2026', section: 'Household Expenses', budgetCategory: 'House Rent', kind: 'expense' };
  const budget = finance.budgetTransactions(input);
  assert.equal(budget.transactions.length, 50);
  assert.equal(budget.transactionCount, 205);
  assert.equal(budget.total, 8200);
  assert.equal(budget.nextOffset, 50);
  assert.equal(finance.budgetTransactions({ ...input, offset: 200 }).transactions.length, 5);
  const insert = f.db.prepare('INSERT INTO investments(name,person,amount_paise) VALUES (?, ?, ?)');
  f.db.transaction(() => { for (let i = 0; i < 205; i++) insert.run(`Fund ${i}`, 'Pooja', 10000); })();
  const investments = finance.investments({ person: 'Pooja', limit: 200 });
  assert.equal(investments.entries.length, 200);
  assert.equal(investments.totalEntries, 205);
  assert.equal(investments.totals.Pooja, 20500);
  assert.equal(investments.valuations.Pooja.missing, 205);
  assert.equal(investments.nextOffset, 200);
  assert.equal(finance.investments({ offset: 200 }).entries.length, 5);
  assert.throws(() => finance.investments({ limit: 201 }), /limit/);
});

test('responsibility and exclusions agree with the dashboard while pool creates no debt', () => {
  shared.addTransactions([row(), row({ amount: 100, description: 'Groceries', payment_method: 'SBI_Debit_Card' }),
    ...['Credit Card Payment', 'Settlement', 'Investment', 'Refunded'].map(category => row({ category, amount: 200, description: category }))]);
  const combined = finance.summary({ month: 'October_2026' });
  assert.equal(combined.totalSpend, 140);
  assert.equal(combined.transactionCount, 2);
  assert.deepEqual(combined.byResponsibility, { Pooja: 90, Kunal: 50 });
  assert.equal(shared.getDashboard('October_2026').totalSpend, 140);
  assert.equal(finance.summary({ month: 'October_2026', person: 'Pooja' }).totalSpend, 90);
  assert.equal(finance.summary({ month: 'October_2026', person: 'Kunal' }).totalSpend, 50);
  assert.equal(finance.settlement({ month: 'October_2026' }).net, 0);
  assert.equal(finance.search({ month: 'October_2026' }).total, 6);
});

test('settlement preserves cross-person payments and reports the direction', () => {
  shared.addTransactions([row({ expense_type: 'Pooja_for_Kunal', amount: 80 }), row({ description: 'Shared', expense_type: 'Common_50_50', paid_by: 'Kunal', amount: 60 })]);
  assert.equal(finance.settlement({ month: 'October_2026' }).net, 50);
  assert.equal(finance.settlement({ month: 'October_2026' }).owes, 'Kunal owes Pooja');
});

test('search orders parsed dates and matches literal wildcard text with bounded pagination', () => {
  shared.addTransactions([row({ date: '12 October 2026', description: '100%_off' }), row({ date: '3 October 2026', description: '100AAoff' }), row({ date: '2 October 2026', description: 'Second' })]);
  assert.deepEqual(finance.search({ month: 'October_2026' }).transactions.map(x => x.date), ['2026-10-02', '2026-10-03', '2026-10-12']);
  assert.equal(finance.search({ text: '%_' }).total, 1);
  const result = finance.search({ startDate: '2026-10-03', endDate: '2026-10-12', limit: 1 });
  assert.equal(result.total, 2); assert.equal(result.nextOffset, 1);
  assert.equal(finance.search({ startDate: '2026-10-03', endDate: '2026-10-12', offset: 1, limit: 1 }).transactions[0].description, '100%_off');
  for (const args of [{ limit: 201 }, { offset: -1 }, { startDate: '2026-02-29', endDate: '2026-03-01' }, { month: 'bad' }, { startDate: '2026-10-12' }, { month: 'October_2026', startDate: '2026-09-01', endDate: '2026-09-30' }]) {
    assert.throws(() => finance.search(args), { code: 'validation' });
  }
});

test('valid leap dates work and malformed historical dates remain visible in month searches', () => {
  shared.addTransactions([row({ date: '29 February 2024', description: 'Leap' })]);
  assert.equal(finance.search({ startDate: '2024-02-29', endDate: '2024-02-29' }).total, 1);
  f.db.prepare('INSERT INTO transactions (date,month,amount,category) VALUES (?,?,?,?)').run('bad', 'October_2026', 7, 'Rent');
  assert.equal(finance.search({ month: 'October_2026' }).transactions[0].date, null);
  assert.equal(finance.summary({ month: 'October_2026' }).totalSpend, 7);
  assert.equal(finance.summary({ month: 'October_2026' }).invalidDateCount, 1);
});

test('summary totals cover all rows even when detail breakdowns are truncated', () => {
  shared.addTransactions(Array.from({ length: 210 }, (_, i) => row({ description: `Item ${i}`, amount: 1, category: `Category ${i}` })));
  const result = finance.summary({ month: 'October_2026' });
  assert.equal(result.totalSpend, 210); assert.equal(result.byCategory.length, 200);
  assert.equal(result.truncated.byCategory, true);
  assert.equal(finance.search({}).transactions.length, 50);
});

test('context, month union, salary presence, budgets and partial valuations retain their meanings', () => {
  f.db.prepare('INSERT INTO lists (list_name,value) VALUES (?,?)').run('categories', 'Custom');
  assert.ok(finance.context().categories.includes('Custom'));
  assert.equal(finance.context().today, '2026-11-01');
  f.db.prepare('INSERT INTO salaries (person,month,amount) VALUES (?,?,?)').run('Pooja', 'November_2026', 0);
  const salaries = finance.salary({ month: 'November_2026' });
  assert.deepEqual(salaries.people.Pooja, { amount: 0, notes: '', recorded: true });
  assert.deepEqual(salaries.people.Kunal, { amount: null, notes: '', recorded: false });
  const months = finance.months().months;
  assert.ok(months.indexOf('February_2026') < months.indexOf('September_2026'));
  assert.ok(months.includes('November_2026'));
  assert.equal(finance.budget({ month: 'September_2026', person: 'all' }).hasBudget, true);
  const investments = require('../investment-service').createInvestmentService(f.db);
  investments.add({ name: 'Known', person: 'Pooja', amount: 50, currentValue: 60 });
  investments.add({ name: 'Unknown', person: 'Pooja', amount: 25 });
  const result = finance.investments({ person: 'Pooja' });
  assert.equal(result.valuations.Pooja.currentValue, 60); assert.equal(result.valuations.Pooja.missing, 1);
  assert.equal(result.totals.Pooja, 75);
});
