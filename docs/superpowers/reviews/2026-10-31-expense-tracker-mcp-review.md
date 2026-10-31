# Expense Tracker MCP — verification and review

Implementation: `codex/expense-tracker-mcp`, based on `eddf828`. The approved scope is implemented locally; deployment and real account linking remain rollout steps in [MCP setup](../../mcp-setup.md).

## Independent review

A fresh-context reviewer inspected the committed implementation through `b8e7dc1`, including the accounting, OAuth/SQLite persistence, Google continuation, consent, scopes, transport, and tests. It independently ran all 31 MCP tests present at that point. It found no critical issues and one important issue, subsequently fixed by the implementer:

- **Fixed:** Partial updates used to recompute the month from a legacy date. A notes-only edit of a malformed or ISO historical date could move the record to the current month. The shared mutation service now preserves the original month unless the patch explicitly changes its date. A regression test failed with February 2024 becoming October 2026, then passed for both malformed and ISO dates and explicit month changes.
- **Deferred minor:** `normalizedFields` may omit indirectly changed payer/expense-type fields when an update supplies only `payment_method: SBI_Debit_Card`. The returned transaction and stored accounting remain correct. Consumers should use the returned transaction as the authoritative saved values.

The reviewer set aside live ChatGPT/Claude/Codex linking, real Google authentication, and production proxy acceptance because they require actual rollout, as well as existing Nodemailer/development-tool advisories. These remain explicit limitations, not verified deployment claims.

## Verification evidence

- Working checkout: `npm test`, 274/274 passed after the review fix, including the user's two pre-existing extra extraction tests.
- The committed implementation is also tested in an exported clean copy with Node 22, dummy credentials, and temporary databases; no private `.env` is required.
- OAuth/HTTP tests use real SDK/provider protocol handling, replacing only the external Google identity step.
- `git diff --check` passes. Pre-existing edits in `server.js` and `test/extraction-timeout.test.js` match the saved original patch and are excluded from MCP commits.
- Compatible Express/body-parser/proxy-addr/qs/path-to-regexp security patches were updated. Existing Nodemailer major-upgrade and development-tool advisories remain documented in setup.

## Decisions and costs

1. Execute inline after approved design, with one independent review at the end. Cost if wrong: fewer intermediate review opportunities; final review and regression tests cover the complete implementation.
2. Use a feature branch in the original checkout after the managed worktree was denied filesystem writes and archived. Cost if wrong: interleaving with user work; original edits were saved, compared and excluded from commits.
3. Install/version-check dependencies early; the OAuth task owns their commit. Cost if wrong: install failure delays early tests; exact compatible versions were verified.
4. Mount registration/request rate limits in HTTP composition rather than the standalone provider module. Cost if wrong: another embedder must add equivalent public-route protections.
5. Apply 50/default, 200/max pagination to budget transaction and investment detail rows, retaining complete totals. Cost if wrong: consumers must follow `nextOffset` to see every row.
6. Isolate npm test databases and supply dummy auth credentials. Cost if wrong: test environment differences; real application startup and explicit enabled configuration are covered separately.
7. Remove the unused MCP Express adapter and update compatible HTTP patches; defer the unrelated major email-service upgrade and dev tooling changes. Cost if wrong: the existing advisory exposure remains, without new MCP tools exposing email configuration.
8. Treat live client/proxy/Google authentication as deployment acceptance checks, because fixture/SDK tests cannot prove real account connectivity. Cost if wrong: client-specific deployment corrections may be needed.
9. Keep the implementation on its feature branch for handoff. No merge, push, deploy or account linking is part of this implementation run.
