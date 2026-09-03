const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_PATH = path.join(__dirname, '..', 'public', 'app.js');
const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

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

function createBudgetWorkflow({ responses = [], person = 'Pooja', amountValues = ['0', '1000'], checkedCategories = [] } = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const start = source.indexOf('// ─── Budget Display Helpers');
  const end = source.indexOf('// ─── Trends Tab', start);
  assert.notEqual(start, -1, 'budget workflow slice must exist');
  assert.notEqual(end, -1, 'budget workflow slice must have an end marker');

  const amountInputs = amountValues.map(value => element({ value }));
  const mappingInputs = checkedCategories.map(value => element({ value, checked: true }));
  const dashboardOptions = [
    { value: 'August_2026', textContent: 'August 2026' },
    { value: 'September_2026', textContent: 'September 2026' },
    { value: 'October_2026', textContent: 'October 2026 —' },
  ];
  const elements = {
    monthPicker: element({ value: 'September_2026', options: dashboardOptions }),
    budgetMonthPicker: element({ value: 'September_2026', options: dashboardOptions.map(option => ({ ...option })) }),
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
      const response = responseQueue.shift() || { ok: true, status: 200, body: budgetFixture(person) };
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
  assert.doesNotMatch(elements.budgetSections.innerHTML, /<First>|<Rent>/);
  assert.ok(elements.budgetSections.innerHTML.indexOf('&lt;First&gt;') < elements.budgetSections.innerHTML.indexOf('Second'));
});

test('a personal budget edit renders numeric inputs without blanking zero', () => {
  const { workflow, elements } = createBudgetWorkflow();
  workflow.setData(budgetFixture());

  workflow.beginBudgetEdit();

  assert.equal(workflow.getState().editing, true);
  assert.match(elements.budgetSections.innerHTML, /class="budget-amount-input"[^>]*type="number"[^>]*value="0"/);
});

test('saving sends the complete person line set and reloads the affected month', async () => {
  const { workflow, requests, dashboardLoads } = createBudgetWorkflow({
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
