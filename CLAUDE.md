# Expense Tracker — Project Context

## Stack
- **Backend:** Node.js + Express (`server.js`)
- **DB:** SQLite via `better-sqlite3` (`db.js`) — file at `./expenses.db` (prod: `DB_PATH=/data/expenses.db`)
- **Frontend:** Vanilla HTML/CSS/JS in `public/` — no build step
- **Auth:** Google OAuth via Passport.js — allowed emails in `ALLOWED_EMAILS` env var
- **AI:** Gemini Flash (`gemini-flash-latest`) for transaction extraction
- **Charts:** Chart.js 4.x via CDN

## File Map
```
server.js          Express app, all routes, Gemini extraction
db.js              SQLite init, CREATE TABLE, exports db instance
public/
  index.html       Three tabs: Dashboard (default) + Add Expenses + Trends
  app.js           All frontend JS — dashboard, upload, save flow, trends
  style.css        All styles + dark mode + mobile responsive
apps-script.gs     Google Sheets Apps Script (optional export target)
```

## DB Schema — transactions table
```sql
id, date TEXT, amount REAL, description, payment_method, paid_by,
expense_type, category, mood, impulse, remarks,
month TEXT  -- e.g. "March_2026", derived from date at insert time
created_at TEXT DEFAULT (datetime('now'))
```

## API Routes (all behind `requireAuth`)
```
GET  /api/me                     current user {email, name, photo}
POST /api/extract                Gemini extraction (multipart file upload)
POST /api/transactions           save batch [{date,amount,...}]; deduplicates on date+amount+description; returns {saved, skipped, ids}
GET  /api/transactions?month=    fetch by month
PUT  /api/transactions/:id       update one
DELETE /api/transactions/:id     delete one
GET  /api/months                 list distinct months with data
GET  /api/dashboard?month=       aggregated stats (see shape below)
GET  /api/trends                 all-time monthly data for Trends tab (see shape below)
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
    "kunalOwesPooja": 0,
    "poojaOwesKunal": 0,
    "net": 0,
    "commonSpend": 0,
    "poojaForKunal": 0,
    "kunalForPooja": 0
  },
  "topMerchants": [{"description":"...", "total":0, "cnt":0}]
}
```

## Trends Response Shape (`/api/trends`)
```json
{
  "months": ["January_2026", "February_2026", "March_2026"],
  "monthlyTotals": [12000, 18000, 24000],
  "monthlySplit": {
    "Pooja": [6000, 9000, 12000],
    "Kunal": [6000, 9000, 12000]
  },
  "topCategories": {
    "Outside Food": [2000, 3000, 4000],
    "Ola/Uber": [1000, 1500, 2000]
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
1. **Add Expenses tab:** upload file → `/api/extract` (Gemini) → review table → `saveToTracker()` → `POST /api/transactions`
   - `paid_by` auto-set to logged-in user's first name; `expense_type` defaults to `{User}_Personal`
   - Month selector at top — defaults to current month; date fields fall back to selected month if not found in screenshot
2. **Dashboard tab (default):** `loadMonths()` → `loadDashboard(month)` → renders KPIs + 4 charts + merchants table + transactions list
3. **Trends tab:** `loadTrends()` (fetches once, cached in `trendsLoaded`; reset after save) → renders 3 charts + summary table
4. **Export to Sheets (optional):** fetches month transactions → POSTs to Apps Script URL stored in localStorage

## Key JS Functions (app.js)
- `switchTab(name)` — toggles dashboard/add/trends tabs; calls `loadTrends()` on first visit to trends
- `saveToTracker()` — POST batch to DB; resets `trendsLoaded = false`
- `loadMonths()` — shows all months Jan 2026→current; months without data marked with ` —`
- `initUploadMonthPicker()` — populates month selector on Add Expenses tab
- `getUploadMonth()` — returns selected upload month string
- `loadDashboard(month)` — parallel fetch dashboard + transactions, renders all
- `loadTrends()` — fetches `/api/trends`, renders 3 charts + summary table
- `renderKPIs(data)` — settlement card shows net + breakdown (common, Pooja→Kunal, Kunal→Pooja)
- `renderCategoryChart / renderDailyChart / renderExpenseTypeChart / renderPaymentMethodChart` — Chart.js renders; destroy before re-render
- `renderTopMerchants(data)` — collapsible table
- `renderTransactionsList(txs)` — full transactions list with inline edit, sort, filter, column toggle
- `renderMonthlySpendChart / renderMonthlySplitChart / renderTopCategoriesChart` — Trends tab charts
- `renderTrendsSummaryTable(data)` — monthly summary rows
- `makeChipCombo(options, current, index, field)` — chip-based searchable dropdown (review table + dashboard inline edit)
- `startEdit(td, id, field, val)` — inline edit with chip combo or date picker; uses `.rv-combo-panel.rv-inline`
- `appDateToISO(str)` / `isoToAppDate(str)` — convert between "20 March 2026" and "2026-03-20"
- `deleteSavedTx(id)` — DELETE then reload dashboard
- `toggleDark()` — toggles `body.dark`, persists in localStorage
- `toggleCharts()` / `toggleMerchants()` — collapse/expand sections (default collapsed)
- `formatCurrency(n)` — `₹12,450`
- `esc(str)` — HTML escape

## CSS Patterns
- Dark mode: `body.dark` class with CSS custom property overrides (`--bg`, `--white`, `--border`, `--text`)
- Chip combo: `.rv-combo-trigger`, `.rv-combo-panel`, `.rv-combo-search`, `.rv-combo-list`, `.rv-opt`
- Inline edit panel: `.rv-combo-panel.rv-inline` — `position: absolute; z-index: 200`
- Editing cell: `.gc.editing` — `position: relative; overflow: visible`
- Settlement detail: `.sett-net`, `.sett-detail`, `.sett-row`
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
