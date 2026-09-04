# Budget History, Investment Analytics, and Upload Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill protected 2026 budget history, separate investments from spending analytics, add deterministic upload payment-method selection and SBI debit support, and improve Budget section usability without changing settlement or Combined editing.

**Architecture:** Extend startup migrations with a ledgered atomic backfill; centralize analytics qualification and upload batch override behavior at their existing convergence points; keep UI-only state in page memory and preserve the complete Budget model for saves. Existing API fields remain compatible, with one additive Dashboard investments total.

**Tech Stack:** Node.js 22, Express, SQLite/better-sqlite3, vanilla JavaScript/HTML/CSS, Node test runner, in-app browser QA.

**Spec:** `docs/superpowers/specs/2026-09-04-budget-history-investment-upload-design.md`

## Global Constraints

- Backfill only January-August 2026 from September 2026, independently for Pooja and Kunal.
- Never overwrite any existing or subsequently edited budget rows; never store Combined rows.
- Exclude exact category `Investment` from expense analytics and budget expense actuals, but not storage, transaction tables, or settlement.
- Concrete file-upload payment method overrides every row before review; Auto-detect and pasted SMS preserve extracted values.
- `SBI_Debit_Card` is a payment method, never an expense category.
- Hide `Education/Child Care` only while rendering Budget rows; retain its data and totals.
- Combined remains derived/read-only; Pooja and Kunal editing behavior must remain intact.
- Do not merge, push, create a pull request, or deploy.

---

### Task 1: Versioned historical budget migration

**Files:**
- Modify: `db.js`
- Modify: `test/budget-schema.test.js`

**Interfaces:**
- Produces: startup migration ledger row `2026-09-04-budget-history-v1` and guarded copies into `budgets`.
- Preserves: `UNIQUE(month, person, section, category)` and all September seed values.

- [ ] **Step 1: Write failing migration tests**

Add temporary-database tests that start from the September seed, assert January-August row-by-row equality and totals for each person, preinsert one target person/month row and assert it remains the sole unchanged row for that slice, assert no `person = 'all'` row, reload `db.js`, and assert row counts/amounts are unchanged.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node --test test/budget-schema.test.js`

Expected: FAIL because historical rows and migration ledger do not exist.

- [ ] **Step 3: Implement the atomic ledgered migration**

Create `schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT ...)`. In one database transaction, return when the version exists; otherwise loop the eight target month strings and two people, copy September rows only when `SELECT 1 ... LIMIT 1` finds no target row, then insert the version. Invoke after September seed initialization.

- [ ] **Step 4: Run focused tests and verify pass**

Run the Task 1 command; expect all budget schema tests to pass.

- [ ] **Step 5: Commit**

Commit message: `feat: backfill historical budgets safely`

### Task 2: Expense analytics exclude investments and expose Dashboard KPI data

**Files:**
- Modify: `server.js`
- Create: `test/investment-analytics.test.js`

**Interfaces:**
- Produces: Dashboard response field `investments: number`.
- Preserves: settlement query input includes Investment transactions.
- Updates: expense-qualified Dashboard and Trends SQL predicates.

- [ ] **Step 1: Write failing route/SQL behavior tests**

Build mixed fixtures for ordinary expense, exact `Investment`, `Investment Fees`, credit-card payment, and settlement categories. Assert Dashboard expense fields/count/charts/top merchants omit exact Investment, `investments` honors All/Pooja/Kunal/Common filters, settlement remains unchanged, and Trends expense outputs omit Investment.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node --test test/investment-analytics.test.js`

Expected: FAIL because Investment is currently included and the KPI field is absent.

- [ ] **Step 3: Implement shared exact-category predicates**

Add narrowly named SQL fragments/helpers for expense analytics. Apply them to Dashboard total/count, payer/category/type/payment/daily/top-merchant queries and Trends monthly/split/category/payment queries. Compute Investment total with the existing person-filter clause. Leave settlement SQL untouched.

- [ ] **Step 4: Run focused tests and verify pass**

Run the Task 2 command; expect all analytics cases to pass.

- [ ] **Step 5: Commit**

Commit message: `feat: separate investments from spending analytics`

### Task 3: Budget actual-kind isolation

**Files:**
- Modify: `budget-service.js`
- Modify: `test/budget-service.test.js`

**Interfaces:**
- Consumes: transaction categories and mapping `kind`.
- Produces: expense lines that cannot consume Investment transactions; investment summary remains independent.

- [ ] **Step 1: Extend the existing failing attribution test**

Map an expense-kind line defensively and add exact Investment plus ordinary mapped transactions. Assert `actualSpending`/expense variance exclude Investment while `actualInvestments` includes only investment-kind attribution.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node --test --test-name-pattern="attributes only mapped" test/budget-service.test.js`

- [ ] **Step 3: Add kind-aware transaction qualification**

Exclude exact Investment from expense-kind totals and ensure investment actuals are sourced only for investment-kind mappings, without changing salary or Combined derivation.

- [ ] **Step 4: Run all budget service tests and verify pass**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node --test test/budget-service.test.js`

- [ ] **Step 5: Commit**

Commit message: `fix: isolate budget investment actuals`

### Task 4: Upload payment-method selector and deterministic batch override

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/style.css`
- Create: `test/upload-payment-method.test.js`

**Interfaces:**
- Produces: `getUploadPaymentMethodOverride(): string` and `applyUploadPaymentMethodOverride(rows, method): transaction[]` (names may follow local conventions but remain pure/testable).
- Consumes: configured frontend `PAYMENT_METHODS` and all file-derived transaction batches.
- Excludes: `extractFromTextArea()` from override application.

- [ ] **Step 1: Write failing DOM/source and behavior tests**

Assert the labeled selector sits with upload date controls, offers Auto-detect, is populated from configured methods, preserves extracted values in Auto-detect mode, overwrites every row for a concrete choice, is invoked for spreadsheet and image/PDF file flows before review, and is absent from pasted SMS handling.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node --test test/upload-payment-method.test.js`

- [ ] **Step 3: Implement selector population and override convergence**

Render the selector beside month/from/to inputs. Refresh its concrete options after configured lists load while retaining a valid selection. Apply the selected concrete value immediately to every transaction returned by each file parser/extractor before date filtering and `transactions.push`; leave SMS flow unchanged.

- [ ] **Step 4: Add responsive/dark-compatible styles and run focused tests**

Use existing form-control tokens and mobile wrapping patterns. Run the Task 4 command; expect pass.

- [ ] **Step 5: Commit**

Commit message: `feat: override upload payment methods`

### Task 5: SBI Debit Card across payment-method surfaces

**Files:**
- Modify: `server.js`
- Modify: `public/app.js`
- Modify: `test/smart-categorization.test.js`
- Modify: `test/upload-payment-method.test.js`

**Interfaces:**
- Produces: configured default string `SBI_Debit_Card` in backend prompt and frontend selectors/chips/filters.
- Preserves: category default list without `SBI_Debit_Card`.

- [ ] **Step 1: Write failing availability tests**

Assert SBI Debit is present in backend/frontend payment defaults, extraction prompt construction, upload selector inputs, chip colors, review/transaction edit/list-management/filter sources, and absent from category defaults.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node --test test/smart-categorization.test.js test/upload-payment-method.test.js`

- [ ] **Step 3: Add the default and chip styling**

Insert `SBI_Debit_Card` beside other debit-card methods in server and client defaults and add a distinct accessible chip palette entry. Existing shared arrays propagate it to all controls and filters.

- [ ] **Step 4: Run focused tests and verify pass**

Run the Task 5 command; expect pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add SBI debit card payment method`

### Task 6: Dashboard Investments KPI rendering

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/style.css`
- Modify: `test/investment-analytics.test.js`

**Interfaces:**
- Consumes: Dashboard `investments` total already filtered by backend global-person semantics.
- Produces: visible Investments KPI separate from Total Spend and Budget planned-versus-actual summary.

- [ ] **Step 1: Write failing UI rendering tests**

Assert a dedicated KPI target exists, `renderKPIs` formats the response value, filter-triggered Dashboard refresh updates it, and zero renders as currency rather than missing data.

- [ ] **Step 2: Run focused tests and verify failure**

Run the Task 2 focused command.

- [ ] **Step 3: Render and style the additive KPI**

Add Investments to the Dashboard KPI grid using existing card markup/tokens. Keep Total Spend and Budget Investments labels unambiguous.

- [ ] **Step 4: Run focused tests and verify pass**

Run the Task 2 focused command; expect pass.

- [ ] **Step 5: Commit**

Commit message: `feat: show dashboard investments KPI`

### Task 7: Collapsible Budget sections and Budget-only hidden row

**Files:**
- Modify: `public/app.js`
- Modify: `public/style.css`
- Modify: `test/budget-ui.test.js`

**Interfaces:**
- Produces: page-session `Set<string>` of collapsed section names and `toggleBudgetSection(name)`.
- Preserves: `budgetData.sections` as the complete save source, including Education/Child Care.

- [ ] **Step 1: Write failing accessibility/state/data tests**

Assert every header renders a native toggle with `aria-expanded` and visible indicator, totals sit outside the collapsible rows, toggling by keyboard-compatible click updates state, the same section stays collapsed after rerender/month/person changes, and `Education/Child Care` is absent from Budget HTML while retained in save payload and summary values.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node --test test/budget-ui.test.js`

- [ ] **Step 3: Implement stable collapsed-name state and safe hidden-row rendering**

Add a module-level Set, render button state from it, toggle row-wrapper `hidden` state and aria/indicator values, filter the Education/Child Care line only when building row HTML, and keep save construction model-based so the hidden line survives.

- [ ] **Step 4: Add focus, indicator, collapsed, mobile, and dark styles; run tests**

Run the Task 7 command; expect all Budget UI regression tests to pass, including existing save/cancel/locking/Combined guards.

- [ ] **Step 5: Commit**

Commit message: `feat: make budget sections collapsible`

### Task 8: Full regression, browser QA, and review

**Files:**
- Modify only files required by verified defects discovered here.

**Interfaces:**
- Validates all preceding outputs together.

- [ ] **Step 1: Run static and complete automated verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node --check server.js
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node --check public/app.js
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm test
git diff --check
git status --short --branch
```

Expected: syntax checks succeed; every test passes; no whitespace errors; only intended changes exist.

- [ ] **Step 2: Start the local app without production mutation**

Use a temporary copied/fixture database and local development auth/test route if the repository supports it. Never use production database paths or deploy credentials.

- [ ] **Step 3: Perform desktop browser QA in light and dark themes**

At a desktop viewport, verify upload selector Auto-detect/HDFC Debit/SBI Debit choices and review override; Dashboard Investments KPI for All/Pooja/Kunal/Common; Budget totals during collapse, keyboard activation, persisted collapsed names; hidden Education/Child Care; Pooja and Kunal edit/save/cancel/locking/unlock; Combined read-only.

- [ ] **Step 4: Perform mobile browser QA in light and dark themes**

Repeat the critical upload, KPI, collapse, and personal edit paths at a mobile viewport; verify no overflow or unreachable controls.

- [ ] **Step 5: Request independent code review and resolve findings**

Use `superpowers:requesting-code-review` against the complete branch diff. Reproduce each finding, add a failing test for confirmed defects, implement the minimum correction, and rerun focused plus complete verification.

- [ ] **Step 6: Commit final verified corrections**

If QA/review causes changes, commit them with a focused message. Otherwise do not create an empty commit.

- [ ] **Step 7: Report readiness without external actions**

Report branch, commit(s), exact commands and pass counts, browser matrix/results, review outcome, remaining issues, and PR-ready status. Do not push, merge, create a PR, or deploy.
