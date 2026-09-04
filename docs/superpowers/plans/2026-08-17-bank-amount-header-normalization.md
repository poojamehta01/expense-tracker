# Bank Amount Header Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import bank CSV rows whose amount columns use abbreviated, punctuated headers such as `Withdrawal Amt.` and `Deposit Amt.`.

**Architecture:** Keep spreadsheet parsing in `public/app.js`. Introduce one header-normalization helper used both when CSV/XLSX row keys are normalized and when aliases are looked up, preserving current amount precedence and row filtering.

**Tech Stack:** Browser JavaScript, Node.js built-in test runner, `node:vm` test harness.

## Global Constraints

- Existing supported spreadsheet headers must continue to work.
- Withdrawal/debit takes precedence over deposit/credit when both contain values.
- Rows with no positive resolved amount remain filtered out.
- Date and description mapping behavior remains unchanged.

---

### Task 1: Normalize bank amount headers

**Files:**
- Create: `test/spreadsheet-import.test.js`
- Modify: `public/app.js:533-615`

**Interfaces:**
- Consumes: `parseCSVToObjects(text: string): object[]` and `mapSpreadsheetRow(rawRow: object): object` from `public/app.js`.
- Produces: `normalizeSpreadsheetHeader(header: unknown): string`, returning a lowercase, punctuation-free, whitespace-collapsed header with standalone `amt` expanded to `amount`.

- [ ] **Step 1: Write the failing regression tests**

Create a VM harness that extracts the spreadsheet parsing section from `public/app.js`, then assert:

```js
test('maps Withdrawal Amt. as the transaction amount', () => {
  const [row] = parseCSVToObjects([
    'Date,Narration,Withdrawal Amt.,Deposit Amt.',
    '01/07/26,UPI-SWIGGY,591,',
  ].join('\n'));
  assert.equal(mapSpreadsheetRow(row).amount, 591);
});

test('maps Deposit Amt. when withdrawal is empty', () => {
  const [row] = parseCSVToObjects([
    'Date,Narration,Withdrawal Amt.,Deposit Amt.',
    '06/07/26,SALARY,,15460',
  ].join('\n'));
  assert.equal(mapSpreadsheetRow(row).amount, 15460);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/spreadsheet-import.test.js`

Expected: both amount assertions fail because the current header keys retain `amt.` while aliases expect `amount`.

- [ ] **Step 3: Implement minimal normalization**

Add:

```js
function normalizeSpreadsheetHeader(header) {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bamt\b/g, 'amount')
    .replace(/\s+/g, ' ')
    .trim();
}
```

Use it for row keys in `mapSpreadsheetRow` and for each alias inside `find`. This makes `Withdrawal Amt.` and `withdrawal amount` resolve to the same key without changing alias order.

- [ ] **Step 4: Run focused and full verification**

Run: `node --test test/spreadsheet-import.test.js`

Expected: 2 tests pass.

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 5: Verify the reported CSV fixture**

Run a read-only Node harness against `/Users/poojamehta/Downloads/Acct Statement_8793_08082026_14.49.56 - Sheet 1.csv` and assert that 128 parsed rows have positive amounts.

- [ ] **Step 6: Commit the implementation**

```bash
git add public/app.js test/spreadsheet-import.test.js docs/superpowers/plans/2026-08-17-bank-amount-header-normalization.md
git commit -m "fix: parse abbreviated bank amount headers"
```
