# Monthly Budget Tracking Design

**Date:** 2026-09-03
**Status:** Approved for implementation planning
**Source workbooks:** `Yearly Budget Sheet.xlsx` and `Monthly Expense Sheet -INR .xlsx`

## Purpose

Add a monthly budgeting workflow to Expense Tracker. Pooja and Kunal can set separate budgets using the financial adviser's sheet categories, see a combined household view, map each budget line to existing transaction categories, and compare budget, actual spending, and savings throughout the month.

## Product Decisions

- Preserve the financial adviser's sheet category labels in the budget UI.
- Store separate budgets for Pooja and Kunal; derive Combined rather than storing it.
- Allow each sheet category to map to one or more existing transaction categories.
- Make mappings editable in the UI.
- Keep investments separate from ordinary expenses.
- Show both budget variance and net monthly savings because they answer different questions.
- Use a hybrid interface: a compact budget-health card on Dashboard and a dedicated Budget tab for management and analysis.

## Definitions

- **Expense budget:** Sum of budget lines classified as ordinary expense.
- **Actual spending:** Transactions matched through a budget line's mappings for the selected month and person.
- **Budget remaining:** Expense budget minus actual spending. A negative value is displayed as overspent.
- **Budget usage:** Actual spending divided by expense budget. For a zero budget with positive actual spending, the row is overspent without displaying a misleading percentage.
- **Net monthly savings:** Recorded salary minus qualifying actual spending.
- **Planned investments:** Sum of investment budget lines.
- **Actual investments:** Transactions matched to investment budget lines.
- **Combined:** Sum of Pooja and Kunal values for the same month. Combined values are never separately editable.

Actual spending excludes transactions categorized as `Credit Card Payment`, `Settlement`, or `Refunded`. These exclusions prevent bill repayment and settlements from being counted as consumption; refunded transactions do not consume a budget. Investment actuals are calculated separately and are not included in ordinary expense actuals.

## September 2026 Seed Budget

Seed September 2026 from the `budget` sheet in `Monthly Expense Sheet -INR .xlsx`. Blank cells are imported as zero. Text placeholders, including Spotify's `todo`, are imported as zero and remain editable.

| Section | Sheet category | Kunal | Pooja |
|---|---|---:|---:|
| Household Expenses | Protien | ₹10,000 | ₹10,000 |
| Household Expenses | Vegitble / Fruits/Groceries (Canteen) | ₹5,000 | ₹5,000 |
| Household Expenses | Milk | ₹0 | ₹0 |
| Household Expenses | House Rent | ₹21,000 | ₹21,000 |
| Household Expenses | Repair / Maintainance / Parking | ₹0 | ₹0 |
| Household Expenses | Conveyance (Petrol/ Disel/ Cab / Bus) | ₹2,500 | ₹2,500 |
| Household Expenses | Gas / LPG / MNGL | ₹200 | ₹200 |
| Household Expenses | Medicine (All family) | ₹500 | ₹500 |
| Household Expenses | Electricity | ₹3,000 | ₹3,000 |
| Household Expenses | Mobile / Wifi / Gadgets | ₹3,900 | ₹3,900 |
| Household Expenses | Newspaper | ₹0 | ₹0 |
| Household Expenses | Maid / Laundry / Driver | ₹3,500 | ₹3,500 |
| Household Expenses | Other (Specify) | ₹0 | ₹0 |
| Lifestyle | Cloths | ₹0 | ₹0 |
| Lifestyle | Shoes | ₹0 | ₹0 |
| Lifestyle | Saloon / Spa | ₹1,000 | ₹6,000 |
| Lifestyle | Parlour / Cosmetics | ₹500 | ₹5,000 |
| Lifestyle | Dining Out / Pub | ₹500 | ₹10,000 |
| Lifestyle | Gym / Yoga / Aerobics / Zumba | ₹0 | ₹0 |
| Lifestyle | Travelling / Trip | ₹20,000 | ₹20,000 |
| Lifestyle | Movies / Books | ₹0 | ₹1,000 |
| Lifestyle | Gifts | ₹5,000 | ₹0 |
| Lifestyle | Smoking / Liquor | ₹0 | ₹0 |
| Lifestyle | Donations | ₹5,000 | ₹0 |
| Lifestyle | Hobbies / Skills / Learnings | ₹0 | ₹0 |
| Lifestyle | Other (Specify) | ₹0 | ₹0 |
| Education/Child Care | School Fees | ₹0 | ₹0 |
| Education/Child Care | Tution Fees | ₹0 | ₹0 |
| Education/Child Care | Stationary | ₹0 | ₹0 |
| Education/Child Care | Sports / Hobbies | ₹0 | ₹0 |
| Education/Child Care | Toys / Games | ₹0 | ₹0 |
| Education/Child Care | Other (Specify) | ₹0 | ₹0 |
| LOANS & OTHER DEBTS | Home Loan/ EMI | ₹0 | ₹0 |
| LOANS & OTHER DEBTS | Personal Loan | ₹0 | ₹0 |
| LOANS & OTHER DEBTS | Vehicle Loan | ₹15,460 | ₹15,460 |
| LOANS & OTHER DEBTS | Credit Card | ₹0 | ₹0 |
| LOANS & OTHER DEBTS | Education Loan | ₹18,587 | ₹0 |
| LOANS & OTHER DEBTS | Other (Gold Loan / Morgege Loan) | ₹0 | ₹0 |
| OTT Subscription | Netflix | ₹0 | ₹162 |
| OTT Subscription | Disney Hotstar | ₹0 | ₹0 |
| OTT Subscription | Amazon Prime Video | ₹0 | ₹0 |
| OTT Subscription | Jio Cinema Premium | ₹0 | ₹0 |
| OTT Subscription | Sony LIV | ₹0 | ₹0 |
| OTT Subscription | Claude/ AI/ other | ₹0 | ₹3,200 |
| OTT Subscription | Linkedin | ₹0 | ₹0 |
| OTT Subscription | Fly.io | ₹0 | ₹755 |
| OTT Subscription | Naukari | ₹0 | ₹0 |
| OTT Subscription | Spotify | ₹0 | ₹0 |

Seed totals must reconcile to the workbook:

- Kunal: Household ₹49,600 + Lifestyle ₹32,000 + Loans ₹34,047 + OTT ₹0 = ₹1,15,647.
- Pooja: Household ₹49,600 + Lifestyle ₹42,000 + Loans ₹15,460 + OTT ₹4,117 = ₹1,11,177.
- Combined expense budget: ₹2,26,824.
- Planned investments: ₹0 for both people in the September `budget` sheet.

## Data Model

### `budgets`

One row per month, person, section, and sheet category.

| Column | Type | Rules |
|---|---|---|
| `id` | INTEGER | Primary key, autoincrement |
| `month` | TEXT | Existing `Month_YYYY` convention |
| `person` | TEXT | `Pooja` or `Kunal` |
| `section` | TEXT | Sheet section label |
| `category` | TEXT | Sheet category label |
| `kind` | TEXT | `expense` or `investment` |
| `amount` | REAL | Required, finite, and greater than or equal to zero |
| `sort_order` | INTEGER | Stable order matching the sheet |
| `created_at` | TEXT | SQLite timestamp |
| `updated_at` | TEXT | SQLite timestamp |

Unique constraint: `(month, person, section, category)`.

### `budget_category_mappings`

One row per sheet category to tracker-category mapping. Mappings apply across months so they do not need to be recreated every month.

| Column | Type | Rules |
|---|---|---|
| `id` | INTEGER | Primary key, autoincrement |
| `section` | TEXT | Sheet section label |
| `budget_category` | TEXT | Sheet category label |
| `transaction_category` | TEXT | Existing or custom tracker category |
| `created_at` | TEXT | SQLite timestamp |

Unique constraint: `(section, budget_category, transaction_category)`.

The pair `(section, budget_category)` is used because labels such as `Other (Specify)` occur in multiple sections.

## API Design

All routes use the existing `requireAuth` middleware.

### `GET /api/budget?month=September_2026&person=all`

Returns budget lines, mapping-derived actuals, section totals, and summary totals. `person` accepts `Pooja`, `Kunal`, or `all`; `all` returns the derived Combined view.

The response contains:

- `month`, `person`, and `hasBudget`.
- `summary`: expense budget, actual spending, variance, usage, salary, net monthly savings, planned investments, and actual investments.
- `sections`: ordered sections containing ordered lines with budget, actual, variance, usage, status, kind, and mappings.
- `unmappedCount`.

### `PUT /api/budget/:month`

Replaces the submitted person's budget lines in a transaction. The request contains `person` and a complete `lines` array. Validate month format, supported person, unique section/category pairs, `kind`, and all numeric amounts before writing anything.

### `PUT /api/budget-mappings`

Replaces mappings for one `(section, budgetCategory)` pair. Every mapped category must exist in the combined default and custom category lists. An empty mapping is allowed and surfaces as `Mapping needed`.

### `POST /api/budget/:month/copy`

Copies both people or one selected person's lines from `sourceMonth` into the target month. Reject a source with no budget. If the target already contains budget rows, require `replace: true`; otherwise return a conflict response that the UI turns into a confirmation.

## Actual-Spend Attribution

For a selected month and person:

1. Load that person's budget lines.
2. Load global mappings for the lines.
3. Aggregate qualifying transactions by tracker category and `paid_by`.
4. Attribute a tracker category to every budget line mapped to it.
5. Prevent ambiguous double counting: the mapping API rejects assigning the same tracker category to more than one budget line of the same `kind`.
6. For Combined, calculate each person's budget and actuals first, then sum corresponding lines.

Person-specific actuals use `paid_by`, matching the app's existing global person filter. Common expenses therefore remain attributed to the person who paid them; Combined always includes both.

## User Interface

### Navigation

Add a `Budget` tab alongside Dashboard, Add Expenses, Trends, Salary, and Ask AI. The tab follows existing vanilla HTML, CSS, and JavaScript patterns without adding a frontend framework.

### Dashboard Budget Card

Place a compact card below the primary KPI row for the selected month and global person filter. It shows:

- Actual spending of expense budget.
- Remaining or overspent amount.
- Progress bar and usage percentage when a positive budget exists.
- A link that opens the Budget tab with the same month and person context.

If the selected month has no budget, show `No budget set` and a `Create budget` action. If budget is zero and actual spending is positive, show the actual amount as unbudgeted spending rather than an infinite percentage.

### Budget Tab

The tab contains:

1. Month selector and person selector (`Pooja`, `Kunal`, `Combined`).
2. Actions: `Edit budget` and `Copy previous month`.
3. Summary cards for expense budget, actual spending, remaining/overspent, net monthly savings, planned investments, and actual investments.
4. Sectioned budget table with columns: Category, Budget, Actual, Variance, Used, and Status.
5. Expandable mapping editor on each category row.

Combined is read-only. Edit mode is available only for Pooja or Kunal. Amounts save as one validated replacement request. Mappings can be edited from either personal view and apply globally.

Status rules:

- `On track`: usage below 80%.
- `Watch`: usage from 80% through 100%.
- `Over budget`: actual is greater than budget.
- `No activity`: budget is positive and actual is zero.
- `Unbudgeted`: budget is zero and actual is positive.
- `Mapping needed`: the line has no mapping; this takes precedence because actuals cannot be attributed.

Use restrained green, amber, and red treatments that work in the existing light and dark modes. The table becomes stacked category cards on narrow screens so labels and currency values remain legible.

## Empty, Error, and Loading States

- A month without budget data shows an explanation and a `Copy previous month` action when a prior budget exists.
- A month may have budget data before transactions or salary exist; zeros and `Salary not recorded` are displayed without hiding the budget.
- Loading states prevent duplicate saves.
- Failed saves keep unsaved input visible and show a readable error.
- Negative values, non-finite numbers, duplicate rows, invalid kinds, invalid months, and invalid people are rejected on the server.
- Replacing a populated target month through copy requires explicit confirmation.
- Rows without mappings remain saved and visibly flagged.

## Files and Responsibilities

- `db.js`: create the two budget tables and seed September 2026 idempotently.
- `server.js`: validation, aggregation helpers, budget APIs, mapping APIs, and copy behavior.
- `public/index.html`: Budget navigation, Dashboard card container, Budget tab structure.
- `public/app.js`: budget state, loading, rendering, editing, mapping controls, copy flow, and Dashboard integration.
- `public/style.css`: responsive Budget tab, status, progress, light mode, and dark mode styling.
- `test/budget-api.test.js`: schema, seeding, validation, calculation, mapping, exclusion, combined, and copy tests.
- `test/budget-ui.test.js`: pure rendering/calculation helpers where practical in the current test setup.
- `CLAUDE.md`, `docs/architecture.md`, and `features.md`: document schema, routes, UI flow, and user-facing behavior after implementation.

## Testing and Acceptance Criteria

- September seed rows and totals reconcile exactly to ₹1,15,647 for Kunal, ₹1,11,177 for Pooja, and ₹2,26,824 Combined.
- Re-running database initialization does not duplicate seed rows or mappings.
- A mapped qualifying transaction appears in the correct personal and Combined actual totals.
- Excluded categories do not consume expense budgets.
- One tracker category cannot map to two expense lines or two investment lines.
- Invalid budget replacement requests do not partially update a month.
- Copying into an empty month works; copying over populated data requires explicit replacement.
- Combined equals Pooja plus Kunal for every summary and category line.
- Net monthly savings uses recorded salary minus qualifying actual spending.
- Expense and investment totals remain separate.
- The Dashboard card links to the matching Budget month and person.
- Missing budgets, zero budgets, missing mappings, missing transactions, and missing salaries render without misleading percentages or broken UI.
- Existing transaction, trends, salary, and upload tests continue to pass.
- The new interface is manually verified on desktop and mobile widths in both light and dark modes.

## Out of Scope

- Automatic AI recommendations or budget forecasts.
- Notifications and scheduled alerts.
- Prorating the monthly budget based on the day of the month.
- Importing arbitrary future workbook layouts.
- Editing the source Excel workbooks.
