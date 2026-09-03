const assert = require('node:assert/strict');
const test = require('node:test');

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const { registerBudgetRoutes } = require('../server');

function createApp() {
  const routes = new Map();
  return {
    routes,
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    put(path, handler) { routes.set(`PUT ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function createService(overrides = {}) {
  return {
    getBudget: (...args) => ({ operation: 'get', args }),
    replaceBudget: (...args) => ({ operation: 'replace', args }),
    replaceMappings: (...args) => ({ operation: 'mappings', args }),
    copyBudget: (...args) => ({ operation: 'copy', args }),
    ...overrides,
  };
}

function route(app, method, path) {
  const handler = app.routes.get(`${method} ${path}`);
  assert.ok(handler, `${method} ${path} should be registered`);
  return handler;
}

test('GET budget defaults person to all and returns service data', () => {
  const app = createApp();
  const service = createService({ getBudget: input => ({ month: input.month, person: input.person, hasBudget: true }) });
  registerBudgetRoutes(app, service);

  const res = createResponse();
  route(app, 'GET', '/api/budget')({ query: { month: 'September_2026' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { month: 'September_2026', person: 'all', hasBudget: true });
});

test('PUT budget uses path month and body person/lines', () => {
  const app = createApp();
  let received;
  registerBudgetRoutes(app, createService({ replaceBudget: input => { received = input; return { saved: true, count: 1 }; } }));

  const res = createResponse();
  route(app, 'PUT', '/api/budget/:month')({
    params: { month: 'September_2026' },
    body: { person: 'Pooja', lines: [{ section: 'Home', category: 'Rent' }] },
  }, res);

  assert.deepEqual(received, {
    month: 'September_2026',
    person: 'Pooja',
    lines: [{ section: 'Home', category: 'Rent' }],
  });
  assert.deepEqual(res.body, { saved: true, count: 1 });
});

test('PUT mappings forwards the complete replacement', () => {
  const app = createApp();
  let received;
  registerBudgetRoutes(app, createService({ replaceMappings: input => { received = input; return { saved: true, count: 2 }; } }));
  const body = { section: 'Home', budgetCategory: 'Rent', kind: 'expense', transactionCategories: ['Rent', 'Petrol'] };

  const res = createResponse();
  route(app, 'PUT', '/api/budget-mappings')({ body }, res);

  assert.deepEqual(received, body);
  assert.deepEqual(res.body, { saved: true, count: 2 });
});

test('copy converts service conflict to HTTP 409', () => {
  const app = createApp();
  registerBudgetRoutes(app, createService({ copyBudget: () => { const error = new Error('Target budget already exists'); error.code = 'conflict'; throw error; } }));

  const res = createResponse();
  route(app, 'POST', '/api/budget/:month/copy')({
    params: { month: 'September_2026' },
    body: { targetMonth: 'October_2026', person: 'all', replace: false },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Target budget already exists' });
});

test('validation errors return HTTP 400 without leaking stacks', () => {
  const app = createApp();
  registerBudgetRoutes(app, createService({ replaceBudget: () => { const error = new Error('Month must use Month_YYYY'); error.code = 'validation'; error.stack = 'sensitive stack'; throw error; } }));

  const res = createResponse();
  route(app, 'PUT', '/api/budget/:month')({ params: { month: 'bad' }, body: { person: 'Pooja', lines: [] } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Month must use Month_YYYY' });
  assert.equal(JSON.stringify(res.body).includes('stack'), false);
});

test('missing source returns HTTP 404', () => {
  const app = createApp();
  registerBudgetRoutes(app, createService({ copyBudget: () => { const error = new Error('Source budget was not found'); error.code = 'not_found'; throw error; } }));

  const res = createResponse();
  route(app, 'POST', '/api/budget/:month/copy')({
    params: { month: 'September_2026' },
    body: { targetMonth: 'October_2026', person: 'Pooja', replace: false },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Source budget was not found' });
});
