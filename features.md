# Expense Tracker — Feature Reference

Personal expense tracker for Pooja & Kunal. Upload payment screenshots → AI extracts transactions → review & save → analyze.

---

## Navigation

The top nav bar includes:
- **Dashboard** (default) — monthly snapshot
- **Add Expenses** — upload & extract transactions
- **Trends** — all-time analysis
- **Salary** — salary tracking & savings rate
- **Budget** — monthly personal budgets, mappings, actuals, and copy workflow
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

### Monthly Budget Card

The compact card uses the Dashboard's selected month and global person filter (`All` and `Common` use Combined). For an existing budget it shows actual expense spending against the expense budget, budget remaining or overspent, and percentage used. A zero budget with positive actuals is labelled unbudgeted instead of showing an infinite percentage.

The action opens the detailed Budget tab without losing month/person context. `No budget set` means the budget request succeeded but the selected context has no rows. `Budget unavailable` means the request failed; it is not presented as an empty budget.

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
Drop or select files (up to 20MB each):
- **Images** (PNG, JPG, HEIC) or **PDFs** — Gemini AI extracts transactions from the screenshot/statement
- **CSV / XLSX / XLS** — parsed directly in the browser (no AI); rows map to transaction fields automatically

Choose an inclusive **From** and **To** date before uploading. Only transactions dated within that range reach the review table; transactions outside the range or with missing/invalid dates are excluded. After processing, the app reports how many transactions were included and excluded.

For spreadsheets, columns are matched by name (case-insensitive). Supported aliases:

| Field | Accepted column names |
|---|---|
| date | `date` |
| amount | `amount`, `amt`, `value`, `debit`, `credit` |
| description | `description`, `desc`, `merchant`, `narration`, `particulars`, `note`, `detail` |
| payment_method | `payment_method`, `method`, `mode`, `instrument` |
| paid_by | `paid_by`, `who`, `person` |
| expense_type | `expense_type`, `type` |
| category | `category`, `cat` |
| mood / impulse / remarks | exact match |

Rows with no amount (or amount ≤ 0) are skipped. All other fields default the same way as image uploads.

### Paste SMS / Bank Messages
Expandable card to paste raw SMS or bank notification text. Gemini extracts transactions from the text.

### Month Selector
Choose which month the transactions belong to. Defaults to current month and initializes the upload date range (today for the current month, or the full month for another month). It remains the fallback month for pasted bank messages.

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

## Budget Tab

Track a separate monthly budget for Pooja and Kunal while viewing a derived household total. September 2026 is seeded at:

| Person | Expense budget |
|---|---:|
| Kunal | ₹1,15,647 |
| Pooja | ₹1,11,177 |
| Combined | ₹2,26,824 |

September planned investments are ₹0. Combined is calculated from the two personal budgets and is read-only; it is never stored or edited as a third budget.

### Read the Summary Correctly

- **Expense budget** — planned ordinary expenses.
- **Actual spending** — qualifying transactions attributed through tracker-category mappings.
- **Remaining** — expense budget minus actual spending. A negative result is overspent; it is not savings.
- **Monthly savings** — recorded salary minus qualifying actual spending. Missing salary displays `—`, while a recorded zero salary remains a valid value.
- **Investments** — planned and actual investment totals, kept separate from ordinary expense budget and spending.

Budget actuals exclude `Credit Card Payment`, `Settlement`, and `Refunded`. Unmapped tracker categories are not silently assigned, and investment actuals do not increase ordinary expense actuals.

### Edit One Person's Budget

1. Select the month and then `Pooja` or `Kunal` under **Budget for**.
2. Choose **Edit budget**, change non-negative amounts, and choose **Save budget**.
3. The app replaces only that person's complete budget for that month, then refreshes both the Budget detail and Dashboard card. Editing Pooja never changes Kunal, and vice versa.

Combined disables amount and mapping controls. Use a personal view whenever a write is required.

### Edit Category Mappings

Choose **Map** beside a budget line, select zero or more tracker categories, and save. Mappings are global across months, and each tracker category may belong to only one budget line within the same `expense` or `investment` kind, preventing duplicate actuals.

The initial unambiguous mappings are:

| Budget line | Tracker category or categories |
|---|---|
| Household Expenses → House Rent | Rent |
| Household Expenses → Conveyance (Petrol/ Disel/ Cab / Bus) | Petrol, Ola/Uber |
| Lifestyle → Dining Out / Pub | Outside Food |
| LOANS & OTHER DEBTS → Vehicle Loan | Car downpayment/ emi |
| OTT Subscription → Claude/ AI/ other | Subscriptions |

Lines without mappings show **Mapping needed**. Removing all mappings is allowed and returns the line to that state.

### Copy a Prior Month

For an empty month, the app scans earlier months from most recent to oldest and offers the first populated budget it finds—not merely the immediately previous calendar month. Copying into an empty target succeeds directly. If the target is populated, the server returns a conflict and the modal requires the separate **Replace and copy** confirmation before existing target rows are replaced.

Copy applies to the selected person, or to both people from Combined. Mappings are global and are not duplicated by a month copy.

### Statuses and Empty States

- **On track** — below 80% used.
- **Watch** — 80% through 100% used.
- **Over budget** — actual spending is greater than budget.
- **No activity** — a positive budget has no actual spending.
- **Unbudgeted** — a zero budget has positive actual spending.
- **Mapping needed** — no tracker category is mapped; this takes precedence because actuals cannot be attributed.

A budget may exist with no transactions, no salary, or all-zero amounts; those are valid, explicit states. If no earlier source exists, copying stays disabled with **No earlier budget to copy**. Budget fetch failures show a readable error and never masquerade as a missing budget.

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
