const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSpreadsheetParsing() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('function parseCSVToObjects(text) {');
  const end = source.indexOf('// ─── Smart Categorization', start);

  assert.notEqual(start, -1, 'CSV parser must exist');
  assert.notEqual(end, -1, 'spreadsheet parsing section must have an end marker');

  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end)}\nglobalThis.spreadsheetParsingForTest = { parseCSVToObjects, mapSpreadsheetRow };`,
    context
  );
  return context.spreadsheetParsingForTest;
}

const { parseCSVToObjects, mapSpreadsheetRow } = loadSpreadsheetParsing();

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
