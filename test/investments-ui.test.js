const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function fixture() {
  const elements = new Proxy({}, { get: (obj, id) => obj[id] ||= { value: '', innerHTML: '', textContent: '', disabled: false, hidden: false, focus() {}, reset() {}, reportValidity() { return true; } } });
  const responses = [];
  const requests = [];
  const context = vm.createContext({ document: { getElementById: id => elements[id] }, globalPersonFilter: 'all',
    esc: s => String(s).replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    confirm: () => true,
    fetch: async (url, options) => { requests.push({ url, options }); return responses.shift(); },
  });
  vm.runInContext(fs.readFileSync('public/investments.js', 'utf8'), context);
  return { context, elements, responses, requests };
}
const data = { entries: [{ id: 1, name: '<Fund>', person: 'Pooja', amount: 100.25 }, { id: 2, name: 'FD', person: 'Kunal', amount: 200 }], totals: { Pooja: 100.25, Kunal: 200, combined: 300.25 } };
const ok = body => ({ ok: true, json: async () => body });
test('all-time investments show exact amounts, escape names, and filter by owner', async () => {
  const f = fixture(); f.responses.push(ok(data));
  await f.context.loadInvestments();
  assert.match(f.elements.investmentRows.innerHTML, /&lt;Fund&gt;/);
  assert.match(f.elements.investmentTotal.textContent, /300\.25/);
  f.context.globalPersonFilter = 'Kunal'; f.context.renderInvestments();
  assert.doesNotMatch(f.elements.investmentRows.innerHTML, /Fund/);
  assert.match(f.elements.investmentRows.innerHTML, /FD/);
  f.context.globalPersonFilter = 'Common'; f.context.renderInvestments();
  assert.match(f.elements.investmentRows.innerHTML, /No common investments/);
});
test('editing sends saved ID, errors preserve input, successful save resets the form', async () => {
  const f = fixture(); f.responses.push(ok(data)); await f.context.loadInvestments();
  f.context.editInvestment(1);
  assert.equal(f.elements.investmentName.value, '<Fund>');
  f.elements.investmentAmount.value = '150.25';
  f.responses.push({ ok: false, json: async () => ({ error: 'Try again' }) });
  await f.context.saveInvestment({ preventDefault() {} });
  assert.equal(f.requests[1].url, '/api/investments/1');
  assert.equal(f.requests[1].options.method, 'PUT');
  assert.equal(JSON.parse(f.requests[1].options.body).amount, 150.25);
  assert.equal(f.elements.investmentAmount.value, '150.25');
  assert.equal(f.elements.investmentStatus.textContent, 'Try again');
  f.responses.push(ok(data)); await f.context.saveInvestment({ preventDefault() {} });
  assert.equal(f.elements.investmentSave.textContent, 'Add investment');
});
test('deletion updates totals and an older load cannot overwrite it', async () => {
  const f = fixture(); f.responses.push(ok(data)); await f.context.loadInvestments();
  let resolve; f.responses.push({ ok: true, json: () => new Promise(r => { resolve = r; }) });
  const pending = f.context.loadInvestments(); await Promise.resolve();
  f.responses.push(ok({ entries: [], totals: { Pooja: 0, Kunal: 0, combined: 0 } }));
  await f.context.deleteInvestment(1);
  resolve(data); await pending;
  assert.equal(f.requests[2].options.method, 'DELETE');
  assert.match(f.elements.investmentRows.innerHTML, /No investments yet/);
});
