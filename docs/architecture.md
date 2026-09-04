# Expense Tracker — Architecture

## System Overview

A two-person personal finance tracker. Pooja & Kunal upload payment screenshots → Gemini AI extracts transactions → review & save → analyze via Dashboard, Trends, Salary, Budget, and Ask AI tabs.

```
Browser (Vanilla JS)
      │
      │  HTTPS
      ▼
Express Server (server.js)          ← Google OAuth session
      │
      ├── Gemini Flash API           ← transaction extraction + AI Q&A
      │
      └── SQLite (better-sqlite3)   ← persistent storage on Fly.io volume
            expenses.db
```

---

## Request Flow

### Upload & Extract
```
User drops screenshot
  → POST /api/extract (multipart)
  → server builds prompt + base64 image
  → Gemini Flash returns JSON array of transactions
  → browser renders review table
  → User edits/confirms
  → POST /api/transactions (batch)
  → SQLite INSERT with dedup (date+amount+description)
  → audit snapshot written to transaction_audit
```

### Dashboard Load
```
switchTab('dashboard') → loadMonths()
  → GET /api/months  (distinct months in DB)
  → populates month picker

loadDashboard(month) — parallel:
  ├── GET /api/dashboard?month=   → aggregated stats
  ├── GET /api/transactions?month= → full tx list
  └── GET /api/salary?month=      → salary for month

renderKPIs() + renderSalaryKPIs()
renderCategoryChart() + renderDailyChart() + ...
renderTopMerchants()
renderTransactionsList()
```

`loadDashboardBudget(month)` runs in the same refresh but owns a separate request guard. It maps the global `Pooja`/`Kunal` filter directly and maps `All`/`Common` to `person=all`. A failed budget request renders `Budget unavailable`; only a successful response with `hasBudget: false` renders `No budget set`.

### Budget Load and Management

```text
Month/person selection
  → GET /api/budget
  → budget-service loads lines + mappings + salary + qualifying transactions
  → per-person attribution and section summaries
  → optional Combined merge
  → Dashboard pulse or detailed Budget tab
```

The service attributes actuals by transaction `paid_by` and tracker-category mapping. It excludes `Credit Card Payment`, `Settlement`, and `Refunded`, and keeps `expense` and `investment` lines in separate summaries. `person=all` merges the two personal responses in memory; Combined rows are never stored and the Combined UI has no edit or mapping controls.

Budget writes have three flows:

```text
Edit Pooja/Kunal amounts
  → PUT /api/budget/:month with the complete validated line set
  → transactional replacement for only that person/month

Edit one line's mappings
  → PUT /api/budget-mappings
  → transactional global mapping replacement
  → reload Budget and Dashboard actuals

Copy month
  → POST /api/budget/:sourceMonth/copy
  → empty target copies immediately
  → populated target returns 409
  → explicit "Replace and copy" repeats with replace=true
```

When the selected month is empty, the frontend checks earlier picker months from newest to oldest and uses the first month whose budget response has `hasBudget: true`. Copy-source discovery, detail loading, and Dashboard loading each discard stale responses after the month/person context changes.

### Trends Load
```
switchTab('trends') → loadTrends() [cached, only runs once]
  → GET /api/trends?person=

renderTrendsSummaryTable()
renderCategoryBreakdownTable()   ← sticky total row, sortable, searchable
renderCreditCardPaymentsTable()
renderPaymentMethodTable()
renderTopCategoriesChart()       ← Chart.js stacked bar
```

### Ask AI
```
User types question / clicks chip
  → POST /api/ask { question, month }
  → server fetches context from DB:
      monthly totals, top 10 categories,
      current month category + paid_by + expense_type breakdown
  → builds prompt → Gemini Flash
  → streams answer back as JSON { answer }
```

---

## Database Schema

```
transactions
├── id          INTEGER PK AUTOINCREMENT
├── date        TEXT              "2026-03-21"
├── amount      REAL
├── description TEXT
├── payment_method TEXT
├── paid_by     TEXT              "Pooja" | "Kunal"
├── expense_type TEXT             see enum
├── category    TEXT             see enum (50 values)
├── mood        TEXT
├── impulse     TEXT
├── remarks     TEXT
├── month       TEXT              "March_2026"  ← derived at insert
└── created_at  TEXT

salaries
├── id          INTEGER PK AUTOINCREMENT
├── person      TEXT              "Pooja" | "Kunal"
├── month       TEXT              "March_2026"
├── amount      REAL
├── notes       TEXT
├── created_at  TEXT
└── UNIQUE(person, month)         ← enables upsert

transaction_audit
├── id          INTEGER PK AUTOINCREMENT
├── tx_id       INTEGER           FK → transactions.id
├── action      TEXT              "INSERT" | "UPDATE" | "DELETE"
├── snapshot    TEXT              JSON snapshot of old row
└── changed_at  TEXT

lists
├── id          INTEGER PK AUTOINCREMENT
├── list_name   TEXT
├── value       TEXT
└── UNIQUE(list_name, value)      ← enum storage (unused for now)

budgets
├── id          INTEGER PK AUTOINCREMENT
├── month       TEXT              "September_2026"
├── person      TEXT              "Pooja" | "Kunal"
├── section     TEXT              adviser-sheet section label
├── category    TEXT              adviser-sheet category label
├── kind        TEXT              "expense" | "investment"
├── amount      REAL              finite, >= 0
├── sort_order  INTEGER           stable order within a section
├── created_at / updated_at TEXT
└── UNIQUE(month, person, section, category)

budget_category_mappings
├── id                   INTEGER PK AUTOINCREMENT
├── section              TEXT
├── budget_category      TEXT
├── transaction_category TEXT      tracker category
├── kind                 TEXT      "expense" | "investment"
├── created_at           TEXT
├── UNIQUE(section, budget_category, transaction_category)
└── UNIQUE(kind, transaction_category)  ← prevents double attribution within a kind
```

`db.js` applies the September 2026 defaults once, tracked by a migration marker in `settings`: Kunal ₹1,15,647, Pooja ₹1,11,177, Combined ₹2,26,824, with zero planned investments. If an existing database already has September budget rows, initialization records the marker without reapplying defaults, so later user deletions stay deleted. Initial mappings are deliberately limited to unambiguous categories: Rent; Petrol and Ola/Uber; Outside Food; Car downpayment/ emi; and Subscriptions. Unmapped budget lines remain visible as `mapping_needed`.

---

## Server Modules (server.js)

```
Constants
  CC_EXCLUDE    " AND category != 'Credit Card Payment' AND category != 'Settlement'"
  MONTH_SORT    CASE expression for chronological month ordering

Middleware
  express.static('public')        Cache-Control: no-store on .html/.js/.css
  express.json()
  session + Passport Google OAuth

Auth
  requireAuth(req, res, next)     redirects to /auth/google if not logged in
  /auth/google                    OAuth entry
  /auth/google/callback           OAuth return → session
  /logout

API Routes
  /api/me
  /api/extract                    Gemini multipart extraction
  /api/transactions (GET/POST/PUT/DELETE)
  /api/months
  /api/dashboard                  aggregated stats with settlement calc
  /api/trends                     all-time monthly data (CC+Settlement excluded)
  /api/salary (GET/POST)          upsert with UNIQUE(person, month)
  /api/budget (GET)               detail for Pooja, Kunal, or derived Combined
  /api/budget/:month (PUT)        transactional personal-budget replacement
  /api/budget-mappings (PUT)      global mapping replacement for one line
  /api/budget/:month/copy (POST)  selected-person/Combined month copy
  /api/ask                        Gemini Q&A with DB context
  /api/audit (GET)
  /api/audit/:id/restore (POST)
```

`budget-service.js` is the service boundary for month/person/kind/amount validation, mapping uniqueness, qualifying-transaction attribution, summary calculation, personal replacement, and copy conflict handling. `registerBudgetRoutes()` translates typed service errors to 400/404/409. Unexpected errors return status 500 with exactly `{ "error": "Budget operation failed" }`, never the underlying message or stack.

The budget response intentionally carries separate financial meanings:

- `summary.variance`: expense budget remaining (`expenseBudget - actualSpending`), negative when overspent.
- `summary.netMonthlySavings`: recorded salary minus qualifying actual spending; `hasSalary` distinguishes missing salary from recorded zero.
- `summary.plannedInvestments` and `summary.actualInvestments`: investment-only totals, excluded from ordinary expense budget/actual totals.
- `hasBudget`: based on row existence, so an all-zero budget is still a real budget.

---

## Frontend Architecture (app.js)

### State
```
globalPersonFilter    'all' | 'Pooja' | 'Kunal' | 'Common'
trendsLoaded          bool — prevents re-fetch on tab revisit
_catBreakdownData     cached category table data for sort/search
_catSortCol / _catSortDir
_salaryInited         bool — prevents re-fetch on tab revisit
dashboardBudgetLoadState
                      active Dashboard budget request sequence/month/person
budgetState           selected budget month/person, data, edit/save state,
                      mapping line, copy source/status, and request sequence
```

### Tab Lifecycle
```
switchTab(name)
  'dashboard' → loadMonths() → loadDashboard(month)
  'add'       → initUploadMonthPicker()
  'trends'    → loadTrends()           [once, trendsLoaded gate]
  'salary'    → initSalaryTab()        [once, _salaryInited gate]
  'budget'    → initBudgetTab() → loadBudget()
  'ask'       → (static, no fetch)
```

### Render Pipeline
```
loadDashboard(month)
  ├── renderKPIs(dash)
  ├── renderSalaryKPIs(sal)
  ├── renderCategoryChart(dash)
  ├── renderDailyChart(dash)
  ├── renderExpenseTypeChart(dash)
  ├── renderPaymentMethodChart(dash)
  ├── renderTopMerchants(dash)
  └── renderTransactionsList(txs)

loadTrends()
  ├── renderTrendsSummaryTable(data)
  ├── renderCategoryBreakdownTable(data)  → _catBreakdownData cache
  ├── renderCreditCardPaymentsTable(data)
  ├── renderPaymentMethodTable(data)
  └── renderTopCategoriesChart(data)

loadSalaryHistory()
  ├── renders 9-cell summary (salary/spend/savings × pooja/kunal/combined)
  └── renders history table (9 columns)

loadDashboardBudget(month)
  └── renderDashboardBudget()          active | empty | unavailable

loadBudget()
  ├── renderBudget()                   separate remaining/savings/investment summaries
  ├── saveBudget()                     Pooja/Kunal only
  ├── saveBudgetMapping()              global mapping replacement
  └── findEarlierBudgetSource()        newest earlier populated month
```

### Inline Edit Flow
```
click cell → startEdit(td, id, field, val)
  → makeChipCombo() for enum fields (category, payment_method, etc.)
  → date picker for date field
  → PUT /api/transactions/:id on confirm
  → reload dashboard
```

---

## CSS Architecture (style.css — ~1400 lines)

```
:root                   CSS custom properties (--bg, --white, --border, --text, --primary, ...)
body.dark               overrides all custom properties + hardcoded colors

Sections (in order):
  Reset / base
  Dark mode overrides
  Layout (nav, tab-pane, toolbar)
  KPI cards + salary KPI cards
  Charts grid + chart cards
  Collapsible section headers
  Tables (shared: .table-section, .table-wrapper, thead sticky)
  Transactions list (inline edit, chip combo, bulk actions)
  Trends tab (category search, sticky total row)
  Salary tab (summary grid, entry card, history table)
  Ask AI tab
  Mobile responsive (@media max-width: 640px / 900px)
```

---

## Deployment (Fly.io)

```
App:     expense-tracker-pooja
Region:  Single machine (17813e20ad5068)
Volume:  /data/expenses.db  ← persistent SQLite
Port:    3000

fly deploy          → builds Docker image → rolling deploy
fly logs            → live logs
fly ssh console     → SSH into machine
fly sftp get /data/expenses.db   → download DB backup
```

### Dockerfile flow
```
node:22-slim base
apt-get: build-essential, node-gyp, python (for better-sqlite3 native build)
npm ci
COPY . .
RUN mkdir -p /data
CMD node server.js
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| No build step | Simplicity — vanilla JS/HTML/CSS, instant deploy |
| SQLite over Postgres | Single-user, low concurrency, easy Fly.io volume backup |
| Gemini Flash | Fast + cheap for extraction; same model reused for Q&A |
| CC_EXCLUDE constant | `Credit Card Payment` + `Settlement` are bookkeeping entries, not real spend — excluded from all totals |
| MONTH_SORT CASE | `ORDER BY month` is alphabetical (April before January); CASE gives correct chronological order |
| Cache-Control: no-store | Fly.io CDN was serving stale JS/HTML; no-store forces fresh fetch every time |
| `trendsLoaded` / `_salaryInited` gates | Trends + salary data is all-time; no need to re-fetch on every tab switch — only reset when data changes (save, bulk edit, filter change) |
| Sticky Total row in thead | Putting Total as `thead` row 2 allows `position: sticky` without JS scroll listeners; top offset calculated dynamically via `getBoundingClientRect()` |
| Derived, read-only Combined budget | Avoids divergent stored household totals; personal budgets are merged at read time |
| Mapping-based actuals | Preserves adviser-sheet labels while using the tracker's established transaction categories; one mapping per kind prevents duplicates |
| Separate remaining, savings, and investments | Budget variance, cash-flow savings, and investment activity answer different financial questions and must not be conflated |
