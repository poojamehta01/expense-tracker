const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSmartCategorize() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('const SMART_PATTERNS = [');
  const end = source.indexOf('// ─── Review Table', start);

  assert.notEqual(start, -1, 'smart categorization patterns must exist');
  assert.notEqual(end, -1, 'smart categorization section must have an end marker');

  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end)}\nglobalThis.smartCategorizeForTest = smartCategorize;`,
    context
  );
  return context.smartCategorizeForTest;
}

function loadArray(relativePath, declaration) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const start = source.indexOf(`const ${declaration} = [`);
  const end = source.indexOf('];', start);

  assert.notEqual(start, -1, `${declaration} must exist in ${relativePath}`);
  assert.notEqual(end, -1, `${declaration} must be a complete array`);

  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end + 2)}\nglobalThis.arrayForTest = ${declaration};`,
    context
  );
  return Array.from(context.arrayForTest);
}

const smartCategorize = loadSmartCategorize();

const approvedMappings = [
  ['UPI-AUTOPAY-FINZOOMERS SERVICES -FINZOOMERS.CF@ICICI-SUBSCHARGE', 'Investment', 'Pooja_Personal'],
  ['UPI-AUTOPAY-GROWW-GROWWSTOCKS.ELEMENTS@ICICI-DEBIT FOR STOCKS', 'Investment', 'Pooja_Personal'],
  ['UPI-AUTOPAY-AMAZON INDIA-AUDIBLE RECURRING', 'Subscriptions', 'Pooja_Personal'],
  ['UPI-AUTOPAY-APPLE MEDIA SERVICES-EXECUTION TEST', 'Subscriptions', 'Pooja_Personal'],
  ['UPI-PROLEVEL PERSONAL TRAINING-GYM', 'Fitness', 'Pooja_Personal'],
  ['UPI-KUNAL-CAR EMI', 'Car downpayment/ emi', 'Pooja_Personal'],
  ['UPI-KUNAL-RENT', 'Rent', 'Pooja_Personal'],
  ['UPI-KUNAL-JUNE SETTLEMENT', 'Settlement', undefined],
  ['UPI-DEVAKKI-COOKUTENSILS', 'Home stuff', 'Pooja_Personal'],
  ['UPI-NYKAA ON TREND-PAYMENT FROM PHONE', 'Shopping - skin/hair care', 'Pooja_Personal'],
  ['UPI-PRONTO-PAYMENT FOR UPI', 'Pronto', 'Pooja_Personal'],
  ['UPI-SHOP-WATER', 'Outside Food', 'Common_50_50'],
];

for (const [description, expectedCategory, expectedExpenseType] of approvedMappings) {
  test(`categorizes ${description} as ${expectedCategory}`, () => {
    const transaction = { description, paid_by: 'Pooja' };

    smartCategorize(transaction);

    assert.equal(transaction.category, expectedCategory);
    assert.equal(transaction.expense_type, expectedExpenseType);
  });
}

test('categorizes the exact cafe water fixture as Outside Food', () => {
  const transaction = { description: 'UPI-CAFE-WATER', paid_by: 'Pooja' };

  smartCategorize(transaction);

  assert.equal(transaction.category, 'Outside Food');
  assert.equal(transaction.expense_type, 'Common_50_50');
});

test('uses the payer for a FinZoomers personal expense type', () => {
  const transaction = {
    description: 'UPI-AUTOPAY-FINZOOMERS SERVICES-SUBSCHARGE',
    paid_by: 'Kunal',
  };

  smartCategorize(transaction);

  assert.equal(transaction.expense_type, 'Kunal_Personal');
});

test('leaves ambiguous merchant descriptions uncategorized', () => {
  for (const description of [
    'UPI-AMAZON-PAYMENT FROM PHONE',
    'UPI-WATERFALL RESORT-PAYMENT',
  ]) {
    const transaction = { description, paid_by: 'Pooja' };

    smartCategorize(transaction);

    assert.equal(transaction.category, undefined);
  }
});

test('does not overwrite a reviewed category and expense type', () => {
  const transaction = {
    description: 'UPI-AUTOPAY-FINZOOMERS SERVICES-SUBSCHARGE',
    paid_by: 'Pooja',
    category: 'Others',
    expense_type: 'Common_50_50',
  };

  smartCategorize(transaction);

  assert.equal(transaction.category, 'Others');
  assert.equal(transaction.expense_type, 'Common_50_50');
});

test('keeps the Pronto category available in frontend and backend category lists', () => {
  const frontendCategories = loadArray('public/app.js', 'DEFAULT_CATEGORIES');
  const backendCategories = loadArray('server.js', 'CATEGORIES');

  assert.ok(frontendCategories.includes('Pronto'));
  assert.ok(backendCategories.includes('Pronto'));
  assert.equal(new Set(frontendCategories).size, frontendCategories.length);
  assert.equal(new Set(backendCategories).size, backendCategories.length);
  assert.deepEqual(new Set(frontendCategories), new Set(backendCategories));
});
