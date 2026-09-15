const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createWorkflow(responseOverrides) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('// ─── Monthly Notes');
  const end = source.indexOf('// ─── End Monthly Notes', start);
  assert.notEqual(start, -1, 'monthly notes workflow must exist');
  assert.notEqual(end, -1, 'monthly notes workflow must have an end marker');

  const elements = {
    monthPicker: { value: 'September_2026' },
    monthlyNotesList: { innerHTML: '' },
    monthlyNoteInput: { value: '', disabled: false },
    monthlyNoteAdd: { disabled: false },
    monthlyNotesStatus: { textContent: '' },
  };
  const requests = [];
  const responses = responseOverrides || [
    { ok: true, json: async () => ({ notes: [
      { id: 1, month: 'September_2026', author: 'Pooja', body: 'ICICI done', created_at: '2026-09-14 10:00:00' },
      { id: 2, month: 'September_2026', author: 'Kunal', body: 'Amazon pending', created_at: '2026-09-14 11:00:00' },
    ] }) },
    { ok: true, json: async () => ({ id: 3 }) },
    { ok: true, json: async () => ({ notes: [] }) },
  ];
  const context = {
    currentUserName: 'Pooja',
    document: { getElementById: id => elements[id] },
    fetch: async (url, options = {}) => { requests.push({ url, options }); return responses.shift(); },
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    console,
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}; globalThis.notesForTest = { loadMonthlyNotes, addMonthlyNote };`, context);
  return { workflow: context.notesForTest, elements, requests };
}

test('monthly notes render both authors but only the current author gets delete controls', async () => {
  const { workflow, elements, requests } = createWorkflow();

  await workflow.loadMonthlyNotes('September_2026');

  assert.equal(requests[0].url, '/api/monthly-notes?month=September_2026');
  assert.match(elements.monthlyNotesList.innerHTML, /ICICI done/);
  assert.match(elements.monthlyNotesList.innerHTML, /Amazon pending/);
  assert.match(elements.monthlyNotesList.innerHTML, /deleteMonthlyNote\(1, 'September_2026'\)/);
  assert.doesNotMatch(elements.monthlyNotesList.innerHTML, /deleteMonthlyNote\(2,/);
});

test('adding a monthly note uses the selected month and clears the input after saving', async () => {
  const { workflow, elements, requests } = createWorkflow();
  elements.monthlyNoteInput.value = '  HDFC entered through 13 Sep  ';

  await workflow.addMonthlyNote();

  assert.equal(requests[0].url, '/api/monthly-notes');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    month: 'September_2026',
    body: 'HDFC entered through 13 Sep',
  });
  assert.equal(elements.monthlyNoteInput.value, '');
  assert.equal(requests[1].url, '/api/monthly-notes?month=September_2026');
});

test('a failed month load replaces stale notes with an error state', async () => {
  const { workflow, elements } = createWorkflow([
    { ok: false, json: async () => ({ error: 'failed' }) },
  ]);
  elements.monthlyNotesList.innerHTML = 'Old month note';
  await workflow.loadMonthlyNotes('September_2026');

  assert.doesNotMatch(elements.monthlyNotesList.innerHTML, /Old month note/);
  assert.match(elements.monthlyNotesList.innerHTML, /Could not load notes/);
});

test('an old mutation reload cannot replace the active month with a loading state', async () => {
  const { workflow, elements, requests } = createWorkflow();
  elements.monthPicker.value = 'October_2026';
  elements.monthlyNotesList.innerHTML = 'October notes';

  await workflow.loadMonthlyNotes('September_2026');

  assert.equal(elements.monthlyNotesList.innerHTML, 'October notes');
  assert.deepEqual(requests, []);
});
