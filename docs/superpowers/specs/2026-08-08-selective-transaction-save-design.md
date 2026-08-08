# Selective Transaction Save Design

## Goal

Let users save one selected review row, multiple selected rows, or every reviewed transaction without losing rows they have not saved yet.

## User Interface

- Rename both existing `Save to Tracker` controls to `Save all (N)`, where `N` is the current number of review transactions.
- Reuse the existing row checkboxes and selection state.
- When at least one row is selected, show a primary action in the existing bulk-action bar labeled `Save 1 selected` or `Save N selected`.
- Keep bulk editing and clearing the selection available alongside the selective-save action.
- Disable every save control while a save request is in progress to prevent duplicate submissions.

## Save Behavior

Both actions use the existing `POST /api/transactions` batch endpoint:

- `Save selected` submits only transactions whose indexes are in `reviewSelected`.
- `Save all` submits the complete `transactions` array.
- A one-row selection is sent as a one-item batch; no new API route is needed.

After a successful selected save, remove all submitted rows from the review table, including rows the server reports as duplicates, because those transactions already exist in the tracker. Preserve every unselected row, clear the selection, re-render the table, update both save-all counts, invalidate trends, and refresh the month list.

After a successful save-all request, clear and hide the review table as today. If the server or network request fails, retain all rows and the current selection so the user can retry.

## State and Index Safety

Selected rows are identified from a snapshot of `reviewSelected` taken immediately before the request. When removing submitted rows, filter the original array by those indexes rather than repeatedly splicing it, avoiding index shifts. Re-rendering then assigns contiguous indexes to the remaining rows.

The existing select-all behavior remains unchanged: it selects every transaction, including rows currently hidden by filters.

## Feedback

The success message reports the submitted scope and the server's saved/duplicate counts. Examples:

- `1 transaction saved to Tracker!`
- `4 transactions saved to Tracker! (1 duplicate skipped)`

If selected rows remain visible after an error, the error message appears in the existing result area.

## Testing

Add automated coverage for:

- Resolving a one-row selection to a one-item request.
- Resolving multiple selected indexes in table order.
- Resolving save-all to every transaction.
- Removing only submitted selected rows after success.
- Removing submitted duplicate rows as already present.
- Retaining all rows and selection after request failure.
- Clearing/hiding the table after save all.
- Updating `Save all (N)` and `Save N selected` labels as state changes.
- Disabling and restoring all save controls around an in-flight request.

## Non-Goals

- Changing the transaction API or database schema.
- Adding per-row Save buttons.
- Changing filters, selection semantics, or bulk-edit behavior.
- Automatically saving rows when they are marked reviewed.
