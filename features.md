# Expense Tracker — Feature Reference

Personal expense tracker for Pooja & Kunal. Upload payment screenshots → AI extracts transactions → review & save → analyze.

---

## Navigation

Five tabs in the top nav bar:
- **Dashboard** (default) — monthly snapshot
- **Add Expenses** — upload & extract transactions
- **Trends** — all-time analysis
- **Salary** — salary tracking & savings rate
- **Ask AI** — Gemini-powered financial Q&A

Global person filter (All / Pooja / Kunal / Common) in the top-right nav filters data across Dashboard and Trends.

Dark mode toggle (🌙/☀️) in the top-right nav, persisted in localStorage.

---

## Dashboard Tab

### KPI Cards (Row 1)
Four cards showing stats for the selected month:
- **Total Spend** — sum of all expenses (excludes Credit Card Payments)
- **Transactions** — count of transactions
- **Pooja vs Kunal** — how much each person spent
- **Settlement** — who owes whom, with breakdown (Common / Pooja→Kunal / Kunal→Pooja)

### Salary KPI Cards (Row 2)
Shown only when salary data exists for the selected month:
- **Pooja Salary** / **Kunal Salary** / **Combined Salary**

### Month Picker
Dropdown in the toolbar showing all months from Jan 2026 to present. Months without data are marked with `—`.

### Toolbar Actions
- **Edit History** — opens audit modal showing changes in the last 24 hours with restore option
- **Export to Google Sheets** — sends current month's transactions to a configured Apps Script URL (optional; URL stored in localStorage)

### Trends Section (collapsible, default collapsed)
Four Chart.js charts:
1. Spend by Category (bar)
2. Daily Spend (line)
3. Expense Type breakdown (doughnut)
4. Payment Method breakdown (doughnut)

### Top Merchants (collapsible)
Table of top merchants by total spend for the selected month, with transaction count.

### Transactions List (collapsible)
Full list of transactions for the selected month with:
- **Sort** by any column
- **Filter** by text search
- **Column toggle** — show/hide columns
- **Inline edit** — click any cell to edit (chip combo for enums, date picker for dates)
- **Bulk select** — checkbox select + bulk edit field or bulk delete
- **Delete** individual rows

---

## Add Expenses Tab

### Upload
Drop or select image files (PNG, JPG, HEIC) or PDFs (up to 20MB each). Gemini AI extracts all transactions from the screenshots.

### Paste SMS / Bank Messages
Expandable card to paste raw SMS or bank notification text. Gemini extracts transactions from the text.

### Month Selector
Choose which month the transactions belong to. Defaults to current month. Used as fallback date if no date is found in the screenshot.

### Review Table
After extraction, transactions appear in an editable table:
- All fields editable via chip combos (category, payment method, expense type, etc.)
- `paid_by` auto-filled to the logged-in user's first name
- `expense_type` defaults to `{User}_Personal`
- Add rows manually with "+ Add row"
- Remove any row before saving

### Save to Tracker
Saves all reviewed transactions. Deduplication: if the same date + amount + description already exists in the DB, it is skipped (not double-saved). Shows count of saved vs skipped.

---

## Trends Tab

All-time view across all months. Respects the global person filter.

### Monthly Summary Table
One row per month (most recent first):
- Month, Total Spend (excl. CC payments), Transaction count, Pooja spend, Kunal spend

### Spend by Category Table
All categories as rows, months as columns. Features:
- **Total row** frozen at the top of the scrollable table
- **Sort** by any column (click header) — defaults to Total descending
- **Search** filter to find specific categories
- Excludes Credit Card Payment category

### Credit Card Payments Table
Separate table showing CC payment totals by month. Labelled "Excluded from expense totals" — these are bill payments, not individual expenses.

### Spend by Payment Method Table
Payment methods as rows, months as columns, with totals.

### Top 5 Categories Over Time
Stacked bar chart showing the top 5 spending categories month by month.

---

## Salary Tab

Track monthly salaries for Pooja and Kunal and see savings rate over time.

### Summary Section (all-time totals, 3 rows × 3 columns)
| | Pooja | Kunal | Combined |
|---|---|---|---|
| **Salary** | total earned | total earned | combined |
| **Spend** | total spent | total spent | combined |
| **Savings** | salary − spend | salary − spend | combined |

Savings shown in green (positive) or red (negative).

### Entry Card
- Month picker (same months as Dashboard)
- Pooja card: Monthly Salary input + optional Note
- Kunal card: Monthly Salary input + optional Note
- Save button — upserts salary for that month (safe to re-save)

### History Table
One row per month (most recent first):
- Month, Pooja Salary, Kunal Salary, Combined Salary, Pooja Spend, Kunal Spend, Total Spend, Savings, Savings %

Spend columns sourced from Trends data (same CC-excluded totals). Savings % = (Combined Salary − Total Spend) / Combined Salary.

---

## Ask AI Tab

Gemini-powered financial Q&A using your actual expense data as context.

### Preset Chips
Quick-fire questions:
- Top spend category
- Where can I improve?
- Predict next month's spend
- Am I overspending?
- Biggest splurge this month
- Savings rate check

### Free-text Input
Ask any custom question. Context sent to Gemini includes:
- All-time monthly totals
- Top 10 categories all-time
- Current month's category breakdown, paid-by split, expense type breakdown

---

## Authentication

Google OAuth — only email addresses listed in `ALLOWED_EMAILS` env var can log in. Logged-in user's name is shown in the nav bar.

---

## Settlement Logic

Used to calculate who owes whom at end of month:

| Expense Type | Meaning |
|---|---|
| `Common_50_50` | Split equally — each owes half |
| `Pooja_for_Kunal` | Pooja paid, Kunal should reimburse |
| `Kunal_for_Pooja` | Kunal paid, Pooja should reimburse |
| `Pooja_Personal` | Pooja's own expense, no settlement needed |
| `Kunal_Personal` | Kunal's own expense, no settlement needed |
| `Pooja_CreditCard_Bill` / `Kunal_CreditCard_Bill` | CC bill payments, excluded from totals |

Net = Kunal owes Pooja − Pooja owes Kunal. Positive → Kunal pays Pooja. Negative → Pooja pays Kunal.

---

## Edit History & Restore

Any create, update, or delete on a transaction is logged in `transaction_audit`. The Edit History modal shows all changes in the last 24 hours with a snapshot of the old values and a Restore button to revert.

---

## Data & Privacy

- All data stored in SQLite on the Fly.io persistent volume (`/data/expenses.db`)
- No data shared with third parties except Gemini API (transaction extraction + AI Q&A)
- Access restricted to `ALLOWED_EMAILS` list via Google OAuth
