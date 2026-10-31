const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/mcp-fixture');
const { createProviderAdapter } = require('../mcp/storage');
const { setup, register, authorize, exchange } = require('./helpers/oauth-fixture');

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
