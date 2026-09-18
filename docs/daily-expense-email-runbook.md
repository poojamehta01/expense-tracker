# Daily Expense Email Delivery Reconciliation

Use this runbook only when a reminder or report returns `delivery_unknown`, or when a `sending` claim remains after its 15-minute freshness window. The system deliberately does not recover or resend automatically: Gmail SMTP and SQLite cannot provide an atomic exactly-once commit, so an uncertain send is blocked until an operator reconciles it.

Never paste Gmail credentials, the scheduler bearer token, or an app password into commands, tickets, or this document.

## 1. Stop new attempts

Pause the scheduled workflow and do not invoke the affected endpoint manually. If the claim is still `sending`, wait until the 15-minute freshness window has elapsed so an active sender has time to finish. Record only:

- `kind`: `reminder` or `report`
- `report_date`: the previous-day date in `YYYY-MM-DD`
- expected subject: `Expense Tracker — Daily Reminder` or `Expense Tracker — Daily Report`

## 2. Inspect Gmail Sent and SQLite before changing anything

In the sender account's Gmail Sent folder, search the narrow time window around the attempt and inspect messages with the expected subject. Confirm all of the following:

- sender is `pooja0111mehta@gmail.com`;
- both intended recipients are on the same message;
- the body names the expected report date;
- the subject matches the selected `kind`;
- there is exactly one matching sent message, or none.

For a matching message, use Gmail's **Show original** view to record its exact `Message-ID`, `In-Reply-To`, and `References` headers. Do not use the Gmail UI conversation ID as the message ID.

Using approved SQLite administration access to the production database, run these read-only queries with bound `:kind` and `:report_date` values:

```sql
SELECT kind, report_date, status, message_id, claimed_at, updated_at
FROM daily_email_delivery_claims
WHERE kind = :kind AND report_date = :report_date;

SELECT kind, report_date, message_id, sent_at
FROM daily_email_sends
WHERE kind = :kind AND report_date = :report_date;

SELECT kind, root_message_id, last_message_id, updated_at
FROM daily_email_threads
WHERE kind = :kind;
```

Stop without mutating anything if the identifiers are uncertain, multiple Gmail messages match, the ledger and claim disagree unexpectedly, or the Gmail thread headers do not match the stored thread root/last IDs. Preserving the blocked claim is safer than risking a duplicate.

## 3. Choose one reconciliation outcome

Before either write path, take a recoverable SQLite backup or volume snapshot and use one database connection for the entire transaction.

### A. Gmail Sent contains the message: preserve it as sent

If `daily_email_sends` already contains the successful row, do not insert or resend anything. A `sent` claim is already reconciled; any other claim/ledger mismatch needs investigation before mutation.

If Gmail contains exactly one matching message, no send-ledger row exists, and the claim is `delivery_unknown` or stale `sending`, bind its exact Gmail `Message-ID` as `:message_id`. Start one `BEGIN IMMEDIATE` transaction and re-run the three inspection queries inside it.

Then update exactly one claim and insert the ledger row:

```sql
BEGIN IMMEDIATE;

UPDATE daily_email_delivery_claims
SET status = 'sent',
    message_id = :message_id,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE kind = :kind
  AND report_date = :report_date
  AND status IN ('sending', 'delivery_unknown');

SELECT changes(); -- must be 1; otherwise ROLLBACK

INSERT INTO daily_email_sends (kind, report_date, message_id)
VALUES (:kind, :report_date, :message_id);
```

Reconcile the thread in the same transaction:

- If no `daily_email_threads` row exists for the kind, the Gmail message must have no `In-Reply-To`/`References`; insert it as the root:

```sql
INSERT INTO daily_email_threads (kind, root_message_id, last_message_id)
VALUES (:kind, :message_id, :message_id);
```

- If a thread row exists, Gmail's `References` must contain its `root_message_id` and `In-Reply-To` must equal its prior `last_message_id`; preserve the root and advance only the last ID:

```sql
UPDATE daily_email_threads
SET last_message_id = :message_id,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE kind = :kind;

SELECT changes(); -- must be 1; otherwise ROLLBACK
```

Re-run all three inspection queries, confirm the claim and ledger have the same message ID and the thread root/last values are correct, then `COMMIT`. On any mismatch, `ROLLBACK` and escalate instead of improvising a repair.

### B. Gmail Sent does not contain the message: clear once, then retry once

Choose this only after the freshness window, after confirming no matching Gmail Sent message exists, and while schedules remain paused. Confirm there is no `daily_email_sends` row. In one transaction:

```sql
BEGIN IMMEDIATE;

SELECT kind, report_date, status, message_id, claimed_at, updated_at
FROM daily_email_delivery_claims
WHERE kind = :kind AND report_date = :report_date;

SELECT kind, report_date, message_id, sent_at
FROM daily_email_sends
WHERE kind = :kind AND report_date = :report_date;

DELETE FROM daily_email_delivery_claims
WHERE kind = :kind
  AND report_date = :report_date
  AND status IN ('sending', 'delivery_unknown');

SELECT changes(); -- must be 1; otherwise ROLLBACK

COMMIT;
```

Invoke the affected endpoint exactly once and inspect its result. Do not loop or enable workflow retries. If it returns `delivery_unknown` again, stop and restart this reconciliation procedure from the Gmail Sent check.

## 4. Resume scheduling

Resume the scheduled workflow only after the claim, ledger, Gmail Sent message, and thread state agree—or after the controlled retry has reached a confirmed `sent`/`already_sent` result. Keep automation paused if the outcome remains uncertain.
