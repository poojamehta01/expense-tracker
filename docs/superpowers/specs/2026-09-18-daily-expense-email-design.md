# Daily Expense Email Design

## Purpose

Send Pooja and Kunal two useful household-expense emails every evening:

1. An 8:30 p.m. IST reminder to finish entering the previous day's expenses.
2. A 9:00 p.m. IST report summarizing the previous calendar day and the current month's budget position.

The one-day delay gives both users most of the following day to enter late expenses before that day's report is finalized.

## Delivery

- Sender: `pooja0111mehta@gmail.com`
- Recipients on the same message:
  - `poojamehta1197@gmail.com`
  - `kunal.mukte03@gmail.com`
- Schedule: every day, including weekends, in the `Asia/Kolkata` time zone.
- Reminder time: 8:30 p.m.
- Report time: 9:00 p.m.

The reminder and report use two separate persistent email threads:

- `Expense Tracker — Daily Reminder`
- `Expense Tracker — Daily Report`

Every later message replies to the corresponding thread using `Message-ID`, `In-Reply-To`, and `References` headers. Reusing a subject alone is not considered sufficient threading.

## Reporting Period

The emails sent on a given date refer to the previous calendar day in `Asia/Kolkata`. For example, emails sent on September 19 summarize September 18.

The daily sections use the previous day's transaction dates. Month-to-date sections use the latest database state for the month containing the previous day. This is important at month boundaries: a report sent on October 1 summarizes September 30 and uses September's month-to-date totals and budget.

Transactions entered after their previous-day report has been sent remain visible in the app and affect the applicable monthly totals, but the first version does not send corrections or reopen an already-sent daily report.

## Reminder Email

The 8:30 p.m. email:

- Identifies the previous day by a human-readable date.
- Asks both users to finish adding that day's expenses before the 9:00 p.m. report.
- Includes a direct link to the app's Add Expenses page.
- Is sent every day even when transactions already exist, establishing a consistent habit.

## Report Email

The 9:00 p.m. email includes:

### Previous day

- Expense total.
- Expense transaction count.
- Compact expense transaction list with description, category, payer, and amount.
- Investments made that day.

### Month to date

- Expense spending.
- Expense budget.
- Remaining budget or overspent amount.
- Percentage of budget used.
- Investment total.
- A warning and total when eligible expenses remain unmapped to budget lines.

The email includes direct links to the Dashboard and Budget pages.

If no expenses or investments were recorded for the previous day, the report says so explicitly. If no monthly budget exists, it displays `No budget configured` rather than presenting a zero budget. Amounts use Indian rupee formatting.

## Calculation Rules

Report calculations must match the existing combined Dashboard and Budget behavior:

- Exclude `Credit Card Payment`, `Settlement`, `Investment`, and `Refunded` from expense spending.
- Report `Investment` transactions separately.
- Count Household Pool transactions once in the combined report.
- Include eligible unmapped expenses in actual spending.
- Use the combined Pooja and Kunal budget for the applicable month.
- Calculate all date boundaries in `Asia/Kolkata`, independent of the Fly machine or GitHub runner time zone.

## Components

### Report service

A new server-side module owns:

- India-time reporting date derivation.
- Expense and investment queries.
- Budget summary retrieval.
- Plain-text and HTML email rendering.
- Gmail SMTP delivery.
- Thread metadata and send-ledger persistence.

It accepts its database, mail transport, clock, and application base URL as dependencies so calculations and delivery behavior can be tested without external calls.

### Gmail SMTP

The app sends through Gmail SMTP as `pooja0111mehta@gmail.com` using a Google app password. Credentials are never committed or returned to the browser.

Fly secrets:

- `REPORT_GMAIL_USER`
- `REPORT_GMAIL_APP_PASSWORD`
- `REPORT_RECIPIENTS`
- `REPORT_SCHEDULER_SECRET`

The app password is entered directly as a Fly secret and must not be pasted into source files, tests, documentation, chat, or GitHub workflow definitions.

### Scheduler endpoints

Two internal POST endpoints trigger the jobs:

- `/api/internal/daily-email/reminder`
- `/api/internal/daily-email/report`

Requests authenticate with `Authorization: Bearer <REPORT_SCHEDULER_SECRET>`. Authentication is checked before any report calculation or send attempt. The endpoints are not protected by the interactive Google login because GitHub Actions calls them without a browser session.

Each endpoint returns a small JSON result indicating `sent`, `already_sent`, `in_progress`, `delivery_unknown`, or an error. No credential or recipient detail is included in responses.

### GitHub Actions scheduler

A scheduled workflow invokes the deployed endpoints every day. GitHub cron is expressed in UTC:

- 8:30 p.m. IST = 3:00 p.m. UTC.
- 9:00 p.m. IST = 3:30 p.m. UTC.

India has no daylight-saving adjustment, so these UTC schedules remain stable. The workflow stores only the scheduler secret and deployed application URL. The Fly app may auto-start when called.

The workflow also supports manual dispatch so either job can be tested or retried from GitHub Actions.

## Persistence and Threading

SQLite stores three kinds of state:

1. Thread state keyed by `reminder` or `report`, containing the root/reference message ID needed for the next reply.
2. A send ledger keyed by job type and reporting date.
3. A durable delivery claim keyed by job type and reporting date, with `sending`, `delivery_unknown`, or `sent` state.

The send sequence is:

1. In one SQLite transaction, check the send ledger and atomically insert the `sending` claim.
2. If a successful ledger row already exists, return `already_sent`. If another invocation owns a fresh claim, return `in_progress`. Neither path contacts Gmail.
3. Build the email from a consistent database snapshot.
4. Send through Gmail, adding thread headers when stored thread state exists.
5. Once SMTP may have accepted the message, durably change the claim to `delivery_unknown` before validating or finalizing the result.
6. For a confirmed result with a valid message ID, transition the claim to `sent`, insert the successful ledger row, and update thread state in one SQLite transaction.

A demonstrably definite pre-acceptance failure is not recorded as successful: its claim is removed and the job may be retried. This includes local message/envelope/authentication failures and explicit 4xx/5xx SMTP rejection responses. Network, timeout, socket, connection, unclassified transport errors, invalid success metadata, and post-acceptance persistence errors are not known to be safe to retry. They remain `delivery_unknown` and block automatic resend. If thread metadata is unavailable, a confirmed job starts a new thread and stores its message ID for later sends.

A `sending` claim is fresh for 15 minutes. A later invocation returns `in_progress` during that window. At the stale boundary it changes the claim to `delivery_unknown`; it does not reclaim or resend, because the interrupted process may have reached Gmail. There is no automatic recovery from `delivery_unknown` by design.

## Error Handling and Operations

- Missing SMTP or scheduler configuration causes an explicit server error and no send attempt.
- Unauthorized scheduler calls return HTTP 401.
- Duplicate calls return success with `already_sent` so workflow retries remain safe.
- A concurrent call returns `in_progress` without contacting Gmail.
- Definite pre-acceptance failures remain retryable.
- Ambiguous SMTP and post-acceptance persistence outcomes return `delivery_unknown`, block automatic retry, and require manual reconciliation.
- Report-generation errors do not send partial messages.
- Empty transaction data and missing budgets are normal report states, not errors.
- Server logs identify the job type, reporting date, and outcome without logging secrets or full email contents.

Before enabling schedules, both endpoints are manually exercised against production with the real recipients. The schedule is enabled only after the reminder, report content, sender identity, and both persistent threads are confirmed.

Operators reconcile `delivery_unknown` only with the [daily email production runbook](../../daily-expense-email-runbook.md). The procedure requires checking Gmail Sent and the exact SQLite claim/ledger/thread state before explicitly choosing to preserve the delivery as sent or clear the claim for one controlled retry.

## Testing

Automated tests cover:

- Previous-day derivation in `Asia/Kolkata`, including UTC-boundary cases.
- Month-boundary behavior, especially the October 1 report for September 30.
- Expense exclusions and separate investment totals.
- Household Pool and unmapped-expense reconciliation.
- No-budget and no-transaction presentation.
- Reminder and report HTML/plain-text content.
- Two independent persistent thread identities.
- Correct reply headers after the first message.
- Duplicate prevention for both job types.
- Retry behavior after a definite pre-acceptance failure.
- At-most-once handling for concurrent claims, ambiguous SMTP failures, invalid success metadata, and post-acceptance persistence failures.
- Fresh and stale claim behavior, including the 15-minute transition to `delivery_unknown`.
- Authentication failure before report generation.
- Workflow schedule expressions and manual dispatch configuration.

Tests use a fake mail transport with complete message results; they do not contact Gmail. A final controlled production smoke test verifies SMTP credentials and Gmail threading.

## Initial Scope

The first version deliberately excludes:

- Per-user personalized reports.
- User-configurable schedules or recipients in the UI.
- Correction emails for transactions entered after a report is sent.
- Weekly or monthly summary emails.
- Email reply processing.

These can be added later without changing the daily report calculation or delivery boundaries.
