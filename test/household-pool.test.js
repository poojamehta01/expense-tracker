const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  normalizeHouseholdPoolTransaction,
  calculateSettlement,
} = require('../household-pool');

test('SBI debit transactions are paid by the equally funded household pool', () => {
  const transaction = normalizeHouseholdPoolTransaction({
    payment_method: 'SBI_Debit_Card',
    paid_by: 'Kunal',
    expense_type: 'Kunal_Personal',
  });

  assert.equal(transaction.paid_by, 'Household Pool');
  assert.equal(transaction.expense_type, 'Common_50_50');
});

test('non-SBI transactions retain their payer and expense type', () => {
  const transaction = normalizeHouseholdPoolTransaction({
    payment_method: 'HDFC_Debit_Card',
    paid_by: 'Pooja',
    expense_type: 'Pooja_for_Kunal',
  });

  assert.equal(transaction.paid_by, 'Pooja');
  assert.equal(transaction.expense_type, 'Pooja_for_Kunal');
});

test('household-pool common spending creates no settlement debt', () => {
  const settlement = calculateSettlement([
    { expense_type: 'Common_50_50', paid_by: 'Household Pool', total: 1200 },
    { expense_type: 'Common_50_50', paid_by: 'Kunal', total: 400 },
  ]);

  assert.equal(settlement.commonSpend, 1600);
  assert.equal(settlement.poojaOwesKunal, 200);
  assert.equal(settlement.kunalOwesPooja, 0);
  assert.equal(settlement.net, -200);
});

function loadClientNormalizer() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('function normalizeHouseholdPoolTransaction(');
  const end = source.indexOf('\n}', start);

  assert.notEqual(start, -1, 'client household-pool normalizer must exist');
  assert.notEqual(end, -1, 'client household-pool normalizer must be complete');

  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end + 2)}\nglobalThis.normalizeForTest = normalizeHouseholdPoolTransaction;`,
    context
  );
  return context.normalizeForTest;
}

test('review rows immediately reflect the household payer when SBI debit is selected', () => {
  const normalize = loadClientNormalizer();
  const transaction = {
    payment_method: 'SBI_Debit_Card',
    paid_by: 'Kunal',
    expense_type: 'Kunal_Personal',
  };

  normalize(transaction);

  assert.equal(transaction.paid_by, 'Household Pool');
  assert.equal(transaction.expense_type, 'Common_50_50');
});
