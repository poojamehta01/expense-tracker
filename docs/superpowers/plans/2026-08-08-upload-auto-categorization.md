# Upload Auto-Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved upload-time category mappings, including the new `Pronto` category, without changing incoming-transaction behavior.

**Architecture:** Keep the existing first-match-wins `SMART_PATTERNS` classifier in `public/app.js` and add narrowly scoped regular expressions. Exercise the real classifier from a Node test by loading only the self-contained smart-categorization section into a VM context. Keep the frontend and backend category enums synchronized.

**Tech Stack:** Vanilla browser JavaScript, Node.js built-in test runner, Node.js `vm`, Express.

## Global Constraints

- Incoming transaction import and direction handling are out of scope.
- Matches are case-insensitive.
- Existing rows with both `category` and `expense_type` remain unchanged.
- Do not auto-tag generic `AMAZON`, `BROKERAGE`, or generic UPI descriptions.
- Use `poojamehta01 <poojamehta1197@gmail.com>` as the author for implementation commits.

---

### Task 1: Regression coverage and smart patterns

**Files:**
- Create: `test/smart-categorization.test.js`
- Modify: `package.json`
- Modify: `public/app.js` in the `SMART_PATTERNS` section

**Interfaces:**
- Consumes: `smartCategorize(tx: object): void` and `SMART_PATTERNS` from the smart-categorization section of `public/app.js`.
- Produces: upload-time defaults on `tx.category` and `tx.expense_type`; `npm test` runs the Node regression suite.

- [ ] **Step 1: Write the failing categorization tests**

Create a Node test which reads `public/app.js`, extracts the text from `const SMART_PATTERNS = [` through the end of `smartCategorize`, evaluates it with `vm.runInContext`, and exposes `smartCategorize` to the test context. Use table-driven cases for these descriptions and expected categories:

```js
[
  ['UPI-AUTOPAY-FINZOOMERS SERVICES -FINZOOMERS.CF@ICICI-SUBSCHARGE', 'Investment'],
  ['UPI-AUTOPAY-GROWW-GROWWSTOCKS.ELEMENTS@ICICI-DEBIT FOR STOCKS', 'Investment'],
  ['UPI-AUTOPAY-AMAZON INDIA-AUDIBLE RECURRING', 'Subscriptions'],
  ['UPI-AUTOPAY-APPLE MEDIA SERVICES-EXECUTION TEST', 'Subscriptions'],
  ['UPI-PROLEVEL PERSONAL TRAINING-GYM', 'Fitness'],
  ['UPI-KUNAL-CAR EMI', 'Car downpayment/ emi'],
  ['UPI-KUNAL-RENT', 'Rent'],
  ['UPI-KUNAL-JUNE SETTLEMENT', 'Settlement'],
  ['UPI-DEVAKKI-COOKUTENSILS', 'Home stuff'],
  ['UPI-NYKAA ON TREND-PAYMENT FROM PHONE', 'Shopping - skin/hair care'],
  ['UPI-PRONTO-PAYMENT FOR UPI', 'Pronto'],
  ['UPI-CAFE-WATER', 'Outside Food'],
]
```

Assert a FinZoomers transaction paid by Kunal receives `Kunal_Personal`. Assert `UPI-AMAZON-PAYMENT FROM PHONE` and `UPI-WATERFALL RESORT-PAYMENT` remain uncategorized. Assert a pre-categorized transaction is not overwritten.

Update `package.json`:

```json
"scripts": {
  "start": "node server.js",
  "test": "node --test test/*.test.js"
}
```

- [ ] **Step 2: Run the tests and verify the new cases fail**

Run: `npm test`

Expected: the existing Groww case passes; the newly approved mappings fail because their rules do not exist.

- [ ] **Step 3: Add the minimal smart patterns**

Extend `SMART_PATTERNS` with case-insensitive expressions. Use word boundaries for `GYM`, `CAR EMI`, `RENT`, `SETTLEMENT`, and `WATER`; use merchant fragments for FinZoomers, Audible, Apple Media Services, Prolevel, Nykaa, and Pronto. Set `personal: true` except for `WATER`, which uses `expense_type: 'Common_50_50'`, and `SETTLEMENT`, which relies on the existing personal fallback.

- [ ] **Step 4: Run focused tests and syntax verification**

Run:

```bash
npm test
node --check public/app.js
```

Expected: all categorization tests pass and the syntax check exits successfully.

- [ ] **Step 5: Commit the tested classifier change**

```bash
git add package.json test/smart-categorization.test.js public/app.js
git commit -m "feat: expand upload auto-categorization"
```

### Task 2: Register the Pronto category

**Files:**
- Modify: `public/app.js` in `DEFAULT_CATEGORIES`
- Modify: `server.js` in `CATEGORIES`
- Modify: `test/smart-categorization.test.js`

**Interfaces:**
- Consumes: frontend `DEFAULT_CATEGORIES` and backend `CATEGORIES` arrays.
- Produces: `Pronto` as a selectable category in the browser and an allowed category in the Gemini extraction prompt.

- [ ] **Step 1: Add a failing category synchronization test**

Read `public/app.js` and `server.js`, extract each category array, and assert that both contain `Pronto`. Also assert the arrays contain the same set of values so future drift is detected.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test`

Expected: failure reports that `Pronto` is missing from both category lists.

- [ ] **Step 3: Add Pronto to both category lists**

Insert `'Pronto'` next to the other merchant-specific categories in `DEFAULT_CATEGORIES` and `CATEGORIES`. Do not rename or reorder unrelated categories.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm test
node --check public/app.js
node --check server.js
git diff --check
```

Expected: all commands exit successfully with no test failures or whitespace errors.

- [ ] **Step 5: Commit the category registration**

```bash
git add public/app.js server.js test/smart-categorization.test.js
git commit -m "feat: add Pronto expense category"
```
