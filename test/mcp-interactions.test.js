const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { setup, register, exchange } = require('./helpers/oauth-fixture');
const { createHttpPolicy } = require('../mcp/http-policy');
const challenge = createHash('sha256').update('a'.repeat(64)).digest('base64url');
async function toConsent(x, client, scopes = 'expenses:read expenses:write') {
  let path = '/oauth/auth?' + new URLSearchParams({ client_id: client.client_id, redirect_uri: 'https://client.example/callback', response_type: 'code', scope: scopes, resource: x.config.resourceUrl, state: 'state', code_challenge: challenge, code_challenge_method: 'S256' });
  for (let i=0; i<12; i++) {
    const res = await x.request(path);
    if (res.status === 200) {
      const html = await res.text();
      if (html.includes('Sign in with Google')) { path = /href="([^"]+\/login)"/.exec(html)[1]; continue; }
      return { html, path: new URL(path, x.config.baseUrl).pathname, status: res.status, referrerPolicy: res.headers.get('referrer-policy') };
    }
    if (![302,303].includes(res.status)) return { html: await res.text(), status: res.status };
    path = res.headers.get('location');
  }
  throw new Error('Consent flow failed to resolve');
}
async function consent(x, page, access = 'write', csrf) {
  const token = csrf === undefined ? /name="csrf" value="([^"]+)"/.exec(page.html)[1] : csrf;
  return x.request(page.path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: token, access }) });
}
async function finish(x, res) {
  for (let i=0; i<8; i++) { const next=res.headers.get('location'); assert.ok(next); if(next.startsWith('https://client.example/')) return new URL(next); res=await x.request(next); }
  throw new Error('No client callback');
}

test('Google login resumes consent across Passport session rotation and escapes client metadata', async t => {
  const x = await setup(t, { realInteractions: true });
  const { body: client } = await register(x, { client_name: '<script>bad()</script>' });
  const page = await toConsent(x,client); assert.equal(page.status,200);
  assert.ok(page.html.includes('&lt;script&gt;bad()&lt;/script&gt;')); assert.ok(page.html.includes('add and edit'));
  assert.equal((await consent(x,page,'write','wrong')).status,403);
  const callback=await finish(x,await consent(x,page));
  const tokens=await exchange(x,client,callback.searchParams.get('code')); assert.equal(tokens.response.status,200,JSON.stringify(tokens.body));
  assert.ok((await x.oauth.verifyAccessToken(tokens.body.access_token)).scopes.includes('expenses:write'));
  const ordinary=await x.request('/auth/google'); assert.equal(ordinary.headers.get('location'),'/');
});

test('read-only consent omits write scope and own connections can be revoked with CSRF protection', async t => {
  const x=await setup(t,{realInteractions:true}); const {body:client}=await register(x);
  const page=await toConsent(x,client); const callback=await finish(x,await consent(x,page,'read'));
  const tokens=(await exchange(x,client,callback.searchParams.get('code'))).body;
  const caller=await x.oauth.verifyAccessToken(tokens.access_token); assert.deepEqual(caller.scopes,['expenses:read']);
  const connections=await x.request('/mcp/connections'); const html=await connections.text();
  const token=/name="csrf" value="([^"]+)"/.exec(html)[1];
  const path=`/mcp/connections/${caller.grantId}/revoke`;
  assert.equal((await x.request(path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:'bad'})})).status,403);
  assert.equal((await x.request(path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:token})})).status,303);
  await assert.rejects(x.oauth.verifyAccessToken(tokens.access_token));
});

test('unverified or disallowed browser identities cannot approve a grant', async t => {
  const x=await setup(t,{realInteractions:true}); x.setUser({email:'pooja@example.com',emailVerified:false});
  const {body:client}=await register(x);
  const page=await toConsent(x,client); assert.equal(page.status,403);
});

test('browser consent preserves the same-site form origin without accepting opaque or foreign origins', async t => {
  const x=await setup(t,{realInteractions:true}); const {body:client}=await register(x);
  const page=await toConsent(x,client);
  // Fetch's Origin-header algorithm turns non-CORS form POSTs into Origin: null
  // under no-referrer. same-origin keeps local forms usable and hides external referrers.
  assert.equal(page.referrerPolicy,'same-origin');
  const csrf=/name="csrf" value="([^"]+)"/.exec(page.html)[1];
  const submit=(origin, token=csrf)=>x.request(page.path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin},body:new URLSearchParams({csrf:token,access:'write'})});
  for(const origin of ['null','https://evil.example']) {
    const response=await submit(origin); assert.equal(response.status,403);
    assert.deepEqual(await response.json(),{error:'forbidden_origin'});
  }
  assert.equal((await submit(x.config.baseUrl,'wrong')).status,403);
  const callback=await finish(x,await submit(x.config.baseUrl));
  const tokens=await exchange(x,client,callback.searchParams.get('code'));
  assert.equal(tokens.response.status,200);
  assert.ok((await x.oauth.verifyAccessToken(tokens.body.access_token)).scopes.includes('expenses:write'));
  const connections=await x.request('/mcp/connections');
  assert.equal(connections.headers.get('referrer-policy'),'same-origin');
});

test('HTTP policy rejects hostile hosts/origins and rate limits without trusting spoofed forwarded hosts', () => {
  const middleware=createHttpPolicy({baseUrl:'https://tracker.example',allowedOrigins:[]},{limit:2,windowMs:60000});
  const request=(headers={})=>({headers:{host:'tracker.example',...headers},ip:'127.0.0.1'});
  const run=req=>{let passed=false;const res={code:200,status(n){this.code=n;return this},json(){return this},setHeader(){}};middleware(req,res,()=>{passed=true});return {passed,code:res.code};};
  assert.equal(run(request({host:'evil.example'})).code,403);
  assert.equal(run(request({origin:'https://evil.example'})).code,403);
  assert.equal(run(request({'x-forwarded-host':'evil.example'})).code,403);
  assert.equal(run(request()).passed,true); assert.equal(run(request()).passed,true); assert.equal(run(request()).code,429);
});
