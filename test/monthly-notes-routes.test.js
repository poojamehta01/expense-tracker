const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const { registerMonthlyNotesRoutes } = require('../server');

function createApp() {
  const routes = new Map();
  return {
    routes,
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    delete(path, handler) { routes.set(`DELETE ${path}`, handler); },
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

function route(app, method, path) {
  const handler = app.routes.get(`${method} ${path}`);
  assert.ok(handler, `${method} ${path} should be registered`);
  return handler;
}

test('monthly notes routes list shared notes and attribute new notes to the signed-in user', () => {
  const app = createApp();
  const calls = [];
  const service = {
    listNotes(input) { calls.push(['list', input]); return [{ id: 1, author: 'Kunal', body: 'Shared' }]; },
    addNote(input) { calls.push(['add', input]); return { id: 2, ...input }; },
    deleteNote() {},
  };
  registerMonthlyNotesRoutes(app, service);

  const listRes = createResponse();
  route(app, 'GET', '/api/monthly-notes')({ query: { month: 'September_2026' }, user: { email: 'pooja@example.com', name: 'Renamed User' } }, listRes);
  assert.deepEqual(listRes.body, { notes: [{ id: 1, author: 'Kunal', body: 'Shared' }] });

  const addRes = createResponse();
  route(app, 'POST', '/api/monthly-notes')({ body: { month: 'September_2026', body: 'Card entered through Sep 10' }, user: { email: 'kunal@example.com', name: 'Pooja Spoof' } }, addRes);
  assert.equal(addRes.statusCode, 201);
  assert.deepEqual(calls, [
    ['list', { month: 'September_2026' }],
    ['add', { month: 'September_2026', author: 'Kunal', body: 'Card entered through Sep 10' }],
  ]);
});

test('monthly notes route maps ownership failures to HTTP 403', () => {
  const app = createApp();
  const service = {
    listNotes() {},
    addNote() {},
    deleteNote() { const error = new Error('Only the author can delete this note'); error.code = 'forbidden'; throw error; },
  };
  registerMonthlyNotesRoutes(app, service);

  const res = createResponse();
  route(app, 'DELETE', '/api/monthly-notes/:id')({ params: { id: '7' }, query: { month: 'September_2026' }, user: { email: 'pooja@example.com' } }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Only the author can delete this note' });
});

test('monthly notes reject an authenticated account without a canonical identity', () => {
  const app = createApp();
  const service = { listNotes() {}, addNote() {}, deleteNote() {} };
  registerMonthlyNotesRoutes(app, service);

  const res = createResponse();
  route(app, 'POST', '/api/monthly-notes')({ body: { month: 'September_2026', body: 'Note' }, user: { email: 'shared@example.com', name: 'Pooja' } }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Account is not mapped to Pooja or Kunal' });
});
