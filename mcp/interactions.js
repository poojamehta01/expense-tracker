const express = require('express');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validReturn = path => typeof path === 'string' && /^\/mcp\/interaction\/[A-Za-z0-9_-]{10,128}$/.test(path);
function completeGoogleLogin(req, res, user, next) {
  const returnTo = validReturn(req.session?.mcpReturnTo) ? req.session.mcpReturnTo : '/';
  req.logIn(user, error => {
    if (error) return next(error);
    delete req.session.mcpReturnTo;
    req.session.save(error => error ? next(error) : res.redirect(returnTo));
  });
}
function page(res, title, content, status = 200) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  // no-referrer makes browser form POSTs send Origin: null, failing our origin check.
  res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','same-origin');
  res.status(status).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — Expense Tracker</title><style>
  :root{color-scheme:light dark}body{font:16px/1.6 system-ui;margin:0;padding:32px;background:#f5f5f7;color:#202124}.card{max-width:600px;margin:5vh auto;padding:32px;border-radius:16px;background:white;border:1px solid #ddd}h1{font-size:24px;line-height:1.25}button,.button{display:inline-block;font:inherit;padding:10px 16px;margin:8px 8px 8px 0;border-radius:8px;border:1px solid #888;cursor:pointer;background:#2455d6;color:white;text-decoration:none}button.secondary{background:transparent;color:inherit}small{color:#666}li{margin:16px 0}.destination{overflow-wrap:anywhere}@media(prefers-color-scheme:dark){body{background:#14151a;color:#eee}.card{background:#202228;border-color:#45474f}small{color:#aaa}button.secondary{background:transparent;color:#eee}}
  </style></head><body><main class="card"><h1>${escape(title)}</h1>${content}</main></body></html>`);
}
function registerInteractions(app, { provider, db, config, allowedEmails }) {
  const route = '/mcp/interaction/:uid';
  const wrap = handler => (req,res,next) => Promise.resolve(handler(req,res)).catch(() => page(res,'Connection unavailable','<p>This connection request expired or could not be verified. Start the connection again from your AI app.</p>',400));
  const allowed = req => req.user?.emailVerified === true && allowedEmails().includes(String(req.user.email).toLowerCase());
  const csrf = req => req.session.mcpCsrf ||= randomBytes(32).toString('hex');
  const validCsrf = req => typeof req.body?.csrf === 'string' && typeof req.session?.mcpCsrf === 'string' && req.body.csrf.length === req.session.mcpCsrf.length && timingSafeEqual(Buffer.from(req.body.csrf),Buffer.from(req.session.mcpCsrf));
  const assertDetails = async (req,res) => {
    if (!validReturn(`/mcp/interaction/${req.params.uid}`)) throw new Error('Invalid interaction');
    const details = await provider.interactionDetails(req,res);
    if (details.uid !== req.params.uid) throw new Error('Wrong interaction');
    return details;
  };
  const denyUser = res => page(res,'Sign-in required','<p>Use a verified Google account allowed by this expense tracker. Sign in again, then restart the connection.</p>',403);
  app.get(route + '/login',wrap(async (req,res) => {
    await assertDetails(req,res);
    req.session.mcpReturnTo = `/mcp/interaction/${req.params.uid}`;
    await new Promise((resolve,reject)=>req.session.save(error=>error?reject(error):resolve()));
    res.redirect('/auth/google');
  }));
  app.get(route,wrap(async (req,res) => {
    const details = await assertDetails(req,res);
    if (!req.user) return page(res,'Connect Expense Tracker',`<p>Sign in to choose what this AI app can access.</p><a class="button" href="/mcp/interaction/${escape(details.uid)}/login">Sign in with Google</a>`);
    if (!allowed(req)) return denyUser(res);
    if (details.prompt.name === 'login') return provider.interactionFinished(req,res,{login:{accountId:req.user.email.toLowerCase()}},{mergeWithLastSubmission:false});
    if (details.session?.accountId !== req.user.email.toLowerCase()) return denyUser(res);
    const client = await provider.Client.find(details.params.client_id);
    const requested = new Set(String(details.params.scope || '').split(' '));
    if (!requested.has('expenses:read')) return page(res,'Read permission required','<p>Reconnect with the expenses:read permission. Expense editing also requires expenses:write.</p>',400);
    const canWrite=requested.has('expenses:write');
    page(res,'Connect Expense Tracker',`<p><strong>${escape(client.clientName || 'AI app')}</strong> wants access to your shared household tracker.</p><p>Signed in as ${escape(req.user.email)}. Read access includes both household members’ expenses, budgets, salaries, settlements, and recorded investments.</p>${canWrite?'<p>Write access lets this app <strong>add and edit expenses</strong>. You can choose read access only.</p>':''}<p class="destination"><small>Client callback: ${escape(new URL(details.params.redirect_uri).origin)}</small></p><form method="post" action="/mcp/interaction/${escape(details.uid)}"><input type="hidden" name="csrf" value="${csrf(req)}"><button name="access" value="read">Connect read only</button>${canWrite?'<button name="access" value="write">Connect with expense editing</button>':''}<button class="secondary" name="access" value="deny">Cancel</button></form>`);
  }));
  app.post(route,express.urlencoded({extended:false,limit:'8kb'}),wrap(async (req,res) => {
    const details=await assertDetails(req,res);
    if(!allowed(req)||details.session?.accountId!==req.user.email.toLowerCase()) return denyUser(res);
    if(!validCsrf(req)) return res.status(403).json({error:'invalid_csrf'});
    if(req.body.access==='deny') return provider.interactionFinished(req,res,{error:'access_denied'},{mergeWithLastSubmission:false});
    if(details.prompt.name!=='consent'||!['read','write'].includes(req.body.access)) return res.status(400).json({error:'invalid_consent'});
    const scopes = new Set(String(details.params.scope || '').split(' '));
    if(!scopes.has('expenses:read') || (req.body.access==='write'&&!scopes.has('expenses:write'))) return res.status(400).json({error:'invalid_scope'});
    const grant = new provider.Grant({accountId:req.user.email.toLowerCase(),clientId:details.params.client_id});
    grant.addResourceScope(config.resourceUrl,'expenses:read');
    if(req.body.access==='write') grant.addResourceScope(config.resourceUrl,'expenses:write');
    else if(scopes.has('expenses:write')) grant.rejectResourceScope(config.resourceUrl,'expenses:write');
    for(const scope of ['openid','offline_access']) if(scopes.has(scope)) grant.addOIDCScope(scope);
    const grantId=await grant.save();
    return provider.interactionFinished(req,res,{consent:{grantId}},{mergeWithLastSubmission:true});
  }));
  app.get('/mcp/connections',wrap(async (req,res) => {
    if(!allowed(req)) return denyUser(res);
    const rows=db.prepare("SELECT id,payload FROM mcp_oauth WHERE model='Grant' AND account_id=? AND (expires_at IS NULL OR expires_at>?) ORDER BY id LIMIT 201").all(req.user.email.toLowerCase(),Math.floor(Date.now()/1000));
    const items=[];
    for(const row of rows.slice(0,200)) {
      const grant=JSON.parse(row.payload); const client=await provider.Client.find(grant.clientId);
      items.push(`<li><strong>${escape(client?.clientName || 'AI app')}</strong><br><small>${escape(grant.resources?.[config.resourceUrl] || 'Read access')}</small><form method="post" action="/mcp/connections/${escape(row.id)}/revoke"><input type="hidden" name="csrf" value="${csrf(req)}"><button class="secondary">Disconnect</button></form></li>`);
    }
    page(res,'AI connections',`<p>Connections authorized by ${escape(req.user.email)}. Disconnecting stops access and token refresh.</p>${items.length?`<ul>${items.join('')}</ul>`:'<p>No connected AI apps.</p>'}${rows.length>200?'<p>Showing 200 connections. Disconnect some to see the remaining connections.</p>':''}<p><a href="/">Back to your tracker</a></p>`);
  }));
  app.post('/mcp/connections/:id/revoke',express.urlencoded({extended:false,limit:'8kb'}),wrap(async(req,res)=>{
    if(!allowed(req)) return denyUser(res);
    if(!validCsrf(req)) return res.status(403).json({error:'invalid_csrf'});
    const grant=await provider.Grant.find(req.params.id);
    if(!grant||grant.accountId!==req.user.email.toLowerCase()) return res.status(404).json({error:'not_found'});
    await provider.AccessToken.revokeByGrantId(grant.jti);
    await grant.destroy();
    res.redirect(303,'/mcp/connections');
  }));
}
module.exports = { registerInteractions, completeGoogleLogin, validReturn };
