const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { createBudgetService } = require('../budget-service');
const {
  createGmailTransport,
  createDailyEmailService,
  reportingPeriod,
  renderReminder,
  renderReport,
} = require('../daily-email-service');

test('creates a Gmail SMTP transport from injected environment configuration', () => {
  const transport = createGmailTransport({
    user: 'sender@example.com',
    appPassword: 'fake-app-password',
  });

  assert.equal(transport.options.service, 'gmail');
  assert.deepEqual(transport.options.auth, {
    user: 'sender@example.com',
    pass: 'fake-app-password',
  });
});

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
    CREATE TABLE daily_email_threads (
      kind TEXT PRIMARY KEY CHECK(kind IN ('reminder','report')),
      root_message_id TEXT NOT NULL,
      last_message_id TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE daily_email_sends (
      kind TEXT NOT NULL CHECK(kind IN ('reminder','report')),
      report_date TEXT NOT NULL,
      message_id TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(kind, report_date)
    );
    CREATE TABLE daily_email_delivery_claims (
      kind TEXT NOT NULL CHECK(kind IN ('reminder','report')),
      report_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('sending','delivery_unknown','sent')),
      message_id TEXT,
      claimed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK(status != 'sent' OR (typeof(message_id) = 'text' AND length(trim(message_id)) > 0)),
      PRIMARY KEY(kind, report_date)
    );
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

function createDeliveryService({
  db,
  messages,
  messageIds,
  currentTime,
  budgetService = createBudgetService(db, { validCategories: [] }),
}) {
  return createDailyEmailService({
    db,
    budgetService,
    transport: {
      async sendMail(message) {
        messages.push(message);
        return { messageId: messageIds.shift() };
      },
    },
    config: {
      sender: 'pooja0111mehta@gmail.com',
      recipients: ['poojamehta1197@gmail.com', 'kunal.mukte03@gmail.com'],
      baseUrl: 'https://expense.example',
    },
    now: () => currentTime.value,
  });
}

test('sends the first reminder as a root and later reminders as replies to its persisted thread', async () => {
  const db = createFixture();
  const messages = [];
  const currentTime = { value: new Date('2026-09-18T15:45:00.000Z') };
  const service = createDeliveryService({
    db,
    messages,
    messageIds: ['<reminder-1@example>', '<reminder-2@example>'],
    currentTime,
  });

  const first = await service.sendReminder();
  currentTime.value = new Date('2026-09-19T15:45:00.000Z');
  const second = await service.sendReminder();

  assert.deepEqual(first, { status: 'sent', kind: 'reminder', reportDate: '2026-09-17' });
  assert.deepEqual(second, { status: 'sent', kind: 'reminder', reportDate: '2026-09-18' });
  assert.equal(messages[0].from, 'pooja0111mehta@gmail.com');
  assert.deepEqual(messages[0].to, ['poojamehta1197@gmail.com', 'kunal.mukte03@gmail.com']);
  assert.equal(messages[0].inReplyTo, undefined);
  assert.equal(messages[0].references, undefined);
  assert.equal(messages[1].inReplyTo, '<reminder-1@example>');
  assert.equal(messages[1].references, '<reminder-1@example>');
  assert.deepEqual(db.prepare(`
    SELECT kind, root_message_id, last_message_id
    FROM daily_email_threads WHERE kind = ?
  `).get('reminder'), {
    kind: 'reminder',
    root_message_id: '<reminder-1@example>',
    last_message_id: '<reminder-2@example>',
  });
  assert.deepEqual(db.prepare(`
    SELECT kind, report_date, status, message_id
    FROM daily_email_delivery_claims
    WHERE kind = 'reminder' AND report_date = '2026-09-18'
  `).get(), {
    kind: 'reminder',
    report_date: '2026-09-18',
    status: 'sent',
    message_id: '<reminder-2@example>',
  });
});

test('keeps report replies in a persistent thread independent from reminders', async () => {
  const db = createFixture();
  const messages = [];
  const currentTime = { value: new Date('2026-09-18T15:45:00.000Z') };
  const service = createDeliveryService({
    db,
    messages,
    messageIds: ['<reminder-root@example>', '<report-root@example>', '<report-reply@example>'],
    currentTime,
  });

  await service.sendReminder();
  await service.sendReport();
  currentTime.value = new Date('2026-09-19T15:45:00.000Z');
  const reply = await service.sendReport();

  assert.deepEqual(reply, { status: 'sent', kind: 'report', reportDate: '2026-09-18' });
  assert.equal(messages[1].from, 'pooja0111mehta@gmail.com');
  assert.deepEqual(messages[1].to, ['poojamehta1197@gmail.com', 'kunal.mukte03@gmail.com']);
  assert.equal(messages[1].inReplyTo, undefined);
  assert.equal(messages[1].references, undefined);
  assert.equal(messages[2].inReplyTo, '<report-root@example>');
  assert.equal(messages[2].references, '<report-root@example>');
  assert.deepEqual(
    db.prepare('SELECT kind, root_message_id, last_message_id FROM daily_email_threads ORDER BY kind').all(),
    [
      { kind: 'reminder', root_message_id: '<reminder-root@example>', last_message_id: '<reminder-root@example>' },
      { kind: 'report', root_message_id: '<report-root@example>', last_message_id: '<report-reply@example>' },
    ],
  );
});

for (const kind of ['reminder', 'report']) {
  test(`does not send a duplicate ${kind} for the same report date`, async () => {
    const db = createFixture();
    const messages = [];
    const currentTime = { value: new Date('2026-09-18T15:45:00.000Z') };
    let budgetCalls = 0;
    const service = createDeliveryService({
      db,
      messages,
      messageIds: [`<${kind}-1@example>`, `<${kind}-2@example>`],
      currentTime,
      budgetService: {
        getBudget() {
          budgetCalls += 1;
          return { hasBudget: false };
        },
      },
    });

    await service[kind === 'reminder' ? 'sendReminder' : 'sendReport']();
    const duplicate = await service[kind === 'reminder' ? 'sendReminder' : 'sendReport']();

    assert.deepEqual(duplicate, {
      status: 'already_sent',
      kind,
      reportDate: '2026-09-17',
    });
    assert.equal(messages.length, 1);
    assert.equal(budgetCalls, kind === 'report' ? 1 : 0);
    assert.deepEqual(
      db.prepare('SELECT kind, report_date, message_id FROM daily_email_sends').all(),
      [{ kind, report_date: '2026-09-17', message_id: `<${kind}-1@example>` }],
    );
  });
}

test('treats a legacy successful ledger row without a claim as already sent', async () => {
  const db = createFixture();
  db.prepare(`
    INSERT INTO daily_email_sends (kind, report_date, message_id)
    VALUES ('report', '2026-09-17', '<legacy-success@example>')
  `).run();
  const messages = [];
  const service = createDeliveryService({
    db,
    messages,
    messageIds: ['<must-not-send@example>'],
    currentTime: { value: new Date('2026-09-18T15:45:00.000Z') },
  });

  assert.deepEqual(await service.sendReport(), {
    status: 'already_sent',
    kind: 'report',
    reportDate: '2026-09-17',
  });
  assert.equal(messages.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM daily_email_delivery_claims').get().count, 0);
});

test('leaves a failed SMTP send unrecorded and allows a successful retry', async () => {
  const db = createFixture();
  const messages = [];
  let attempt = 0;
  const service = createDailyEmailService({
    db,
    budgetService: createBudgetService(db, { validCategories: [] }),
    transport: {
      async sendMail(message) {
        messages.push(message);
        attempt += 1;
        if (attempt === 1) throw new Error('temporary SMTP failure');
        return { messageId: '<report-retry@example>' };
      },
    },
    config: {
      sender: 'pooja0111mehta@gmail.com',
      recipients: ['poojamehta1197@gmail.com', 'kunal.mukte03@gmail.com'],
      baseUrl: 'https://expense.example',
    },
    now: () => new Date('2026-09-18T15:45:00.000Z'),
  });

  await assert.rejects(service.sendReport(), /temporary SMTP failure/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM daily_email_sends').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM daily_email_threads').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM daily_email_delivery_claims').get().count, 0);

  assert.deepEqual(await service.sendReport(), {
    status: 'sent',
    kind: 'report',
    reportDate: '2026-09-17',
  });
  assert.equal(messages.length, 2);
  assert.deepEqual(
    db.prepare('SELECT kind, report_date, message_id FROM daily_email_sends').all(),
    [{ kind: 'report', report_date: '2026-09-17', message_id: '<report-retry@example>' }],
  );
});

test('blocks automatic retry when SMTP resolves without a usable message ID', async () => {
  const db = createFixture();
  const messages = [];
  const service = createDeliveryService({
    db,
    messages,
    messageIds: ['   '],
    currentTime: { value: new Date('2026-09-18T15:45:00.000Z') },
  });

  assert.deepEqual(await service.sendReminder(), {
    status: 'delivery_unknown',
    kind: 'reminder',
    reportDate: '2026-09-17',
  });
  assert.deepEqual(await service.sendReminder(), {
    status: 'delivery_unknown',
    kind: 'reminder',
    reportDate: '2026-09-17',
  });
  assert.equal(messages.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM daily_email_sends').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM daily_email_threads').get().count, 0);
  assert.deepEqual(
    db.prepare(`
      SELECT kind, report_date, status, message_id
      FROM daily_email_delivery_claims
    `).all(),
    [{ kind: 'reminder', report_date: '2026-09-17', status: 'delivery_unknown', message_id: null }],
  );
});

test('allows only one concurrent claimant to invoke SMTP', async () => {
  const db = createFixture();
  let transportCalls = 0;
  let resolveFirstSend;
  const service = createDailyEmailService({
    db,
    budgetService: createBudgetService(db, { validCategories: [] }),
    transport: {
      async sendMail() {
        transportCalls += 1;
        if (transportCalls > 1) return { messageId: '<duplicate@example>' };
        return new Promise((resolve) => { resolveFirstSend = resolve; });
      },
    },
    config: {
      sender: 'pooja0111mehta@gmail.com',
      recipients: ['poojamehta1197@gmail.com', 'kunal.mukte03@gmail.com'],
      baseUrl: 'https://expense.example',
    },
    now: () => new Date('2026-09-18T15:45:00.000Z'),
  });

  const first = service.sendReminder();
  const second = service.sendReminder();
  await Promise.resolve();
  resolveFirstSend({ messageId: '<winner@example>' });
  const results = await Promise.all([first, second]);

  assert.equal(transportCalls, 1);
  assert.deepEqual(results, [
    { status: 'sent', kind: 'reminder', reportDate: '2026-09-17' },
    { status: 'in_progress', kind: 'reminder', reportDate: '2026-09-17' },
  ]);
  assert.deepEqual(
    db.prepare('SELECT kind, report_date, message_id FROM daily_email_sends').all(),
    [{ kind: 'reminder', report_date: '2026-09-17', message_id: '<winner@example>' }],
  );
});

test('clears a pre-send rendering claim so the job can be retried', async () => {
  const db = createFixture();
  let budgetCalls = 0;
  const messages = [];
  const service = createDailyEmailService({
    db,
    budgetService: {
      getBudget() {
        budgetCalls += 1;
        if (budgetCalls === 1) throw new Error('render data failed');
        return { hasBudget: false };
      },
    },
    transport: {
      async sendMail(message) {
        messages.push(message);
        return { messageId: '<render-retry@example>' };
      },
    },
    config: {
      sender: 'pooja0111mehta@gmail.com',
      recipients: ['poojamehta1197@gmail.com', 'kunal.mukte03@gmail.com'],
      baseUrl: 'https://expense.example',
    },
    now: () => new Date('2026-09-18T15:45:00.000Z'),
  });

  await assert.rejects(service.sendReport(), /render data failed/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM daily_email_delivery_claims').get().count, 0);
  assert.deepEqual(await service.sendReport(), {
    status: 'sent',
    kind: 'report',
    reportDate: '2026-09-17',
  });
  assert.equal(messages.length, 1);
});

test('keeps a durable delivery_unknown claim when post-SMTP persistence fails', async () => {
  const db = createFixture();
  const messages = [];
  db.exec(`
    CREATE TRIGGER fail_daily_email_send
    BEFORE INSERT ON daily_email_sends
    BEGIN
      SELECT RAISE(ABORT, 'forced persistence failure');
    END;
  `);
  const service = createDeliveryService({
    db,
    messages,
    messageIds: ['<accepted@example>'],
    currentTime: { value: new Date('2026-09-18T15:45:00.000Z') },
  });

  assert.deepEqual(await service.sendReminder(), {
    status: 'delivery_unknown',
    kind: 'reminder',
    reportDate: '2026-09-17',
  });
  assert.deepEqual(await service.sendReminder(), {
    status: 'delivery_unknown',
    kind: 'reminder',
    reportDate: '2026-09-17',
  });
  assert.equal(messages.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM daily_email_sends').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM daily_email_threads').get().count, 0);
  assert.deepEqual(
    db.prepare('SELECT kind, report_date, status, message_id FROM daily_email_delivery_claims').all(),
    [{ kind: 'reminder', report_date: '2026-09-17', status: 'delivery_unknown', message_id: '<accepted@example>' }],
  );
});

test('keeps a fresh claim in_progress and turns it delivery_unknown at the 15-minute stale boundary', async () => {
  const db = createFixture();
  db.prepare(`
    INSERT INTO daily_email_delivery_claims
      (kind, report_date, status, message_id, claimed_at, updated_at)
    VALUES ('reminder', '2026-09-17', 'sending', NULL, ?, ?)
  `).run('2026-09-18T15:30:00.000Z', '2026-09-18T15:30:00.000Z');
  const messages = [];
  const currentTime = { value: new Date('2026-09-18T15:44:59.000Z') };
  const service = createDeliveryService({
    db,
    messages,
    messageIds: ['<must-not-send@example>'],
    currentTime,
  });

  assert.deepEqual(await service.sendReminder(), {
    status: 'in_progress',
    kind: 'reminder',
    reportDate: '2026-09-17',
  });
  currentTime.value = new Date('2026-09-18T15:45:00.000Z');
  assert.deepEqual(await service.sendReminder(), {
    status: 'delivery_unknown',
    kind: 'reminder',
    reportDate: '2026-09-17',
  });
  assert.equal(messages.length, 0);
  assert.deepEqual(
    db.prepare('SELECT status, message_id FROM daily_email_delivery_claims').get(),
    { status: 'delivery_unknown', message_id: null },
  );
});
