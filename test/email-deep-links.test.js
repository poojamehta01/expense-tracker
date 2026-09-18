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

test('initialTabFromLocation accepts only public email deep-link tabs', () => {
  const { initialTabFromLocation } = loadDeepLinkHelpers();

  assert.equal(initialTabFromLocation({ search: '?tab=add' }), 'add');
  assert.equal(initialTabFromLocation({ search: '?tab=dashboard' }), 'dashboard');
  assert.equal(initialTabFromLocation({ search: '?tab=budget' }), 'budget');
  assert.equal(initialTabFromLocation({ search: '?tab=unknown' }), null);
  assert.equal(initialTabFromLocation({ search: '?tab=tab-add' }), null);
});

test('startup applies the Add Expenses email deep link through switchTab', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const initStart = source.indexOf("document.addEventListener('DOMContentLoaded'");
  const initEnd = source.indexOf('\n});', initStart);
  const initSource = source.slice(initStart, initEnd);

  assert.match(initSource, /const initialTab = initialTabFromLocation\(window\.location\);/);
  assert.match(initSource, /if \(initialTab\) switchTab\(initialTab\);/);
});

test('startup falls back to Dashboard when no allowed tab is requested', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const initStart = source.indexOf("document.addEventListener('DOMContentLoaded'");
  const initEnd = source.indexOf('\n});', initStart);
  const initSource = source.slice(initStart, initEnd);

  assert.match(initSource, /else switchTab\('dashboard'\);/);
});
