# Expense Tracker MCP

The tracker serves twelve tools at `BASE_URL/mcp` using Streamable HTTP. Google login verifies the account against `ALLOWED_EMAILS`; a separate consent page grants each assistant read access or read + expense editing. Both people have access to the shared household dataset. A `person` argument filters results; it is not an account access restriction.

MCP is **disabled by default**. This implementation has automated SDK/OAuth tests, but deployment and sign-in with actual ChatGPT, Claude and Codex accounts are still rollout steps.

## Configure the server

Use Node.js 22 and `npm ci`. Keep the existing Google OAuth credentials, `ALLOWED_EMAILS`, `BASE_URL`, `SESSION_SECRET` and persistent `DB_PATH`. The Google application's authorized callback remains `BASE_URL/auth/google/callback`; assistants use the tracker's OAuth server, not Google's credentials directly.

Generate MCP secrets once on a trusted machine. This command writes an owner-only file and refuses to overwrite an existing one; it does not print secrets:

```sh
node <<'NODE'
const { generateKeyPairSync, randomBytes, randomUUID } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...privateKey.export({ format: 'jwk' }), kid: randomUUID(), use: 'sig', alg: 'RS256' }] };
const values = {
  MCP_COOKIE_KEYS: JSON.stringify([randomBytes(48).toString('base64url')]),
  MCP_JWKS: JSON.stringify(jwks),
};
writeFileSync('/tmp/expense-tracker-mcp-secrets.env', Object.entries(values).map(([k,v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
NODE
```

Store the file's values in the deployment secret manager and a secure backup. Keep the same keys across restarts. Do not commit this file. `SESSION_SECRET` must also be a stable random secret of at least 32 characters; changing it signs website users out.

| Variable | Value |
| --- | --- |
| `MCP_ENABLED` | `true` to enable; unset or `false` to disable |
| `BASE_URL` | Exact public HTTPS origin, e.g. `https://expense-tracker-pooja.fly.dev` |
| `MCP_COOKIE_KEYS` | JSON array of secrets, each at least 32 characters |
| `MCP_JWKS` | JSON object with a private RSA signing key, at least 2048 bits, and `kid` |
| `MCP_ALLOWED_ORIGINS` | Optional comma-separated exact origins; defaults to `https://chatgpt.com,https://claude.ai`. The app's own origin is always accepted. |
| `DB_PATH` | Existing tracker SQLite file; `/data/expenses.db` on Fly |

The enabled server refuses startup if configuration is incomplete. Local development allows an exact loopback HTTP `BASE_URL` when `NODE_ENV` is not `production`. The configured hostname and port must match incoming requests. Requests without an Origin header are supported; supplied Host, forwarded Host and Origin headers are checked.

For the existing Fly app, import secrets and set the remaining configuration before deploying the reviewed branch:

```sh
fly secrets import --app expense-tracker-pooja < /tmp/expense-tracker-mcp-secrets.env
fly secrets set --app expense-tracker-pooja MCP_ENABLED=true BASE_URL=https://expense-tracker-pooja.fly.dev DB_PATH=/data/expenses.db
fly deploy --app expense-tracker-pooja
```

These commands change the live application. Back up the SQLite volume using the existing operational procedure before rollout. OAuth registrations, grants, tokens, retry records and audit records live in this same database. The design assumes the existing single-machine SQLite deployment; do not run independent database replicas.

## Connect clients

Use `https://expense-tracker-pooja.fly.dev/mcp` after deployment. Each client must complete its own OAuth connection and Google sign-in. The consent page identifies the client and requested callback host, explains household access, and lets you approve reads alone or reads and edits. Previously logged-in website sessions may require signing out and in again to record Google's verified-email status.

### ChatGPT

Open Plugins, use the plus button to add a custom MCP server, supply a name and the HTTPS `/mcp` URL, and select OAuth authentication. Use automatic client registration if prompted. Finish Google sign-in and consent, then review the discovered tools and enable the plugin in a conversation. Workspace policies may control access to this flow. See [OpenAI's connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

### Claude

Under Customize → Connectors, add a custom connector with the HTTPS `/mcp` URL. Choose sign-in authentication and **Register automatically** for the OAuth client. This server supports dynamic client registration (DCR), not published client metadata documents (CIMD). Finish Google sign-in and consent, then enable the connector in a conversation. Claude's remote connectors require the server to be reachable from Anthropic's cloud. See [Claude's custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

### Codex

```sh
codex mcp add expense_tracker --url https://expense-tracker-pooja.fly.dev/mcp
codex mcp login expense_tracker --scopes expenses:read,expenses:write
codex mcp list
```

For read-only access, request only `expenses:read`. Codex uses DCR for this server; current versions also accept `--oauth-client-registration dcr` on the login command to select it explicitly. The equivalent server entry in `~/.codex/config.toml` is:

```toml
[mcp_servers.expense_tracker]
url = "https://expense-tracker-pooja.fly.dev/mcp"
scopes = ["expenses:read", "expenses:write"]
```

Complete login in the browser, then reopen the Codex session if tool discovery has not refreshed. See [Codex MCP configuration and login](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Tools and accounting

| Tool | Purpose |
| --- | --- |
| `get_tracker_context` | India-local date, units, accepted categories/payment methods and household rules |
| `list_months` | Chronological union of transaction, salary and budget months |
| `search_transactions` | Literal text, category, payer, payment method, expense type and month/date-range search |
| `get_transaction` | One expense with its current revision |
| `summarize_spending` | Full-period totals, responsibility, category, payer and daily breakdowns |
| `get_budget` | Existing budget service's planned/actual/remaining values and mappings |
| `get_budget_transactions` | Paged expenses contributing to a budget line |
| `get_settlement` | Monthly household debt and direction |
| `get_salary` | Recorded salary and missing-value status |
| `get_investments` | Paged contributions and recorded valuations with complete totals |
| `add_expense` | One validated, audited expense; requires both scopes |
| `update_expense` | Partial edit with revision protection; requires both scopes |

Amounts are INR. Write dates are real `YYYY-MM-DD` calendar dates; months use `October_2026`. Current date uses Asia/Kolkata. Search, budget transactions and investment entries default to 50 rows, at most 200; follow `nextOffset`. Financial totals cover the entire matching dataset. Summary breakdowns cap at 200 with explicit truncation flags. Invalid legacy dates remain visible in month queries with a null normalized date and the original date; date ranges omit dates that cannot be parsed.

Ordinary spending excludes Credit Card Payment, Settlement, Investment and Refunded categories. Raw searches include them. Personal spending uses expense responsibility, including half of shared spending. Budget actuals retain the website's separate payer/mapping rules, including household pool attribution and separate investment lines. SBI debit payments normalize to Household Pool/Common_50_50 and create no settlement debt. Missing salary and investment valuations remain unknown; investment valuations are stored values, not live market prices. Partial valuation totals cover the valued entries and report the missing count.

Writes require a unique `idempotencyKey` per intended operation. Retry the exact same request with the same key for up to 30 days. A changed request with an already used key conflicts. An update also needs the latest revision from `get_transaction`; stale updates conflict. A successful retry replays the original result even if the expense has since changed. Adds retain the website's date + amount + description duplicate rule and return an explicit duplicate result. There are no delete, salary-write, investment-write or budget-write MCP tools.

Example prompts: “Summarize our October spending by category”, “How much does Kunal owe Pooja?”, “Show investments with missing valuations”, and “Record ₹250 for lunch today, paid by Pooja in cash, Pooja personal, Outside Food.” The assistant should clarify missing or ambiguous fields before adding/editing.

## Operations and verification

- Open `/mcp/connections` while logged into the tracker to revoke one of your assistant grants. Revocation invalidates its access and refresh tokens immediately. Removing an email from `ALLOWED_EMAILS` and restarting also denies that account's existing tokens.
- Access tokens last one hour; authorization codes five minutes; refresh tokens and grants up to 30 days. Refresh tokens rotate. Reconnect when a grant expires or is revoked.
- MCP audit records retain actor, client, operation, transaction, time and before/after data until an explicit retention policy is introduced. Retry records expire after 30 days and are cleaned on subsequent writes. The website's separate short-lived restore history continues to work. Protect database backups like the original financial data and OAuth credentials.
- Rate limits are per process/IP: 120 requests/minute for MCP and OAuth, and 20 registrations/hour, with a 1,000-client registration capacity. Behind a proxy, preserve the original Host and use the existing trusted one-hop proxy configuration. MCP bodies are limited to 64 KiB.
- Set `MCP_ENABLED=false` and restart to disable MCP without removing website data. This preserves grants; revoke connections first if you want them invalidated when re-enabling.

```sh
npm test
curl -i https://expense-tracker-pooja.fly.dev/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://expense-tracker-pooja.fly.dev/mcp -H 'Content-Type: application/json' --data '{}'
```

`npm test` gives each worker its own temporary database and launches only loopback test servers. Tests cover all twelve tools with the official SDK client, PKCE, consent/CSRF, revocation/restart, scopes, real startup routing, pagination, and atomic retries/revisions. The unauthenticated curl should return JSON `401` plus `WWW-Authenticate` discovery, without a browser login redirect. Test actual account linking in all three clients after rollout; SDK integration tests do not substitute for that acceptance step.

If setup fails: check exact `BASE_URL`/Host and HTTPS, verified Google login, current allowlist, key JSON, persistent database, scopes and client DCR setting. A `429` may require waiting for `Retry-After`. Logs deliberately omit bearer tokens and financial payloads.

Compatible Express/HTTP dependency patches were updated during this feature. `npm audit --omit=dev` still reports the pre-existing Nodemailer advisory set; resolving it requires a separate major-version email-service upgrade. Development-tool advisories also remain outside this MCP change. No MCP tool exposes email transport configuration.
