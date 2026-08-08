# Filtered Review Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Review Transactions counts and header selection operate on the currently filtered rows without discarding selections accumulated under other filters.

**Architecture:** Extract the existing review-filter predicate into pure helpers that derive visible indexes, count labels, selection transitions, and header-checkbox state. The DOM functions will consume those helpers, giving filtering, counts, selection, and saving one shared definition of “visible.”

**Tech Stack:** Vanilla JavaScript, browser DOM APIs, Node.js built-in test runner, `node:vm` for loading real frontend helpers.

## Global Constraints

- Header select-all selects or deselects only currently visible rows.
- Hidden selections remain selected when filters change.
- The count is `X of Y transactions` only while a filter is active; otherwise it is the existing total count.
- `Save N selected`, individual selection, and `Save all` retain their existing semantics.
- No API, database, dependency, or deployment configuration changes.

---

### Task 1: Pure Filter and Selection Model

**Files:**
- Create: `test/filtered-review-selection.test.js`
- Modify: `public/app.js:714-755`

**Interfaces:**
- Produces: `transactionMatchesReviewFilters(transaction, filters) -> boolean`
- Produces: `getVisibleReviewIndexes(allTransactions, filters) -> number[]`
- Produces: `hasActiveReviewFilters(filters) -> boolean`
- Produces: `formatReviewTransactionCount(visibleCount, totalCount, filtersActive) -> string`
- Produces: `updateVisibleReviewSelection(selectedIndexes, visibleIndexes, checked) -> Set<number>`
- Produces: `getVisibleReviewSelectionState(selectedIndexes, visibleIndexes) -> { checked: boolean, indeterminate: boolean }`

- [ ] **Step 1: Write failing tests for filter matching and visible indexes**

Create `test/filtered-review-selection.test.js` with a VM loader for the real helper section and literal fixtures:

```js
test('category filter exposes only Investment transaction indexes', () => {
  const rows = [
    { category: 'Investment' },
    { category: 'Outside Food' },
    { category: 'Investment' },
  ];
  assert.deepEqual(
    Array.from(getVisibleReviewIndexes(rows, { ...EMPTY_FILTERS, category: 'Investment' })),
    [0, 2]
  );
});

test('all supported filters use the existing matching semantics', () => {
  const transaction = {
    date: '1 July 2026', amount: 1000, description: 'FINZOOMERS',
    payment_method: 'UPI', paid_by: 'Pooja', expense_type: 'Pooja_Personal',
    category: 'Investment', mood: 'Happy', impulse: 'Intentional',
    remarks: 'monthly', reviewed: true,
  };
  assert.equal(transactionMatchesReviewFilters(transaction, {
    date: 'july', amount: '100', description: 'zoom', payment_method: 'UPI',
    paid_by: 'Pooja', expense_type: 'Pooja_Personal', category: 'Investment',
    mood: 'Happy', impulse: 'Intentional', remarks: 'month', reviewed: 'reviewed',
  }), true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/filtered-review-selection.test.js`

Expected: FAIL because the Review Filter Helpers marker/functions do not exist.

- [ ] **Step 3: Implement the filter helpers**

Add a `// ─── Review Filter Helpers` section before `// ─── Review Table`. Move the predicate currently embedded in `filterReviewTable()` into:

```js
function transactionMatchesReviewFilters(tx, f) {
  return (
    (!f.date || (tx.date || '').toLowerCase().includes(f.date.toLowerCase())) &&
    (!f.amount || String(tx.amount || '').includes(f.amount)) &&
    (!f.description || (tx.description || '').toLowerCase().includes(f.description.toLowerCase())) &&
    (!f.payment_method || tx.payment_method === f.payment_method) &&
    (!f.paid_by || tx.paid_by === f.paid_by) &&
    (!f.expense_type || tx.expense_type === f.expense_type) &&
    (!f.category || tx.category === f.category) &&
    (!f.mood || tx.mood === f.mood) &&
    (!f.impulse || tx.impulse === f.impulse) &&
    (!f.remarks || (tx.remarks || '').toLowerCase().includes(f.remarks.toLowerCase())) &&
    (f.reviewed === 'all' || (f.reviewed === 'reviewed' ? tx.reviewed : !tx.reviewed))
  );
}

function getVisibleReviewIndexes(allTransactions, filters) {
  return allTransactions.flatMap((transaction, index) =>
    transactionMatchesReviewFilters(transaction, filters) ? [index] : []
  );
}
```

- [ ] **Step 4: Add failing tests for count and selection helpers**

Add literal assertions:

```js
assert.equal(formatReviewTransactionCount(12, 175, true), '12 of 175 transactions');
assert.equal(formatReviewTransactionCount(175, 175, false), '175 transactions');

const selected = updateVisibleReviewSelection(new Set([1]), [0, 2], true);
assert.deepEqual(Array.from(selected).sort((a, b) => a - b), [0, 1, 2]);
assert.deepEqual(
  Array.from(updateVisibleReviewSelection(selected, [0, 2], false)),
  [1]
);

assert.deepEqual(
  getVisibleReviewSelectionState(new Set([0, 1]), [0, 2]),
  { checked: false, indeterminate: true }
);
assert.deepEqual(
  getVisibleReviewSelectionState(new Set([0, 2]), [0, 2]),
  { checked: true, indeterminate: false }
);
assert.deepEqual(
  getVisibleReviewSelectionState(new Set(), []),
  { checked: false, indeterminate: false }
);
```

- [ ] **Step 5: Run the focused test and verify RED**

Run: `node --test test/filtered-review-selection.test.js`

Expected: filter tests PASS; count/selection tests FAIL because those helpers do not exist.

- [ ] **Step 6: Implement the minimal count and selection helpers**

Implement helpers that copy the selected set before adding/removing visible indexes, treat `reviewed: 'all'` as inactive, use non-empty values for every other filter, and return unchecked/non-indeterminate when no rows are visible.

- [ ] **Step 7: Verify Task 1 and commit**

Run:

```bash
node --test test/filtered-review-selection.test.js
npm test
node --check public/app.js
git diff --check
```

Expected: all commands exit 0.

Commit:

```bash
git add public/app.js test/filtered-review-selection.test.js
git commit -m "test: model filtered review selection"
```

---

### Task 2: Wire Filter-Aware Review UI

**Files:**
- Modify: `public/app.js:714-755, 1011-1031`
- Test: `test/filtered-review-selection.test.js`

**Interfaces:**
- Consumes all pure helpers produced by Task 1.
- Updates: `filterReviewTable()`, `reviewSelectAll(checked)`, `reviewToggleRow(index, checked)`, and `renderTable(preserveSelection)`.

- [ ] **Step 1: Add a failing DOM workflow test**

Build a small real DOM-shaped harness in `test/filtered-review-selection.test.js` with three transaction rows (indexes 0 and 2 are Investment). Exercise the production `filterReviewTable()` and `reviewSelectAll(true)` functions, then assert:

```js
assert.equal(elements.txCount.textContent, '2 of 3 transactions');
assert.deepEqual(Array.from(getSelection()).sort((a, b) => a - b), [0, 2]);
assert.equal(rows[1].style.display, 'none');
assert.equal(elements.txSelectAll.checked, true);
```

Then start with hidden index 1 selected, call filtered select and deselect, and assert deselecting visible rows leaves `[1]` selected.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/filtered-review-selection.test.js`

Expected: FAIL because production select-all still replaces selection with all transaction indexes and the count remains total-only.

- [ ] **Step 3: Wire the helpers into the UI**

Update `filterReviewTable()` to compute visible indexes once, apply row visibility, set the count through `formatReviewTransactionCount()`, and update header state through `getVisibleReviewSelectionState()`.

Update `reviewSelectAll(checked)` to call:

```js
const visibleIndexes = getVisibleReviewIndexes(transactions, reviewFilters);
reviewSelected = updateVisibleReviewSelection(reviewSelected, visibleIndexes, checked);
```

Update only the visible rows' checkboxes/classes. Update `reviewToggleRow()` and `renderTable()` to derive header state from visible indexes rather than comparing selection size to total transaction count. Keep `updateReviewBulkBar()` unchanged so `Save N selected` reflects selections across filters.

- [ ] **Step 4: Verify Task 2 and commit**

Run:

```bash
node --test test/filtered-review-selection.test.js
npm test
node --check public/app.js
git diff --check
```

Expected: all tests pass, including existing selective-save tests.

Commit:

```bash
git add public/app.js test/filtered-review-selection.test.js
git commit -m "fix: select only filtered review transactions"
```

---

### Task 3: Review and Final Verification

**Files:**
- Review: `public/app.js`
- Review: `test/filtered-review-selection.test.js`
- Review: `docs/superpowers/specs/2026-08-08-filtered-review-selection-design.md`

**Interfaces:** None; this is the integration gate.

- [ ] **Step 1: Review the complete diff against the approved spec**

Check that filtered counts, filtered select/deselect, hidden selection preservation, visible-only checkbox state, and unchanged save behavior are each implemented and tested. Confirm no API or schema files changed.

- [ ] **Step 2: Run fresh verification**

Run:

```bash
npm test
node --check public/app.js
git diff --check
git status --short
```

Expected: all tests pass, syntax and whitespace checks exit 0, and status contains only intentional committed work.

- [ ] **Step 3: Request independent code review**

Review the branch from `3b92aa5` through `HEAD`, fix every Critical or Important issue, and rerun Step 2 after any change.

- [ ] **Step 4: Hand off the completed branch**

Offer the standard choices: merge locally, push and create a Pull Request, or keep the branch as-is.
