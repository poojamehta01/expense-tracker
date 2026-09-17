const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadSpreadsheetHelpers() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('function parseCSVToObjects');
  const end = source.indexOf('// ─── Smart Categorization', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end)}\n` +
      'globalThis.helpers = { mapSpreadsheetRow, filterOutgoingTransactions };',
    context,
  );
  return context.helpers;
}

test('spreadsheet import keeps debit rows and skips credit rows', () => {
  const { mapSpreadsheetRow, filterOutgoingTransactions } = loadSpreadsheetHelpers();
  const rows = [
    mapSpreadsheetRow({ date: '17/09/2026', narration: 'Grocery store', debit: '1,250.00', credit: '' }),
    mapSpreadsheetRow({ date: '17/09/2026', narration: 'Salary received', debit: '', credit: '50,000.00' }),
    mapSpreadsheetRow({ date: '17/09/2026', narration: 'UPI purchase', amount: '300', 'dr/cr': 'DR' }),
    mapSpreadsheetRow({ date: '17/09/2026', narration: 'Refund received', amount: '200', 'dr/cr': 'CR' }),
  ];

  const result = filterOutgoingTransactions(rows);

  assert.deepEqual(Array.from(result.included, row => row.description), ['Grocery store', 'UPI purchase']);
  assert.equal(result.excludedCount, 2);
  assert.equal(result.included.every(row => !Object.hasOwn(row, 'direction')), true);
});

test('AI extraction filter skips explicit incoming transactions and keeps outgoing ones', () => {
  const { filterOutgoingTransactions } = require('../server');
  const result = filterOutgoingTransactions([
    { description: 'Swiggy', amount: 500, direction: 'outgoing' },
    { description: 'Monthly salary', amount: 100000, direction: 'incoming' },
    { description: 'UPI transfer received from Kunal', amount: 2000 },
    { description: 'Salary credited to account', amount: 90000, direction: 'outgoing' },
    { description: 'Petrol', amount: 2500 },
  ]);

  assert.deepEqual(result.included.map(row => row.description), ['Swiggy', 'Petrol']);
  assert.equal(result.excludedCount, 3);
  assert.equal(result.included.every(row => !Object.hasOwn(row, 'direction')), true);
});
