const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_PATH = path.join(__dirname, '..', 'public', 'app.js');
const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const STYLE_PATH = path.join(__dirname, '..', 'public', 'style.css');

function loadBudgetHelpers() {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const start = source.indexOf('// ─── Budget Display Helpers');
  const end = source.indexOf('// ─── Budget API Workflow', start);

  assert.notEqual(start, -1, 'budget display helpers must exist');
  assert.notEqual(end, -1, 'budget display helpers must have an end marker');

  const context = vm.createContext({});
  vm.runInContext(
    `${source.slice(start, end)}\n` +
      'globalThis.helpersForTest = { budgetStatusPresentation, budgetUsagePresentation, buildBudgetSaveLines };',
    context
  );
  return context.helpersForTest;
}

test('Budget navigation and render targets are present', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  assert.match(html, /id="tab-btn-budget"[^>]*onclick="switchTab\('budget'\)"/);
  assert.match(html, /id="tab-budget"/);
  assert.match(html, /id="budgetMonthPicker"/);
  assert.match(html, /id="budgetPersonPicker"/);
  assert.match(html, /id="budgetSummary"/);
  assert.match(html, /id="budgetSections"/);
});

test('budget status presentation uses the mapping warning treatment', () => {
  const { budgetStatusPresentation } = loadBudgetHelpers();

  assert.deepEqual(
    { ...budgetStatusPresentation('mapping_needed') },
    { label: 'Mapping needed', className: 'budget-status--mapping' }
  );
});

test('budget usage presents zero-budget actuals as fully unbudgeted', () => {
  const { budgetUsagePresentation } = loadBudgetHelpers();

  assert.deepEqual(
    { ...budgetUsagePresentation({ budget: 0, actual: 1250, usage: null }) },
    { label: 'Unbudgeted', width: 100 }
  );
  assert.deepEqual(
    { ...budgetUsagePresentation({ budget: 0, actual: 0, usage: null }) },
    { label: '—', width: 0 }
  );
});

test('budget usage clamps only the visual width to its valid range', () => {
  const { budgetUsagePresentation } = loadBudgetHelpers();

  assert.deepEqual(
    { ...budgetUsagePresentation({ budget: 100, actual: 150, usage: 1.5 }) },
    { label: '150%', width: 100 }
  );
  assert.deepEqual(
    { ...budgetUsagePresentation({ budget: 100, actual: -10, usage: -0.1 }) },
    { label: '-10%', width: 0 }
  );
});

test('save-line construction preserves labels and numeric zero amounts', () => {
  const { buildBudgetSaveLines } = loadBudgetHelpers();
  const sections = [{
    section: "Adviser's plan",
    lines: [
      { category: "Adviser's buffer", kind: 'expense', amount: 0, budget: 999, sort_order: 4 },
      { category: 'Index fund', kind: 'investment', amount: 2500, sort_order: 5 },
    ],
  }];

  assert.deepEqual(
    Array.from(buildBudgetSaveLines(sections), line => ({ ...line })),
    [
      { section: "Adviser's plan", category: "Adviser's buffer", kind: 'expense', amount: 0, sort_order: 4 },
      { section: "Adviser's plan", category: 'Index fund', kind: 'investment', amount: 2500, sort_order: 5 },
    ]
  );
});

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      const enabled = force === undefined ? !values.has(name) : force;
      if (enabled) values.add(name); else values.delete(name);
      return enabled;
    },
  };
}

function element(initial = {}) {
  return {
    classList: classList(initial.hidden ? ['hidden'] : []),
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    options: [],
    dataset: {},
    style: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    appendChild(child) { this.options.push(child); },
    ...initial,
  };
}

function budgetFixture(person = 'Pooja') {
  return {
    month: 'September_2026',
    person,
    hasBudget: true,
    hasSalary: true,
    summary: {
      expenseBudget: 1000,
      actualSpending: 250,
      variance: 750,
      usage: 0.25,
      salary: 5000,
      netMonthlySavings: 4750,
      plannedInvestments: 0,
      actualInvestments: 0,
    },
    sections: [{
      section: 'Home',
      budget: 1000,
      actual: 250,
      variance: 750,
      usage: 0.25,
      lines: [
        {
          section: 'Home', category: 'Rent', kind: 'expense', budget: 0,
          actual: 250, variance: -250, usage: null, hasMappings: true,
          mappings: ['Rent'], sort_order: 0, status: 'unbudgeted',
        },
        {
          section: 'Home', category: 'Utilities', kind: 'expense', budget: 1000,
          actual: 0, variance: 1000, usage: 0, hasMappings: false,
          mappings: [], sort_order: 1, status: 'mapping_needed',
        },
      ],
    }],
    unmappedCount: 1,
  };
}

function deferredResponse() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createBudgetWorkflow({
  responses = [],
  person = 'Pooja',
  amountValues = ['0', '1000'],
  checkedCategories = [],
  monthOptions = null,
  selectedMonth = 'September_2026',
  budgetSelectedMonth = selectedMonth,
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const start = source.indexOf('// ─── Budget Display Helpers');
  const end = source.indexOf('// ─── Trends Tab', start);
  assert.notEqual(start, -1, 'budget workflow slice must exist');
  assert.notEqual(end, -1, 'budget workflow slice must have an end marker');

  const amountInputs = amountValues.map(value => element({ value }));
  const mappingInputs = checkedCategories.map(value => element({ value, checked: true }));
  const dashboardOptions = monthOptions || [
    { value: 'August_2026', textContent: 'August 2026' },
    { value: 'September_2026', textContent: 'September 2026' },
    { value: 'October_2026', textContent: 'October 2026 —' },
  ];
  const elements = {
    monthPicker: element({ value: selectedMonth, options: dashboardOptions }),
    budgetMonthPicker: element({ value: budgetSelectedMonth, options: dashboardOptions.map(option => ({ ...option })) }),
    budgetPersonPicker: element({ value: person }),
    budgetEditBtn: element(),
    budgetCopyBtn: element(),
    budgetLoading: element({ hidden: true }),
    budgetError: element({ hidden: true }),
    budgetEmpty: element({ hidden: true }),
    budgetSummary: element(),
    budgetSections: element(),
    budgetMappingModal: element({ hidden: true }),
    budgetMappingLabel: element(),
    budgetMappingCategories: element(),
    budgetMappingSaveBtn: element(),
    budgetCopyModal: element({ hidden: true }),
    budgetCopyTargetMonth: element({ value: 'October_2026' }),
    budgetCopyMessage: element(),
    budgetCopyConfirmBtn: element(),
    budgetCopyReplaceBtn: element({ hidden: true }),
  };
  const requests = [];
  const dashboardLoads = [];
  const responseQueue = [...responses];
  const context = vm.createContext({
    document: {
      getElementById: id => elements[id] || null,
      createElement: tag => element({ tagName: tag.toUpperCase() }),
      querySelectorAll: selector => {
        if (selector === '.budget-amount-input') return amountInputs;
        if (selector === '#budgetMappingCategories input:checked') return mappingInputs;
        return [];
      },
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      const response = await (responseQueue.shift() || { ok: true, status: 200, body: budgetFixture(person) });
      return {
        ok: response.ok,
        status: response.status,
        json: async () => response.body,
      };
    },
    loadDashboard: month => { dashboardLoads.push(month); },
    formatCurrency: value => `₹${Number(value)}`,
    esc: value => String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;'),
    CATEGORIES: ['Rent', 'Utilities', '<Unsafe>'],
    console: { error() {} },
  });
  vm.runInContext(
    `let globalPersonFilter = ${JSON.stringify(person)};
     ${source.slice(start, end)}
     globalThis.workflowForTest = {
       initBudgetTab, loadBudget, renderBudget, beginBudgetEdit, cancelBudgetEdit,
       saveBudget, openBudgetMapping, saveBudgetMapping, copyBudgetMonth,
       openBudgetCopy, closeBudgetCopy,
       setData(data, selectedPerson = data.person) {
         budgetState.month = data.month;
         budgetState.person = selectedPerson;
         budgetState.data = data;
         budgetState.editing = false;
         budgetState.saving = false;
         document.getElementById('budgetMonthPicker').value = data.month;
         document.getElementById('budgetPersonPicker').value = selectedPerson;
       },
       getState: () => budgetState,
     };`,
    context
  );
  return { workflow: context.workflowForTest, elements, amountInputs, requests, dashboardLoads };
}

test('Combined budgets remain read-only and server labels are escaped in API order', () => {
  const { workflow, elements } = createBudgetWorkflow({ person: 'all' });
  const data = budgetFixture('all');
  data.sections = [
    { ...data.sections[0], section: '<First>', lines: [{ ...data.sections[0].lines[0], section: '<First>', category: '<Rent>' }] },
    { ...data.sections[0], section: 'Second', lines: [{ ...data.sections[0].lines[1], section: 'Second' }] },
  ];
  workflow.setData(data, 'all');

  workflow.renderBudget();

  assert.equal(elements.budgetEditBtn.disabled, true);
  assert.doesNotMatch(elements.budgetSections.innerHTML, /budget-amount-input/);
  assert.doesNotMatch(elements.budgetSections.innerHTML, /openBudgetMapping|>Map</);
  assert.doesNotMatch(elements.budgetSections.innerHTML, /<First>|<Rent>/);
  assert.ok(elements.budgetSections.innerHTML.indexOf('&lt;First&gt;') < elements.budgetSections.innerHTML.indexOf('Second'));
});

test('an older successful load cannot replace the active month response', async () => {
  const older = deferredResponse();
  const current = budgetFixture();
  current.month = 'October_2026';
  current.sections[0].lines[0].category = 'Current month rent';
  const { workflow, elements } = createBudgetWorkflow({
    responses: [older.promise, { ok: true, status: 200, body: current }],
  });
  workflow.setData(budgetFixture());
  workflow.beginBudgetEdit();

  const olderLoad = workflow.loadBudget();
  assert.equal(workflow.getState().data, null);
  assert.equal(workflow.getState().editing, false);
  assert.equal(elements.budgetEditBtn.disabled, true);
  assert.equal(elements.budgetEditBtn.textContent, 'Edit budget');
  assert.equal(elements.budgetSections.innerHTML, '');

  elements.budgetMonthPicker.value = 'October_2026';
  const currentLoad = workflow.loadBudget();
  await currentLoad;
  older.resolve({ ok: true, status: 200, body: budgetFixture() });
  await olderLoad;

  assert.equal(workflow.getState().month, 'October_2026');
  assert.equal(workflow.getState().data.month, 'October_2026');
  assert.match(elements.budgetSections.innerHTML, /Current month rent/);
  assert.equal(elements.budgetError.classList.contains('hidden'), true);
});

test('a late load error cannot overwrite the active selection', async () => {
  const older = deferredResponse();
  const current = budgetFixture();
  current.month = 'October_2026';
  const { workflow, elements } = createBudgetWorkflow({
    responses: [older.promise, { ok: true, status: 200, body: current }],
  });

  const olderLoad = workflow.loadBudget();
  elements.budgetMonthPicker.value = 'October_2026';
  await workflow.loadBudget();
  older.resolve({ ok: false, status: 500, body: { error: 'Late failure' } });
  await olderLoad;

  assert.equal(workflow.getState().month, 'October_2026');
  assert.equal(workflow.getState().data.month, 'October_2026');
  assert.equal(elements.budgetError.textContent, '');
  assert.equal(elements.budgetError.classList.contains('hidden'), true);
});

test('an active failed load clears stale data and cannot submit a stale replacement', async () => {
  const { workflow, elements, requests } = createBudgetWorkflow({
    responses: [{ ok: false, status: 500, body: { error: 'Budget unavailable' } }],
  });
  workflow.setData(budgetFixture());
  workflow.beginBudgetEdit();

  await workflow.loadBudget();
  workflow.beginBudgetEdit();
  await workflow.saveBudget();

  assert.equal(workflow.getState().data, null);
  assert.equal(workflow.getState().editing, false);
  assert.equal(elements.budgetEditBtn.disabled, true);
  assert.equal(elements.budgetEditBtn.textContent, 'Edit budget');
  assert.equal(elements.budgetSections.innerHTML, '');
  assert.equal(elements.budgetError.textContent, 'Budget unavailable');
  assert.equal(requests.some(request => request.options.method === 'PUT'), false);
});

test('a personal budget edit renders numeric inputs without blanking zero', () => {
  const { workflow, elements } = createBudgetWorkflow();
  workflow.setData(budgetFixture());

  workflow.beginBudgetEdit();

  assert.equal(workflow.getState().editing, true);
  assert.match(elements.budgetSections.innerHTML, /class="[^"]*budget-amount-input[^"]*"[^>]*type="number"[^>]*value="0"/);
});

test('saving sends the complete person line set and reloads the affected month', async () => {
  const { workflow, elements, requests, dashboardLoads } = createBudgetWorkflow({
    amountValues: ['0', '1250'],
    responses: [
      { ok: true, status: 200, body: { saved: true, count: 2 } },
      { ok: true, status: 200, body: budgetFixture() },
    ],
  });
  workflow.setData(budgetFixture());
  workflow.beginBudgetEdit();

  await workflow.saveBudget();

  const put = requests.find(request => request.options.method === 'PUT');
  assert.equal(put.url, '/api/budget/September_2026');
  assert.deepEqual(JSON.parse(put.options.body), {
    person: 'Pooja',
    lines: [
      { section: 'Home', category: 'Rent', kind: 'expense', amount: 0, sort_order: 0 },
      { section: 'Home', category: 'Utilities', kind: 'expense', amount: 1250, sort_order: 1 },
    ],
  });
  assert.deepEqual(dashboardLoads, ['September_2026']);
  assert.equal(elements.budgetCopyBtn.disabled, false);
});

test('a failed save retains edited values and displays the server error', async () => {
  const { workflow, elements, amountInputs } = createBudgetWorkflow({
    amountValues: ['75', '1000'],
    responses: [{ ok: false, status: 400, body: { error: 'Budget amount is invalid' } }],
  });
  workflow.setData(budgetFixture());
  workflow.beginBudgetEdit();

  await workflow.saveBudget();

  assert.equal(workflow.getState().editing, true);
  assert.equal(amountInputs[0].value, '75');
  assert.equal(elements.budgetError.textContent, 'Budget amount is invalid');
  assert.equal(elements.budgetError.classList.contains('hidden'), false);
});

test('mapping save replaces checked categories for the selected budget line', async () => {
  const { workflow, elements, requests } = createBudgetWorkflow({
    checkedCategories: ['Rent', 'Utilities'],
    responses: [
      { ok: true, status: 200, body: { saved: true, count: 2 } },
      { ok: true, status: 200, body: budgetFixture() },
    ],
  });
  workflow.setData(budgetFixture());
  workflow.openBudgetMapping({ section: 'Home', category: 'Housing', kind: 'expense', mappings: ['Rent'] });

  await workflow.saveBudgetMapping();

  const put = requests.find(request => request.url === '/api/budget-mappings');
  assert.deepEqual(JSON.parse(put.options.body), {
    section: 'Home',
    budgetCategory: 'Housing',
    kind: 'expense',
    transactionCategories: ['Rent', 'Utilities'],
  });
  assert.equal(elements.budgetEditBtn.disabled, false);
});

test('Combined defensively rejects direct mapping edit and save calls', async () => {
  const { workflow, elements, requests } = createBudgetWorkflow({
    person: 'all',
    checkedCategories: ['Rent'],
  });
  workflow.setData(budgetFixture('all'), 'all');

  workflow.openBudgetMapping({ section: 'Home', category: 'Rent', kind: 'expense', mappings: ['Rent'] });
  await workflow.saveBudgetMapping();

  assert.equal(workflow.getState().mappingLine, null);
  assert.equal(elements.budgetMappingModal.classList.contains('hidden'), true);
  assert.equal(requests.some(request => request.url === '/api/budget-mappings'), false);
});

test('copy conflict opens replacement confirmation without retrying automatically', async () => {
  const { workflow, elements, requests } = createBudgetWorkflow({
    responses: [{ ok: false, status: 409, body: { error: 'Target budget already exists' } }],
  });
  workflow.setData(budgetFixture());
  workflow.openBudgetCopy();

  await workflow.copyBudgetMonth(false);

  assert.equal(requests.filter(request => request.options.method === 'POST').length, 1);
  assert.equal(elements.budgetCopyModal.classList.contains('hidden'), false);
  assert.equal(elements.budgetCopyReplaceBtn.classList.contains('hidden'), false);
  assert.match(elements.budgetCopyMessage.textContent, /September 2026.*October 2026/s);
});

test('confirmed replacement repeats the copy request with replace true', async () => {
  const { workflow, elements, requests } = createBudgetWorkflow({
    responses: [
      { ok: false, status: 409, body: { error: 'Target budget already exists' } },
      { ok: true, status: 200, body: { saved: true, count: 2 } },
    ],
  });
  workflow.setData(budgetFixture());
  workflow.openBudgetCopy();
  await workflow.copyBudgetMonth(false);

  await workflow.copyBudgetMonth(true);

  const posts = requests.filter(request => request.options.method === 'POST');
  assert.equal(posts.length, 2);
  assert.deepEqual(JSON.parse(posts[1].options.body), {
    targetMonth: 'October_2026', person: 'Pooja', replace: true,
  });
  assert.equal(elements.budgetEditBtn.disabled, false);
});

test('Common global filter initializes Budget as Combined and preserves month option labels', async () => {
  const { workflow, elements } = createBudgetWorkflow({
    person: 'Common',
    responses: [{ ok: true, status: 200, body: budgetFixture('all') }],
  });

  await workflow.initBudgetTab();

  assert.equal(elements.budgetPersonPicker.value, 'all');
  assert.deepEqual(
    Array.from(elements.budgetMonthPicker.options, option => option.textContent),
    ['August 2026', 'September 2026', 'October 2026 —']
  );
});

test('opening Budget synchronizes its pre-populated month picker with the Dashboard month', async () => {
  const { workflow, elements } = createBudgetWorkflow({
    selectedMonth: 'September_2026',
    budgetSelectedMonth: 'August_2026',
  });

  await workflow.initBudgetTab();

  assert.equal(elements.budgetMonthPicker.value, 'September_2026');
});

function createDashboardWorkflow({
  person = 'Pooja',
  transactionCount = 1,
  budget = budgetFixture(person),
  budgetResponses = [],
  budgetError = null,
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const dashboardStart = source.indexOf('async function loadDashboard(month)');
  const dashboardEnd = source.indexOf('let chartsVisible', dashboardStart);
  const helpersStart = source.indexOf('// ─── Budget Display Helpers');
  const helpersEnd = source.indexOf('// ─── Budget API Workflow', helpersStart);
  const filterStart = source.indexOf('function setGlobalFilter(person)');
  const filterEnd = source.indexOf('function applyGlobalFilter()', filterStart);
  assert.notEqual(dashboardStart, -1, 'dashboard workflow must exist');
  assert.notEqual(dashboardEnd, -1, 'dashboard workflow must have an end marker');
  assert.notEqual(helpersStart, -1, 'budget display helpers must exist');
  assert.notEqual(helpersEnd, -1, 'budget display helpers must have an end marker');
  assert.notEqual(filterStart, -1, 'global filter workflow must exist');
  assert.notEqual(filterEnd, -1, 'global filter workflow must have an end marker');

  const monthOptions = [
    { value: 'August_2026', textContent: 'August 2026' },
    { value: 'September_2026', textContent: 'September 2026' },
  ];
  const elements = {
    monthPicker: element({ value: 'September_2026', options: monthOptions }),
    budgetMonthPicker: element({ value: '', options: monthOptions.map(option => ({ ...option })) }),
    budgetPersonPicker: element({ value: 'all' }),
    dashboardEmpty: element({ hidden: true }),
    merchantsSection: element(),
    savedTxSection: element(),
    chartsGrid: element(),
    chartsToggleIcon: element(),
    dashboardBudgetCard: element(),
    dashboardBudgetTitle: element(),
    dashboardBudgetAmount: element(),
    dashboardBudgetVariance: element(),
    dashboardBudgetProgress: element(),
    dashboardBudgetProgressFill: element(),
    dashboardBudgetUsage: element(),
    dashboardBudgetAction: element(),
  };
  const requests = [];
  const switchedTabs = [];
  const responseQueue = [...budgetResponses];
  const context = vm.createContext({
    document: {
      getElementById: id => elements[id] || null,
      querySelectorAll: () => [],
    },
    fetch: async url => {
      requests.push(url);
      if (url.startsWith('/api/budget')) {
        if (budgetError) throw budgetError;
        const queued = responseQueue.shift();
        if (queued) {
          const response = await queued;
          return {
            ok: response.ok,
            status: response.status,
            json: async () => response.body,
          };
        }
        return { ok: true, status: 200, json: async () => budget };
      }
      const body = url.startsWith('/api/dashboard')
        ? { transactionCount }
        : url.startsWith('/api/transactions')
          ? { transactions: [] }
          : {};
      return { ok: true, status: 200, json: async () => body };
    },
    renderSalaryKPIs() {},
    renderTransactionsList() {},
    applyGlobalFilter() {},
    formatCurrency: value => `₹${Number(value)}`,
    switchTab: name => switchedTabs.push(name),
    copyMonthOptions() {},
    console: { error() {} },
  });
  vm.runInContext(
    `let globalPersonFilter = ${JSON.stringify(person)};
     let _lastDashData = null;
     let chartPersonFilter = 'all';
     let chartsVisible = false;
     let trendsLoaded = false;
     const budgetState = { initialized: false };
     ${source.slice(dashboardStart, dashboardEnd)}
     ${source.slice(filterStart, filterEnd)}
     ${source.slice(helpersStart, helpersEnd)}
     globalThis.dashboardForTest = {
       loadDashboard, loadDashboardBudget, renderDashboardBudget, openBudgetDetails, setGlobalFilter,
       setPersonForTest(person) { globalPersonFilter = person; },
     };`,
    context
  );

  return { workflow: context.dashboardForTest, elements, requests, switchedTabs };
}

test('Dashboard contains the compact budget card targets', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  assert.match(html, /id="dashboardBudgetCard"/);
  assert.match(html, /id="dashboardBudgetProgress"/);
  assert.match(html, /id="dashboardBudgetAction"/);
});

test('Dashboard loads and renders budget in the same refresh even without transactions', async () => {
  const { workflow, elements, requests } = createDashboardWorkflow({ transactionCount: 0 });

  await workflow.loadDashboard('September_2026');

  assert.deepEqual(requests, [
    '/api/dashboard?month=September_2026',
    '/api/transactions?month=September_2026',
    '/api/salary?month=September_2026',
    '/api/budget?month=September_2026&person=Pooja',
  ]);
  assert.equal(elements.dashboardEmpty.classList.contains('hidden'), false);
  assert.equal(elements.dashboardBudgetAmount.textContent, '₹250 of ₹1000');
});

test('Dashboard budget requests Combined data for the Common filter', async () => {
  const { workflow, requests } = createDashboardWorkflow({ person: 'Common', budget: budgetFixture('all') });

  await workflow.loadDashboard('September_2026');

  assert.equal(requests[3], '/api/budget?month=September_2026&person=all');
});

test('a late Dashboard budget success cannot replace the active month', async () => {
  const older = deferredResponse();
  const current = budgetFixture();
  current.summary.actualSpending = 400;
  const { workflow, elements } = createDashboardWorkflow({
    budgetResponses: [older.promise, { ok: true, status: 200, body: current }],
  });

  elements.monthPicker.value = 'August_2026';
  const olderLoad = workflow.loadDashboardBudget('August_2026');
  elements.monthPicker.value = 'September_2026';
  await workflow.loadDashboardBudget('September_2026');
  const oldData = budgetFixture();
  oldData.month = 'August_2026';
  oldData.summary.actualSpending = 50;
  older.resolve({ ok: true, status: 200, body: oldData });
  await olderLoad;

  assert.equal(elements.dashboardBudgetAmount.textContent, '₹400 of ₹1000');
});

test('a late Dashboard budget error cannot replace the active person', async () => {
  const older = deferredResponse();
  const current = budgetFixture('Kunal');
  current.summary.actualSpending = 600;
  const { workflow, elements } = createDashboardWorkflow({
    budgetResponses: [older.promise, { ok: true, status: 200, body: current }],
  });

  const olderLoad = workflow.loadDashboardBudget('September_2026');
  workflow.setPersonForTest('Kunal');
  await workflow.loadDashboardBudget('September_2026');
  older.resolve({ ok: false, status: 500, body: { error: 'Late failure' } });
  await olderLoad;

  assert.equal(elements.dashboardBudgetTitle.textContent, 'Budget health');
  assert.equal(elements.dashboardBudgetAmount.textContent, '₹600 of ₹1000');
});

test('changing the global person filter refreshes Dashboard budget context', () => {
  const { workflow, requests } = createDashboardWorkflow();

  workflow.setGlobalFilter('Common');

  assert.deepEqual(requests, ['/api/budget?month=September_2026&person=all']);
});

test('Dashboard budget renders positive totals, remaining variance, and clamped progress', () => {
  const data = budgetFixture();
  data.summary.usage = 1.5;
  data.summary.variance = -500;
  const { workflow, elements } = createDashboardWorkflow({ budget: data });

  workflow.renderDashboardBudget(data);

  assert.equal(elements.dashboardBudgetAmount.textContent, '₹250 of ₹1000');
  assert.equal(elements.dashboardBudgetVariance.textContent, '₹500 overspent');
  assert.equal(elements.dashboardBudgetProgressFill.style.width, '100%');
  assert.equal(elements.dashboardBudgetUsage.textContent, '150% used');
  assert.equal(elements.dashboardBudgetProgress.attributes['aria-valuenow'], '100');
  assert.equal(elements.dashboardBudgetProgress.attributes['aria-valuetext'], '150% used');
});

test('Dashboard budget offers creation when the selected month has no budget', () => {
  const { workflow, elements } = createDashboardWorkflow();

  workflow.renderDashboardBudget({ hasBudget: false, summary: {} });

  assert.equal(elements.dashboardBudgetTitle.textContent, 'No budget set');
  assert.equal(elements.dashboardBudgetAction.textContent, 'Create budget');
  assert.equal(elements.dashboardBudgetProgress.classList.contains('hidden'), true);
});

test('Dashboard budget distinguishes non-OK and failed requests from a missing budget', async () => {
  const unavailable = createDashboardWorkflow({
    budgetResponses: [{ ok: false, status: 503, body: { error: 'Unavailable' } }],
  });
  await unavailable.workflow.loadDashboardBudget('September_2026');

  assert.equal(unavailable.elements.dashboardBudgetTitle.textContent, 'Budget unavailable');
  assert.equal(unavailable.elements.dashboardBudgetAction.textContent, 'Open budget');
  assert.doesNotMatch(unavailable.elements.dashboardBudgetTitle.textContent, /No budget set/);

  const failed = createDashboardWorkflow({ budgetError: new Error('network down') });
  await failed.workflow.loadDashboardBudget('September_2026');

  assert.equal(failed.elements.dashboardBudgetTitle.textContent, 'Budget unavailable');
  assert.equal(failed.elements.dashboardBudgetAction.textContent, 'Open budget');
});

test('Dashboard budget presents zero-budget actuals as unbudgeted without invalid numbers', () => {
  const data = budgetFixture();
  data.summary.expenseBudget = 0;
  data.summary.actualSpending = 250;
  data.summary.variance = -250;
  data.summary.usage = null;
  const { workflow, elements } = createDashboardWorkflow({ budget: data });

  workflow.renderDashboardBudget(data);

  const rendered = [
    elements.dashboardBudgetTitle.textContent,
    elements.dashboardBudgetAmount.textContent,
    elements.dashboardBudgetVariance.textContent,
    elements.dashboardBudgetUsage.textContent,
  ].join(' ');
  assert.match(rendered, /Unbudgeted spending/);
  assert.doesNotMatch(rendered, /Infinity|NaN/);
  assert.equal(elements.dashboardBudgetProgress.classList.contains('hidden'), true);
  assert.equal(elements.dashboardBudgetProgressFill.style.width, '0%');
  assert.equal(elements.dashboardBudgetProgress.attributes['aria-valuenow'], undefined);
  assert.equal(elements.dashboardBudgetUsage.textContent, '');
});

test('opening Dashboard budget details preserves month and normalized person', () => {
  const { workflow, elements, switchedTabs } = createDashboardWorkflow({ person: 'Common' });

  workflow.openBudgetDetails();

  assert.equal(elements.budgetMonthPicker.value, 'September_2026');
  assert.equal(elements.budgetPersonPicker.value, 'all');
  assert.deepEqual(switchedTabs, ['budget']);
});

test('a missing Combined budget skips empty months and copies the latest populated source with conflict confirmation', async () => {
  const missing = budgetFixture('all');
  missing.hasBudget = false;
  missing.sections = [];
  const julyMissing = { ...missing, month: 'July_2026' };
  const juneSource = { ...budgetFixture('all'), month: 'June_2026' };
  const copied = budgetFixture('all');
  const { workflow, elements, requests, dashboardLoads } = createBudgetWorkflow({
    person: 'all',
    monthOptions: [
      { value: 'June_2026', textContent: 'June 2026' },
      { value: 'July_2026', textContent: 'July 2026' },
      { value: 'September_2026', textContent: 'September 2026' },
      { value: 'October_2026', textContent: 'October 2026' },
    ],
    responses: [
      { ok: true, status: 200, body: missing },
      { ok: true, status: 200, body: julyMissing },
      { ok: true, status: 200, body: juneSource },
      { ok: false, status: 409, body: { error: 'Target budget already exists' } },
      { ok: true, status: 200, body: { saved: true, count: 4 } },
      { ok: true, status: 200, body: copied },
    ],
  });

  await workflow.loadBudget();

  assert.equal(elements.budgetEditBtn.disabled, true);
  assert.equal(elements.budgetCopyBtn.disabled, false);
  assert.equal(elements.budgetCopyBtn.textContent, 'Copy June 2026');
  assert.equal(workflow.getState().copySourceMonth, 'June_2026');
  assert.deepEqual(requests.slice(0, 3).map(request => request.url), [
    '/api/budget?month=September_2026&person=all',
    '/api/budget?month=July_2026&person=all',
    '/api/budget?month=June_2026&person=all',
  ]);
  workflow.openBudgetCopy();
  assert.equal(elements.budgetCopyTargetMonth.value, 'September_2026');
  await workflow.copyBudgetMonth(false);

  let posts = requests.filter(request => request.options.method === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, '/api/budget/June_2026/copy');
  assert.deepEqual(JSON.parse(posts[0].options.body), {
    targetMonth: 'September_2026', person: 'all', replace: false,
  });
  assert.equal(elements.budgetCopyReplaceBtn.classList.contains('hidden'), false);
  assert.match(elements.budgetCopyMessage.textContent, /June 2026.*September 2026/s);

  await workflow.copyBudgetMonth(true);

  posts = requests.filter(request => request.options.method === 'POST');
  assert.deepEqual(JSON.parse(posts[1].options.body), {
    targetMonth: 'September_2026', person: 'all', replace: true,
  });
  assert.deepEqual(dashboardLoads, ['September_2026']);
});

test('a missing budget with no populated earlier month disables copy and sends no copy request', async () => {
  const missing = budgetFixture();
  missing.hasBudget = false;
  missing.sections = [];
  const { workflow, elements, requests } = createBudgetWorkflow({
    monthOptions: [
      { value: 'June_2026', textContent: 'June 2026' },
      { value: 'July_2026', textContent: 'July 2026' },
      { value: 'September_2026', textContent: 'September 2026' },
    ],
    responses: [
      { ok: true, status: 200, body: missing },
      { ok: true, status: 200, body: { ...missing, month: 'July_2026' } },
      { ok: true, status: 200, body: { ...missing, month: 'June_2026' } },
    ],
  });

  await workflow.loadBudget();

  assert.equal(workflow.getState().copySourceMonth, '');
  assert.equal(elements.budgetCopyBtn.disabled, true);
  assert.equal(elements.budgetCopyBtn.textContent, 'No earlier budget to copy');
  workflow.openBudgetCopy();
  await workflow.copyBudgetMonth(false);
  assert.equal(requests.some(request => request.options.method === 'POST'), false);
  assert.equal(elements.budgetCopyModal.classList.contains('hidden'), true);
});

test('earlier-budget discovery cannot publish after month selection changes', async () => {
  const discovery = deferredResponse();
  const septemberMissing = budgetFixture();
  septemberMissing.hasBudget = false;
  septemberMissing.sections = [];
  const october = budgetFixture();
  october.month = 'October_2026';
  const { workflow, elements, requests } = createBudgetWorkflow({
    monthOptions: [
      { value: 'July_2026', textContent: 'July 2026' },
      { value: 'September_2026', textContent: 'September 2026' },
      { value: 'October_2026', textContent: 'October 2026' },
    ],
    responses: [
      { ok: true, status: 200, body: septemberMissing },
      discovery.promise,
      { ok: true, status: 200, body: october },
    ],
  });

  const septemberLoad = workflow.loadBudget();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests[1].url, '/api/budget?month=July_2026&person=Pooja');

  elements.budgetMonthPicker.value = 'October_2026';
  await workflow.loadBudget();
  discovery.resolve({ ok: true, status: 200, body: { ...budgetFixture(), month: 'July_2026' } });
  await septemberLoad;

  assert.equal(workflow.getState().month, 'October_2026');
  assert.equal(workflow.getState().copySourceMonth, 'October_2026');
  assert.equal(elements.budgetCopyBtn.disabled, false);
  assert.equal(elements.budgetCopyBtn.textContent, 'Copy month');
});

function parseHexColor(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function relativeLuminance(hex) {
  const channels = parseHexColor(hex).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function cssCustomProperties(block) {
  return Object.fromEntries(Array.from(block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi), match => [match[1], match[2]]));
}

test('Budget status tokens meet WCAG AA contrast in light and dark themes', () => {
  const css = fs.readFileSync(STYLE_PATH, 'utf8');
  const light = cssCustomProperties(css.match(/:root\s*\{([^}]*)\}/s)?.[1] || '');
  const dark = cssCustomProperties(css.match(/body\.dark\s*\{([^}]*)\}/s)?.[1] || '');
  const statuses = ['good', 'watch', 'bad', 'muted', 'unbudgeted', 'mapping'];

  for (const theme of [light, dark]) {
    for (const status of statuses) {
      const foreground = theme[`--budget-${status}-text`];
      const background = theme[`--budget-${status}-bg`];
      assert.ok(foreground && background, `${status} status must define foreground and background tokens`);
      assert.ok(
        contrastRatio(foreground, background) >= 4.5,
        `${status} contrast must be at least 4.5:1, got ${contrastRatio(foreground, background).toFixed(2)}:1`
      );
      assert.match(css, new RegExp(`\\.budget-status--${status}[^}]*var\\(--budget-${status}-text\\)[^}]*var\\(--budget-${status}-bg\\)`));
    }
    assert.ok(theme['--budget-negative-text'], 'Dashboard negative/error text token must exist');
    assert.ok(
      contrastRatio(theme['--budget-negative-text'], theme['--white']) >= 4.5,
      `Dashboard negative/error contrast must be at least 4.5:1, got ${contrastRatio(theme['--budget-negative-text'], theme['--white']).toFixed(2)}:1`
    );
  }
  assert.match(css, /dashboard-budget-card\[data-state="over"\][^}]*var\(--budget-negative-text\)/s);
  assert.match(css, /dashboard-budget-card\[data-state="error"\][^}]*var\(--budget-negative-text\)/s);
});
