const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('combined dashboard keeps all four KPI cards in one desktop row', () => {
  const kpiGridRule = css.match(/\.kpi-grid\s*\{[^}]+\}/)?.[0] || '';

  assert.match(kpiGridRule, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
});
