const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EMPTY_FILTERS = {
  date: '', amount: '', description: '', payment_method: '', paid_by: '',
  expense_type: '', category: '', mood: '', impulse: '', remarks: '', reviewed: 'all',
};

function loadReviewFilterHelpers() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('// ─── Review Filter Helpers');
  const end = source.indexOf('// ─── Review Table', start);

  assert.notEqual(start, -1, 'review filter helpers must exist');
  assert.notEqual(end, -1, 'review filter helpers must have an end marker');

  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end)}\n` +
      `globalThis.helpersForTest = {
        transactionMatchesReviewFilters,
        getVisibleReviewIndexes,
        hasActiveReviewFilters: typeof hasActiveReviewFilters === 'undefined' ? undefined : hasActiveReviewFilters,
        formatReviewTransactionCount: typeof formatReviewTransactionCount === 'undefined' ? undefined : formatReviewTransactionCount,
        updateVisibleReviewSelection: typeof updateVisibleReviewSelection === 'undefined' ? undefined : updateVisibleReviewSelection,
        getVisibleReviewSelectionState: typeof getVisibleReviewSelectionState === 'undefined' ? undefined : getVisibleReviewSelectionState,
      };`,
    context
  );
  return context.helpersForTest;
}

test('category filter exposes only Investment transaction indexes', () => {
  const { getVisibleReviewIndexes } = loadReviewFilterHelpers();
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
  const { transactionMatchesReviewFilters } = loadReviewFilterHelpers();
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

test('formats a filtered count differently from an unfiltered count', () => {
  const { formatReviewTransactionCount } = loadReviewFilterHelpers();

  assert.equal(formatReviewTransactionCount(12, 175, true), '12 of 175 transactions');
  assert.equal(formatReviewTransactionCount(175, 175, false), '175 transactions');
  assert.equal(formatReviewTransactionCount(1, 1, false), '1 transaction');
});

test('detects active filters while treating reviewed all as inactive', () => {
  const { hasActiveReviewFilters } = loadReviewFilterHelpers();

  assert.equal(hasActiveReviewFilters(EMPTY_FILTERS), false);
  assert.equal(hasActiveReviewFilters({ ...EMPTY_FILTERS, reviewed: 'reviewed' }), true);
  assert.equal(hasActiveReviewFilters({ ...EMPTY_FILTERS, category: 'Investment' }), true);
});

test('selects and deselects only visible indexes without mutating the source selection', () => {
  const { updateVisibleReviewSelection } = loadReviewFilterHelpers();
  const source = new Set([1]);
  const selected = updateVisibleReviewSelection(source, [0, 2], true);

  assert.deepEqual(Array.from(selected).sort((a, b) => a - b), [0, 1, 2]);
  assert.deepEqual(Array.from(updateVisibleReviewSelection(selected, [0, 2], false)), [1]);
  assert.deepEqual(Array.from(source), [1]);
});

test('derives header selection state from visible indexes', () => {
  const { getVisibleReviewSelectionState } = loadReviewFilterHelpers();

  assert.deepEqual(
    { ...getVisibleReviewSelectionState(new Set([0, 1]), [0, 2]) },
    { checked: false, indeterminate: true }
  );
  assert.deepEqual(
    { ...getVisibleReviewSelectionState(new Set([0, 2]), [0, 2]) },
    { checked: true, indeterminate: false }
  );
  assert.deepEqual(
    { ...getVisibleReviewSelectionState(new Set(), []) },
    { checked: false, indeterminate: false }
  );
});

function createClassList() {
  const classes = new Set();
  return {
    add: name => classes.add(name),
    remove: name => classes.delete(name),
    toggle: (name, enabled) => {
      if (enabled) classes.add(name);
      else classes.delete(name);
    },
    contains: name => classes.has(name),
  };
}

function createReviewWorkflow(initialSelection = []) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const helpersStart = source.indexOf('// ─── Review Filter Helpers');
  const helpersEnd = source.indexOf('// ─── Review Table', helpersStart);
  const filterStart = source.indexOf('function filterReviewTable()');
  const filterEnd = source.indexOf('\nfunction buildFilterRow()', filterStart);
  const selectAllStart = source.indexOf('function reviewSelectAll(checked)');
  const selectAllEnd = source.indexOf('\nfunction reviewClearSelection()', selectAllStart);

  assert.notEqual(helpersStart, -1, 'review filter helpers must exist');
  assert.notEqual(helpersEnd, -1, 'review filter helpers must have an end marker');
  assert.notEqual(filterStart, -1, 'filterReviewTable must exist');
  assert.notEqual(selectAllStart, -1, 'reviewSelectAll must exist');

  const transactions = [
    { category: 'Investment' },
    { category: 'Outside Food' },
    { category: 'Investment' },
  ];
  const rows = transactions.map((_, index) => {
    const row = { dataset: { index: String(index) }, style: { display: '' }, classList: createClassList() };
    row.checkbox = { checked: initialSelection.includes(index), closest: () => row };
    return row;
  });
  const elements = {
    txCount: { textContent: '' },
    txSelectAll: { checked: false, indeterminate: false },
  };
  const document = {
    getElementById: id => elements[id] || null,
    querySelectorAll: selector => {
      if (selector === '#txBody tr') return rows;
      if (selector === '#txBody .review-cb') return rows.map(row => row.checkbox);
      return [];
    },
    querySelector: selector => {
      const match = selector.match(/^#txBody tr\[data-index="(\d+)"\]$/);
      return match ? rows[Number(match[1])] || null : null;
    },
  };
  const context = vm.createContext({ document });
  vm.runInContext(
    `let transactions = ${JSON.stringify(transactions)};
     let reviewSelected = new Set(${JSON.stringify(initialSelection)});
     let reviewFilters = ${JSON.stringify(EMPTY_FILTERS)};
     function updateReviewBulkBar() {}
     ${source.slice(helpersStart, helpersEnd)}
     ${source.slice(filterStart, filterEnd)}
     ${source.slice(selectAllStart, selectAllEnd)}
     globalThis.workflowForTest = {
       filterReviewTable,
       reviewSelectAll,
       setFilters: filters => { reviewFilters = { ...reviewFilters, ...filters }; },
       getSelection: () => reviewSelected,
     };`,
    context
  );

  return { workflow: context.workflowForTest, rows, elements };
}

test('filtered select-all changes only visible review rows and reports their count', () => {
  const { workflow, rows, elements } = createReviewWorkflow();

  workflow.setFilters({ category: 'Investment' });
  workflow.filterReviewTable();
  workflow.reviewSelectAll(true);

  assert.equal(elements.txCount.textContent, '2 of 3 transactions');
  assert.deepEqual(Array.from(workflow.getSelection()).sort((a, b) => a - b), [0, 2]);
  assert.equal(rows[1].style.display, 'none');
  assert.equal(elements.txSelectAll.checked, true);

  const hiddenSelection = createReviewWorkflow([1]);
  hiddenSelection.workflow.setFilters({ category: 'Investment' });
  hiddenSelection.workflow.filterReviewTable();
  hiddenSelection.workflow.reviewSelectAll(true);
  hiddenSelection.workflow.reviewSelectAll(false);

  assert.deepEqual(Array.from(hiddenSelection.workflow.getSelection()), [1]);
});
