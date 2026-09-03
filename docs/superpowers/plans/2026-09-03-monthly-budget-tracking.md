# Monthly Budget Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable monthly budgets for Pooja and Kunal, mapping-based actual comparisons, investment tracking, and the approved hybrid Dashboard/Budget interface.

**Architecture:** SQLite stores monthly person-level budget lines and global mappings from adviser-sheet categories to tracker categories. A focused CommonJS budget service owns validation, transactional writes, attribution, summary calculation, and copying; Express routes translate HTTP requests into that service. The vanilla frontend renders a compact Dashboard pulse and a detailed Budget tab, reusing the existing month and person conventions.

**Tech Stack:** Node.js 20+, Express 4, better-sqlite3, vanilla HTML/CSS/JavaScript, Node's built-in test runner

**Spec:** `docs/superpowers/specs/2026-09-03-monthly-budget-tracking-design.md`

## Global Constraints

- Preserve adviser-sheet category labels, spelling, grouping, and order in the Budget UI.
- Store only `Pooja` and `Kunal`; calculate `all`/Combined dynamically.
- Mappings apply across months and are editable.
- Exclude `Credit Card Payment`, `Settlement`, and `Refunded` from budget actuals.
- Keep `expense` and `investment` calculations separate.
- Combined is read-only; only individual views can save amounts.
- Reject negative, non-finite, duplicate, or structurally invalid budget data before any write.
- A tracker category may map to at most one budget line per `kind`.
- Preserve the existing no-build frontend, authentication, dark mode, and responsive patterns.
- Do not change or overwrite the source Excel workbooks.

---

## File Structure

- Create `budget-service.js`: budget validation, database queries, attribution, summaries, copy logic, and service factory.
- Create `budget-seed.js`: immutable September 2026 seed lines and initial mapping definitions.
- Modify `db.js`: create budget tables and invoke idempotent seeding.
- Modify `server.js`: instantiate the budget service and expose four authenticated budget endpoints.
- Modify `public/index.html`: Budget nav, Dashboard pulse container, detailed Budget tab, and copy confirmation modal.
- Modify `public/app.js`: budget state, pure display helpers, API workflows, rendering, editing, mapping controls, and navigation synchronization.
- Modify `public/style.css`: budget cards, progress/status treatments, edit/mapping controls, responsive stacking, and dark-mode-compatible styling.
- Create `test/budget-schema.test.js`: temporary-database schema and seed reconciliation tests.
- Create `test/budget-service.test.js`: validation, mapping, attribution, summaries, exclusions, and copy tests.
- Create `test/budget-routes.test.js`: HTTP-handler request/response contract tests through an extracted route registration function.
- Create `test/budget-ui.test.js`: frontend helper and required-markup tests using the repository's existing VM pattern.
- Modify `CLAUDE.md`, `docs/architecture.md`, and `features.md`: document the delivered schema, APIs, UI, and calculations.

---

### Task 1: Budget schema and idempotent September seed

**Files:**
- Create: `budget-seed.js`
- Modify: `db.js`
- Create: `test/budget-schema.test.js`

**Interfaces:**
- Produces: `SEPTEMBER_2026_BUDGET_LINES: Array<{month, person, section, category, kind, amount, sort_order}>`
- Produces: `INITIAL_BUDGET_MAPPINGS: Array<{section, budget_category, transaction_category}>`
- Produces database tables `budgets` and `budget_category_mappings` with the constraints defined in the spec.
- Consumers: `budget-service.js` and startup database initialization.

- [ ] **Step 1: Write the failing temporary-database tests**

Create `test/budget-schema.test.js`. Give each test a fresh path under `fs.mkdtempSync(path.join(os.tmpdir(), 'expense-budget-'))`, set `DB_PATH`, delete `require.cache[require.resolve('../db')]`, then require and close `db.js` in `test.afterEach`.

Assert these exact behaviors:

```js
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
  const before = db.prepare('SELECT COUNT(*) count FROM budgets').get().count;
  delete require.cache[require.resolve('../db')];
  db.close();
  db = require('../db');
  assert.equal(db.prepare('SELECT COUNT(*) count FROM budgets').get().count, before);
});
```

Also assert that the Spotify seed amount is numeric zero and that duplicate `(month, person, section, category)` rows fail.

- [ ] **Step 2: Run the schema test and verify RED**

Run: `node --test test/budget-schema.test.js`

Expected: FAIL because `budgets` and `budget_category_mappings` do not exist.

- [ ] **Step 3: Add seed constants and schema**

In `budget-seed.js`, export every row from the approved September table. Use numeric `0` for blank cells and Spotify's text placeholder. Use one shared order sequence per section and create both person rows even when values are zero.

Add these tables in the existing `db.exec` block:

```sql
CREATE TABLE IF NOT EXISTS budgets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  month      TEXT NOT NULL CHECK(month GLOB '[A-Z]*_[0-9][0-9][0-9][0-9]'),
  person     TEXT NOT NULL CHECK(person IN ('Pooja','Kunal')),
  section    TEXT NOT NULL,
  category   TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK(kind IN ('expense','investment')),
  amount     REAL NOT NULL CHECK(amount >= 0),
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
```

Include `kind` in the mapping table implementation so the database can enforce the approved no-double-attribution rule efficiently. Seed with `INSERT OR IGNORE` inside a transaction after schema creation. Initial mappings should cover unambiguous tracker categories only; leave genuinely ambiguous lines visibly unmapped. Representative mappings:

```js
{ section: 'Household Expenses', budget_category: 'House Rent', transaction_category: 'Rent', kind: 'expense' }
{ section: 'Household Expenses', budget_category: 'Conveyance (Petrol/ Disel/ Cab / Bus)', transaction_category: 'Petrol', kind: 'expense' }
{ section: 'Household Expenses', budget_category: 'Conveyance (Petrol/ Disel/ Cab / Bus)', transaction_category: 'Ola/Uber', kind: 'expense' }
{ section: 'Lifestyle', budget_category: 'Dining Out / Pub', transaction_category: 'Outside Food', kind: 'expense' }
{ section: 'LOANS & OTHER DEBTS', budget_category: 'Vehicle Loan', transaction_category: 'Car downpayment/ emi', kind: 'expense' }
{ section: 'OTT Subscription', budget_category: 'Claude/ AI/ other', transaction_category: 'Subscriptions', kind: 'expense' }
```

- [ ] **Step 4: Run the schema tests and verify GREEN**

Run: `node --test test/budget-schema.test.js`

Expected: PASS with exact seed reconciliation and idempotency.

- [ ] **Step 5: Commit the schema slice**

```bash
git add budget-seed.js db.js test/budget-schema.test.js
git commit -m "feat: add monthly budget schema and seed"
```

---

### Task 2: Budget service validation, attribution, and summaries

**Files:**
- Create: `budget-service.js`
- Create: `test/budget-service.test.js`

**Interfaces:**
- Consumes: a better-sqlite3 database containing the Task 1 tables.
- Produces: `createBudgetService(db, { validCategories })`.
- Produces methods:
  - `getBudget({ month, person }): BudgetResponse`
  - `replaceBudget({ month, person, lines }): { saved: true, count: number }`
  - `replaceMappings({ section, budgetCategory, kind, transactionCategories }): { saved: true, count: number }`
  - `copyBudget({ sourceMonth, targetMonth, person, replace }): { saved: true, count: number }`
- Produces pure exports `validateMonth`, `validatePerson`, `lineStatus`, and `combineBudgetResponses` for focused tests and frontend parity.

- [ ] **Step 1: Write failing validation and status tests**

Create a temporary in-memory database fixture with the two budget tables, `transactions`, `salaries`, and `lists`. Write tests for:

```js
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
```

Test that `replaceBudget` rejects negative, `NaN`, `Infinity`, duplicate section/category pairs, invalid `kind`, invalid person, and malformed month without deleting existing rows.

- [ ] **Step 2: Run service tests and verify RED**

Run: `node --test test/budget-service.test.js`

Expected: FAIL because `budget-service.js` does not exist.

- [ ] **Step 3: Implement validators and atomic replacement**

Implement strict validation before entering the transaction. Do not use `Number(value) || 0`; require `Number.isFinite(Number(value)) && Number(value) >= 0`. Require non-empty trimmed section/category strings and an integer `sort_order >= 0`.

Use a transaction that deletes only `(month, person)` and inserts the complete validated line set. Return the inserted count. Re-run tests until the validation slice passes.

- [ ] **Step 4: Add failing actual-attribution tests**

Insert budget lines and mappings, then transactions for the same month with:

- A mapped `Rent` transaction for Pooja.
- A mapped `Outside Food` transaction for Kunal.
- `Credit Card Payment`, `Settlement`, and `Refunded` transactions that must be excluded.
- The same mapped category in another month that must be excluded.
- A qualifying category with no mapping that must not be silently assigned.

Assert response shape and calculations:

```js
const pooja = service.getBudget({ month: 'September_2026', person: 'Pooja' });
assert.equal(pooja.summary.expenseBudget, 111177);
assert.equal(pooja.summary.actualSpending, 21000);
assert.equal(pooja.summary.variance, 90177);
assert.equal(pooja.summary.salary, 337292);
assert.equal(pooja.summary.netMonthlySavings, 316292);

const combined = service.getBudget({ month: 'September_2026', person: 'all' });
assert.equal(combined.summary.expenseBudget, 226824);
assert.equal(combined.summary.actualSpending, pooja.summary.actualSpending + kunal.summary.actualSpending);
```

Assert investment mappings contribute only to `plannedInvestments`/`actualInvestments`, not `expenseBudget`/`actualSpending`.

- [ ] **Step 5: Implement queries, response assembly, and Combined**

Aggregate transactions by `paid_by, category` with bounded predicates:

```sql
SELECT paid_by, category, COALESCE(SUM(amount), 0) AS total
FROM transactions
WHERE month = ?
  AND paid_by IN ('Pooja','Kunal')
  AND category NOT IN ('Credit Card Payment','Settlement','Refunded')
GROUP BY paid_by, category
```

Build line actuals from mappings, then section totals and summary totals. Return `usage: null` for zero budgets. `hasBudget` is based on row existence, not a positive total. Load salary from `salaries`; zero is valid, while the frontend uses the response's `hasSalary` boolean to distinguish missing salary.

For `all`, build both personal responses and merge lines by `(section, category, kind)` in `sort_order`; sum every monetary field and calculate status from the merged totals. Do not query or store Combined rows.

- [ ] **Step 6: Add failing mapping and copy tests**

Test that mappings:

- Accept multiple tracker categories for one budget line.
- Reject unknown transaction categories.
- Reject assigning an already-mapped tracker category to another line of the same kind.
- Can be replaced with an empty array.
- Roll back fully on any invalid category.

Test copy behavior:

- Missing source returns a typed `not_found` service error.
- Empty target copies one or both people.
- Populated target without `replace` returns typed `conflict`.
- `replace: true` replaces only the selected target people.
- Source mappings are not duplicated because mappings are global.

- [ ] **Step 7: Implement mappings and copy operations**

Resolve valid categories from default categories passed by the caller plus `SELECT value FROM lists WHERE list_name='categories'`. Validate the complete replacement first, then delete/insert mappings in one transaction.

For copy, validate both month keys and `person` (`Pooja`, `Kunal`, or `all`), verify source rows, inspect target rows, and copy via `INSERT ... SELECT` with the target month and fresh timestamps. Return copied row count.

- [ ] **Step 8: Run the complete service suite and verify GREEN**

Run: `node --test test/budget-service.test.js`

Expected: PASS for validators, atomicity, attribution, exclusions, investments, Combined, mappings, and copying.

- [ ] **Step 9: Commit the service slice**

```bash
git add budget-service.js test/budget-service.test.js
git commit -m "feat: calculate monthly budget performance"
```

---

### Task 3: Authenticated budget API routes

**Files:**
- Modify: `server.js`
- Create: `test/budget-routes.test.js`

**Interfaces:**
- Consumes: `createBudgetService(db, { validCategories })` from Task 2.
- Produces: `registerBudgetRoutes(app, service)` exported for isolated handler tests.
- Produces endpoints:
  - `GET /api/budget?month=&person=`
  - `PUT /api/budget/:month`
  - `PUT /api/budget-mappings`
  - `POST /api/budget/:month/copy`

- [ ] **Step 1: Write failing route-contract tests**

Use a minimal fake Express app that records registered handlers and a fake service that records calls. Invoke handlers with simple `{query, params, body}` request objects and a response recorder implementing `status()` and `json()`.

Cover:

```js
test('GET budget defaults person to all and returns service data', () => { /* expect 200 */ });
test('PUT budget uses path month and body person/lines', () => { /* expect 200 */ });
test('PUT mappings forwards the complete replacement', () => { /* expect 200 */ });
test('copy converts service conflict to HTTP 409', () => { /* expect 409 */ });
test('validation errors return HTTP 400 without leaking stacks', () => { /* expect {error} */ });
test('missing source returns HTTP 404', () => { /* expect 404 */ });
```

- [ ] **Step 2: Run route tests and verify RED**

Run: `node --test test/budget-routes.test.js`

Expected: FAIL because route registration is absent.

- [ ] **Step 3: Register the four routes**

Add a small `registerBudgetRoutes(app, service)` function before server startup and call it after the existing global `app.use(requireAuth)` boundary. Keep route handlers synchronous because better-sqlite3 and the service are synchronous.

Translate typed service errors with this exact policy:

```js
const statusByCode = { validation: 400, not_found: 404, conflict: 409 };
const status = statusByCode[error.code] || 500;
res.status(status).json({ error: status === 500 ? 'Budget operation failed' : error.message });
```

Instantiate the service once with the existing server-side `CATEGORIES` constant; include current custom list values through the service's database lookup.

Export `registerBudgetRoutes` without changing the existing production startup behavior.

- [ ] **Step 4: Run route and service tests**

Run: `node --test test/budget-routes.test.js test/budget-service.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the API slice**

```bash
git add server.js test/budget-routes.test.js
git commit -m "feat: expose monthly budget APIs"
```

---

### Task 4: Budget tab structure and pure UI behavior

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Create: `test/budget-ui.test.js`

**Interfaces:**
- Consumes: Task 3 response shapes.
- Produces pure helpers:
  - `budgetStatusPresentation(status): { label, className }`
  - `budgetUsagePresentation({ budget, actual, usage }): { label, width }`
  - `buildBudgetSaveLines(sections): Array<BudgetLineInput>`
- Produces UI functions: `initBudgetTab`, `loadBudget`, `renderBudget`, `beginBudgetEdit`, `cancelBudgetEdit`, `saveBudget`, `openBudgetMapping`, `saveBudgetMapping`, and `copyBudgetMonth`.

- [ ] **Step 1: Write failing markup and helper tests**

Follow the existing VM extraction approach: bracket pure helpers between `// ─── Budget Display Helpers` and `// ─── Budget API Workflow`, evaluate only that slice, and expose the three helpers.

Assert markup contains:

```js
assert.match(html, /id="tab-btn-budget"[^>]*onclick="switchTab\('budget'\)"/);
assert.match(html, /id="tab-budget"/);
assert.match(html, /id="budgetMonthPicker"/);
assert.match(html, /id="budgetPersonPicker"/);
assert.match(html, /id="budgetSummary"/);
assert.match(html, /id="budgetSections"/);
```

Assert `mapping_needed` takes the warning presentation, zero budget plus actual uses `Unbudgeted` and `width: 100`, normal usage clamps visual width to `[0, 100]`, and save-line construction preserves adviser labels and numeric zero values.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `node --test test/budget-ui.test.js`

Expected: FAIL because the Budget tab and helpers do not exist.

- [ ] **Step 3: Add Budget navigation and static tab structure**

Add the Budget tab button after Salary. Add a hidden `#tab-budget` containing:

- Toolbar with `#budgetMonthPicker`, `#budgetPersonPicker`, `#budgetEditBtn`, and `#budgetCopyBtn`.
- `#budgetLoading`, `#budgetError`, and `#budgetEmpty` state blocks.
- `#budgetSummary` six-card grid.
- `#budgetSections` render target.
- A mapping editor modal with selected sheet-category label, checkbox list target, Cancel, and Save.
- A copy confirmation modal that states source/target month and has a destructive `Replace and copy` action.

Update `switchTab` to include `budget`; call `initBudgetTab()` when selected.

- [ ] **Step 4: Implement pure helpers and render read-only data**

Use exact status copy:

```js
const BUDGET_STATUS = {
  on_track: ['On track', 'budget-status--good'],
  watch: ['Watch', 'budget-status--watch'],
  over_budget: ['Over budget', 'budget-status--bad'],
  no_activity: ['No activity', 'budget-status--muted'],
  unbudgeted: ['Unbudgeted', 'budget-status--bad'],
  mapping_needed: ['Mapping needed', 'budget-status--mapping'],
};
```

Render currency through existing `formatCurrency` and escape all server/user labels with `esc`. For `usage === null`, show `—`, except unbudgeted actuals show `Unbudgeted`; progress widths never exceed 100%. Render sections in API order and include `data-section`, `data-category`, and `data-kind` attributes for edit/mapping actions.

- [ ] **Step 5: Run UI tests and verify the read-only slice GREEN**

Run: `node --test test/budget-ui.test.js`

Expected: PASS for markup and pure helpers.

- [ ] **Step 6: Add edit, save, mapping, and copy workflow tests**

Use a VM DOM/fetch harness similar to `test/selective-save.test.js`. Assert:

- Combined disables editing and amount inputs are never rendered.
- Pooja/Kunal edit mode creates numeric inputs containing zero rather than blanks.
- Save sends `PUT /api/budget/September_2026` with the complete person's line set.
- Failed save retains edits and displays the server error.
- Mapping save sends section, budgetCategory, kind, and checked tracker categories.
- A 409 copy response opens confirmation without a second automatic request.
- Confirmed replacement repeats copy with `replace: true`.

- [ ] **Step 7: Implement editing and API workflows**

Keep state in one object:

```js
const budgetState = {
  initialized: false,
  month: '',
  person: 'all',
  data: null,
  editing: false,
  saving: false,
  mappingLine: null,
};
```

Populate the Budget month picker from the Dashboard month picker options so future years and missing-month markers stay consistent. Selecting `Common` globally should open Budget as Combined because budgets are not stored for the Common expense type. After amount, mapping, or copy success, reload Budget and the Dashboard budget card for the affected month.

- [ ] **Step 8: Run UI tests and verify GREEN**

Run: `node --test test/budget-ui.test.js`

Expected: PASS for rendering and workflows.

- [ ] **Step 9: Commit the Budget tab slice**

```bash
git add public/index.html public/app.js test/budget-ui.test.js
git commit -m "feat: add monthly budget management UI"
```

---

### Task 5: Hybrid Dashboard card and responsive styling

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/style.css`
- Modify: `test/budget-ui.test.js`

**Interfaces:**
- Consumes: `GET /api/budget` summary and current `monthPicker`/`globalPersonFilter`.
- Produces: `loadDashboardBudget(month)`, `renderDashboardBudget(data)`, and `openBudgetDetails()`.

- [ ] **Step 1: Write failing Dashboard integration tests**

Assert `index.html` contains `#dashboardBudgetCard`, `#dashboardBudgetProgress`, and `#dashboardBudgetAction`. In a VM harness, assert:

- `loadDashboard` requests `/api/budget?month=<month>&person=<filter>` in the same refresh cycle as dashboard, transaction, and salary data.
- `Common` translates to `all` for the budget request.
- A positive budget renders `actual of budget`, variance, and clamped progress.
- No budget renders `No budget set` with `Create budget`.
- Zero budget with positive actual renders `Unbudgeted spending` without `Infinity` or `NaN`.
- `openBudgetDetails()` synchronizes Budget month/person and switches tabs.

- [ ] **Step 2: Run the Dashboard integration tests and verify RED**

Run: `node --test test/budget-ui.test.js`

Expected: FAIL because the Dashboard budget card is absent.

- [ ] **Step 3: Integrate the compact card into Dashboard loading**

Add the approved hybrid card below the KPI row. Extend the existing `Promise.all` in `loadDashboard` with the budget request, and render the budget card even when there are no transactions. This is important because a planned budget can exist before actuals.

Use `globalPersonFilter` when it is `Pooja` or `Kunal`; otherwise request `all`. The card action calls `openBudgetDetails()` and preserves the selected month.

- [ ] **Step 4: Add Budget styling with existing design tokens**

Add focused classes rather than inline styles:

- `.dashboard-budget-card`, `.budget-progress`, `.budget-progress__fill`
- `.budget-summary-grid`, `.budget-summary-card`
- `.budget-section`, `.budget-table`, `.budget-category-cell`
- `.budget-status` plus six modifier classes
- `.budget-mapping-row`, `.budget-mapping-chip`, `.budget-edit-input`

Use existing CSS variables such as `--white`, `--border`, `--text`, `--text-muted`, `--success`, and `--error`; add an amber token only if no suitable existing token exists. Ensure focus states remain visible.

At the existing mobile breakpoint, collapse the six summary cards to two columns and transform each table row into a labeled category card. Do not require horizontal scrolling for the primary Budget view. The mapping modal may scroll vertically within the viewport.

- [ ] **Step 5: Run UI tests and syntax checks**

Run:

```bash
node --test test/budget-ui.test.js
node --check public/app.js
node --check server.js
```

Expected: all PASS with no syntax output.

- [ ] **Step 6: Manually verify the four responsive/theme states**

Start the local app with its normal environment, then inspect Budget and Dashboard at approximately 1280px and 390px in light and dark modes. Verify:

- Currency and long adviser labels are not clipped.
- Progress bars remain inside their tracks.
- Combined has no editable amount controls.
- Mapping and copy modals fit the viewport.
- Status colors remain legible and are not the only status signal.
- Dashboard budget card appears when the transaction dashboard is otherwise empty.

Record any reproducible UI regression as a focused test before fixing it.

- [ ] **Step 7: Commit the hybrid presentation slice**

```bash
git add public/index.html public/app.js public/style.css test/budget-ui.test.js
git commit -m "feat: show budget health on dashboard"
```

---

### Task 6: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/architecture.md`
- Modify: `features.md`

**Interfaces:**
- Documents the schema, service boundaries, four API routes, response meaning, exclusions, Combined behavior, and monthly workflow delivered by Tasks 1–5.

- [ ] **Step 1: Update project documentation**

In `CLAUDE.md`, add:

- `budgets` and `budget_category_mappings` schema summaries.
- Four budget routes.
- Budget tab and Dashboard card lifecycle.
- New frontend functions and budget state.

In `docs/architecture.md`, add the budget request flow:

```text
Month/person selection
  → GET /api/budget
  → budget-service loads lines + mappings + salary + qualifying transactions
  → per-person attribution and section summaries
  → optional Combined merge
  → Dashboard pulse or detailed Budget tab
```

In `features.md`, describe how to edit one person's budget, edit mappings, copy a prior month, interpret statuses, and distinguish budget remaining from net monthly savings.

- [ ] **Step 2: Run the complete automated test suite**

Run: `npm test`

Expected: every existing and new test passes.

- [ ] **Step 3: Run final static and database checks**

Run:

```bash
node --check server.js
node --check db.js
node --check budget-service.js
node --check budget-seed.js
node --check public/app.js
git diff --check
```

Expected: no output from syntax or whitespace checks.

Run a one-off temporary-database probe that initializes `db.js` with `DB_PATH` pointing inside a new temporary directory and prints September totals. Expected output:

```text
Kunal 115647
Pooja 111177
Combined 226824
```

- [ ] **Step 4: Re-run the approved acceptance scenarios manually**

Verify all of the following through the local UI:

1. September Combined opens with ₹2,26,824 expense budget.
2. Pooja and Kunal totals match ₹1,11,177 and ₹1,15,647.
3. Editing Pooja never changes Kunal.
4. Mapping one tracker category updates actuals without duplicating another line.
5. Excluded categories never change expense actuals.
6. Salary minus qualifying actuals equals net monthly savings.
7. Copying to an empty month succeeds; replacing a populated month requires confirmation.
8. Dashboard and Budget tab retain the same month/person context.
9. Missing salary, missing transactions, missing mappings, and zero budgets have explicit non-broken states.
10. Desktop/mobile and light/dark presentations remain readable.

- [ ] **Step 5: Commit documentation**

```bash
git add CLAUDE.md docs/architecture.md features.md
git commit -m "docs: document monthly budget tracking"
```

- [ ] **Step 6: Review the complete branch**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --check
```

Expected: only intentionally untracked local files remain; the branch contains the design, plan, implementation, tests, and docs with a clean diff check.
