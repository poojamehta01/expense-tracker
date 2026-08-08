# Filtered Review Selection Design

## Problem

The Review Transactions filters hide non-matching table rows, but the header checkbox still selects every transaction. The transaction badge and header-checkbox state also continue to use the full transaction count. A user filtering to `Investment` therefore sees only Investment rows but selects all 175 transactions.

## Approved Behavior

- The transaction badge shows the total count when no filter is active.
- When any review filter is active, it shows `X of Y transactions`, where X is the visible count and Y is the total count.
- The header checkbox selects only rows visible under the current filters.
- Unchecking the header checkbox deselects only currently visible rows.
- Selections made under earlier filters remain selected when the filter changes.
- The header checkbox reflects only visible rows:
  - checked when every visible row is selected;
  - indeterminate when some visible rows are selected;
  - unchecked when no visible rows are selected or no rows are visible.
- `Save N selected` saves every selected row, including selections accumulated across filters.
- Individual row selection and `Save all` behavior remain unchanged.

## Implementation Design

Add small pure helpers that identify whether filters are active and compute visible indexes from the existing transaction/filter matching rules. Use the same matching helper for rendering visibility, filtered counts, header-checkbox state, and select-all behavior so those features cannot disagree.

Filtering continues to hide rows in place; it does not reorder or remove transactions. Selection remains a set of original transaction indexes. After filtering, the UI refreshes the count and header checkbox without altering the selection set.

## Testing

Regression tests will verify:

- visible indexes and counts for an Investment category filter;
- filtered select-all adds only visible indexes;
- filtered deselect-all removes only visible indexes and preserves hidden selections;
- header checkbox checked, indeterminate, and empty-visible states;
- filter-active count labels;
- the existing selective-save suite remains green.

No API, database, or deployment configuration changes are required.
