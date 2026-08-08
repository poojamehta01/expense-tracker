# Upload Auto-Categorization Design

## Goal

Improve smart categorization during spreadsheet upload by recognizing additional high-confidence merchant names and bank narration keywords found in `Acct_Statement_XXXXXXXX1130_08082026.csv`.

## Scope

This change applies only to outgoing transactions that already reach the existing `smartCategorize` flow. Incoming transaction import and direction handling are explicitly deferred.

Add these mappings:

| Description match | Category |
| --- | --- |
| `FINZOOMERS` | `Investment` |
| `GROWW` or `GROWWSTOCKS` | `Investment` (retain existing behavior) |
| `AUDIBLE RECURRING` or `APPLE MEDIA SERVICES` | `Subscriptions` |
| `PROLEVEL PERSONAL TRAINING` or the standalone keyword `GYM` | `Fitness` |
| `CAR EMI` | `Car downpayment/ emi` |
| standalone `RENT` | `Rent` |
| standalone `SETTLEMENT` | `Settlement` |
| `COOKUTENSILS` | `Home stuff` |
| `NYKAA` | `Shopping - skin+hair care` |
| `PRONTO` | `Pronto` |
| standalone `WATER` | `Outside Food` |

All mappings are case-insensitive. Personal categories continue to derive the expense type from `paid_by` through the existing `personal` behavior. Settlement follows the existing personal expense-type fallback because this change does not redesign settlement accounting.

## Approach

Extend `SMART_PATTERNS` in `public/app.js`. Use specific merchant fragments for named businesses and bounded keywords for narration labels. Add `Pronto` to the frontend and backend category lists so it is available anywhere categories are selected. Do not add broad rules for ambiguous descriptions such as `AMAZON`, `BROKERAGE`, or generic UPI payments.

The first matching rule continues to win, preserving current behavior. Existing transactions that already contain both a category and expense type remain unchanged.

## Testing

Add automated regression coverage around the real categorization function:

- Verify every approved description maps to its expected category.
- Verify investment and other personal rules derive the uploader's personal expense type.
- Verify existing Groww categorization remains intact.
- Verify Pronto is available as a category and its merchant narration maps to it.
- Verify standalone `WATER` maps to `Outside Food` without matching words such as `WATERFALL`.
- Verify ambiguous descriptions such as a generic Amazon payment remain uncategorized.
- Run the focused tests, JavaScript syntax checks, and the complete available test suite.

## Non-Goals

- Importing or storing incoming transactions.
- Adding transaction direction to the schema or UI.
- Categorizing ambiguous merchants without sufficient narration context.
- Reclassifying transactions already saved in the database.
