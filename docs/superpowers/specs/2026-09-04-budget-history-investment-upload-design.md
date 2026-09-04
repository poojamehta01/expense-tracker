# Budget History, Investment Analytics, and Upload Controls Design

## Status and scope

This design implements the approved September 4, 2026 follow-up to monthly budget tracking. It covers historical budget backfill, investment/spending separation, upload payment-method overrides, SBI debit-card support, collapsible Budget sections, Budget-only hiding of Education/Child Care, and regression verification for personal budget editing. Combined budget editing remains out of scope. No merge, push, pull request, deployment, or production data mutation is part of this work.

## Existing architecture

The application is a Node/Express service backed by SQLite and a build-free vanilla JavaScript frontend. `db.js` creates and migrates storage at startup, `server.js` owns transaction extraction and analytics routes, `budget-service.js` produces personal and derived Combined budget views, and `public/app.js` renders uploads, dashboards, tables, trends, and budgets. Tests use Node's built-in test runner, lightweight DOM fixtures, and temporary SQLite databases.

## Historical budget migration

Add a durable migration ledger table keyed by a version string. A migration named specifically for the January-August 2026 budget backfill runs in one SQLite transaction after the budget schema and September seed are available.

For each target month from `January_2026` through `August_2026`, and independently for `Pooja` and `Kunal`, the migration checks whether any target budget row exists. If none exists, it copies every September 2026 row for that person, preserving section, category, kind, amount, and sort order while receiving new timestamps. If even one target row exists, that month/person is skipped in full. This prevents partial merging and protects all pre-existing historical edits.

The migration ledger is recorded only after all guarded copies complete successfully. Reopening a migrated database does nothing. Even if the ledger entry is removed or the migration body is invoked again in tests, the per-target existence guard prevents overwrites. Combined remains a service-level derivation and no Combined rows are inserted.

Verification will assert exact row equality with September for every newly populated month/person, exact personal totals (Pooja ₹1,11,177 and Kunal ₹1,15,647; Combined derived ₹2,26,824), preservation of pre-existing target rows, absence of Combined rows, and idempotency across repeated startup.

## Spending and investment semantics

The exact transaction category `Investment` is excluded from expense analytics alongside each surface's existing non-expense exclusions. Matching remains exact and case-sensitive; similarly named categories are unchanged. Stored transactions, review tables, transaction tables, filters, editing, and settlement calculations are unchanged.

Dashboard expense totals, transaction count for those totals, payer splits, category/type/payment-method/daily charts, and top merchants use expense-qualified rows. The Dashboard response also includes a separate `investments` total computed for the selected month under the same global person predicate used by the route. Therefore All is household total, Pooja and Kunal are personal totals, and Common uses the existing Common expense-type predicate. The frontend adds an Investments KPI without folding it into Total Spend.

Trends monthly totals and counts, person splits, category breakdown, top-category chart data, and payment-method expense totals exclude Investment. Existing dedicated credit-card reporting stays dedicated. Salary-derived spend and savings continue consuming the corrected expense-oriented trends totals.

Budget actuals keep expense and investment lines separate. Investment-category transactions cannot contribute to expense-kind actuals or expense variance. Investment-kind lines continue feeding the planned-versus-actual Investments summary. Settlement SQL deliberately retains Investment transactions, because settlement behavior is explicitly unchanged.

Tests will use mixed expense, investment, settlement, and similarly named-category fixtures to prove both the exclusions and the preserved settlement behavior.

## Upload payment-method override

Add a Payment Method selector beside the upload month/from/to controls. Its first option is `Auto-detect`; the remaining options are the current configured payment-method list, including defaults and custom list entries. The selector is populated whenever list configuration loads and retains a still-valid user choice.

All file ingestion paths converge on a batch-normalization function before date filtering and review rendering. When Auto-detect is selected, the function returns extracted or spreadsheet `payment_method` values unchanged. When a concrete method is selected, it overwrites `payment_method` on every transaction produced by each chosen image, PDF, CSV, XLS, or XLSX file. The override is applied per upload run before rows enter the review array, so review/edit controls immediately show the selected value. Pasted SMS extraction bypasses this function and remains auto-detected.

The HDFC Debit reliability defect is attributed to trusting probabilistic extraction, filenames, or inconsistent spreadsheet values with no deterministic user control. The explicit batch override resolves that failure mode without adding bank-specific inference.

Tests will cover Auto-detect preservation, concrete override across spreadsheet and extracted-file paths, multiple rows/files, placement before review rendering, and the SMS bypass.

## SBI Debit Card configuration

`SBI_Debit_Card` is added only to payment-method defaults. It is included in backend extraction prompt choices, frontend default/select/filter/list surfaces, upload override choices, review and transaction editing controls, and the payment-method chip color map. It is not added to categories. Custom list behavior and API shapes remain unchanged.

## Collapsible Budget sections

Each rendered Budget section header contains a native button that toggles only the section's row wrapper. The button exposes `aria-expanded`, an accessible label, and a visible chevron or equivalent indicator. Section totals remain in the always-visible header.

A page-lifetime `Set` stores collapsed section names. Rendering reads that set, and toggling updates it before adjusting the DOM. Because the key is the server-provided section name rather than month/person/index, collapsed names persist through Budget rerenders and month/person changes for the current page session. State is intentionally not persisted to localStorage or the database. Keyboard activation follows native button behavior, with visible focus styling.

## Education/Child Care rendering

`Education/Child Care` is filtered only from the Budget section-render loop. It remains in API responses, edit/save payload construction, database rows, mapping behavior, and all summary and section totals. Hiding the row cannot alter financial calculations or remove it during a personal budget save; save logic continues to derive the complete line set from the loaded model, merging visible edited inputs with unchanged hidden values.

## Personal Budget edit regression behavior

Combined remains derived and read-only, including defensive guards against write calls. Pooja and Kunal retain Edit Budget, numeric inputs, Save, and Cancel. Entering edit mode locks month/person/global navigation that could discard edits; cancel restores the loaded values and unlocks navigation; a successful save reloads current budget data and unlocks navigation; a failed save retains inputs and remains locked. Automated regression tests and browser QA will cover both people.

## Error handling and compatibility

The migration uses an atomic transaction so a failure records no version and leaves no partially completed run. Analytics retain existing response fields and add only the Dashboard `investments` number. Missing or malformed transaction fields keep existing coercion behavior. The upload override never invents a method in Auto-detect mode and offers only configured values in concrete mode.

No new production dependency is required. Existing service-worker/cache behavior is unchanged.

## Test and QA strategy

Development follows red-green-refactor by subsystem. Add focused migration, analytics-route, budget-service, upload, payment-method, and Budget UI tests, then run the complete `npm test` suite under the repository-compatible Node runtime. Run syntax/static checks and `git diff --check`.

Manual browser QA uses a local authenticated/testable application session and covers desktop and mobile viewports in light and dark themes. It checks the upload Payment Method selector and HDFC/SBI choices, Dashboard Investments KPI under global person filters, Budget section keyboard collapse with totals visible and state preserved across month/person changes, absence of the Education/Child Care row with unchanged totals, and Pooja/Kunal edit/save/cancel/locking/navigation-unlock flows. Combined is confirmed read-only. Findings and any environmental limitations are reported exactly.

Before completion, request an independent code review of the final diff and address any verified findings. The finished branch is reported as PR-ready only if the complete test suite, browser QA, review, and repository checks pass; it is not pushed, merged, submitted as a PR, or deployed.
