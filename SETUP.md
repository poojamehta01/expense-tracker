# Expense Tracker — Complete Reference Guide

> Personal expense tracker for Pooja & Kunal. Upload payment screenshots → AI extracts transactions → review → save → dashboard with charts.

**Live app:** https://expense-tracker-pooja.fly.dev
**GitHub:** https://github.com/poojamehta01/expense-tracker
**Deployed on:** Fly.io (Singapore region)

---

## Table of Contents
1. [What the App Does](#what-the-app-does)
2. [Tech Stack](#tech-stack)
3. [File Structure](#file-structure)
4. [Running Locally](#running-locally)
5. [Environment Variables](#environment-variables)
6. [Database](#database)
7. [API Routes](#api-routes)
8. [Features Walkthrough](#features-walkthrough)
9. [Fly.io Deployment](#flyio-deployment)
10. [Google OAuth Setup](#google-oauth-setup)
11. [Optional: Google Sheets Export](#optional-google-sheets-export)
12. [Maintenance](#maintenance)
13. [Troubleshooting](#troubleshooting)

---

## What the App Does

Three-tab single-page app:

**Dashboard tab (default)**
- Month picker — shows all months Jan 2026 → current month; months without data shown with ` —` suffix
- KPI cards: Total Spend, Transaction Count, Pooja vs Kunal split, Settlement (who owes whom + breakdown)
- Charts (collapsible, collapsed by default): Category breakdown, Daily spend trend, Expense type, Payment method
- Top Merchants table (collapsible, collapsed by default)
- All Transactions table: sortable, filterable, inline-editable with chip dropdowns + date picker, column toggle, `+ Add row`

**Add Expenses tab**
- Month selector at top — defaults to current month; supports adding for past/future months
- Upload screenshots/PDFs (PhonePe, GPay, HDFC bank statements, Amazon Pay, CRED, etc.)
- Gemini AI extracts transactions automatically
- Review table: edit all fields with colored chip dropdowns (searchable) and date picker
- "Paid By" auto-defaults to the logged-in user (Pooja → Pooja, Kunal → Kunal)
- Expense Type auto-defaults to `{User}_Personal`
- Duplicate detection: saves only new transactions (matches on date + amount + description)
- "Save to Tracker" → writes to SQLite DB

**Trends tab**
- Monthly Total Spend bar chart — all months with data
- Pooja vs Kunal monthly split stacked bar chart
- Top 5 Categories Over Time line chart
- Monthly Summary table (month, total, transaction count, Pooja total, Kunal total)
- Data cached on first load; refreshes automatically after saving new transactions

**Other features**
- Dark mode toggle (🌙/☀️) — persists in localStorage
- Mobile responsive (works on phone)
- Google OAuth login — only Pooja & Kunal's emails can sign in
- Optional "Export to Google Sheets" button on Dashboard

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express |
| Database | SQLite via `better-sqlite3` |
| Frontend | Vanilla HTML + CSS + JS (no build step) |
| Auth | Google OAuth 2.0 via Passport.js |
| AI extraction | Google Gemini Flash (`gemini-flash-latest`) |
| Charts | Chart.js 4.x (CDN) |
| Hosting | Fly.io (free tier + persistent volume) |

---

## File Structure

```
expenseTracker/
├── server.js          # Express app — all routes, Gemini extraction, OAuth
├── db.js              # SQLite init, CREATE TABLE, exports db instance
├── package.json       # Dependencies
├── fly.toml           # Fly.io deployment config
├── .env               # Local secrets (NOT committed)
├── .gitignore         # node_modules, .env, expenses.db, uploads/, *.csv
├── SETUP.md           # This file
├── CLAUDE.md          # AI assistant context (schema, routes, conventions)
├── apps-script.gs     # Google Sheets Apps Script (optional export)
└── public/
    ├── index.html     # Three-tab UI skeleton
    ├── app.js         # All frontend JS (~1500 lines)
    └── style.css      # All styles + dark mode + mobile (~950 lines)
```

---

## Running Locally

### Prerequisites
- Node.js (LTS) — https://nodejs.org
- A Google Cloud project with OAuth credentials (see [Google OAuth Setup](#google-oauth-setup))
- A Gemini API key — https://aistudio.google.com/app/apikey

### Steps

```bash
# 1. Clone / go to project
cd ~/Documents/expenseTracker

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env   # or create manually (see env vars below)

# 4. Start
npm start
# → Server running at http://localhost:3000
```

Open http://localhost:3000 → sign in with your Google account.

---

## Environment Variables

Create a `.env` file in the project root (never commit this):

```env
# Required
GEMINI_API_KEY=AIzaSy...             # From aistudio.google.com
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
SESSION_SECRET=any-random-string-here
ALLOWED_EMAILS=poojamehta1197@gmail.com,kunal@example.com

# For local dev, BASE_URL is http://localhost:3000
BASE_URL=http://localhost:3000

# Production only (set via fly secrets, not .env)
DB_PATH=/data/expenses.db            # Where SQLite file lives on Fly volume
PORT=3000                            # Fly expects 3000 (set in fly.toml)
```

### Setting secrets on Fly.io

```bash
fly secrets set \
  GEMINI_API_KEY="AIzaSy..." \
  GOOGLE_CLIENT_ID="....apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="GOCSPX-..." \
  SESSION_SECRET="some-random-string" \
  ALLOWED_EMAILS="poojamehta1197@gmail.com,kunal@example.com" \
  BASE_URL="https://expense-tracker-pooja.fly.dev" \
  DB_PATH="/data/expenses.db"
```

Changing any secret triggers an automatic redeploy.

---

## Database

**File location:**
- Local: `./expenses.db`
- Production: `/data/expenses.db` (on Fly.io persistent volume `expense_data`)

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  date           TEXT NOT NULL,         -- "21 March 2026"
  amount         REAL NOT NULL,
  description    TEXT,
  payment_method TEXT,                  -- see enums below
  paid_by        TEXT,                  -- "Pooja" or "Kunal"
  expense_type   TEXT,                  -- see enums below
  category       TEXT,                  -- see enums below
  mood           TEXT,
  impulse        TEXT,                  -- "Impulse" or "Intentional"
  remarks        TEXT,
  month          TEXT,                  -- "March_2026" (derived from date at insert)
  created_at     TEXT DEFAULT (datetime('now'))
);
```

**Enum values used in the UI:**

| Field | Values |
|---|---|
| `paid_by` | Pooja, Kunal |
| `payment_method` | Cash, ICICI_Credit_Card, Amazon_Credit_Card, SBI_Credit_Card, HDFC_Credit_Card, ABFL_Credit_Card, HDFC_Debit_Card, Zaggle |
| `expense_type` | Pooja_Personal, Kunal_Personal, Common_50_50, Pooja_for_Kunal, Kunal_for_Pooja, Kunal_CreditCard_Bill, Pooja_CreditCard_Bill |
| `impulse` | Impulse, Intentional |
| `category` | 50 categories: Zepto/Blinkit, Outside Food, Fruits & Veggies, Salon, Medicines, Doctor, Shopping - clothes/home/bag/shoes/etc., Ola/Uber, House Help, Rent, Wifi/Phone bills, Subscriptions, and more |

---

## API Routes

All routes require login (protected by `requireAuth` middleware).

| Method | Path | Description |
|---|---|---|
| GET | `/api/me` | Current user: `{email, name, photo}` |
| POST | `/api/extract` | Multipart file → Gemini extraction → `[{date, amount, description, ...}]` |
| POST | `/api/transactions` | Save batch. Skips duplicates (same date+amount+description). Returns `{saved, skipped, ids}` |
| GET | `/api/transactions?month=March_2026` | All transactions for a month |
| PUT | `/api/transactions/:id` | Update one transaction |
| DELETE | `/api/transactions/:id` | Delete one transaction |
| GET | `/api/months` | List of distinct months that have data |
| GET | `/api/dashboard?month=March_2026` | Pre-aggregated stats for all charts |
| GET | `/api/trends` | All-time monthly aggregates for Trends tab |

**Dashboard response shape:**
```json
{
  "totalSpend": 84250,
  "transactionCount": 87,
  "byCategory": [{"category": "Outside Food", "total": 12400}],
  "byPaidBy": {"Pooja": 52000, "Kunal": 32250},
  "byExpenseType": [{"expense_type": "Common_50_50", "total": 41000}],
  "byPaymentMethod": [{"payment_method": "HDFC_Debit_Card", "total": 38000}],
  "dailySpend": [{"date": "1 March 2026", "total": 2400}],
  "settlement": {
    "kunalOwesPooja": 5000,
    "poojaOwesKunal": 0,
    "net": 5000,
    "commonSpend": 41000,
    "poojaForKunal": 5000,
    "kunalForPooja": 0
  },
  "topMerchants": [{"description": "Swiggy", "total": 6200, "cnt": 8}]
}
```

**Trends response shape:**
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

---

## Features Walkthrough

### Adding Expenses (daily workflow)
1. Open app → **Add Expenses** tab
2. Select the month you're adding expenses for (defaults to current month)
3. Drop screenshots or PDFs into the upload area (or click Choose files)
   - Supported: PhonePe, GPay, HDFC bank statements, Amazon Pay, CRED, any payment app screenshot
   - Formats: PNG, JPG, HEIC, PDF — up to 20MB per file
4. Gemini extracts all transactions automatically
5. Review table appears — edit anything that's wrong:
   - **Date**: calendar date picker
   - **Category**: searchable chip dropdown (type to filter 50 options)
   - **Paid By**: defaults to logged-in user (Pooja or Kunal)
   - **Expense Type**: defaults to `{User}_Personal`
   - All dropdowns show colored chips matching the dashboard
6. Click **Save to Tracker** → saved to DB. Success message shows count + duplicates skipped.

### Dashboard
- **Month picker**: all months Jan 2026 → current. Months without data show ` —` suffix.
- **Charts** and **Top Merchants** are collapsed by default — click section header to expand.
- **All Transactions table**:
  - Click any cell to edit inline
  - Date cells → date picker
  - Category/Expense Type/etc → searchable chip dropdown
  - Sort by any column (click header)
  - Filter by category, paid by, expense type, etc. (Filter button)
  - Toggle visible columns (Columns button)
  - `+ Add row` to manually add a transaction

### Settlement KPI Card
Shows who owes whom for the selected month based on expense types:
- **Common_50_50**: split equally; each person effectively owes the other half
- **Pooja_for_Kunal**: Pooja paid an expense that's Kunal's → Kunal owes Pooja
- **Kunal_for_Pooja**: Kunal paid an expense that's Pooja's → Pooja owes Kunal
- Displays net settlement (e.g. "Kunal owes Pooja ₹5,000") with breakdown detail

### Trends Tab
- **Monthly Total Spend**: bar chart showing total spend per month across all history
- **Pooja vs Kunal Monthly Split**: stacked bar showing each person's spend per month
- **Top 5 Categories Over Time**: line chart for the top 5 categories across all months
- **Monthly Summary**: table with month, total spend, transaction count, Pooja total, Kunal total
- Data loads once per session and refreshes automatically after you save new transactions

### Dark Mode
- Click 🌙 in the top-right of the header
- Preference saved in `localStorage` — persists across sessions and page reloads

### Mobile Support
- Fully responsive layout — works on iPhone/Android browsers
- Tables scroll horizontally on small screens
- Upload area, review table, and dashboard all adapt to narrow viewports

### Duplicate Prevention
- When saving, each transaction is checked against existing DB records on `date + amount + description`
- Duplicates are silently skipped; save result shows `"X saved, Y skipped"`
- Safe to upload the same screenshot twice

### Export to Google Sheets (optional)
- Set Apps Script URL in the browser's localStorage (or configure via old settings UI)
- Click **Export to Google Sheets** on the Dashboard
- Exports the currently selected month to your configured sheet

---

## Fly.io Deployment

**App name:** `expense-tracker-pooja`
**Region:** Singapore (`sin`)
**Machine ID:** `17813e20ad5068`
**Persistent volume:** `expense_data` mounted at `/data`

### Deploy a new version

```bash
# From project root
git add .
git commit -m "your message"
git push
fly deploy --ha=false
```

### View logs

```bash
fly logs
```

### SSH into the machine

```bash
fly ssh console
# Then: ls /data, sqlite3 /data/expenses.db, etc.
```

### Check app status

```bash
fly status
fly machine list
```

### Scale (if needed)

```bash
fly scale memory 512    # increase RAM
fly scale count 1       # ensure 1 machine
```

---

## Google OAuth Setup

The app uses Google OAuth so only Pooja & Kunal can sign in.

**Where it's configured:** Google Cloud Console → project → APIs & Services → Credentials

**Authorized redirect URIs** currently set:
- `http://localhost:3000/auth/google/callback` (local dev)
- `https://expense-tracker-pooja.fly.dev/auth/google/callback` (production)

**If you deploy to a new URL**, add that URL's callback to the Google Cloud Console authorized redirect URIs, otherwise you'll get a `redirect_uri_mismatch` error.

**Steps to update:**
1. Go to https://console.cloud.google.com
2. APIs & Services → Credentials → click the OAuth 2.0 Client
3. Add new authorized redirect URI
4. Save

**Allowed users** controlled by `ALLOWED_EMAILS` env var (comma-separated).

---

## Optional: Google Sheets Export

This was the original workflow — now optional. The DB is the source of truth.

### Setup (one-time)
1. Open your Google Sheet
2. Extensions → Apps Script → paste contents of `apps-script.gs`
3. Deploy → New deployment → Web app
   - Execute as: Me
   - Who has access: Anyone
4. Copy the Web App URL

### Use in the app
1. Store the URL in localStorage key `sheetsUrl` (open browser console: `localStorage.setItem('sheetsUrl', 'YOUR_URL')`)
2. On Dashboard → click "Export to Google Sheets"
3. The currently selected month's transactions get pushed to the sheet

> Note: every time you change the Apps Script code, create a **New deployment** (not update existing).

---

## Maintenance

### Backup the database

```bash
# Download from Fly volume to local
fly ssh console --command "cat /data/expenses.db" > backup_$(date +%Y%m%d).db
```

Or use SFTP:
```bash
fly sftp get /data/expenses.db ./backup_local.db
```

### Upload a local DB to production

```bash
# Delete existing first
fly ssh console --command "rm /data/expenses.db"
# Upload
fly sftp put ./expenses.db /data/expenses.db
```

### Add a new secret

```bash
fly secrets set NEW_VAR="value"
# This triggers automatic redeploy
```

### Update dependencies

```bash
npm update
git add package.json package-lock.json
git commit -m "Update dependencies"
git push && fly deploy --ha=false
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` on login | New URL not in Google Cloud Console | Add the callback URL to OAuth credentials |
| App shows 502 on Fly | Port mismatch | Check `internal_port = 3000` in fly.toml, don't set PORT env var |
| "No transactions found" from AI | Blurry/partial screenshot | Use a clearer full-screen screenshot of the payment history |
| Duplicate entries in DB | Uploaded same screenshot twice | App auto-deduplicates — but if already saved, delete via dashboard |
| Dark mode not applying to some elements | Missing dark override in CSS | Add `body.dark .classname` rule to style.css |
| Data missing after redeploy | DB_PATH not set or volume not mounted | Check `fly secrets list` for DB_PATH and `fly volumes list` |
| Can't log in (not allowed) | Email not in ALLOWED_EMAILS | `fly secrets set ALLOWED_EMAILS="..."` with your email included |
| Local: OAuth error | BASE_URL wrong | Set `BASE_URL=http://localhost:3000` in .env |
| Trends chart not updating after save | `trendsLoaded` not reset | Verify `saveToTracker()` sets `trendsLoaded = false` |
| Month order wrong in Trends | SQL ORDER BY month (alphabetical) | Ensure `MONTH_SORT` CASE expression is used in `/api/trends` query |
| Settlement shows wrong direction | expense_type mismatch | Check that Pooja_for_Kunal / Kunal_for_Pooja are set correctly on transactions |
