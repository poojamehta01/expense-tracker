const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); },
  };
}

function element(initial = {}) {
  return {
    innerHTML: '', textContent: '', value: '', disabled: false,
    classList: classList(initial.hidden ? ['hidden'] : []),
    focus() { this.focused = true; },
    ...initial,
  };
}

function deferredResponse() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createWorkflow(responseOverrides) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('// ─── Monthly Notes');
  const end = source.indexOf('// ─── End Monthly Notes', start);
  assert.notEqual(start, -1, 'monthly notes workflow must exist');
  assert.notEqual(end, -1, 'monthly notes workflow must have an end marker');

  const elements = {
    monthPicker: element({ value: 'September_2026' }),
    monthlyNotesButton: element(),
    monthlyNotesModal: element({ hidden: true }),
    monthlyNotesCloseBtn: element(),
    monthlyNotesList: element(),
    monthlyNoteInput: element(),
    monthlyNoteAdd: element(),
    monthlyNotesStatus: element(),
  };
  const documentListeners = {};
  const requests = [];
  const documentModel = {
    activeElement: null,
    getElementById: id => elements[id],
    addEventListener: (name, listener) => { documentListeners[name] = listener; },
  };
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
    document: documentModel,
    fetch: async (url, options = {}) => { requests.push({ url, options }); return responses.shift(); },
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    console,
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}; globalThis.notesForTest = { loadMonthlyNotes, addMonthlyNote, openMonthlyNotes, closeMonthlyNotes };`, context);
  return { workflow: context.notesForTest, elements, requests, documentListeners, documentModel };
}

test('Dashboard uses a compact notes trigger and keeps note content in a dialog', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  assert.match(html, /id="monthlyNotesButton"[^>]*onclick="openMonthlyNotes\(\)"/);
  assert.match(html, /id="monthlyNotesModal"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.doesNotMatch(html, /<section class="monthly-notes-card"/);
});

test('monthly notes render both authors but only the current author gets delete controls', async () => {
  const { workflow, elements, requests } = createWorkflow();

  await workflow.loadMonthlyNotes('September_2026');

  assert.equal(requests[0].url, '/api/monthly-notes?month=September_2026');
  assert.match(elements.monthlyNotesList.innerHTML, /ICICI done/);
  assert.match(elements.monthlyNotesList.innerHTML, /Amazon pending/);
  assert.match(elements.monthlyNotesList.innerHTML, /deleteMonthlyNote\(1, 'September_2026'\)/);
  assert.doesNotMatch(elements.monthlyNotesList.innerHTML, /deleteMonthlyNote\(2,/);
  assert.equal(elements.monthlyNotesButton.textContent, 'Notes (2)');
});

test('notes dialog manages focus and closes with Escape', () => {
  const { workflow, elements, documentListeners } = createWorkflow();

  workflow.openMonthlyNotes();
  assert.equal(elements.monthlyNotesModal.classList.contains('hidden'), false);
  assert.equal(elements.monthlyNotesCloseBtn.focused, true);

  documentListeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(elements.monthlyNotesModal.classList.contains('hidden'), true);
  assert.equal(elements.monthlyNotesButton.focused, true);
});

test('notes dialog redirects Tab back inside when focus is outside', () => {
  const { workflow, elements, documentListeners, documentModel } = createWorkflow();
  const first = element();
  const last = element();
  elements.monthlyNotesModal.querySelectorAll = () => [first, last];
  elements.monthlyNotesModal.contains = () => false;
  workflow.openMonthlyNotes();
  documentModel.activeElement = element();
  let prevented = false;

  documentListeners.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });

  assert.equal(prevented, true);
  assert.equal(first.focused, true);
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
  assert.equal(elements.monthlyNotesButton.textContent, 'Notes (0)');
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

test('a failed month switch does not keep the previous month note count', async () => {
  const { workflow, elements } = createWorkflow([
    { ok: false, json: async () => ({ error: 'failed' }) },
  ]);
  elements.monthlyNotesButton.textContent = 'Notes (4)';
  elements.monthPicker.value = 'October_2026';

  await workflow.loadMonthlyNotes('October_2026');

  assert.equal(elements.monthlyNotesButton.textContent, 'Notes');
});

test('an old mutation reload cannot replace the active month with a loading state', async () => {
  const { workflow, elements, requests } = createWorkflow();
  elements.monthPicker.value = 'October_2026';
  elements.monthlyNotesList.innerHTML = 'October notes';

  await workflow.loadMonthlyNotes('September_2026');

  assert.equal(elements.monthlyNotesList.innerHTML, 'October notes');
  assert.deepEqual(requests, []);
});

test('an older response for the same month cannot replace newer notes or count', async () => {
  const older = deferredResponse();
  const newer = deferredResponse();
  const { workflow, elements } = createWorkflow([older.promise, newer.promise]);

  const oldLoad = workflow.loadMonthlyNotes('September_2026');
  const newLoad = workflow.loadMonthlyNotes('September_2026');
  newer.resolve({ ok: true, json: async () => ({ notes: [
    { id: 2, month: 'September_2026', author: 'Kunal', body: 'Newest note', created_at: '2026-09-17 10:00:00' },
  ] }) });
  await newLoad;
  older.resolve({ ok: true, json: async () => ({ notes: [
    { id: 1, month: 'September_2026', author: 'Pooja', body: 'Stale one', created_at: '2026-09-16 10:00:00' },
    { id: 3, month: 'September_2026', author: 'Pooja', body: 'Stale two', created_at: '2026-09-16 11:00:00' },
  ] }) });
  await oldLoad;

  assert.match(elements.monthlyNotesList.innerHTML, /Newest note/);
  assert.doesNotMatch(elements.monthlyNotesList.innerHTML, /Stale/);
  assert.equal(elements.monthlyNotesButton.textContent, 'Notes (1)');
});
