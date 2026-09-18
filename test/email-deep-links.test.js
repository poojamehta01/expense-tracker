const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const APP_PATH = path.join(__dirname, '..', 'public', 'app.js');

function loadDeepLinkHelpers() {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const start = source.indexOf('// ─── Init');
  const end = source.indexOf('let currentUserName', start);
  assert.notEqual(start, -1, 'app initialization must exist');
  assert.notEqual(end, -1, 'app initialization must have an end marker');

  const context = vm.createContext({
    URLSearchParams,
    document: { addEventListener() {} },
  });
  vm.runInContext(
    `${source.slice(start, end)}\n` +
      'globalThis.deepLinkHelpersForTest = { initialTabFromLocation };',
    context,
  );
  return context.deepLinkHelpersForTest;
}

function runStartup(search) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const start = source.indexOf('// ─── Init');
  const end = source.indexOf('let currentUserName', start);
  const listeners = new Map();
  const switchedTabs = [];
  const element = {
    classList: { add() {}, toggle() {} },
    textContent: '',
  };
  const context = vm.createContext({
    URLSearchParams,
    window: { location: { search } },
    localStorage: { getItem() { return null; } },
    document: {
      body: { classList: { add() {} } },
      addEventListener(name, callback) { listeners.set(name, callback); },
      getElementById() { return element; },
    },
    loadSettings() {},
    setupUpload() {},
    populateUploadPaymentMethods() {},
    initUploadMonthPicker() {},
    switchTab(name) { switchedTabs.push(name); },
    renderMotdQuote() {},
    loadUser() { return { finally() {} }; },
    loadMonths() {},
  });

  vm.runInContext(source.slice(start, end), context);
  const domReady = listeners.get('DOMContentLoaded');
  assert.equal(typeof domReady, 'function', 'startup must register DOMContentLoaded');
  domReady();
  return switchedTabs;
}

test('initialTabFromLocation accepts only public email deep-link tabs', () => {
  const { initialTabFromLocation } = loadDeepLinkHelpers();

  assert.equal(initialTabFromLocation({ search: '?tab=add' }), 'add');
  assert.equal(initialTabFromLocation({ search: '?tab=dashboard' }), 'dashboard');
  assert.equal(initialTabFromLocation({ search: '?tab=budget' }), 'budget');
  assert.equal(initialTabFromLocation({ search: '?tab=unknown' }), null);
  assert.equal(initialTabFromLocation({ search: '?tab=tab-add' }), null);
});

test('startup applies the Add Expenses email deep link through switchTab', () => {
  assert.deepEqual(runStartup('?tab=add'), ['add']);
});

test('startup selects every other public deep-link tab', () => {
  assert.deepEqual(runStartup('?tab=dashboard'), ['dashboard']);
  assert.deepEqual(runStartup('?tab=budget'), ['budget']);
});

test('startup falls back to Dashboard when the tab query is absent or invalid', () => {
  assert.deepEqual(runStartup(''), ['dashboard']);
  assert.deepEqual(runStartup('?tab=unknown'), ['dashboard']);
});
