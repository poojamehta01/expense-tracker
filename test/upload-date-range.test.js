const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadUploadDateRangeHelpers() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const marker = '// ─── Upload Date Range Helpers';
  const start = source.indexOf(marker);
  const end = source.indexOf('// ─── Upload ', start + marker.length);

  assert.notEqual(start, -1, 'upload date range helpers must exist');
  assert.notEqual(end, -1, 'upload date range helpers must have an end marker');

  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end)}\n` +
      'globalThis.helpersForTest = { validateUploadDateRange, filterTransactionsByDateRange };',
    context
  );
  return context.helpersForTest;
}

test('includes transactions on both date-range boundaries', () => {
  const { filterTransactionsByDateRange } = loadUploadDateRangeHelpers();
  const rows = [
    { date: '28 August 2026', description: 'start' },
    { date: '29 August 2026', description: 'middle' },
    { date: '30 August 2026', description: 'end' },
  ];

  const result = filterTransactionsByDateRange(rows, '2026-08-28', '2026-08-30');

  assert.deepEqual(Array.from(result.included, row => row.description), ['start', 'middle', 'end']);
  assert.equal(result.excludedCount, 0);
});

test('excludes out-of-range, missing, and invalid transaction dates', () => {
  const { filterTransactionsByDateRange } = loadUploadDateRangeHelpers();
  const rows = [
    { date: '27 August 2026', description: 'before' },
    { date: '29 August 2026', description: 'included' },
    { date: '31 August 2026', description: 'after' },
    { date: '', description: 'missing' },
    { date: '31 February 2026', description: 'invalid' },
  ];

  const result = filterTransactionsByDateRange(rows, '2026-08-28', '2026-08-30');

  assert.deepEqual(Array.from(result.included, row => row.description), ['included']);
  assert.equal(result.excludedCount, 4);
});

test('accepts common abbreviated and separated bank date formats', () => {
  const { filterTransactionsByDateRange } = loadUploadDateRangeHelpers();
  const rows = [
    { date: '28 Aug 2026', description: 'abbreviated' },
    { date: '29-Aug-2026', description: 'hyphenated' },
    { date: '30  August   2026', description: 'spaced' },
  ];

  const result = filterTransactionsByDateRange(rows, '2026-08-28', '2026-08-30');

  assert.deepEqual(
    Array.from(result.included, row => row.description),
    ['abbreviated', 'hyphenated', 'spaced']
  );
  assert.equal(result.excludedCount, 0);
});

test('requires both dates and rejects a reversed range', () => {
  const { validateUploadDateRange } = loadUploadDateRangeHelpers();

  assert.deepEqual({ ...validateUploadDateRange('', '2026-08-30') }, {
    valid: false,
    error: 'Choose both a From date and a To date before uploading.',
  });
  assert.deepEqual({ ...validateUploadDateRange('2026-08-30', '2026-08-28') }, {
    valid: false,
    error: 'The From date must be on or before the To date.',
  });
  assert.deepEqual({ ...validateUploadDateRange('2026-08-28', '2026-08-30') }, {
    valid: true,
    error: '',
  });
});

test('upload UI exposes required From and To date inputs', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  assert.match(html, /id="uploadDateFrom"[^>]*type="date"[^>]*required/);
  assert.match(html, /id="uploadDateTo"[^>]*type="date"[^>]*required/);
});

test('invalid range clears stale upload results before showing the error', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('// ─── Upload Processing');
  const end = source.indexOf('// ─── SMS / text paste', start);
  let hideResultCalls = 0;
  let shownError = '';
  const elements = {
    uploadDateFrom: { value: '2026-08-30' },
    uploadDateTo: { value: '2026-08-28' },
  };
  const context = vm.createContext({
    document: { getElementById: id => elements[id] },
    hideResult: () => { hideResultCalls += 1; },
    showError: message => { shownError = message; },
    validateUploadDateRange: (from, to) => ({
      valid: from <= to,
      error: 'The From date must be on or before the To date.',
    }),
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.handleFilesForTest = handleFiles;`, context);

  await context.handleFilesForTest([]);

  assert.equal(hideResultCalls, 1);
  assert.equal(shownError, 'The From date must be on or before the To date.');
});
