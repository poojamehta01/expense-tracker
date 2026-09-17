const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

test('primary navigation starts on Dashboard and follows the requested workflow order', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
  const nav = html.slice(html.indexOf('<nav class="tab-nav">'), html.indexOf('</nav>'));
  const tabIds = Array.from(nav.matchAll(/id="tab-btn-([^"]+)"/g), match => match[1]);

  assert.deepEqual(tabIds, ['dashboard', 'add', 'budget', 'salary', 'trends', 'ask', 'ai-memory']);
  assert.match(nav, /class="tab-btn active"[^>]*id="tab-btn-dashboard"/);
  assert.doesNotMatch(nav, /class="tab-btn active"[^>]*id="tab-btn-add"/);
  assert.match(app, /DOMContentLoaded[\s\S]*?switchTab\('dashboard'\);/);
});
