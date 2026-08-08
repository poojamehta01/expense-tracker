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
