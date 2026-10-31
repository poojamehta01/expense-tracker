# Expense Tracker MCP

Date: 2026-10-31
Status: Approved by the user on 2026-10-31; implementation authorized.

## Intent and accepted scope

The user wants to use the tracker from ChatGPT, Claude, and Codex. They accepted a first version that searches transactions, summarizes spending, checks budgets and household settlements, reads salaries and investment values, and adds or updates expenses.

The result should let the user ask questions such as “How much did we spend on groceries in October?”, “What does Kunal owe Pooja?”, and “Record my ₹500 lunch yesterday” against the same live data used by the website.

## Proposed implementation choices

These are the builder's recommendations, not additional requirements stated by the user:

- Serve one authenticated Streamable HTTP MCP endpoint at `BASE_URL/mcp` from the existing Fly.io application. All three clients connect to this endpoint.
- Keep Node.js 22 and the existing Express/SQLite stack. Use the current maintained official MCP SDK, with versions verified against Node 22 and pinned in the lockfile. New ESM-only dependencies can use isolated `.mjs` modules and dynamic imports; do not convert the whole application.
- Use the maintained `oidc-provider` authorization-server library, mounted under `/oauth`, with the existing Google sign-in as its user identity step. Configure its protocol implementation instead of writing authorization-code, PKCE, or refresh-token handling ourselves. Add a durable SQLite adapter and use opaque access tokens validated through the provider in the same process.
- Give every authorized household member the same household data access they have in the website. A `person` filter narrows results; it is not an authorization boundary.
- Offer `expenses:read` and `expenses:write` permissions. Writes require both. The connection consent screen states that write permission can add and edit household transactions.
- Use explicit, bounded tools with structured results. No model API calls are needed to answer MCP requests; the connected assistant interprets the returned financial data.

## User experience

The user adds the hosted endpoint in the client, signs in with an allowed Google account, and approves the displayed permissions. The MCP connection resumes after login. Existing ordinary website login continues to land on the dashboard.

Read tools support concrete date ranges, months, categories, and people. Responses include the applied filters and INR units so the assistant can explain the result. The setup guide provides a working connection recipe for each client and a few sample prompts.

Writes use explicit tool arguments and return the saved row, ID, and any normalization applied. Tool descriptions instruct the assistant to resolve ambiguous payers, categories, dates, or target transaction IDs before writing. Clients can apply their normal approval policy; the server does not mistake a model-supplied “confirmed” flag for proof of human consent.

## Tool contract

| Tool | Purpose and key inputs | Permission |
| --- | --- | --- |
| `get_tracker_context` | Current date in Asia/Kolkata, currency, allowed payer/category/payment/type values, supported filters, and month vocabulary | read |
| `list_months` | Chronologically ordered months with transaction, salary, or budget data | read |
| `search_transactions` | Optional month or ISO date range, literal text search, exact category/payment method/payer/expense-type filters, and pagination | read |
| `get_transaction` | One existing transaction by positive integer ID, with a revision token for editing | read |
| `summarize_spending` | Required month or date range; optional person; total, transaction count, category and daily breakdowns, payer totals, and responsibility totals | read |
| `get_budget` | Required month; person `Pooja`, `Kunal`, or `all`; existing budget detail including unmapped spending and Future allocation | read |
| `get_budget_transactions` | Existing budget line drill-down with month, person, section, category, and kind | read |
| `get_settlement` | Required month; existing household settlement breakdown and explicit direction of the net amount | read |
| `get_salary` | Required month; optional person; recorded amounts and notes, with presence flags to distinguish missing from zero | read |
| `get_investments` | Optional person; contributions, known current valuations, gains, and missing-valuation counts | read |
| `add_expense` | One transaction with ISO date, positive INR amount, description, payer, expense type, category, payment method, and optional mood/impulse/remarks; idempotency key | read + write |
| `update_expense` | Transaction ID, revision from a previous read, idempotency key, and a nonempty patch of editable fields | read + write |

No delete tools, arbitrary SQL, salary/budget/investment writes, file extraction, email sending, or automated spending are included. Investment values are the values already recorded in the app, not live market prices. A local database/stdin server, custom chat widgets, and public plugin directory publication are outside this first version.

## Data semantics

- Accept canonical English month names such as `October_2026` and real ISO calendar dates such as `2026-10-31`. Reject invalid or contradictory ranges. Convert valid ISO dates to the tracker's existing date representation when persisting; keep stored schema compatibility.
- Treat relative dates in the Asia/Kolkata timezone. Tools accept explicit dates; context exposes today's date for the client to resolve “yesterday”.
- Reuse the current expense exclusion rule: `Credit Card Payment`, `Settlement`, `Investment`, and `Refunded` do not count in expense summaries. Search returns matching raw transactions, including these categories; its result explains that distinction.
- Preserve household wallet normalization: `SBI_Debit_Card` means `paid_by=Household Pool` and `expense_type=Common_50_50`. Its expenses split equally for responsibility/budgets and create no settlement debt.
- Summary person selection means spending responsibility: personal spending, spending paid by the other partner for that person, and half of common spending. Payer filtering in search remains an independent explicit filter. The combined summary includes every qualifying expense as the website does; unassigned responsibility remains visible separately.
- Reuse `createBudgetService`, `createInvestmentService`, and `calculateSettlement`. Extract dashboard and transaction persistence operations into shared services where needed so website and MCP behavior cannot drift. Settlement uses the app's existing transaction selection and sign convention, without inventing a different accounting definition.
- Preserve missing investment valuations as unknown. Show known subtotals and missing counts; do not present a partially valued portfolio as fully valued.
- Validate amounts as finite positive numbers with at most two decimal places, using exact paise validation and the app's established upper bound. Reject unknown editable keys, invalid IDs, unsupported enum values, and excessively long strings. Category/type/payment choices come from current lists plus established built-in values; blank legacy values remain readable.
- Default transaction page size is 50, maximum 200. Use deterministic ordering by parsed date and ID, bounded search text, and parameterized SQL. Escape wildcard characters for literal text search. Use the existing month-sort expression for month-based SQL ordering. Do not sort stored English dates lexically.
- Summary computations cover the entire filter, not just a search page. Paginate potentially large breakdown arrays or cap them with explicit truncation metadata while keeping overall totals complete. Structured tool responses also contain concise text suitable for clients without structured-result rendering.

## Writes, concurrency, and audit

Extract shared transaction add/update operations while preserving the existing HTTP contract and unrelated extraction-timeout changes. MCP uses stricter validation before calling these operations; ordinary website behavior should not silently change.

An add retains the existing date/amount/description duplicate rule, returning an explicit existing/duplicate result instead of inserting a second row. Updates preserve omitted fields and the app's existing pre-change audit snapshot. Household normalization runs after merging a patch. Maintain existing merchant-pattern rebuild behavior.

Derive an opaque revision from all persisted editable transaction fields. An update compares the supplied revision inside the same SQLite transaction that writes the row; a mismatch returns `conflict` and requires rereading. A stale assistant must not overwrite a concurrent website edit.

Persist MCP idempotency keys scoped to authenticated account, client, and tool, together with a canonical request fingerprint and result. Repeating the same request returns the original result; reusing a key with different input returns a conflict. Check replay before revision validation. The mutation, idempotency record, and audit entry commit atomically. Retain idempotency records for 30 days and document the retry window.

Record MCP writes with actor email, OAuth client ID, operation, transaction ID, timestamp, and before/after snapshots in a separate MCP audit table. Keep the website's existing short-lived restore history behavior. MCP audit records remain until an explicit future retention policy is introduced; never put bearer credentials in audit data or logs.

## Authentication and transport

The OAuth provider uses authorization-code flow with mandatory S256 PKCE, resource indicators targeting the exact MCP URL, strict redirect matching, issuer identification in authorization responses, short-lived access tokens, and rotating refresh tokens. Initial proposed lifetimes are five minutes for authorization codes, one hour for access tokens, and 30 days for refresh grants. Enforce replay rejection and provider-supported grant revocation.

Use dynamic client registration for interoperable initial setup. Accept public clients with `none` token authentication and confidential clients with a provider-supported secret method. Allow HTTPS redirect URIs and standards-compliant loopback redirects for local clients; never allow wildcard redirects, fragments, userinfo, or arbitrary HTTP hosts. Client names and redirect destinations are untrusted and must be escaped on consent screens. Do not fetch arbitrary registration-provided URLs. Bound and rate-limit registration; registration alone never grants data access. CIMD and other optional authentication extensions are deferred unless a named client demonstrably requires them.

Provider state, grants, clients, consumed codes, and refresh-token rotation state persist in SQLite across Fly restarts. Follow the provider's complete adapter contract, including expiration, consume, and grant-family revocation. Configure stable signing/cookie secrets through deployment secrets where the provider requires them; no generated production keys on each boot. The implementation plan must verify current provider configuration APIs and dependency engine requirements before installation.

Bind OAuth interactions to the browser and resume only a validated local interaction after Google login. Require a currently allowed, Google-verified identity, protect consent POSTs against CSRF, and recheck `ALLOWED_EMAILS` on every token-backed request. Removing an email from the allowlist prevents existing connections from continuing to use it. Never accept a request-supplied email as identity, and never forward Google's access token to an MCP client.

Publish MCP protected-resource metadata and OAuth discovery metadata at standards-compliant well-known locations, including the `/mcp` path-aware resource location. Missing or invalid tokens receive a JSON `401` plus the required `WWW-Authenticate` metadata challenge; insufficient scopes receive `403`. MCP requests never redirect to the HTML login page.

Mount MCP and discovery routes outside the existing browser-session `requireAuth` middleware, with their own bearer verification. Keep existing website/API routes protected by browser sessions. Mount the provider before incompatible body-parsing middleware or use its documented integration to avoid consuming OAuth request bodies twice.

Use the SDK's stateless/per-request HTTP handling, protocol negotiation, method validation, and cleanup. No MCP data or authentication lives only in an in-memory session. Validate Host and supplied Origin headers against configured origins; clients that send no Origin still authenticate normally. Bound request sizes and rate-limit token, registration, and MCP routes. Logs contain request/operation IDs and sanitized failure codes, not financial payloads or tokens.

Tool metadata declares read/write behavior accurately, including `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`, plus OAuth security-scheme metadata needed by ChatGPT. Authorization is enforced inside execution regardless of metadata. Financial records and free-text descriptions are returned as data, never treated as instructions.

## Operational delivery

The MCP feature is off unless explicitly enabled and fully configured. Missing OAuth configuration fails closed with a clear startup diagnostic. Persist provider and MCP bookkeeping alongside the existing database on `/data`; do not create a second unsynchronized financial database.

Deliver an `.env.example` update, setup guide for local testing and Fly configuration, account connection instructions for ChatGPT, Claude, and Codex, and a way for a signed-in household user to list/revoke their own connected grants. Revocation must prevent further resource access and refresh. This is a narrow account-management screen, using existing UI styling, not a dashboard redesign.

Use isolated temporary databases for automated tests. Do not read or mutate real expense records merely to test the feature. Deployment and each client's interactive account linking are separate rollout steps; do not claim that a client is connected until its handshake and a read tool succeed. Verify actual account availability during linking rather than promise a specific plan's connector entitlement.

Update `CLAUDE.md`, `features.md`, and the architecture/setup documentation with only the implemented behavior. Preserve all pre-existing working-tree changes. A design/implementation commit must contain only this work. No production deployment or credential entry is implied by this design review.

## Acceptance evidence

1. SDK client integration tests initialize and list tools over HTTP, negotiate supported protocol versions, and call a read tool and each write tool successfully against fixtures.
2. End-to-end OAuth tests cover discovery, registration, PKCE, login/consent continuation, code exchange, audience/issuer/scopes, expiry, refresh rotation, restart persistence, revocation, and disallowed accounts. Negative cases cannot execute financial handlers.
3. Finance tests compare summary/budget/settlement results with shared website services, including household pool, cross-person payments, excluded categories, chronological dates, unmapped categories, missing salaries, and partial valuations.
4. Write tests cover persistence, duplicate handling, omitted fields, normalization, atomic audit, invalid money/dates/enums, idempotent retries, conflicting keys, and stale updates from a concurrent website edit.
5. Existing project tests pass with isolated database configuration, and the standard `npm start` website remains operational with MCP disabled and enabled.
6. A documented manual smoke test links each requested client to the deployed endpoint and runs a read call. Write smoke tests use an isolated test environment or explicitly approved test data. Record any unavailable client/account verification as outstanding.

## What remains with the implementer

Choose module/file names, exact compatible dependency patch versions, pagination cursor encoding, transaction revision encoding, provider adapter schema/indexes, and rate-limit values. Keep those choices consistent with the contracts above. Document differences found between supported client versions instead of silently broadening access or bypassing OAuth.

## References consulted

- [Official MCP SDK](https://ts.sdk.modelcontextprotocol.io/v2/) and [Express integration](https://ts.sdk.modelcontextprotocol.io/v2/serving/express.html).
- [MCP authorization guidance](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html).
- [OpenAI authentication requirements](https://developers.openai.com/plugins/build/auth).
- [Codex MCP setup](https://developers.openai.com/codex/mcp/).
- [Claude custom connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers).
- [oidc-provider](https://github.com/panva/node-oidc-provider), a maintained OAuth/OIDC authorization-server implementation with PKCE and resource indicator support.
