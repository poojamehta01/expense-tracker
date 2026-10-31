const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { jwks } = require('./helpers/oauth-fixture');

async function launch(t, enabled, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-startup-'));
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), BASE_URL: baseUrl,
      DB_PATH: path.join(directory, 'test.db'), MCP_ENABLED: enabled, GEMINI_API_KEY: 'test',
      GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test', ALLOWED_EMAILS: 'pooja@example.com',
      SESSION_SECRET: 'test-session-secret-of-at-least-32-characters',
      MCP_COOKIE_KEYS: JSON.stringify(['test-cookie-key-of-at-least-32-characters']),
      MCP_JWKS: JSON.stringify(jwks), DAILY_EMAIL_ENABLED: 'false', ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && child.exitCode === null && !output.includes('Expense Tracker listening')) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return { child, baseUrl, output, request: (url, options = {}) => fetch(baseUrl + url, { redirect: 'manual', ...options }) };
}

test('disabled MCP preserves website startup and session authentication', async t => {
  const x = await launch(t, 'false', { MCP_COOKIE_KEYS: '', MCP_JWKS: '' });
  assert.match(x.output, /Expense Tracker listening/);
  for (const route of ['/mcp', '/api/transactions', '/.well-known/oauth-protected-resource/mcp']) {
    const response = await x.request(route);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/login');
  }
});

test('enabled MCP with incomplete configuration exits without serving', async t => {
  const x = await launch(t, 'true', { MCP_JWKS: '' });
  assert.equal(x.child.exitCode, 1, x.output);
  assert.doesNotMatch(x.output, /Expense Tracker listening/);
  assert.match(x.output, /MCP configuration:/);
  assert.doesNotMatch(x.output, /test-session-secret/);
});

test('enabled application exposes discovery, OAuth bodies and MCP challenges before website authentication', async t => {
  const x = await launch(t, 'true');
  assert.match(x.output, /Expense Tracker listening/);
  const metadata = await x.request('/.well-known/oauth-protected-resource/mcp');
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json()).resource, x.baseUrl + '/mcp');
  assert.equal((await x.request('/api/transactions')).status, 302);
  const unauthenticated = await x.request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get('www-authenticate'), /resource_metadata=/);
  const registration = await x.request('/oauth/reg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'none', response_types: ['code'], grant_types: ['authorization_code'],
  }) });
  assert.equal(registration.status, 201);
  const token = await x.request('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=authorization_code&code=invalid' });
  assert.equal(token.status, 400);
  assert.equal((await token.json()).error, 'invalid_request');
});
