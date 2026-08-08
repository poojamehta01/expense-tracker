# Selective Transaction Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save one selected review row, multiple selected rows, or all review rows while retaining any unsubmitted rows.

**Architecture:** Add small pure helpers to resolve the submitted rows/indexes and remove only submitted rows after success. Keep the existing batch endpoint and extend the current review-table selection UI with a `Save N selected` action; centralize save-button labels and disabled state in one renderer.

**Tech Stack:** Vanilla browser JavaScript, HTML/CSS, Node.js built-in test runner, Node.js `vm` for exercising production functions.

## Global Constraints

- Keep `POST /api/transactions` and the database schema unchanged.
- Keep select-all, filtering, and bulk-edit semantics unchanged.
- Submitted duplicates are removed from the review table because they already exist in the tracker.
- Failed requests preserve all transactions and the selected indexes.
- Every save control is disabled while a request is in flight.
- Do not add per-row Save buttons or automatic saving on review.
- Use `poojamehta01 <poojamehta1197@gmail.com>` for commits.

---

### Task 1: Pure selection and removal behavior

**Files:**
- Create: `test/selective-save.test.js`
- Modify: `public/app.js` near the Save to Tracker section

**Interfaces:**
- Produces: `resolveSavePlan(allTransactions, selectedIndexes, mode)` returning `{ rows, indexes }` in table order.
- Produces: `removeSubmittedRows(allTransactions, submittedIndexes)` returning the remaining rows without mutating the input.
- Consumes: `mode` is exactly `'selected'` or `'all'`; `selectedIndexes` is any iterable of integer indexes.

- [ ] **Step 1: Write failing behavior tests against the production helper section**

Load the section between `// ─── Selective Save Helpers` and `// ─── Save to Tracker` from `public/app.js` into a `vm` context, exposing both functions. Add literal test cases:

```js
const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

assert.deepEqual(resolveSavePlan(rows, new Set([2]), 'selected'), {
  rows: [{ id: 'c' }],
  indexes: [2],
});

assert.deepEqual(resolveSavePlan(rows, new Set([3, 1]), 'selected'), {
  rows: [{ id: 'b' }, { id: 'd' }],
  indexes: [1, 3],
});

assert.deepEqual(resolveSavePlan(rows, new Set([1]), 'all'), {
  rows,
  indexes: [0, 1, 2, 3],
});

assert.deepEqual(removeSubmittedRows(rows, [1, 3]), [
  { id: 'a' },
  { id: 'c' },
]);
assert.deepEqual(rows, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
```

Also assert invalid/out-of-range selected indexes are ignored and an empty selection resolves to empty arrays.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/selective-save.test.js`

Expected: FAIL because the selective-save helper section/functions do not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

Add a self-contained helper section:

```js
function resolveSavePlan(allTransactions, selectedIndexes, mode) {
  const sourceIndexes = mode === 'all'
    ? allTransactions.map((_, index) => index)
    : [...selectedIndexes]
        .filter(index => Number.isInteger(index) && index >= 0 && index < allTransactions.length)
        .sort((a, b) => a - b);
  const indexes = [...new Set(sourceIndexes)];
  return { rows: indexes.map(index => allTransactions[index]), indexes };
}

function removeSubmittedRows(allTransactions, submittedIndexes) {
  const submitted = new Set(submittedIndexes);
  return allTransactions.filter((_, index) => !submitted.has(index));
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test test/selective-save.test.js
npm test
node --check public/app.js
```

Expected: all tests pass and syntax validation exits successfully.

- [ ] **Step 5: Commit the helper behavior**

```bash
git add public/app.js test/selective-save.test.js
git commit -m "feat: add selective save helpers"
```

### Task 2: Review-table selective save workflow

**Files:**
- Modify: `public/index.html` review bulk bar and save buttons
- Modify: `public/app.js` review selection and save workflow
- Modify: `test/selective-save.test.js`

**Interfaces:**
- Consumes: `resolveSavePlan()` and `removeSubmittedRows()` from Task 1.
- Produces: `updateSaveControls(isSaving = false)` updates `saveBtn`, `saveBtn2`, and `saveSelectedBtn` labels/disabled states.
- Produces: `saveToTracker(mode = 'all')` submits the requested scope and updates review state only after success.

- [ ] **Step 1: Add failing label and workflow tests**

Extend the VM harness with fake button elements and assert `updateSaveControls(false)` produces:

```js
saveBtn.textContent === 'Save all (4)'
saveBtn2.textContent === 'Save all (4) →'
saveSelectedBtn.textContent === 'Save 2 selected'
```

Assert `updateSaveControls(true)` disables all three buttons and shows `Saving…` on each. Exercise `saveToTracker('selected')` with a fake successful `fetch` returning `{ saved: 1, skipped: 1 }`; verify only selected request rows are sent, all submitted rows are removed, selection is cleared, and unselected rows remain. Exercise a rejected request and verify rows and selection remain unchanged. Exercise `saveToTracker('all')` and verify all rows are submitted and the review table is hidden after success.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/selective-save.test.js`

Expected: FAIL because the controls and scoped workflow do not exist.

- [ ] **Step 3: Add the selected-save control and explicit save-all actions**

In `public/index.html`:

```html
<button class="btn-primary small" id="saveSelectedBtn" onclick="saveToTracker('selected')">Save selected</button>
```

Place it inside `.bulk-actions`. Change both existing calls to `saveToTracker('all')`; initial labels may remain static because `renderTable()` immediately calls `updateSaveControls()`.

- [ ] **Step 4: Centralize button state and implement scoped save**

Call `updateSaveControls()` from `renderTable()`, `reviewToggleRow()`, `reviewSelectAll()`, `reviewClearSelection()`, and after final request cleanup. In `saveToTracker(mode)`, snapshot the plan before awaiting `fetch`, reject an empty selected plan with `alert('Select at least one transaction to save.')`, submit `plan.rows`, and only on success assign either `[]` for all or `removeSubmittedRows(transactions, plan.indexes)` for selected. Clear `reviewSelected`, invalidate trends, refresh months, and either hide an empty table or render remaining rows. In `catch`, show the existing error result without mutating state. Use `finally` to restore controls.

- [ ] **Step 5: Run complete verification**

Run:

```bash
npm test
node --check public/app.js
node --check server.js
git diff --check
```

Expected: all tests pass with no syntax or whitespace errors.

- [ ] **Step 6: Commit the UI workflow**

```bash
git add public/index.html public/app.js test/selective-save.test.js
git commit -m "feat: save selected review transactions"
```
