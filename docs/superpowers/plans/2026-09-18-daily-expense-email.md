# Daily Expense Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one previous-day expense reminder at 8:30 p.m. IST and one previous-day expense/budget report at 9:00 p.m. IST every day, with each email type kept in its own persistent Gmail thread.

**Architecture:** A focused `daily-email-service` derives India-time reporting dates, queries SQLite, renders both email variants, sends through an injected Nodemailer transport, and persists send/thread state. Authenticated internal routes trigger each idempotent job, while a GitHub Actions cron calls the deployed app at fixed UTC times; the browser accepts `?tab=` links from the messages.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, Nodemailer SMTP, Node test runner, GitHub Actions, Fly.io

**Spec:** `docs/superpowers/specs/2026-09-18-daily-expense-email-design.md`

## Global Constraints

- Sender is `pooja0111mehta@gmail.com`.
- Recipients are `poojamehta1197@gmail.com` and `kunal.mukte03@gmail.com` on the same message.
- Run every day, including weekends, using `Asia/Kolkata` calendar boundaries.
- Reminder is at 8:30 p.m. IST; report is at 9:00 p.m. IST.
- Both messages describe the previous calendar day; month-to-date values use the month containing that previous day.
- Reminder and report are two independent persistent Gmail threads.
- Expense totals exclude `Credit Card Payment`, `Settlement`, `Investment`, and `Refunded`; investments are reported separately.
- Gmail and scheduler credentials must exist only in Fly/GitHub secrets and must never appear in source, tests, logs, documentation values, or chat.
- A successful job for one job type and report date must not send twice; a failed SMTP send must remain retryable.

---

### Task 1: Email persistence schema

**Files:**
- Modify: `db.js`
- Modify: `test/budget-schema.test.js`

**Interfaces:**
- Consumes: the existing exported better-sqlite3 database initialized by `db.js`.
- Produces: tables `daily_email_threads(kind, root_message_id, last_message_id, updated_at)` and `daily_email_sends(kind, report_date, message_id, sent_at)`.

- [ ] **Step 1: Write failing schema tests**

Add assertions to the existing isolated database initialization test:

```js
const threadColumns = check.prepare(`PRAGMA table_info(daily_email_threads)`).all().map(row => row.name);
assert.deepEqual(threadColumns, ['kind', 'root_message_id', 'last_message_id', 'updated_at']);

const sendColumns = check.prepare(`PRAGMA table_info(daily_email_sends)`).all().map(row => row.name);
assert.deepEqual(sendColumns, ['kind', 'report_date', 'message_id', 'sent_at']);
assert.throws(() => {
  check.prepare(`INSERT INTO daily_email_sends (kind, report_date, message_id) VALUES ('report','2026-09-17','<two>')`).run();
  check.prepare(`INSERT INTO daily_email_sends (kind, report_date, message_id) VALUES ('report','2026-09-17','<three>')`).run();
}, /UNIQUE constraint failed/);
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `node --test test/budget-schema.test.js`

Expected: FAIL because `daily_email_threads` and `daily_email_sends` do not exist.

- [ ] **Step 3: Add the two tables to database initialization**

Add to the existing `db.exec` schema block in `db.js`:

```sql
CREATE TABLE IF NOT EXISTS daily_email_threads (
  kind            TEXT PRIMARY KEY CHECK(kind IN ('reminder','report')),
  root_message_id TEXT NOT NULL,
  last_message_id TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_email_sends (
  kind        TEXT NOT NULL CHECK(kind IN ('reminder','report')),
  report_date TEXT NOT NULL CHECK(report_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  message_id  TEXT NOT NULL,
  sent_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(kind, report_date)
);
```

- [ ] **Step 4: Run the schema test and verify GREEN**

Run: `node --test test/budget-schema.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the schema**

```bash
git add db.js test/budget-schema.test.js
git commit -m "feat: add daily email delivery schema"
```

---

### Task 2: India-time reporting dates and report data

**Files:**
- Create: `daily-email-service.js`
- Create: `test/daily-email-service.test.js`

**Interfaces:**
- Consumes: `createBudgetService(db).getBudget({ month, person: 'all' })`; SQLite `transactions`; injected `now: () => Date`.
- Produces:
  - `reportingPeriod(now): { reportDate: string, displayDate: string, month: string }`
  - `createDailyEmailService({ db, budgetService, transport, config, now }).getReportData(): ReportData`
  - `ReportData = { period, dailyExpenses, dailyExpenseTotal, dailyExpenseCount, dailyInvestments, dailyInvestmentTotal, monthExpenseTotal, monthInvestmentTotal, budget }`

- [ ] **Step 1: Write failing date-boundary tests**

Create `test/daily-email-service.test.js` with literal expectations:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reportingPeriod } = require('../daily-email-service');

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
```

- [ ] **Step 2: Run the date tests and verify RED**

Run: `node --test test/daily-email-service.test.js`

Expected: FAIL with `Cannot find module '../daily-email-service'`.

- [ ] **Step 3: Implement `reportingPeriod` without relying on host timezone**

Use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })` to derive the India date, subtract one day from a UTC-safe `YYYY-MM-DDT00:00:00Z` representation, and format the month/display label from that result.

```js
function reportingPeriod(now = new Date()) {
  const indiaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const previous = new Date(`${indiaDate}T00:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  // Return exact reportDate, displayDate, and Month_YYYY fields.
}
```

- [ ] **Step 4: Run date tests and verify GREEN**

Run: `node --test test/daily-email-service.test.js`

Expected: PASS.

- [ ] **Step 5: Add failing aggregation tests using an in-memory SQLite database**

Build real `transactions`, `budgets`, `budget_category_mappings`, and `salaries` tables in the test. Insert yesterday expenses, excluded categories, investments, an out-of-day expense, and Household Pool spending. Assert literal values:

```js
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
```

Also assert that `Credit Card Payment`, `Settlement`, `Refunded`, and `Investment` never appear in `dailyExpenses`.

- [ ] **Step 6: Run aggregation tests and verify RED**

Run: `node --test test/daily-email-service.test.js`

Expected: FAIL because `createDailyEmailService` or `getReportData` is missing.

- [ ] **Step 7: Implement report aggregation**

Implement `createDailyEmailService` and `getReportData` using parameterized SQL. Convert stored display dates to report comparison without host-time parsing by querying the known `month` and matching the exact app date string (`D Month YYYY`). Use the existing combined budget service for budget actuals and unmapped totals.

Return a normalized budget object:

```js
budget: budgetResult.hasBudget ? {
  configured: true,
  expenseBudget: budgetResult.summary.expenseBudget,
  actualSpending: budgetResult.summary.actualSpending,
  remaining: budgetResult.summary.variance,
  usage: budgetResult.summary.usage,
  unmappedTotal: budgetResult.unmappedExpenses?.total || 0,
} : { configured: false }
```

- [ ] **Step 8: Run service tests and verify GREEN**

Run: `node --test test/daily-email-service.test.js`

Expected: PASS.

- [ ] **Step 9: Commit report calculations**

```bash
git add daily-email-service.js test/daily-email-service.test.js
git commit -m "feat: calculate daily expense email data"
```

---

### Task 3: Render reminder and report emails

**Files:**
- Modify: `daily-email-service.js`
- Modify: `test/daily-email-service.test.js`

**Interfaces:**
- Consumes: `ReportData` and `config.baseUrl` from Task 2.
- Produces:
  - `renderReminder({ period, baseUrl }): { subject, text, html }`
  - `renderReport(data, { baseUrl }): { subject, text, html }`

- [ ] **Step 1: Write failing rendering tests**

Use a literal `ReportData` fixture and assert observable content in both formats:

```js
const reminder = renderReminder({ period, baseUrl: 'https://expense.example' });
assert.equal(reminder.subject, 'Expense Tracker — Daily Reminder');
assert.match(reminder.text, /17 September 2026/);
assert.match(reminder.html, /https:\/\/expense\.example\/?tab=add/);

const report = renderReport(fixture, { baseUrl: 'https://expense.example' });
assert.equal(report.subject, 'Expense Tracker — Daily Report');
assert.match(report.text, /Yesterday's expenses: ₹1,500/);
assert.match(report.text, /Month to date: ₹2,200 of ₹10,000/);
assert.match(report.text, /Investments yesterday: ₹3,000/);
assert.match(report.text, /Investments month to date: ₹5,000/);
assert.match(report.html, /Unmapped expenses/);
assert.match(report.html, /\?tab=budget/);
```

Add separate fixtures for no transactions, no investments, a missing budget, and a negative remaining amount.

- [ ] **Step 2: Run rendering tests and verify RED**

Run: `node --test test/daily-email-service.test.js`

Expected: FAIL because the rendering functions are not exported.

- [ ] **Step 3: Implement plain-text and HTML renderers**

Implement HTML escaping for all database-derived labels. Use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`. Render transaction rows only when present, label negative variance as overspent, and use explicit empty/no-budget messages from the spec.

- [ ] **Step 4: Run rendering tests and verify GREEN**

Run: `node --test test/daily-email-service.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the templates**

```bash
git add daily-email-service.js test/daily-email-service.test.js
git commit -m "feat: render daily expense emails"
```

---

### Task 4: Gmail delivery, persistent threads, and duplicate protection

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `daily-email-service.js`
- Modify: `test/daily-email-service.test.js`

**Interfaces:**
- Consumes: injected `transport.sendMail(message): Promise<{ messageId: string }>` and tables from Task 1.
- Produces:
  - `service.sendReminder(): Promise<{ status: 'sent'|'already_sent', kind: 'reminder', reportDate: string }>`
  - `service.sendReport(): Promise<{ status: 'sent'|'already_sent', kind: 'report', reportDate: string }>`
  - `createGmailTransport({ user, appPassword })`

- [ ] **Step 1: Add Nodemailer**

Run: `npm install nodemailer@^7.0.0`

Expected: `package.json` and `package-lock.json` contain Nodemailer.

- [ ] **Step 2: Write failing first-send and reply-thread tests**

Use a fake transport that records complete messages and returns `<reminder-1@example>` then `<reminder-2@example>`. Assert:

```js
assert.equal(first.status, 'sent');
assert.equal(messages[0].from, 'pooja0111mehta@gmail.com');
assert.deepEqual(messages[0].to, ['poojamehta1197@gmail.com', 'kunal.mukte03@gmail.com']);
assert.equal(messages[0].inReplyTo, undefined);

// Advance the injected clock by one day, then send again.
assert.equal(messages[1].inReplyTo, '<reminder-1@example>');
assert.equal(messages[1].references, '<reminder-1@example>');
```

Repeat the core assertion for `report` and prove its root is independent from the reminder root.

- [ ] **Step 3: Run threading tests and verify RED**

Run: `node --test test/daily-email-service.test.js`

Expected: FAIL because send methods are missing.

- [ ] **Step 4: Implement SMTP transport and threaded sends**

Create the production transport with:

```js
nodemailer.createTransport({
  service: 'gmail',
  auth: { user, pass: appPassword },
});
```

For each kind, read `daily_email_threads`; on replies set `inReplyTo` to `last_message_id` and `references` to `root_message_id`. After a confirmed send, insert the ledger row and upsert thread state inside one SQLite transaction. Validate that `info.messageId` is a non-empty string before persisting success.

- [ ] **Step 5: Write failing duplicate and retry tests**

```js
await service.sendReport();
assert.deepEqual(await service.sendReport(), {
  status: 'already_sent', kind: 'report', reportDate: '2026-09-17',
});
assert.equal(messages.length, 1);
```

In a second test, reject the first `sendMail`, verify no ledger row exists, then resolve the retry and verify one successful ledger row.

- [ ] **Step 6: Run duplicate/retry tests and verify RED**

Run: `node --test test/daily-email-service.test.js`

Expected: FAIL until the ledger check and failure behavior exist.

- [ ] **Step 7: Implement duplicate and retry behavior**

Check `daily_email_sends` before rendering or calling SMTP. Do not create a success row on render/SMTP failure. Convert unique-constraint races into `already_sent`; do not send again after a confirmed ledger row.

- [ ] **Step 8: Run service tests and verify GREEN**

Run: `node --test test/daily-email-service.test.js`

Expected: PASS.

- [ ] **Step 9: Commit delivery support**

```bash
git add package.json package-lock.json daily-email-service.js test/daily-email-service.test.js
git commit -m "feat: deliver threaded daily emails"
```

---

### Task 5: Protected scheduler routes and server wiring

**Files:**
- Create: `daily-email-routes.js`
- Create: `test/daily-email-routes.test.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `service.sendReminder()`, `service.sendReport()`, and `REPORT_SCHEDULER_SECRET`.
- Produces: `registerDailyEmailRoutes(app, service, { schedulerSecret })` with the two POST routes from the spec.

- [ ] **Step 1: Write failing route contract tests**

Follow the existing lightweight fake-app pattern from `test/budget-routes.test.js`. Assert:

```js
await reminderHandler(request({ authorization: 'Bearer correct' }), response);
assert.deepEqual(response.body, { status: 'sent', kind: 'reminder', reportDate: '2026-09-17' });

await reportHandler(request({ authorization: 'Bearer wrong' }), response);
assert.equal(response.statusCode, 401);
assert.equal(serviceCalls, 0);
```

Also cover missing configuration (503), `already_sent` (200), and a service failure (500 with a generic body).

- [ ] **Step 2: Run route tests and verify RED**

Run: `node --test test/daily-email-routes.test.js`

Expected: FAIL because the routes module does not exist.

- [ ] **Step 3: Implement authenticated routes**

Use constant-time token comparison after validating equal buffer lengths. Register routes before `app.use(requireAuth)` so scheduler calls do not redirect to Google login. Never log or return the supplied token.

- [ ] **Step 4: Wire the service into `server.js`**

Read configuration from environment, create the Gmail transport only when all required email settings exist, and pass:

```js
{
  sender: process.env.REPORT_GMAIL_USER,
  recipients: process.env.REPORT_RECIPIENTS.split(',').map(value => value.trim()).filter(Boolean),
  baseUrl: process.env.BASE_URL,
}
```

Register the internal routes before interactive auth middleware. A scheduled call with missing mail configuration must return 503 without crashing normal app startup.

- [ ] **Step 5: Run route and service tests and verify GREEN**

Run: `node --test test/daily-email-routes.test.js test/daily-email-service.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the routes**

```bash
git add daily-email-routes.js test/daily-email-routes.test.js server.js
git commit -m "feat: add daily email scheduler endpoints"
```

---

### Task 6: Email deep links

**Files:**
- Modify: `public/app.js`
- Create: `test/email-deep-links.test.js`

**Interfaces:**
- Consumes: `?tab=add`, `?tab=dashboard`, or `?tab=budget` in `window.location.search`.
- Produces: `initialTabFromLocation(location): 'add'|'dashboard'|'budget'|null` and switches to that tab after app initialization.

- [ ] **Step 1: Write failing deep-link tests**

Extract the pure helper with the existing `vm` test style and assert:

```js
assert.equal(initialTabFromLocation({ search: '?tab=add' }), 'add');
assert.equal(initialTabFromLocation({ search: '?tab=budget' }), 'budget');
assert.equal(initialTabFromLocation({ search: '?tab=unknown' }), null);
```

Add an initialization test proving `switchTab('add')` is invoked for the Add Expenses email link.

- [ ] **Step 2: Run deep-link tests and verify RED**

Run: `node --test test/email-deep-links.test.js`

Expected: FAIL because `initialTabFromLocation` is missing.

- [ ] **Step 3: Implement allowlisted startup tab selection**

Parse with `URLSearchParams`, allow only existing public tab IDs, and fall back to the current Dashboard default. Do not interpolate query values into selectors or HTML.

- [ ] **Step 4: Run deep-link tests and verify GREEN**

Run: `node --test test/email-deep-links.test.js`

Expected: PASS.

- [ ] **Step 5: Commit deep links**

```bash
git add public/app.js test/email-deep-links.test.js
git commit -m "feat: support expense email deep links"
```

---

### Task 7: Daily GitHub Actions schedules

**Files:**
- Create: `.github/workflows/daily-expense-email.yml`
- Create: `test/daily-email-workflow.test.js`

**Interfaces:**
- Consumes: GitHub secrets `EXPENSE_TRACKER_BASE_URL` and `REPORT_SCHEDULER_SECRET`.
- Produces: two scheduled HTTP POST jobs plus manual dispatch inputs `reminder`, `report`, or `both`.

- [ ] **Step 1: Write a failing workflow behavior test**

Read the workflow file and parse it as text with narrowly scoped assertions for the consuming contract:

```js
assert.match(workflow, /cron:\s*['"]0 15 \* \* \*['"]/);
assert.match(workflow, /cron:\s*['"]30 15 \* \* \*['"]/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /\/api\/internal\/daily-email\/reminder/);
assert.match(workflow, /\/api\/internal\/daily-email\/report/);
assert.match(workflow, /Authorization: Bearer \$\{\{ secrets\.REPORT_SCHEDULER_SECRET \}\}/);
```

- [ ] **Step 2: Run workflow test and verify RED**

Run: `node --test test/daily-email-workflow.test.js`

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Implement the workflow**

Create two jobs gated by the triggering cron or manual input. Each uses `curl --fail-with-body --retry 2 --retry-all-errors -X POST`, the bearer secret, and `${{ secrets.EXPENSE_TRACKER_BASE_URL }}`. Set `concurrency` per job type so overlapping scheduler runs cannot execute simultaneously.

- [ ] **Step 4: Run workflow test and verify GREEN**

Run: `node --test test/daily-email-workflow.test.js`

Expected: PASS.

- [ ] **Step 5: Commit scheduling**

```bash
git add .github/workflows/daily-expense-email.yml test/daily-email-workflow.test.js
git commit -m "feat: schedule daily expense emails"
```

---

### Task 8: Full verification and controlled production setup

**Files:**
- Modify only if verification finds a defect in files already listed above.

**Interfaces:**
- Consumes: all outputs from Tasks 1–7.
- Produces: verified application code and a production setup checklist; no secrets in repository history or command output.

- [ ] **Step 1: Run all automated verification**

Run:

```bash
npm test
node --check server.js
node --check daily-email-service.js
node --check daily-email-routes.js
git diff --check
```

Expected: all tests pass, all syntax checks exit 0, and `git diff --check` prints nothing.

- [ ] **Step 2: Inspect the final diff for secret leakage**

Run:

```bash
git diff --check
git grep -n "REPORT_GMAIL_APP_PASSWORD=" -- ':!docs/superpowers/plans/*'
git status --short
```

Expected: no password assignment or password value appears; only intended source/test/workflow files are changed.

- [ ] **Step 3: Configure production secrets without exposing values**

The user runs the following locally. `read -s` accepts the app password without displaying it or placing its value in shell history; the random scheduler secret is generated locally:

```bash
read -s "expense_report_gmail_password?Gmail app password: "
expense_report_scheduler_secret="$(openssl rand -hex 32)"
fly secrets set REPORT_GMAIL_USER=pooja0111mehta@gmail.com REPORT_GMAIL_APP_PASSWORD="$expense_report_gmail_password" REPORT_RECIPIENTS=poojamehta1197@gmail.com,kunal.mukte03@gmail.com REPORT_SCHEDULER_SECRET="$expense_report_scheduler_secret"
```

Set matching GitHub repository secrets:

```bash
gh secret set EXPENSE_TRACKER_BASE_URL --body 'https://expense-tracker-pooja.fly.dev'
gh secret set REPORT_SCHEDULER_SECRET --body "$expense_report_scheduler_secret"
unset expense_report_gmail_password expense_report_scheduler_secret
```

Do not enable the scheduled workflow until both manual sends have been reviewed.

- [ ] **Step 4: Deploy and invoke each job manually once**

Use GitHub Actions `workflow_dispatch` first for `reminder`, then for `report`. Verify:

- Sender is `pooja0111mehta@gmail.com`.
- Both recipients are on each message.
- Previous-day date and totals match the app.
- Reminder and report are separate threads.
- A second manual run returns `already_sent` and sends no duplicate.

- [ ] **Step 5: Verify next-day threading before declaring production complete**

For a non-delivery test, use an injected clock in automated tests. For the real Gmail smoke test, use a controlled admin-only date override only in a local/staging environment; do not add a production query parameter that can bypass the daily ledger. Confirm the second message of each kind replies to its corresponding first message.

- [ ] **Step 6: Enable the two cron schedules and commit any verification-only corrections**

After content and threading are approved, leave the workflow schedules active. If verification required code corrections, rerun Step 1 and commit only those corrections:

```bash
git add db.js daily-email-service.js daily-email-routes.js server.js public/app.js package.json package-lock.json .github/workflows/daily-expense-email.yml test/budget-schema.test.js test/daily-email-service.test.js test/daily-email-routes.test.js test/email-deep-links.test.js test/daily-email-workflow.test.js
git commit -m "fix: finalize daily expense email delivery"
```
