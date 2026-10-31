# Expense Tracker MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose authenticated finance reads and transaction add/update tools to ChatGPT, Claude, and Codex through the live tracker.

**Architecture:** Add shared finance services and a stateless HTTP MCP adapter to the existing Express application. A maintained OAuth provider uses existing Google login and a SQLite adapter; scopes, audit, idempotency, and revisions protect writes.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, official MCP SDK, Zod, oidc-provider, node:test.

**Spec:** `docs/superpowers/specs/2026-10-31-expense-tracker-mcp-design.md`

## Global Constraints

- Preserve existing working-tree changes in `server.js` and `test/extraction-timeout.test.js`.
- Keep Node.js 22 and the existing Express/SQLite stack; no frontend build step.
- Serve `BASE_URL/mcp`; require `expenses:read` for reads and both `expenses:read expenses:write` for writes.
- MCP is disabled unless enabled and completely configured; website session authentication remains in place.
- Default transaction page size is 50, maximum 200; amounts use INR and dates use Asia/Kolkata.
- Preserve current expense exclusions, household pool normalization, settlement, budget, and investment valuation semantics.
- Access token 1 hour, authorization code 5 minutes, refresh grant 30 days; persist provider state on the existing database.
- Use isolated temporary databases in tests; deployment and interactive client linking remain explicit rollout steps.

## Review Focus

- English stored dates, leap days, and malformed historical dates must not corrupt chronological filters or silently change monthly accounting (Task 1).
- An OAuth browser interaction must survive Passport session rotation without accepting an arbitrary return URL (Task 4).
- A retry after a successful write and a later edit must replay its original result before testing the now-stale revision (Task 2).
- Revocation and removing an allowed email must invalidate already-issued access tokens, including after restart (Task 3).
- OAuth request bodies, MCP bodies, browser session middleware, Host/Origin policy, and disabled startup must compose correctly (Tasks 4–5).

## File Structure

- `finance-service.js`: shared transaction storage, dashboard/settlement queries, date and accounting helpers.
- `mcp/finance.js`: bounded read tools and validated, atomic write operations.
- `mcp/storage.js`: MCP bookkeeping migrations and persistent provider adapter.
- `mcp/oauth.mjs`: provider configuration, token verification, metadata, and registration policy.
- `mcp/interactions.js`: login continuation, consent, grant management, CSRF, and escaped HTML.
- `mcp/server.mjs`: tool schemas, MCP factory, HTTP endpoint, scopes, and transport errors.
- `mcp/index.mjs`: configuration and integration entry point.
- `server.js`: small integration hooks and shared service delegation.
- `test/mcp-*.test.js`: isolated fixtures, finance tests, OAuth/transport integration tests.
- `docs/mcp-setup.md`, `.env.example`, `CLAUDE.md`, `features.md`, `docs/architecture.md`: delivered behavior and setup.

### Task 1: Shared finance reads

**Files:** `finance-service.js`, `mcp/finance.js`, `server.js`, `test/mcp-finance.test.js`.

**Interfaces:** `createFinanceService(db, { afterInsert })` provides `addTransactions(rows)`, `updateTransaction(id, patch)`, `getDashboard(month)`, `getSettlement(month)`. `createMcpFinance({ db, financeService, now })` supplies `context`, `months`, `search`, `transaction`, `summary`, `budget`, `budgetTransactions`, `settlement`, `salary`, and `investments`, each accepting one argument object and returning a JSON object. `now` returns a Date. Errors expose `code` (`validation`, `not_found`, `conflict`, `forbidden`).

- [ ] Write tests asserting pool 100 + personal 40 gives household spending 140 and personal responsibility 90/50; excluded categories do not contribute; settlement ignores pool debt. Add calendar, literal wildcard, limit/offset, missing salary, and partial valuation cases.
- [ ] Run `node --test test/mcp-finance.test.js`; confirm failures identify missing services.
- [ ] Extract shared storage/dashboard queries, preserving existing API responses. Implement read methods with validated filters, deterministic ordering, capped breakdowns with complete totals, and existing budget/investment services.
- [ ] Run finance tests and affected existing budget/household/investment tests against a temporary DB; require all pass.
- [ ] Commit only the task files after diff review.

### Task 2: Validated transaction writes

**Files:** `mcp/finance.js`, `mcp/storage.js`, `test/mcp-writes.test.js`.

**Interfaces:** `initializeMcpStorage(db)` creates bookkeeping tables idempotently. `createMcpFinance` additionally provides `add(input, actor)` and `update(input, actor)`, with actor `{ email, clientId }`. `transaction({ id })` returns an opaque `revision`; update accepts `{ id, revision, idempotencyKey, patch }`; add accepts editable fields plus `idempotencyKey`.

- [ ] Write tests for exact paise/date/enum validation, duplicate date/amount/description, merged patches, normalized household rows, stale revision rejection, and unchanged DB on validation failure.
- [ ] Add retry tests asserting the same key/request returns deep-equal original results after a subsequent edit, mismatched key reuse conflicts, audit and idempotency are atomic, and expired keys are removed after 30 days.
- [ ] Run `node --test test/mcp-writes.test.js` and observe intended failures.
- [ ] Implement strict MCP input validation, revision hashing, and one SQLite transaction wrapping replay checks, mutation, actor audit, and saved result. Keep website restore snapshots and merchant patterns consistent.
- [ ] Run finance and write tests; require all pass. Commit only relevant files.

### Task 3: Durable OAuth provider

**Files:** `mcp/storage.js`, `mcp/oauth.mjs`, `test/mcp-oauth.test.js`, `package.json`, `package-lock.json`.

**Interfaces:** `createOAuth({ db, config, allowedEmails })` asynchronously returns `{ provider, verifyAccessToken, resourceMetadata, authorizationMetadata }`. `config` contains canonical `baseUrl`, `resourceUrl`, issuer URL, stable cookie keys and provider signing JWKS. `allowedEmails()` yields current normalized allowed emails. `createProviderAdapter(db)` returns the provider's Adapter class.

- [ ] Verify exact published dependency versions, Node requirements, SDK transport imports, provider adapter and resource-indicator APIs. Install compatible maintained packages; record any documentation/registry discrepancy.
- [ ] Write tests for adapter upsert/find/expiry/consume/destroy/findByUid/findByUserCode/revokeByGrantId, including reopening the database.
- [ ] Write OAuth flow tests for discovery/DCR/PKCE/token exchange, audience/issuer/scopes, short lifetimes, refresh rotation/replay, revocation, and immediate allowlist removal.
- [ ] Run `node --test test/mcp-oauth.test.js`; observe missing behavior.
- [ ] Configure provider with opaque resource tokens, mandatory S256, supported registration methods and strict redirect URI policy, persistent state and stable secrets. Verify tokens through the provider and current grant/account state. Add bounded registration/token rate limits and sanitized errors.
- [ ] Run OAuth tests to green; commit task files.

### Task 4: Google identity, consent, and connections

**Files:** `mcp/interactions.js`, `mcp/index.mjs`, `server.js`, `test/mcp-interactions.test.js`.

**Interfaces:** `registerInteractions(app, { provider, allowedEmails, baseUrl })` mounts `/mcp/interaction/:uid` and `/mcp/connections` before the website catch-all; exposes a login continuation helper limited to validated local interaction UIDs. `initializeMcp(app, dependencies)` mounts provider/discovery/interaction components and returns the remaining MCP mount hook. The exact startup ordering may use separate middleware routers to keep HTTP/OAuth bodies unconsumed.

- [ ] Write tests for anonymous interaction continuation through a mocked Google login with Passport session rotation, consent scope text/CSRF, escaped client names, denied/unverified/disallowed identities, and ordinary login redirect remaining `/`.
- [ ] Write grant-list/revoke tests for own grants only and immediate loss of token/refresh access.
- [ ] Run interaction tests and confirm intended failures.
- [ ] Implement provider interaction helpers with browser-bound cookies, validated Google identity, CSRF tokens, consent and cancellation. Add narrow account connection HTML with existing styling and dark theme support.
- [ ] Integrate startup without altering existing extraction changes or browser authentication. Require complete configuration when enabled, and leave disabled startup unchanged.
- [ ] Run interaction/OAuth tests and existing auth-adjacent routes tests; commit relevant files.

### Task 5: MCP HTTP tool interface

**Files:** `mcp/server.mjs`, `mcp/index.mjs`, `test/mcp-http.test.js`.

**Interfaces:** `createTrackerMcpServer({ finance, actor, scopes })` registers the 12 spec tools. `registerMcpEndpoint(app, { finance, oauth, config })` mounts stateless Streamable HTTP `/mcp`, with protocol/body/Host/Origin/method checks and per-request cleanup.

- [ ] Write SDK-client integration tests that initialize, list exactly the 12 tools, read fixtures, add/update, reject invalid schema/scopes, and assert structured/text output and correct read/write annotations.
- [ ] Add HTTP tests for missing/expired tokens returning JSON challenges, `403` on missing scopes, malformed bodies, method rejection, hostile Origin/Host, bounded requests, and isolated simultaneous callers.
- [ ] Run `node --test test/mcp-http.test.js`; observe intended failures.
- [ ] Implement schemas using the verified SDK/Zod APIs, accurate metadata including OAuth security schemes, bounded tool errors, and authorization inside execution. Bind actor from verified token only.
- [ ] Run HTTP, finance, write, OAuth and interaction suites together; require all pass. Commit task files.

### Task 6: Operational documentation and whole-feature verification

**Files:** `.env.example`, `docs/mcp-setup.md`, `CLAUDE.md`, `features.md`, `docs/architecture.md`, any tests needed for startup checks.

- [ ] Add setup instructions for generating stable secrets, configuring Fly's existing DB, enabling/disabling MCP, Google login, connection/revocation, and each named client. Explain INR, shared household permissions, idempotency window, exclusions and unknown valuations.
- [ ] Add startup smoke tests for disabled, incomplete enabled, and correctly configured enabled MCP using temporary databases; never test against live financial data.
- [ ] Run `npm test` with isolated DB environment and `git diff --check`; inspect every failure and verify required targeted suites remain green.
- [ ] Request an independent code/security review of the complete diff against this spec and plan; resolve actionable findings and rerun only affected tests.
- [ ] Commit final changes only after verification. Report local implementation/testing separately from deployment and interactive client linking, which require actual rollout evidence.

## Self-review

All twelve tools, existing accounting rules, scoped auth, provider persistence, continuation, consent/revocation, bounded transport, write audit/replay/concurrency, documentation, and verification have owning tasks. Tasks 1–2 share finance contracts; Tasks 3–4 share provider contracts; Task 5 joins them. The five review-focus conditions each have an explicit owning test. Execution will be inline in this chat with independent review at the end, following the user's approval to build the design.
