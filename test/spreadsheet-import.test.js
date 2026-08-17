const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSpreadsheetParsing() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('function isSpreadsheetFile(file) {');
  const end = source.indexOf('// ─── Smart Categorization', start);

  assert.notEqual(start, -1, 'CSV parser must exist');
  assert.notEqual(end, -1, 'spreadsheet parsing section must have an end marker');

  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end)}\nglobalThis.spreadsheetParsingForTest = { parseCSVToObjects, mapSpreadsheetRow, parseSpreadsheetFile };`,
    context
  );
  return context.spreadsheetParsingForTest;
}

const { parseCSVToObjects, mapSpreadsheetRow, parseSpreadsheetFile } = loadSpreadsheetParsing();

test('maps Withdrawal Amt. as the transaction amount', () => {
  const [row] = parseCSVToObjects([
    'Date,Narration,Withdrawal Amt.,Deposit Amt.',
    '01/07/26,UPI-SWIGGY,591,',
  ].join('\n'));
  const transaction = mapSpreadsheetRow(row);
  assert.equal(transaction.amount, 591);
  assert.equal(transaction.date, '1 July 2026');
  assert.equal(transaction.description, 'UPI-SWIGGY');
});

test('maps Deposit Amt. when withdrawal is empty', () => {
  const [row] = parseCSVToObjects([
    'Date,Narration,Withdrawal Amt.,Deposit Amt.',
    '06/07/26,SALARY,,15460',
  ].join('\n'));
  assert.equal(mapSpreadsheetRow(row).amount, 15460);
});

test('keeps Amount ahead of a later empty Amt alias', () => {
  const [row] = parseCSVToObjects([
    'Date,Narration,Amount,Amt',
    '01/07/26,UPI-SWIGGY,100,',
  ].join('\n'));

  assert.equal(mapSpreadsheetRow(row).amount, 100);
});

test('keeps Debit Amount ahead of a later empty Debit Amt. alias', () => {
  const [row] = parseCSVToObjects([
    'Date,Narration,Debit Amount,Debit Amt.,Credit Amount,Credit Amt.',
    '01/07/26,UPI-SWIGGY,100,,,,',
  ].join('\n'));

  assert.equal(mapSpreadsheetRow(row).amount, 100);
});

test('keeps Credit Amount ahead of a later empty Credit Amt. alias', () => {
  const [row] = parseCSVToObjects([
    'Date,Narration,Debit Amount,Debit Amt.,Credit Amount,Credit Amt.',
    '01/07/26,SALARY,,,200,',
  ].join('\n'));

  assert.equal(mapSpreadsheetRow(row).amount, 200);
});

test('keeps withdrawal ahead of deposit when both are populated', () => {
  const [row] = parseCSVToObjects([
    'Date,Narration,Withdrawal Amt.,Deposit Amt.',
    '01/07/26,UPI-SWIGGY,591,15460',
  ].join('\n'));

  assert.equal(mapSpreadsheetRow(row).amount, 591);
});

test('filters zero and unresolved amounts through spreadsheet import', async () => {
  const file = {
    name: 'bank.csv',
    type: 'text/csv',
    text: async () => [
      'Date,Narration,Withdrawal Amt.,Deposit Amt.',
      '01/07/26,ZERO,0,',
      '02/07/26,UNRESOLVED,,',
    ].join('\n'),
  };

  assert.equal((await parseSpreadsheetFile(file)).length, 0);
});
