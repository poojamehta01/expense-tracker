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
  index.html       Two tabs: Dashboard (default) + Add Expenses
  app.js           All frontend JS — dashboard, upload, save flow
  style.css        All styles
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
GET  /api/me                     current user
POST /api/extract                Gemini extraction (multipart file upload)
POST /api/transactions           save batch [{date,amount,...}]
GET  /api/transactions?month=    fetch by month
PUT  /api/transactions/:id       update one
DELETE /api/transactions/:id     delete one
GET  /api/months                 list distinct months with data
GET  /api/dashboard?month=       aggregated stats (see shape below)
```

## Dashboard Response Shape
```json
{
  "totalSpend": 84250, "transactionCount": 87,
  "byCategory": [{"category":"...", "total":0}],
  "byPaidBy": {"Pooja": 0, "Kunal": 0},
  "byExpenseType": [{"expense_type":"...", "total":0}],
  "byPaymentMethod": [{"payment_method":"...", "total":0}],
  "dailySpend": [{"date":"...", "total":0}],
  "impulseVsIntentional": {"Impulse":0, "Intentional":0},
  "topMerchants": [{"description":"...", "total":0, "cnt":0}]
}
```

## Enum Values
**Categories (50):** Zepto/Blinkit, Credit Card Payment, Doctor, Donation, Entertainment, Fitness, Fruits & Veggies, Furlenco, Gifts, Home stuff, House Help, Investment, Laundry, Loan EMI, Medicines, Monthly Home bills, Ola/Uber, Others, Outside Food, Parking, Petrol, Porter/Rapido, Refunded, Rent, Salon, Settlement, Shopping - bag/clothes/electronics/gold/home/jwellery/shoes/silver/skin+hair care/hobby, Subscriptions, Unexpected, Wifi/ Phone bills, Insurance, Travel - flights, Car downpayment/ emi, Therapy, Birthday gift, Stays, Nutritionist, Books, Flowers, ESOPS, Movies, DryClear

**Expense types:** Pooja_Personal, Kunal_Personal, Common_50_50, Pooja_for_Kunal, Kunal_for_Pooja, Kunal_CreditCard_Bill, Pooja_CreditCard_Bill

**Payment methods:** Cash, ICICI_Credit_Card, Amazon_Credit_Card, SBI_Credit_Card, HDFC_Credit_Card, ABFL_Credit_Card, HDFC_Debit_Card, Zaggle

**Paid by:** Pooja, Kunal

## Frontend Flow
1. **Add Expenses tab:** upload file → `/api/extract` (Gemini) → review table → `saveToTracker()` → `POST /api/transactions`
2. **Dashboard tab (default):** `loadMonths()` → `loadDashboard(month)` → renders KPIs + 4 charts + merchants table + transactions list
3. **Export to Sheets (optional):** fetches month transactions → POSTs to Apps Script URL stored in localStorage

## Key JS Functions (app.js)
- `switchTab(name)` — toggles dashboard/add tabs
- `saveToTracker()` — POST batch to DB
- `loadMonths()` — populates month picker, auto-selects current month
- `loadDashboard(month)` — parallel fetch dashboard + transactions, renders all
- `renderKPIs/CategoryChart/DailyChart/ExpenseTypeChart/PaymentMethodChart/TopMerchants/TransactionsList`
- `deleteSavedTx(id)` — DELETE then reload dashboard
- `formatCurrency(n)` — `₹12,450`
- `esc(str)` — HTML escape

## Env Vars Needed
```
GEMINI_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
SESSION_SECRET
ALLOWED_EMAILS        comma-separated
BASE_URL              e.g. https://myapp.railway.app
DB_PATH               (prod only) /data/expenses.db
PORT                  default 3000
```

## Do Not
- Do not read server.js, db.js, app.js, index.html, or style.css just to understand the project — this file has all the info needed
- Do not run `npm install` unless adding a new package — everything is installed
- Do not add Google Apps Script as a required step — it is now optional export only
