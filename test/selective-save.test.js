const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSelectiveSaveHelpers() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('// ─── Selective Save Helpers');
  const end = source.indexOf('// ─── Save to Tracker', start);

  assert.notEqual(start, -1, 'selective save helpers must exist');
  assert.notEqual(end, -1, 'selective save helpers must have an end marker');

  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end)}\n` +
      'globalThis.helpersForTest = { resolveSavePlan, removeSubmittedRows };',
    context
  );
  return context.helpersForTest;
}

test('builds a save plan for one selected row', () => {
  const { resolveSavePlan } = loadSelectiveSaveHelpers();
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  const plan = resolveSavePlan(rows, new Set([1]), 'selected');

  assert.deepEqual(Array.from(plan.indexes), [1]);
  assert.deepEqual(Array.from(plan.rows, row => row.id), ['b']);
});

test('sorts and deduplicates multiple selected indexes', () => {
  const { resolveSavePlan } = loadSelectiveSaveHelpers();
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  const plan = resolveSavePlan(rows, [2, 0, 2], 'selected');

  assert.deepEqual(Array.from(plan.indexes), [0, 2]);
  assert.deepEqual(Array.from(plan.rows, row => row.id), ['a', 'c']);
});

test('builds an all-rows save plan regardless of selection', () => {
  const { resolveSavePlan } = loadSelectiveSaveHelpers();
  const rows = [{ id: 'a' }, { id: 'b' }];

  const plan = resolveSavePlan(rows, new Set([1]), 'all');

  assert.deepEqual(Array.from(plan.indexes), [0, 1]);
  assert.deepEqual(Array.from(plan.rows, row => row.id), ['a', 'b']);
});

test('ignores invalid selected indexes and supports an empty selection', () => {
  const { resolveSavePlan } = loadSelectiveSaveHelpers();
  const rows = [{ id: 'a' }, { id: 'b' }];

  const invalidPlan = resolveSavePlan(rows, [-1, 1, 9, 1.5], 'selected');
  const emptyPlan = resolveSavePlan(rows, new Set(), 'selected');

  assert.deepEqual(Array.from(invalidPlan.indexes), [1]);
  assert.deepEqual(Array.from(invalidPlan.rows, row => row.id), ['b']);
  assert.deepEqual(Array.from(emptyPlan.indexes), []);
  assert.deepEqual(Array.from(emptyPlan.rows), []);
});

test('removes submitted rows without mutating the source list', () => {
  const { removeSubmittedRows } = loadSelectiveSaveHelpers();
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  const remaining = removeSubmittedRows(rows, [0, 2]);

  assert.deepEqual(Array.from(remaining, row => row.id), ['b']);
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c']);
  assert.notEqual(remaining, rows);
});
