import { Provider, errors } from 'oidc-provider';
import { createProviderAdapter } from './storage.js';
import { callbackOrigin } from './http-policy.js';

export const READ_SCOPE = 'expenses:read';
export const WRITE_SCOPE = 'expenses:write';
export function validRedirect(value) {
  try {
    const url = new URL(value);
    callbackOrigin(value);
    const loopback = ['127.0.0.1','[::1]','localhost'].includes(url.hostname);
    return !url.hash && !url.username && !url.password && !value.includes('*') && (url.protocol === 'https:' || (url.protocol === 'http:' && loopback));
  } catch { return false; }
}
export async function createOAuth({ db, config, allowedEmails }) {
  const allowed = email => typeof email === 'string' && allowedEmails().includes(email.toLowerCase());
  const issuer = config.issuer;
  const resource = config.resourceUrl;
  const Adapter = createProviderAdapter(db);
  const provider = new Provider(issuer, {
    adapter: Adapter, clients: [], jwks: config.jwks, proxy: true,
    cookies: { keys: config.cookieKeys, long: { httpOnly: true, sameSite: 'lax', secure: issuer.startsWith('https:') }, short: { httpOnly: true, sameSite: 'lax', secure: issuer.startsWith('https:') } },
    claims: { openid: ['sub'] }, scopes: ['openid','offline_access'], responseTypes: ['code'],
    clientAuthMethods: ['none','client_secret_basic','client_secret_post'], clockTolerance: 0,
    pkce: { required: () => true },
    ttl: { AccessToken: 3600, AuthorizationCode: 300, RefreshToken: 30 * 86400, Grant: 30 * 86400, Session: 30 * 86400, Interaction: 600 },
    issueRefreshToken: (ctx, client) => client.grantTypeAllowed('refresh_token'),
    rotateRefreshToken: () => true,
    expiresWithSession: () => false,
    interactions: { url: (ctx, interaction) => `${config.baseUrl}/mcp/interaction/${interaction.uid}` },
    findAccount: async (ctx, accountId) => allowed(accountId) ? { accountId, claims: async () => ({ sub: accountId }) } : undefined,
    features: {
      devInteractions: { enabled: false }, registration: { enabled: true }, revocation: { enabled: true },
      resourceIndicators: { enabled: true, defaultResource: () => resource, useGrantedResource: () => true,
        getResourceServerInfo: (ctx, indicator) => {
          if (indicator !== resource) throw new errors.InvalidTarget('Unknown resource');
          return { scope: `${READ_SCOPE} ${WRITE_SCOPE}`, audience: resource, accessTokenTTL: 3600, accessTokenFormat: 'opaque' };
        } },
    },
    extraClientMetadata: {
      properties: ['redirect_uris','jwks_uri','jwks','sector_identifier_uri','request_uris','initiate_login_uri','grant_types','client_name'],
      validator(ctx, key, value) {
        if (key === 'redirect_uris' && (!Array.isArray(value) || !value.length || value.length > 10 || value.some(uri => typeof uri !== 'string' || uri.length > 2048 || !validRedirect(uri)))) throw new errors.InvalidClientMetadata('Unsupported redirect URI');
        if (['jwks_uri','jwks','sector_identifier_uri','request_uris','initiate_login_uri'].includes(key) && value !== undefined) throw new errors.InvalidClientMetadata('Remote client metadata is not supported');
        if (key === 'grant_types' && (!Array.isArray(value) || value.some(grant => !['authorization_code','refresh_token'].includes(grant)))) throw new errors.InvalidClientMetadata('Only authorization code and refresh grants are supported');
        if (key === 'client_name' && value !== undefined && (typeof value !== 'string' || value.length > 200)) throw new errors.InvalidClientMetadata('Client name is too long');
      },
    },
    renderError: async (ctx, out) => { ctx.type = 'application/json'; ctx.body = { error: out.error || 'server_error', error_description: 'Authorization request could not be completed.' }; },
  });
  provider.proxy = true;
  provider.on('server_error', () => console.error('OAuth request failed: server_error'));
  const resourceMetadata = { resource, authorization_servers: [issuer], scopes_supported: [READ_SCOPE, WRITE_SCOPE], bearer_methods_supported: ['header'] };
  const authorizationMetadata = {
    issuer, authorization_endpoint: issuer + '/auth', token_endpoint: issuer + '/token', registration_endpoint: issuer + '/reg', revocation_endpoint: issuer + '/token/revocation',
    response_types_supported: ['code'], grant_types_supported: ['authorization_code','refresh_token'], code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none','client_secret_basic','client_secret_post'], scopes_supported: [READ_SCOPE, WRITE_SCOPE, 'openid','offline_access'], authorization_response_iss_parameter_supported: true,
  };
  async function verifyAccessToken(value) {
    const invalid = () => Object.assign(new Error('Invalid or expired access token'), { code: 'invalid_token' });
    if (typeof value !== 'string' || !value || value.length > 4096) throw invalid();
    const token = await provider.AccessToken.find(value);
    if (!token || token.exp <= Math.floor(Date.now()/1000) || token.aud !== resource || !allowed(token.accountId)) throw invalid();
    const grant = token.grantId && await provider.Grant.find(token.grantId);
    if (!grant || grant.accountId !== token.accountId || grant.clientId !== token.clientId) throw invalid();
    const granted = new Set(grant.getResourceScope(resource).split(' '));
    const scopes = (token.scope || '').split(' ').filter(Boolean);
    if (scopes.some(scope => !granted.has(scope))) throw invalid();
    return { token: value, clientId: token.clientId, email: token.accountId, grantId: token.grantId, scopes, expiresAt: token.exp, resource: new URL(resource) };
  }
  return { provider, verifyAccessToken, resourceMetadata, authorizationMetadata };
}
