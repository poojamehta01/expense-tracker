const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync } = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const { fixture } = require('./mcp-fixture');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' }] };
const verifier = 'a'.repeat(64), challenge = createHash('sha256').update(verifier).digest('base64url');

async function setup(t, { realInteractions = false } = {}) {
  const f = fixture(); const app = express(); const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); f.close(); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let allowed = ['pooja@example.com'];
  const config = { baseUrl, resourceUrl: `${baseUrl}/mcp`, issuer: `${baseUrl}/oauth`, cookieKeys: ['test-cookie-key-with-at-least-32-characters'], jwks };
  const { createOAuth } = await import('../../mcp/oauth.mjs');
  const oauth = await createOAuth({ db: f.db, config, allowedEmails: () => allowed });
  let user = { email: 'pooja@example.com', emailVerified: true };
  if (realInteractions) {
    const session = require('express-session');
    const passport = new (require('passport').Passport)();
    passport.serializeUser((user, done) => done(null, user)); passport.deserializeUser((user, done) => done(null, user));
    app.use(session({ secret: 'test-session-secret', resave: false, saveUninitialized: false }));
    app.use(passport.initialize()); app.use(passport.session());
    const { registerInteractions, completeGoogleLogin } = require('../../mcp/interactions');
    registerInteractions(app, { provider: oauth.provider, db: f.db, config, allowedEmails: () => allowed });
    app.get('/auth/google', (req,res,next) => completeGoogleLogin(req,res,user,next));
    app.get('/', (req,res) => res.send('Dashboard'));
  } else {
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
  }
  app.use('/oauth', oauth.provider.callback());
  app.use((e, req, res, next) => res.status(500).json({ error: e.message }));
  const jar = new Map();
  async function request(path, options = {}) {
    const response = await fetch(path.startsWith('http') ? path : baseUrl + path, { redirect: 'manual', ...options,
      headers: { cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; '), ...options.headers } });
    for (const value of response.headers.getSetCookie()) { const [pair] = value.split(';'); const at = pair.indexOf('='); jar.set(pair.slice(0,at), pair.slice(at+1)); }
    return response;
  }
  return { ...f, app, config, oauth, request, setUser(value) { user = value; }, disallow() { allowed = []; } };
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

module.exports = { setup, register, authorize, exchange, jwks };
