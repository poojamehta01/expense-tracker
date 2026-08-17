# Bank Amount Header Normalization

## Goal

Allow CSV and spreadsheet imports to recognize common bank statement amount headers such as `Withdrawal Amt.` and `Deposit Amt.` without disrupting existing supported headers.

## Design

Normalize every spreadsheet header before field matching by trimming and lowercasing it, replacing punctuation and separators with spaces, collapsing repeated whitespace, and expanding the standalone abbreviation `amt` to `amount`. Apply the same normalization to lookup aliases so matching remains consistent.

The existing amount precedence remains unchanged: a withdrawal/debit value is selected before a deposit/credit value when both are present. Rows whose resolved amount is zero or empty continue to be filtered out. Date and description mapping remain unchanged.

## Verification

Add regression coverage using rows shaped like the reported bank CSV. Verify that `Withdrawal Amt.` resolves to the transaction amount and that `Deposit Amt.` is used when the withdrawal cell is empty. Run the focused regression test followed by the complete test suite.
