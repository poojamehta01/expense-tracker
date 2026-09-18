const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'daily-expense-email.yml');

function readWorkflow() {
  return fs.readFileSync(workflowPath, 'utf8');
}

function parseWorkflow() {
  const json = execFileSync(
    'ruby',
    ['-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.load_file(ARGV.fetch(0)))', workflowPath],
    { encoding: 'utf8' },
  );
  return JSON.parse(json);
}

test('daily expense email workflow invokes both protected jobs on IST schedules', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /cron:\s*['"]0 15 \* \* \*['"]/);
  assert.match(workflow, /cron:\s*['"]30 15 \* \* \*['"]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /\/api\/internal\/daily-email\/reminder/);
  assert.match(workflow, /\/api\/internal\/daily-email\/report/);
  assert.match(workflow, /Authorization: Bearer \$\{\{ secrets\.REPORT_SCHEDULER_SECRET \}\}/);
});

test('workflow exposes the supported manual dispatch choices and protected curl contract', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /options:\s*[\s\S]*- reminder[\s\S]*- report[\s\S]*- both/);
  assert.match(workflow, /secrets\.EXPENSE_TRACKER_BASE_URL/);
  assert.match(workflow, /curl --fail-with-body --retry 2 --retry-all-errors -X POST/);
  assert.match(workflow, /concurrency:\s*\n\s+group: daily-expense-email-reminder/);
  assert.match(workflow, /concurrency:\s*\n\s+group: daily-expense-email-report/);
  assert.doesNotMatch(workflow, /set\s+-x/);
});

test('parsed workflow keeps each schedule, manual gate, endpoint, and lock paired', () => {
  const workflow = parseWorkflow();
  const triggers = workflow.on || workflow.true;

  assert.deepEqual(
    triggers.schedule.map(({ cron }) => cron),
    ['0 15 * * *', '30 15 * * *'],
  );
  assert.deepEqual(triggers.workflow_dispatch.inputs.job.options, ['reminder', 'report', 'both']);

  const reminder = workflow.jobs.reminder;
  assert.match(reminder.if, /github\.event\.schedule == '0 15 \* \* \*'/);
  assert.match(reminder.if, /github\.event\.inputs\.job == 'reminder'/);
  assert.match(reminder.steps[0].run, /\/api\/internal\/daily-email\/reminder"?$/);
  assert.equal(reminder.concurrency.group, 'daily-expense-email-reminder');

  const report = workflow.jobs.report;
  assert.match(report.if, /github\.event\.schedule == '30 15 \* \* \*'/);
  assert.match(report.if, /github\.event\.inputs\.job == 'report'/);
  assert.match(report.steps[0].run, /\/api\/internal\/daily-email\/report"?$/);
  assert.equal(report.concurrency.group, 'daily-expense-email-report');
});
