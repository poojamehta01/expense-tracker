# Expense Tracker — Project Context

## Skill Auto-Trigger Rules
Invoke the matching skill automatically — user does NOT need to type the slash command.

| User says… | Auto-invoke skill |
|---|---|
| "lets push", "deploy", "ship it", "push changes" | `deploy` |
| "add …", "i want …", "can we …", "lets add …", "build …" | `add-feature` |
| "dark mode", "white background", "looks bad in dark" | `fix-dark-mode` |
| "update docs", "update claude.md", "keep docs updated" | `update-docs` |
| "new route", "add api", "new endpoint" | `new-api-route` |
| "new table", "add table", "new section in trends" | `new-table-section` |
| "new kpi", "add kpi", "new card on dashboard" | `new-kpi-card` |
| "check server", "syntax check", "verify before deploy" | `ship` |

## Stack
- **Backend:** Node.js + Express (`server.js`)
- **DB:** SQLite via `better-sqlite3` (`db.js`) — file at `./expenses.db` (prod: `DB_PATH=/data/expenses.db`)
- **Frontend:** Vanilla HTML/CSS/JS in `public/` — no build step
- **Auth:** Google OAuth via Passport.js — allowed emails in `ALLOWED_EMAILS` env var
- **AI:** Gemini Flash (`gemini-flash-latest`) for transaction extraction AND financial Q&A
- **Charts:** Chart.js 4.x via CDN; SheetJS 0.18.5 via CDN (client-side CSV/XLSX parsing)
- **Deploy:** Fly.io (`fly deploy`) — app name `expense-tracker-pooja`

## File Map
```
server.js          Express app, all routes, Gemini extraction + AI Q&A
db.js              SQLite init, CREATE TABLE, exports db instance
budget-service.js  Budget validation, attribution, summaries, mappings, and copy operations
budget-seed.js     Idempotent September 2026 budget lines and initial mappings
public/
  index.html       Dashboard + Add Expenses + Trends + Salary + Budget + Ask AI + AI Memory tabs
  app.js           All frontend JS — dashboard, budget workflow, upload, trends, salary, AI
  style.css        All styles + dark mode + mobile responsive
apps-script.gs     Google Sheets Apps Script (optional export target)
features.md        User-facing feature documentation
```

## DB Schema
```sql
-- transactions
id, date TEXT, amount REAL, description, payment_method, paid_by,
expense_type, category, mood, impulse, remarks,
month TEXT  -- e.g. "March_2026", derived from date at insert time
created_at TEXT DEFAULT (datetime('now'))

-- salaries
id, person TEXT, month TEXT, amount REAL DEFAULT 0, notes TEXT,
created_at TEXT, UNIQUE(person, month)

-- transaction_audit
id, tx_id INTEGER, action TEXT, snapshot TEXT, changed_at TEXT

-- budgets (one row per month/person/adviser-sheet line)
id, month TEXT, person TEXT CHECK(person IN ('Pooja','Kunal')),
section TEXT, category TEXT, kind TEXT CHECK(kind IN ('expense','investment')),
amount REAL CHECK(amount >= 0), sort_order INTEGER,
created_at TEXT, updated_at TEXT,
UNIQUE(month, person, section, category)

-- budget_category_mappings (global across months)
id, section TEXT, budget_category TEXT, transaction_category TEXT,
kind TEXT CHECK(kind IN ('expense','investment')), created_at TEXT,
UNIQUE(section, budget_category, transaction_category),
UNIQUE(kind, transaction_category)
```

## API Routes (all behind `requireAuth`)
```
GET  /api/me                     current user {email, name, photo}
POST /api/extract                Gemini extraction (multipart file upload)
POST /api/transactions           save batch; deduplicates on date+amount+description; returns {saved, skipped, ids}
GET  /api/transactions?month=    fetch by month
PUT  /api/transactions/:id       update one
DELETE /api/transactions/:id     delete one
GET  /api/months                 list distinct months with data
GET  /api/dashboard?month=       aggregated stats (see shape below)
GET  /api/trends                 all-time monthly data for Trends tab (see shape below)
GET  /api/salary?month=          salary for specific month {Pooja, Kunal, notes} OR all months {history}
POST /api/salary                 upsert salary {month, Pooja, Kunal, notes}
GET  /api/budget?month=&person=  budget detail; person is Pooja, Kunal, or all (Combined)
PUT  /api/budget/:month          replace one person's complete budget {person, lines}
PUT  /api/budget-mappings        replace one line's global tracker-category mappings
POST /api/budget/:month/copy     copy source month to {targetMonth, person, replace}
POST /api/ask                    AI Q&A {question, month} → {answer}
GET  /api/audit                  recent changes (last 24h)
POST /api/audit/:id/restore      restore a snapshot
```

## Dashboard Response Shape
```json
{
  "totalSpend": 84250,
  "transactionCount": 87,
  "byCategory": [{"category":"...", "total":0}],
  "byPaidBy": {"Pooja": 0, "Kunal": 0},
  "byExpenseType": [{"expense_type":"...", "total":0}],
  "byPaymentMethod": [{"payment_method":"...", "total":0}],
  "dailySpend": [{"date":"...", "total":0}],
  "settlement": {
    "kunalOwesPooja": 0, "poojaOwesKunal": 0, "net": 0,
    "commonSpend": 0, "poojaForKunal": 0, "kunalForPooja": 0
  },
  "topMerchants": [{"description":"...", "total":0, "cnt":0}]
}
```

## Budget Response Meaning (`/api/budget?month=&person=`)
`person=all` is the derived, read-only Combined view; the database stores only Pooja and Kunal rows.

```json
{
  "month": "September_2026",
  "person": "Pooja",
  "hasBudget": true,
  "hasSalary": true,
  "summary": {
    "expenseBudget": 111177,
    "actualSpending": 0,
    "variance": 111177,
    "usage": 0,
    "salary": 0,
    "netMonthlySavings": 0,
    "plannedInvestments": 0,
    "actualInvestments": 0
  },
  "sections": [{"section":"...","budget":0,"actual":0,"variance":0,"usage":null,"lines":[]}],
  "unmappedCount": 0
}
```

- `variance` is budget remaining (`expenseBudget - actualSpending`), not savings.
- `netMonthlySavings` is recorded salary minus qualifying actual spending; `hasSalary` distinguishes a missing salary from a recorded zero salary.
- Expense and investment lines are summarized separately. Budget actuals exclude `Credit Card Payment`, `Settlement`, and `Refunded`.
- September 2026 seeds reconcile to Kunal ₹1,15,647, Pooja ₹1,11,177, and Combined ₹2,26,824. Initial unambiguous mappings cover Rent, Petrol, Ola/Uber, Outside Food, Car downpayment/ emi, and Subscriptions; remaining lines visibly report `mapping_needed` until mapped.

## Trends Response Shape (`/api/trends?person=`)
`person` param: `Pooja`, `Kunal`, `Common`, or omit for all.
`Credit Card Payment` category is **excluded from all expense totals/charts** — it appears only in `creditCardPayments`.

```json
{
  "months": ["January_2026", "February_2026", "March_2026"],
  "monthlyTotals": [{"total": 445685, "cnt": 132}, ...],
  "monthlySplit": [{"month": "January_2026", "Pooja": 193714, "Kunal": 251971}, ...],
  "topCategories": {
    "categories": ["Outside Food", "Rent", ...],
    "byMonth": [{"month": "January_2026", "Outside Food": 18358, ...}, ...]
  },
  "categoryBreakdown": {
    "categories": ["Shopping - jwellery", ...],
    "byMonth": { "January_2026": { "Outside Food": 18358, ... }, ... },
    "totals": { "Outside Food": 49254, ... }
  },
  "creditCardPayments": {
    "January_2026": { "total": 39308, "cnt": 3 }, ...
  },
  "byPaymentMethod": {
    "methods": ["HDFC_Debit_Card", "Amazon_Credit_Card", ...],
    "byMonth": { "January_2026": { "HDFC_Debit_Card": 120000, ... }, ... },
    "totals": { "HDFC_Debit_Card": 380000, ... }
  }
}
```

## Settlement Calculation Logic
- `Common_50_50`: each owes half → contributes to `commonSpend`
- `Pooja_for_Kunal`: Pooja paid for Kunal → Kunal owes Pooja (`poojaForKunal`)
- `Kunal_for_Pooja`: Kunal paid for Pooja → Pooja owes Kunal (`kunalForPooja`)
- Net: `kunalOwesPooja - poojaOwesKunal` — positive means Kunal owes Pooja, negative means Pooja owes Kunal

## Enum Values
**Categories (50):** Zepto/Blinkit, Credit Card Payment, Doctor, Donation, Entertainment, Fitness, Fruits & Veggies, Furlenco, Gifts, Home stuff, House Help, Investment, Laundry, Loan EMI, Medicines, Monthly Home bills, Ola/Uber, Others, Outside Food, Parking, Petrol, Porter/Rapido, Refunded, Rent, Salon, Settlement, Shopping - bag/clothes/electronics/gold/home/jwellery/shoes/silver/skin+hair care/hobby, Subscriptions, Unexpected, Wifi/ Phone bills, Insurance, Travel - flights, Car downpayment/ emi, Therapy, Birthday gift, Stays, Nutritionist, Books, Flowers, ESOPS, Movies, DryClear

**Expense types:** Pooja_Personal, Kunal_Personal, Common_50_50, Pooja_for_Kunal, Kunal_for_Pooja, Kunal_CreditCard_Bill, Pooja_CreditCard_Bill

**Payment methods:** Cash, ICICI_Credit_Card, Amazon_Credit_Card, SBI_Credit_Card, HDFC_Credit_Card, ABFL_Credit_Card, HDFC_Debit_Card, Zaggle

**Paid by:** Pooja, Kunal

## Frontend Flow
1. **Add Expenses tab:** upload file → (if image/PDF: `/api/extract` via Gemini; if CSV/XLSX/XLS: parsed client-side via SheetJS/vanilla JS) → review table → `saveToTracker()` → `POST /api/transactions`
   - `paid_by` preserved from spreadsheet if set; otherwise auto-set to logged-in user's first name; `expense_type` defaults to `{User}_Personal`
   - Month selector at top — defaults to current month and initializes an inclusive From/To upload range (today for the current month, full month otherwise)
   - All uploaded file types are filtered before review; only valid transaction dates within the selected range are included, and an included/excluded count is shown
   - Spreadsheet column mapping (case-insensitive): `date`, `amount/amt/value/debit/credit`, `description/desc/merchant/narration/particulars`, `payment_method/method/mode`, `paid_by/who/person`, `expense_type/type`, `category/cat`, `mood`, `impulse`, `remarks/notes`; rows with `amount ≤ 0` are filtered out
2. **Dashboard tab (default):** `loadMonths()` → `loadDashboard(month)` → renders KPIs + salary KPIs + budget-health card + 4 charts (collapsible "Trends" section) + merchants table + transactions list
   - Global person filter (All/Pooja/Kunal/Common) in top-right nav filters all data
   - Dashboard toolbar: Month picker on left, "Edit History" + "Export to Google Sheets" grouped on right
   - Salary row (Pooja / Kunal / Combined) shown below main KPIs if salary exists for that month
   - Budget loads independently for the same month/person context; request failures show `Budget unavailable`, while a successful empty response shows `No budget set`
3. **Trends tab:** `loadTrends()` (fetches once, cached in `trendsLoaded`; reset after save or filter change) → renders tables + chart
4. **Salary tab:** `initSalaryTab()` → month picker + entry form (Pooja/Kunal inputs) + history table; `loadSalaryHistory()` fetches salary + trends data for full picture
5. **Budget tab:** `initBudgetTab()` synchronizes Dashboard month/person → `loadBudget()` → renders summary + section lines; Pooja/Kunal can edit amounts and mappings, while Combined is read-only
   - Empty months scan backward through the available month list and offer the most recent earlier budget as the copy source
   - Copying to an empty target proceeds; a populated target returns `409` and exposes a separate `Replace and copy` confirmation
6. **Ask AI tab:** Gemini-powered Q&A with context (monthly totals, top categories, current month detail); preset chips for common questions
7. **Export to Sheets (optional):** fetches month transactions → POSTs to Apps Script URL stored in localStorage

## Tabs Layout
### Dashboard tab (top → bottom)
1. Toolbar (month picker + Edit History + Export)
2. KPI row: Total Spend | Transactions | Pooja vs Kunal | Settlement
3. Budget-health card: actual of budget, remaining/overspent, usage, and Budget-tab action
4. Salary KPI row (hidden if no salary): Pooja Salary | Kunal Salary | Combined (shown for selected month)
5. Trends section (collapsible, default collapsed): 4 charts
6. Top Merchants (collapsible)
7. Transactions list (sortable, filterable, inline edit, bulk edit/delete, column toggle)

### Trends tab (top → bottom)
1. Monthly Summary table — month rows, total spend (excl. CC), transactions, Pooja/Kunal split
2. Spend by Category table — all categories × months; Total row frozen at top; sortable; searchable
3. Credit Card Payments table — CC amounts by month (labelled "Excluded from expense totals")
4. Spend by Payment Method table — methods × months + totals
5. Top 5 Categories Over Time — stacked bar chart

### Salary tab (top → bottom)
1. Summary section (3 rows × 3 cols): Salary (Pooja/Kunal/Combined) | Spend (Pooja/Kunal/Combined) | Savings (Pooja/Kunal/Combined) — all-time totals
2. Entry card — month picker + Pooja/Kunal salary inputs + notes + Save button
3. History table — Month | Pooja Salary | Kunal Salary | Combined | Pooja Spend | Kunal Spend | Total Spend | Savings | Savings %

### Budget tab (top → bottom)
1. Month and person selectors plus Copy/Edit actions
2. Separate Expense budget, Actual spending, Remaining, Salary, Monthly savings, and Investments summaries
3. Adviser-sheet sections with budget, mapping-derived actual, remaining, usage/status, and mappings per line
4. Pooja/Kunal amount and mapping controls; Combined has no write controls

### Ask AI tab
- Preset chips (top spend category, where to improve, next month prediction, etc.)
- Free-text input
- Gemini response rendered below

## Key JS Functions (app.js)
- `switchTab(name)` — toggles dashboard/add/trends/salary/budget/ask/ai-memory tabs; calls `loadTrends()` on trends, `initSalaryTab()` on salary, and `initBudgetTab()` on budget
- `saveToTracker()` — POST batch to DB; resets `trendsLoaded = false`
- `loadMonths()` — shows all months Jan 2026→current; months without data marked with ` —`
- `loadDashboard(month)` — parallel fetch dashboard + transactions + salary; renders all
- `loadDashboardBudget(month)` / `renderDashboardBudget(data, options)` — independently render active, empty, or unavailable budget health without allowing stale responses to win
- `openBudgetDetails()` — opens Budget with the Dashboard month and normalized person (`All`/`Common` → Combined)
- `renderKPIs(data)` — settlement card shows net + breakdown
- `renderSalaryKPIs(data)` — shows/hides `#kpiSalaryGrid` with month salary values
- `loadTrends()` — fetches `/api/trends?person=`, renders all trends sections; `trendsLoaded` cache
- `renderTrendsSummaryTable(data)` — monthly summary rows (most recent first)
- `renderCategoryBreakdownTable(data)` — saves to `_catBreakdownData`; calls `_renderCatHead()` + `_renderCatBody()`; total row frozen in thead
- `catSortBy(col)` — sorts category table by column; toggles asc/desc
- `filterCategoryTable()` — re-renders category body filtered by `#catSearch` input
- `_fixCatTotalSticky()` — sets `top` px on total row cells after render (dynamic sticky offset)
- `renderCreditCardPaymentsTable(data)` — CC payments by month
- `renderPaymentMethodTable(data)` — payment methods × months table
- `renderTopCategoriesChart(data)` — Top 5 stacked bar chart (Trends tab)
- `renderTransactionsList(txs)` — full transactions list with inline edit, sort, filter, column toggle, bulk select/edit/delete
- `initSalaryTab()` — populates month picker, calls `loadSalaryForMonth()` + `loadSalaryHistory()`
- `loadSalaryForMonth()` — fetches salary for selected month, populates inputs
- `saveSalary()` — POST salary, refresh history
- `loadSalaryHistory()` — fetches `/api/salary` + `/api/trends`; computes 9-cell summary (salary/spend/savings × pooja/kunal/combined) + history table
- `initBudgetTab()` / `loadBudget()` / `renderBudget()` — synchronize context, load guarded budget state, and render summaries/sections
- `saveBudget()` — replace a selected person's complete line set; Combined is blocked
- `saveBudgetMapping()` — replace global tracker-category mappings for one budget line
- `findEarlierBudgetSource()` — scan backward and select the most recent earlier month that has a budget
- `copyBudgetMonth(replace)` — copy into an empty month or retry with explicit replacement after a `409`
- `isSpreadsheetFile(file)` — returns true for .csv/.xlsx/.xls by name or MIME type
- `parseSpreadsheetFile(file)` — async; CSV → `parseCSVToObjects`; XLSX/XLS → SheetJS; returns mapped tx array (rows with amount ≤ 0 filtered)
- `parseCSVToObjects(text)` — splits CSV text into array of objects keyed by header row
- `parseCSVLine(line)` — RFC-4180 CSV line parser (handles quoted fields, escaped quotes)
- `mapSpreadsheetRow(rawRow)` — normalises column names (lowercase) and maps aliases to tx fields; handles SheetJS Date objects for date column
- `validateUploadDateRange(fromISO, toISO)` — requires both inclusive range boundaries and rejects reversed ranges
- `filterTransactionsByDateRange(rows, fromISO, toISO)` — excludes out-of-range transactions and missing/invalid dates before review
- `askChip(btn)` — fills AI input with chip text + submits
- `submitAsk()` — POST to `/api/ask`, renders markdown-ish response
- `makeChipCombo(options, current, index, field)` — chip-based searchable dropdown
- `startEdit(td, id, field, val)` — inline edit with chip combo or date picker
- `setGlobalFilter(person)` — sets All/Pooja/Kunal/Common filter; reloads dashboard + marks trends stale
- `toggleDark()` — toggles `body.dark`, persists in localStorage
- `formatCurrency(n)` — `₹12,450`
- `esc(str)` — HTML escape

## Key Global State (app.js)
- `trendsLoaded` — bool; reset to false on save, bulk edit, or global filter change
- `_catBreakdownData` — cached `{ categories, byMonth, totals, months }` for sort/search without re-fetch
- `_catSortCol` / `_catSortDir` — current sort state for Spend by Category table (default: `'total'` / `'desc'`)
- `globalPersonFilter` — `'all' | 'Pooja' | 'Kunal' | 'Common'`
- `_salaryInited` — bool; prevents re-running `loadSalaryHistory()` on every tab switch
- `dashboardBudgetLoadState` — active Dashboard budget request sequence/month/person; prevents stale success or failure from replacing current context
- `budgetState` — `{ initialized, month, person, data, editing, saving, mappingLine, copySourceMonth, copySourceStatus, loadSequence }`

## CSS Patterns
- Dark mode: `body.dark` class with CSS custom property overrides (`--bg`, `--white`, `--border`, `--text`)
- `.btn-primary.small` — `padding: 6px 12px; font-size: 12px`
- `.upload-date-range` — responsive From/To date controls in the upload month bar; stacks across the mobile width
- `body.dark .btn-primary` — explicit rule ensures correct blue rendering in dark mode
- Chip combo: `.rv-combo-trigger`, `.rv-combo-panel`, `.rv-combo-search`, `.rv-combo-list`, `.rv-opt`
- Inline edit panel: `.rv-combo-panel.rv-inline` — `position: absolute; z-index: 200`
- Editing cell: `.gc.editing` — `position: relative; overflow: visible`
- Settlement detail: `.sett-net`, `.sett-detail`, `.sett-row`
- Section headers (collapsible): `.section-header` + `.section-title` + `.section-toggle-icon`
- Category table sticky: `#trendsCategorySection .table-wrapper { max-height: 540px; overflow-y: auto }` + total row top set dynamically by `_fixCatTotalSticky()`
- `.toolbar-right` — flex group for right-side toolbar buttons
- `.table-note` — small italic muted text in table headers
- `.cat-search-input` — search box in Spend by Category header
- Salary KPI cards: `.kpi-salary-grid` (3-col), `.kpi-salary-pooja` (purple), `.kpi-salary-kunal` (blue), `.kpi-salary-combined` (green)
- Salary summary: `.salary-summary-section` (flex col) → `.salary-summary-group` (label + `.salary-summary-row` 3-col grid) → `.salary-kpi-card` with `.salary-kpi-pooja/kunal/neutral`
- AI section: `.ai-section`, `.ai-chip`, `.ai-input`, `.ai-response`, `.ai-badge`
- Mobile: `@media (max-width: 640px)` block

## Env Vars Needed
```
GEMINI_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
SESSION_SECRET
ALLOWED_EMAILS        comma-separated
BASE_URL              e.g. https://expense-tracker-pooja.fly.dev
DB_PATH               (prod only) /data/expenses.db
PORT                  default 3000
```

## Do Not
- Do not read server.js, db.js, app.js, index.html, or style.css just to understand the project — this file has all the info needed
- Do not run `npm install` unless adding a new package — everything is installed
- Do not add Google Apps Script as a required step — it is now optional export only
- Month sort in SQL must use the `MONTH_SORT` CASE expression (not `ORDER BY month`) — alphabetical sort is wrong
- `Credit Card Payment` and `Settlement` categories must always be excluded from general expense totals — use `CC_EXCLUDE` constant in server.js; CC payments appear in the separate `creditCardPayments` section; Settlement is handled via individual transaction expense types
- Budget actuals have a separate explicit exclusion set: `Credit Card Payment`, `Settlement`, and `Refunded`. Do not silently assign unmapped tracker categories or combine investment actuals with expense actuals.
- Per-chart person filter was removed from Dashboard — global filter (All/Pooja/Kunal/Common) in top nav handles all filtering
- `_salaryInited` flag prevents redundant re-fetches on tab switch; reset it to `false` after save so history refreshes
