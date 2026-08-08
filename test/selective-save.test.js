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

function createSaveWorkflow({ responseOk = true } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('// ─── Selective Save Helpers');
  const end = source.indexOf('const MONEY_QUOTES = [', start);
  const elements = {
    saveBtn: { disabled: false, textContent: '' },
    saveBtn2: { disabled: false, textContent: '' },
    saveSelectedBtn: { disabled: false, textContent: '' },
    tableSection: { classList: { add() {}, remove() {} } },
  };
  const requests = [];
  const context = vm.createContext({
    document: { getElementById: id => elements[id] || null },
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: responseOk,
        json: async () => responseOk
          ? { saved: 1, skipped: 0 }
          : { error: 'Save failed' },
      };
    },
    alert() {},
  });
  vm.runInContext(
    `let transactions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
     let reviewSelected = new Set([1]);
     let trendsLoaded = true;
     let renderCount = 0;
     function renderTable() { renderCount += 1; }
     function showResult() {}
     function loadMonths() {}
     ${source.slice(start, end)}
     globalThis.workflowForTest = {
       saveToTracker,
       getTransactions: () => transactions,
       getSelection: () => reviewSelected,
       getRenderCount: () => renderCount,
     };`,
    context
  );
  return { workflow: context.workflowForTest, requests, elements };
}

test('review UI offers save-all and save-selected controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  assert.match(html, /id="saveBtn"[^>]*>Save all/);
  assert.match(html, /id="saveBtn2"[^>]*>Save all/);
  assert.match(html, /id="saveSelectedBtn"[^>]*onclick="saveToTracker\('selected'\)"/);
});

test('selected save posts only selected rows and keeps the others for review', async () => {
  const { workflow, requests } = createSaveWorkflow();

  await workflow.saveToTracker('selected');

  assert.deepEqual(requests, [{ transactions: [{ id: 'b' }] }]);
  assert.deepEqual(Array.from(workflow.getTransactions(), row => row.id), ['a', 'c']);
  assert.equal(workflow.getSelection().size, 0);
  assert.equal(workflow.getRenderCount(), 1);
});

test('failed selected save keeps rows and selection intact', async () => {
  const { workflow, requests } = createSaveWorkflow({ responseOk: false });

  await workflow.saveToTracker('selected');

  assert.deepEqual(requests, [{ transactions: [{ id: 'b' }] }]);
  assert.deepEqual(Array.from(workflow.getTransactions(), row => row.id), ['a', 'b', 'c']);
  assert.deepEqual(Array.from(workflow.getSelection()), [1]);
  assert.equal(workflow.getRenderCount(), 0);
});
