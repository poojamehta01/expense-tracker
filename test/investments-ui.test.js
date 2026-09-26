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

test('partial summaries display known values and coverage for each owner', async () => {
  const f = fixture();
  f.responses.push(ok({ ...data, entries: [
    { ...data.entries[0], currentValue: 120.50, gain: 20.25 },
    { ...data.entries[1], currentValue: null, gain: null },
  ], valuations: {
    Pooja: { currentValue: 120.50, gain: 20.25, missing: 0 },
    Kunal: { currentValue: null, gain: null, missing: 1 },
    combined: { currentValue: 120.50, gain: 20.25, missing: 1 },
  } }));
  await f.context.loadInvestments();
  assert.match(f.elements.investmentRows.innerHTML, /\+₹20\.25/);
  assert.match(f.elements.investmentRows.innerHTML, /Not added/);
  assert.equal(f.elements.investmentTotalCurrent.textContent, '₹120.50');
  assert.equal(f.elements.investmentTotalGain.textContent, '+₹20.25 (+20.20%)');
  assert.equal(f.elements.investmentTotalMissing.textContent, 'Partial totals · 1 of 2 investments valued');
  assert.equal(f.elements.investmentKunalMissing.textContent, '0 of 1 investments valued');
  assert.equal(f.elements.investmentPoojaMissing.textContent, '1 of 1 investments valued');
  assert.equal(f.elements.investmentPoojaCurrent.textContent, '₹120.50');
  f.context.editInvestment(1);
  assert.equal(f.elements.investmentCurrentValue.value, 120.50);
});

test('saving distinguishes a zero current value from a cleared field', async () => {
  const f = fixture(); f.responses.push(ok(data)); await f.context.loadInvestments();
  f.context.editInvestment(1);
  f.elements.investmentCurrentValue.value = '0';
  f.responses.push(ok(data)); await f.context.saveInvestment({ preventDefault() {} });
  assert.equal(JSON.parse(f.requests[1].options.body).currentValue, 0);
  f.context.editInvestment(1);
  f.elements.investmentCurrentValue.value = '';
  f.responses.push(ok(data)); await f.context.saveInvestment({ preventDefault() {} });
  assert.equal(JSON.parse(f.requests[2].options.body).currentValue, null);
});


test('gain percentages use the valued cost basis and show signed gains, losses, and zero', async () => {
  const f = fixture();
  f.responses.push(ok({ entries: [
    { id: 1, name: 'Small fund', person: 'Pooja', amount: 100, currentValue: 120, gain: 20 },
    { id: 2, name: 'Large fund', person: 'Pooja', amount: 900, currentValue: 990, gain: 90 },
    { id: 3, name: 'Unknown', person: 'Pooja', amount: 9000, currentValue: null, gain: null },
    { id: 4, name: 'Loss', person: 'Kunal', amount: 100, currentValue: 0, gain: -100 },
    { id: 5, name: 'Unchanged', person: 'Kunal', amount: 100, currentValue: 100, gain: 0 },
  ], totals: { Pooja: 10000, Kunal: 200, combined: 10200 }, valuations: {
    Pooja: { currentValue: 1110, gain: 110, missing: 1 },
    Kunal: { currentValue: 100, gain: -100, missing: 0 },
    combined: { currentValue: 1210, gain: 10, missing: 1 },
  } }));
  await f.context.loadInvestments();
  assert.equal(f.elements.investmentPoojaGain.textContent, '+₹110.00 (+11.00%)');
  assert.equal(f.elements.investmentKunalGain.textContent, '-₹100.00 (-50.00%)');
  assert.equal(f.elements.investmentTotalGain.textContent, '+₹10.00 (+0.83%)');
  assert.match(f.elements.investmentRows.innerHTML, /\+20\.00%/);
  assert.match(f.elements.investmentRows.innerHTML, /-100\.00%/);
  assert.match(f.elements.investmentRows.innerHTML, /₹0\.00 \(0\.00%\)/);
  assert.doesNotMatch(f.elements.investmentRows.innerHTML, /NaN|Infinity/);
});

test('investment filters combine owner, case-insensitive name, and valuation status without changing totals', async () => {
  const f = fixture();
  f.responses.push(ok({ ...data, entries: [
    { id: 1, name: 'Gold fund', person: 'Pooja', amount: 100, currentValue: 0, gain: -100 },
    { id: 2, name: 'Gold FD', person: 'Kunal', amount: 200, currentValue: null, gain: null },
    { id: 3, name: 'PPF', person: 'Pooja', amount: 300, currentValue: null, gain: null },
  ] }));
  await f.context.loadInvestments();
  f.elements.investmentSearch.value = '  GOLD  ';
  f.elements.investmentValuationFilter.value = 'valued';
  f.context.renderInvestments();
  assert.match(f.elements.investmentRows.innerHTML, /Gold fund/);
  assert.doesNotMatch(f.elements.investmentRows.innerHTML, /Gold FD|PPF/);
  f.context.globalPersonFilter = 'Kunal';
  f.elements.investmentValuationFilter.value = 'missing';
  f.context.renderInvestments();
  assert.equal(f.elements.investmentOwnerFilter.value, 'Kunal');
  assert.match(f.elements.investmentRows.innerHTML, /Gold FD/);
  assert.doesNotMatch(f.elements.investmentRows.innerHTML, /Gold fund|PPF/);
  assert.match(f.elements.investmentTotal.textContent, /300\.25/);
  f.elements.investmentSearch.value = 'Not present';
  f.context.renderInvestments();
  assert.match(f.elements.investmentRows.innerHTML, /No investments match these filters/);
});

test('editing expands the investment form and cancelling collapses it', async () => {
  const f = fixture(); f.responses.push(ok(data)); await f.context.loadInvestments();
  f.elements.investmentFormDetails.open = false;
  f.context.editInvestment(1);
  assert.equal(f.elements.investmentFormDetails.open, true);
  assert.equal(f.elements.investmentName.value, '<Fund>');
  f.context.resetInvestmentForm();
  assert.equal(f.elements.investmentFormDetails.open, false);
  assert.equal(f.elements.investmentFormTitle.textContent, 'Add investment');
});
