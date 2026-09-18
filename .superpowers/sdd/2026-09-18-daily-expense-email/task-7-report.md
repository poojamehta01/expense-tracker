# Task 7 Report: Daily GitHub Actions schedules

## Result

Implemented `.github/workflows/daily-expense-email.yml` with daily reminder and report schedules, manual dispatch choices, protected endpoint calls, retries, failure propagation, and independent concurrency groups.

## TDD evidence

- RED: `PATH=/Users/poojamehta/.nvm/versions/node/v22.22.0/bin:$PATH node --test test/daily-email-workflow.test.js` failed because the workflow file did not exist.
- GREEN: the focused workflow contract test passed 3/3 after adding the workflow.
- Coverage follow-up: the test now parses the YAML and verifies that reminder/report jobs keep their own schedule, manual dispatch choice, endpoint, and concurrency group paired; swapping either gate or endpoint fails the test.
- YAML verification: Ruby Psych parsed the workflow successfully after converting the `run` commands to block scalars.
- `git diff --check` exited 0.
- Full serial suite attempted with Node 22 (`node --test --test-concurrency=1 test/*.test.js`); 135 tests passed and 56 failed because the worktree's `better-sqlite3` native binding is unavailable for Node 22. The workflow test passed; this environment limitation is unrelated to Task 7.

## Included behavior

- Runs reminder at `0 15 * * *` (20:30 IST) and report at `30 15 * * *` (21:00 IST), every day including weekends.
- Supports manual `reminder`, `report`, and `both` dispatch choices.
- Sends `POST` requests to the protected reminder/report endpoints using the repository URL and scheduler bearer secret references.
- Uses `curl --fail-with-body --retry 2 --retry-all-errors` so non-2xx responses fail the job and transient failures retry.
- Uses separate non-canceling concurrency groups for reminder and report jobs.
