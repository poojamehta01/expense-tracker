const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

test('expense analytics use the exact Investment exclusion and expose an investments total', () => {
  assert.match(server, /EXPENSE_EXCLUDE[\s\S]*category != 'Investment'/);
  assert.match(server, /investments\s*:/);
  assert.match(html, /id="kpiInvestments"/);
  assert.match(app, /kpiInvestments/);
});

test('upload payment selector supports deterministic file overrides but SMS remains separate', () => {
  assert.match(html, /id="uploadPaymentMethod"/);
  assert.match(html, />Auto-detect</);
  assert.match(app, /function applyUploadPaymentMethodOverride/);
  assert.match(app, /applyUploadPaymentMethodOverride\(extracted/);
  assert.match(app, /const paymentMethodOverride[\s\S]*for \(let i = 0; i < files\.length; i\+\+\)/);
  assert.match(app, /applyUploadPaymentMethodOverride\(extracted, paymentMethodOverride\)/);
  const sms = app.slice(app.indexOf('async function extractFromTextArea'), app.indexOf('async function extractFromText', app.indexOf('async function extractFromTextArea') + 10));
  assert.doesNotMatch(sms, /applyUploadPaymentMethodOverride/);
});

test('SBI debit is a payment method with chip styling and is not a category', () => {
  assert.match(server, /PAYMENT_METHODS[\s\S]*SBI_Debit_Card/);
  assert.match(app, /DEFAULT_PAYMENT_METHODS[\s\S]*SBI_Debit_Card/);
  assert.match(app, /'SBI_Debit_Card'\s*:/);
  const categories = server.slice(server.indexOf('const CATEGORIES'), server.indexOf('const EXPENSE_TYPES'));
  assert.doesNotMatch(categories, /SBI_Debit_Card/);
});

test('budget sections are accessible, stateful, and hide Education only at render time', () => {
  assert.match(app, /collapsedBudgetSections\s*=\s*new Set/);
  assert.match(app, /aria-expanded=/);
  assert.match(app, /Education\/Child Care/);
  assert.match(app, /data\.sections \|\| \[\]\)\.filter\(section => section\.section !== 'Education\/Child Care'\)/);
  assert.match(css, /budget-section-toggle/);
});

test('filtered Dashboard applies the same non-expense categories as the server', () => {
  assert.match(app, /expenseList = gList\.filter\(t => !\['Credit Card Payment', 'Settlement', 'Investment'\]\.includes\(t\.category\)\)/);
});
