const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync } = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const { fixture } = require('./helpers/mcp-fixture');
const { createProviderAdapter } = require('../mcp/storage');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' }] };
const verifier = 'a'.repeat(64), challenge = createHash('sha256').update(verifier).digest('base64url');

async function setup(t) {
  const f = fixture(); const app = express(); const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); f.close(); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let allowed = ['pooja@example.com'];
  const config = { baseUrl, resourceUrl: `${baseUrl}/mcp`, issuer: `${baseUrl}/oauth`, cookieKeys: ['test-cookie-key-with-at-least-32-characters'], jwks };
  const { createOAuth } = await import('../mcp/oauth.mjs');
  const oauth = await createOAuth({ db: f.db, config, allowedEmails: () => allowed });
  // This fixture replaces only the external Google identity/UI step, retaining the real OAuth protocol.
  app.get('/mcp/interaction/:uid', async (req, res, next) => {
    try {
      const details = await oauth.provider.interactionDetails(req, res);
      if (details.prompt.name === 'login') return oauth.provider.interactionFinished(req, res, { login: { accountId: 'pooja@example.com' } }, { mergeWithLastSubmission: false });
      const grant = new oauth.provider.Grant({ accountId: 'pooja@example.com', clientId: details.params.client_id });
      grant.addResourceScope(config.resourceUrl, details.params.scope || 'expenses:read');
      grant.addOIDCScope('openid offline_access');
      return oauth.provider.interactionFinished(req, res, { consent: { grantId: await grant.save() } }, { mergeWithLastSubmission: true });
    } catch (e) { next(e); }
  });
  app.use('/oauth', oauth.provider.callback());
  app.use((e, req, res, next) => res.status(500).json({ error: e.message }));
  const jar = new Map();
  async function request(path, options = {}) {
    const response = await fetch(path.startsWith('http') ? path : baseUrl + path, { redirect: 'manual', ...options,
      headers: { cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; '), ...options.headers } });
    for (const value of response.headers.getSetCookie()) { const [pair] = value.split(';'); const at = pair.indexOf('='); jar.set(pair.slice(0,at), pair.slice(at+1)); }
    return response;
  }
  return { ...f, app, config, oauth, request, disallow() { allowed = []; } };
}
async function register(x, overrides = {}) {
  const response = await x.request('/oauth/reg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://client.example/callback'], client_name: 'Test client', token_endpoint_auth_method: 'none', grant_types: ['authorization_code','refresh_token'], response_types: ['code'], ...overrides }) });
  return { response, body: await response.json() };
}
async function authorize(x, client, overrides = {}) {
  let url = '/oauth/auth?' + new URLSearchParams({ client_id: client.client_id, redirect_uri: 'https://client.example/callback', response_type: 'code', scope: 'expenses:read expenses:write', resource: x.config.resourceUrl, state: 'test-state', code_challenge: challenge, code_challenge_method: 'S256', ...overrides });
  for (let i = 0; i < 12; i++) {
    const response = await x.request(url);
    const next = response.headers.get('location');
    assert.ok(next, `Expected redirect, received ${response.status}: ${await response.text()}`);
    if (next.startsWith('https://client.example/')) return new URL(next);
    url = next;
  }
  throw new Error('OAuth interaction did not finish');
}
async function exchange(x, client, code, overrides = {}) {
  const response = await x.request('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: 'https://client.example/callback', code, code_verifier: verifier, resource: x.config.resourceUrl, ...overrides }) });
  return { response, body: await response.json() };
}

test('SQLite provider adapter persists consumed state, expiration and grant-family revocation', async () => {
  const f = fixture();
  try {
    let time = 1000; const Adapter = createProviderAdapter(f.db, { now: () => time });
    const codes = new Adapter('AuthorizationCode'), access = new Adapter('AccessToken');
    await codes.upsert('code', { uid: 'uid', userCode: 'human', grantId: 'grant' }, 10);
    await access.upsert('access', { grantId: 'grant' }, 10);
    await codes.consume('code'); assert.equal((await codes.find('code')).consumed, 1000);
    assert.equal((await codes.findByUid('uid')).consumed, 1000);
    assert.equal((await codes.findByUserCode('human')).consumed, 1000);
    const Database = require('better-sqlite3'); const second = new Database(f.directory + '/test.db');
    try { const Reopened = createProviderAdapter(second, { now: () => time }); assert.equal((await new Reopened('AuthorizationCode').find('code')).consumed, 1000); } finally { second.close(); }
    await access.revokeByGrantId('grant'); assert.equal(await codes.find('code'), undefined); assert.equal(await access.find('access'), undefined);
    await codes.upsert('expired', {}, 2); time = 1002; assert.equal(await codes.find('expired'), undefined);
    await codes.upsert('destroy', {}, 10); await codes.destroy('destroy'); assert.equal(await codes.find('destroy'), undefined);
  } finally { f.close(); }
});

test('OAuth discovery, PKCE and resource tokens enforce audience, lifetime, scopes and current allowlist', async t => {
  const x = await setup(t); const { response, body: client } = await register(x); assert.equal(response.status, 201);
  const metadata = await (await x.request('/oauth/.well-known/openid-configuration')).json();
  assert.equal(metadata.issuer, x.config.issuer); assert.ok(metadata.code_challenge_methods_supported.includes('S256'));
  const redirect = await authorize(x, client); assert.equal(redirect.searchParams.get('iss'), x.config.issuer); assert.equal(redirect.searchParams.get('state'), 'test-state');
  const tokens = await exchange(x, client, redirect.searchParams.get('code')); assert.equal(tokens.response.status, 200, JSON.stringify(tokens.body));
  assert.equal(tokens.body.expires_in, 3600); assert.ok(tokens.body.refresh_token);
  const caller = await x.oauth.verifyAccessToken(tokens.body.access_token); assert.equal(caller.email, 'pooja@example.com'); assert.equal(caller.clientId, client.client_id); assert.ok(caller.scopes.includes('expenses:write'));
  assert.equal((await exchange(x, client, redirect.searchParams.get('code'))).response.status, 400);
  x.disallow(); await assert.rejects(x.oauth.verifyAccessToken(tokens.body.access_token));
});

test('registration rejects unsafe redirects and remote metadata fetches', async t => {
  const x = await setup(t);
  for (const overrides of [{ redirect_uris: ['http://evil.example/cb'] }, { redirect_uris: ['https://client.example/cb#token'] }, { redirect_uris: ['https://user:pass@client.example/cb'] }, { redirect_uris: ['https://*.example/cb'] }, { jwks_uri: 'http://127.0.0.1/secret' }, { sector_identifier_uri: 'http://127.0.0.1/secret' }]) {
    const { response } = await register(x, overrides); assert.equal(response.status, 400);
  }
});

test('incorrect PKCE and wrong resource cannot obtain an access token', async t => {
  const x = await setup(t); const { body: client } = await register(x);
  const redirect = await authorize(x, client);
  assert.equal((await exchange(x, client, redirect.searchParams.get('code'), { code_verifier: 'b'.repeat(64) })).response.status, 400);
  const wrong = await authorize(x, client, { resource: 'https://other.example/mcp' }); assert.equal(wrong.searchParams.get('error'), 'invalid_target');
});

test('refresh rotation rejects replay and revocation invalidates access and refresh tokens', async t => {
  const x = await setup(t); const { body: client } = await register(x);
  const redirect = await authorize(x, client); const first = (await exchange(x, client, redirect.searchParams.get('code'))).body;
  const refresh = async token => {
    const response = await x.request('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token, client_id: client.client_id, resource: x.config.resourceUrl }) });
    return { status: response.status, body: await response.json() };
  };
  const next = await refresh(first.refresh_token); assert.equal(next.status, 200); assert.notEqual(next.body.refresh_token, first.refresh_token);
  assert.equal((await refresh(first.refresh_token)).status, 400);
  await assert.rejects(x.oauth.verifyAccessToken(next.body.access_token));
  assert.equal((await refresh(next.body.refresh_token)).status, 400);
});

module.exports = { setup, register, authorize, exchange, jwks };

test('opaque tokens remain valid after provider restart, then expire and revoke', async t => {
  const x = await setup(t); const { body: client } = await register(x);
  const redirect = await authorize(x, client); const tokens = (await exchange(x, client, redirect.searchParams.get('code'))).body;
  const { createOAuth } = await import('../mcp/oauth.mjs');
  const restarted = await createOAuth({ db: x.db, config: x.config, allowedEmails: () => ['pooja@example.com'] });
  assert.equal((await restarted.verifyAccessToken(tokens.access_token)).email, 'pooja@example.com');
  const expired = x.db.prepare("SELECT id,payload FROM mcp_oauth WHERE model='AccessToken'").get();
  const payload = JSON.parse(expired.payload); payload.exp = Math.floor(Date.now()/1000)-1;
  x.db.prepare("UPDATE mcp_oauth SET payload=? WHERE model='AccessToken' AND id=?").run(JSON.stringify(payload), expired.id);
  await assert.rejects(restarted.verifyAccessToken(tokens.access_token));
  const revoke = await x.request('/oauth/token/revocation', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.client_id, token: tokens.refresh_token }) });
  assert.equal(revoke.status, 200);
  const refreshed = await x.request('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.client_id, grant_type: 'refresh_token', refresh_token: tokens.refresh_token, resource: x.config.resourceUrl }) });
  assert.equal(refreshed.status, 400);
});

test('loopback clients can register and missing PKCE is rejected', async t => {
  const x = await setup(t);
  const native = await register(x, { redirect_uris: ['http://127.0.0.1:1455/auth/callback'], application_type: 'native' });
  assert.equal(native.response.status, 201, JSON.stringify(native.body));
  const { body: client } = await register(x);
  const response = await x.request('/oauth/auth?' + new URLSearchParams({ client_id: client.client_id, redirect_uri: 'https://client.example/callback', response_type: 'code', scope: 'expenses:read', resource: x.config.resourceUrl }));
  const location = response.headers.get('location');
  assert.equal(new URL(location).searchParams.get('error'), 'invalid_request');
});
