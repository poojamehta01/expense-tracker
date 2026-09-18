const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'daily-expense-email.yml');

test('daily expense email workflow invokes both protected jobs on IST schedules', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /cron:\s*['"]0 15 \* \* \*['"]/);
  assert.match(workflow, /cron:\s*['"]30 15 \* \* \*['"]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /\/api\/internal\/daily-email\/reminder/);
  assert.match(workflow, /\/api\/internal\/daily-email\/report/);
  assert.match(workflow, /Authorization: Bearer \$\{\{ secrets\.REPORT_SCHEDULER_SECRET \}\}/);
});

test('workflow exposes the supported manual dispatch choices and protected curl contract', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /options:\s*[\s\S]*- reminder[\s\S]*- report[\s\S]*- both/);
  assert.match(workflow, /secrets\.EXPENSE_TRACKER_BASE_URL/);
  assert.match(workflow, /curl --fail-with-body --retry 2 --retry-all-errors -X POST/);
  assert.match(workflow, /concurrency:\s*\n\s+group: daily-expense-email-reminder/);
  assert.match(workflow, /concurrency:\s*\n\s+group: daily-expense-email-report/);
  assert.doesNotMatch(workflow, /set\s+-x/);
});
