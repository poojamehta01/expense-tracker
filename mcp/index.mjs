import { createOAuth } from './oauth.mjs';
import { registerInteractions } from './interactions.js';
import { createHttpPolicy } from './http-policy.js';
import { createMcpFinance } from './finance.js';

export function readMcpConfig(environment = process.env) {
  if (!environment.MCP_ENABLED || environment.MCP_ENABLED === 'false') return null;
  if (environment.MCP_ENABLED !== 'true') throw new Error('MCP_ENABLED must be true or false');
  const error = message => { throw new Error(`MCP configuration: ${message}`); };
  let base;
  try { base = new URL(environment.BASE_URL); } catch { error('BASE_URL must be a valid URL'); }
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    !(base.protocol === 'https:' || (environment.NODE_ENV !== 'production' && base.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(base.hostname)))) error('BASE_URL must be an HTTPS origin (loopback HTTP is allowed for local development)');
  if (!environment.GOOGLE_CLIENT_ID || !environment.GOOGLE_CLIENT_SECRET || !environment.ALLOWED_EMAILS?.trim() || !environment.SESSION_SECRET || environment.SESSION_SECRET.length < 32) error('Google credentials, ALLOWED_EMAILS and a SESSION_SECRET of at least 32 characters are required');
  let cookieKeys,jwks;
  try { cookieKeys = JSON.parse(environment.MCP_COOKIE_KEYS); jwks = JSON.parse(environment.MCP_JWKS); } catch { error('MCP_COOKIE_KEYS and MCP_JWKS must contain valid JSON'); }
  if (!Array.isArray(cookieKeys) || !cookieKeys.length || cookieKeys.some(key=>typeof key!=='string'||key.length<32)) error('MCP_COOKIE_KEYS must be a nonempty JSON array of secrets of at least 32 characters');
  if (!Array.isArray(jwks?.keys) || !jwks.keys.length || jwks.keys.some(key=>!key.d || !key.kid || key.kty!=='RSA' || Buffer.from(key.n || '', 'base64url').length<256)) error('MCP_JWKS must contain a private RSA signing key of at least 2048 bits with a key ID');
  const allowedOrigins = (environment.MCP_ALLOWED_ORIGINS || 'https://chatgpt.com,https://claude.ai').split(',').map(x=>x.trim()).filter(Boolean);
  for (const value of allowedOrigins) { try { if(new URL(value).origin!==value) error('MCP_ALLOWED_ORIGINS entries must be exact origins'); } catch { error('MCP_ALLOWED_ORIGINS entries must be exact origins'); } }
  const baseUrl=base.origin;
  return {baseUrl,resourceUrl:baseUrl+'/mcp',issuer:baseUrl+'/oauth',cookieKeys,jwks,allowedOrigins};
}
export async function initializeMcp({ rawRouter, browserRouter }, { db, financeService, lists, environment = process.env }) {
  const config=readMcpConfig(environment); if(!config) return null;
  const allowedEmails=()=>String(environment.ALLOWED_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const oauth=await createOAuth({db,config,allowedEmails});
  const policy=createHttpPolicy(config);
  const metadata = value => (req,res) => { res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Cache-Control','no-store'); res.json(value); };
  for (const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']) rawRouter.get(path,policy,metadata(oauth.resourceMetadata));
  for (const path of ['/.well-known/oauth-authorization-server','/.well-known/oauth-authorization-server/oauth']) rawRouter.get(path,policy,metadata(oauth.authorizationMetadata));
  rawRouter.use('/oauth/reg',createHttpPolicy(config,{limit:20,windowMs:3600000}),(req,res,next)=>{
    if(req.method==='POST' && db.prepare("SELECT COUNT(*) count FROM mcp_oauth WHERE model='Client'").get().count>=1000) return res.status(429).json({error:'registration_capacity'});
    next();
  });
  rawRouter.use('/oauth',policy,oauth.provider.callback());
  browserRouter.use('/mcp',createHttpPolicy(config));
  registerInteractions(browserRouter,{provider:oauth.provider,db,config,allowedEmails});
  const finance=createMcpFinance({db,financeService,lists});
  return {oauth,finance,config,mountTools: register => register(rawRouter,{finance,oauth,config})};
}
