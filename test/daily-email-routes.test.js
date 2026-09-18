const assert = require('node:assert/strict');
const test = require('node:test');

const { registerDailyEmailRoutes } = require('../daily-email-routes');

function createApp() {
  const routes = new Map();
  return {
    routes,
    post(path, handler) { routes.set(`POST ${path}`, handler); },
  };
}

function createRequest(headers = {}) {
  return { headers };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function route(app, path) {
  const handler = app.routes.get(`POST ${path}`);
  assert.ok(handler, `POST ${path} should be registered`);
  return handler;
}

function createService(overrides = {}) {
  return {
    sendReminder: async () => ({ status: 'sent', kind: 'reminder', reportDate: '2026-09-17' }),
    sendReport: async () => ({ status: 'sent', kind: 'report', reportDate: '2026-09-17' }),
    ...overrides,
  };
}

function createLogger() {
  const entries = { info: [], error: [] };
  return {
    entries,
    info(entry) { entries.info.push(entry); },
    error(entry) { entries.error.push(entry); },
  };
}

test('logs structured non-secret fields for every scheduler service result', async () => {
  const cases = [
    { status: 'sent', statusCode: 200, level: 'info', manualAttention: false },
    { status: 'already_sent', statusCode: 200, level: 'info', manualAttention: false },
    { status: 'in_progress', statusCode: 202, level: 'info', manualAttention: false },
    { status: 'delivery_unknown', statusCode: 503, level: 'error', manualAttention: true },
  ];

  for (const expected of cases) {
    const app = createApp();
    const logger = createLogger();
    registerDailyEmailRoutes(app, createService({
      sendReport: async () => ({
        status: expected.status,
        kind: 'report',
        reportDate: '2026-09-17',
      }),
    }), { schedulerSecret: 'scheduler-token', logger });

    const response = createResponse();
    await route(app, '/api/internal/daily-email/report')(
      createRequest({ authorization: 'Bearer scheduler-token' }),
      response,
    );

    assert.equal(response.statusCode, expected.statusCode);
    assert.deepEqual(logger.entries[expected.level], [{
      event: 'daily_email_scheduler',
      kind: 'report',
      reportDate: '2026-09-17',
      outcome: expected.status,
      manualAttention: expected.manualAttention,
    }]);
    const otherLevel = expected.level === 'info' ? 'error' : 'info';
    assert.deepEqual(logger.entries[otherLevel], []);
    assert.equal(JSON.stringify(logger.entries).includes('scheduler-token'), false);
  }
});

test('logs only safe error classification when a scheduler service throws', async () => {
  const app = createApp();
  const logger = createLogger();
  registerDailyEmailRoutes(app, createService({
    sendReport: async () => {
      const error = new TypeError(
        'Bearer scheduler-token failed with app-password for recipient@example.test',
      );
      error.code = 'EAUTH';
      throw error;
    },
  }), { schedulerSecret: 'scheduler-token', logger });

  const response = createResponse();
  await route(app, '/api/internal/daily-email/report')(
    createRequest({ authorization: 'Bearer scheduler-token' }),
    response,
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(logger.entries.info, []);
  assert.deepEqual(logger.entries.error, [{
    event: 'daily_email_scheduler',
    kind: 'report',
    reportDate: null,
    outcome: 'failed',
    manualAttention: false,
    errorClass: 'TypeError',
    errorCode: 'EAUTH',
  }]);
  const serialized = JSON.stringify(logger.entries);
  assert.equal(serialized.includes('scheduler-token'), false);
  assert.equal(serialized.includes('app-password'), false);
  assert.equal(serialized.includes('recipient@example.test'), false);
});

test('redacts unrecognized exception codes from scheduler logs', async () => {
  const app = createApp();
  const logger = createLogger();
  registerDailyEmailRoutes(app, createService({
    sendReminder: async () => {
      const error = new Error('transport failed');
      error.code = 'SECRET_password-value';
      throw error;
    },
  }), { schedulerSecret: 'scheduler-token', logger });

  const response = createResponse();
  await route(app, '/api/internal/daily-email/reminder')(
    createRequest({ authorization: 'Bearer scheduler-token' }),
    response,
  );

  assert.deepEqual(logger.entries.error[0], {
    event: 'daily_email_scheduler',
    kind: 'reminder',
    reportDate: null,
    outcome: 'failed',
    manualAttention: false,
    errorClass: 'Error',
    errorCode: 'UNCLASSIFIED',
  });
  assert.equal(JSON.stringify(logger.entries).includes('password-value'), false);
});

test('authorized reminder calls the service and returns its sent result', async () => {
  const app = createApp();
  let serviceCalls = 0;
  registerDailyEmailRoutes(app, createService({
    sendReminder: async () => {
      serviceCalls += 1;
      return { status: 'sent', kind: 'reminder', reportDate: '2026-09-17' };
    },
  }), { schedulerSecret: 'correct' });

  const response = createResponse();
  await route(app, '/api/internal/daily-email/reminder')(
    createRequest({ authorization: 'Bearer correct' }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    status: 'sent',
    kind: 'reminder',
    reportDate: '2026-09-17',
  });
  assert.equal(serviceCalls, 1);
});

test('missing and incorrect bearer tokens return 401 before calling the service', async () => {
  const app = createApp();
  let serviceCalls = 0;
  registerDailyEmailRoutes(app, createService({
    sendReport: async () => {
      serviceCalls += 1;
      return { status: 'sent', kind: 'report', reportDate: '2026-09-17' };
    },
  }), { schedulerSecret: 'correct' });
  const reportHandler = route(app, '/api/internal/daily-email/report');

  const missingResponse = createResponse();
  await reportHandler(createRequest(), missingResponse);
  assert.equal(missingResponse.statusCode, 401);
  assert.deepEqual(missingResponse.body, { error: 'Unauthorized' });

  const wrongResponse = createResponse();
  await reportHandler(
    createRequest({ authorization: 'Bearer wronggg' }),
    wrongResponse,
  );
  assert.equal(wrongResponse.statusCode, 401);
  assert.deepEqual(wrongResponse.body, { error: 'Unauthorized' });
  assert.equal(serviceCalls, 0);
  assert.equal(JSON.stringify(wrongResponse.body).includes('wronggg'), false);
});

test('missing scheduler configuration returns 503 without calling the service', async () => {
  const app = createApp();
  let serviceCalls = 0;
  registerDailyEmailRoutes(app, createService({
    sendReminder: async () => {
      serviceCalls += 1;
      return { status: 'sent', kind: 'reminder', reportDate: '2026-09-17' };
    },
  }), { schedulerSecret: '' });

  const response = createResponse();
  await route(app, '/api/internal/daily-email/reminder')(
    createRequest({ authorization: 'Bearer anything' }),
    response,
  );

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: 'Daily email is not configured' });
  assert.equal(serviceCalls, 0);
});

test('missing mail service returns 503 only after bearer authentication succeeds', async () => {
  const app = createApp();
  registerDailyEmailRoutes(app, null, { schedulerSecret: 'correct' });
  const reminderHandler = route(app, '/api/internal/daily-email/reminder');

  const unauthorizedResponse = createResponse();
  await reminderHandler(
    createRequest({ authorization: 'Bearer wrong' }),
    unauthorizedResponse,
  );
  assert.equal(unauthorizedResponse.statusCode, 401);

  const unavailableResponse = createResponse();
  await reminderHandler(
    createRequest({ authorization: 'Bearer correct' }),
    unavailableResponse,
  );
  assert.equal(unavailableResponse.statusCode, 503);
  assert.deepEqual(unavailableResponse.body, { error: 'Daily email is not configured' });
});

test('already sent is an idempotent HTTP 200 response', async () => {
  const app = createApp();
  registerDailyEmailRoutes(app, createService({
    sendReport: async () => ({
      status: 'already_sent', kind: 'report', reportDate: '2026-09-17',
    }),
  }), { schedulerSecret: 'correct' });

  const response = createResponse();
  await route(app, '/api/internal/daily-email/report')(
    createRequest({ authorization: 'Bearer correct' }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    status: 'already_sent', kind: 'report', reportDate: '2026-09-17',
  });
});

test('in-progress delivery returns 202 and preserves the service result', async () => {
  const app = createApp();
  registerDailyEmailRoutes(app, createService({
    sendReminder: async () => ({
      status: 'in_progress', kind: 'reminder', reportDate: '2026-09-17',
    }),
  }), { schedulerSecret: 'correct' });

  const response = createResponse();
  await route(app, '/api/internal/daily-email/reminder')(
    createRequest({ authorization: 'Bearer correct' }),
    response,
  );

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, {
    status: 'in_progress', kind: 'reminder', reportDate: '2026-09-17',
  });
});

test('unknown delivery returns 503 and preserves its non-secret service result', async () => {
  const app = createApp();
  registerDailyEmailRoutes(app, createService({
    sendReport: async () => ({
      status: 'delivery_unknown', kind: 'report', reportDate: '2026-09-17',
    }),
  }), { schedulerSecret: 'correct' });

  const response = createResponse();
  await route(app, '/api/internal/daily-email/report')(
    createRequest({ authorization: 'Bearer correct' }),
    response,
  );

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    status: 'delivery_unknown', kind: 'report', reportDate: '2026-09-17',
  });
});

test('service failures return a generic HTTP 500 body', async () => {
  const app = createApp();
  registerDailyEmailRoutes(app, createService({
    sendReport: async () => {
      const error = new Error('sensitive SMTP failure');
      error.stack = 'sensitive stack';
      throw error;
    },
  }), { schedulerSecret: 'correct' });

  const response = createResponse();
  await route(app, '/api/internal/daily-email/report')(
    createRequest({ authorization: 'Bearer correct' }),
    response,
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: 'Daily email operation failed' });
  assert.equal(JSON.stringify(response.body).includes('SMTP'), false);
  assert.equal(JSON.stringify(response.body).includes('stack'), false);
});

test('server service construction requires complete mail configuration', () => {
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
  process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  process.env.REPORT_SCHEDULER_SECRET = 'test-scheduler-secret';
  process.env.REPORT_GMAIL_USER = '';
  process.env.REPORT_GMAIL_APP_PASSWORD = '';
  process.env.REPORT_RECIPIENTS = '';
  const { createDailyEmailServiceFromEnvironment } = require('../server');
  const completeEnvironment = {
    REPORT_GMAIL_USER: 'sender@example.test',
    REPORT_GMAIL_APP_PASSWORD: 'test-app-password',
    REPORT_RECIPIENTS: 'first@example.test, second@example.test',
    BASE_URL: 'https://expense.example.test',
  };
  let transportCalls = 0;
  const dependencies = {
    database: { name: 'database' },
    createBudget: database => ({ database, name: 'budget-service' }),
    createTransport: options => {
      transportCalls += 1;
      return { options, name: 'transport' };
    },
    createService: options => ({ options, name: 'daily-email-service' }),
  };

  for (const missing of Object.keys(completeEnvironment)) {
    const environment = { ...completeEnvironment, [missing]: '' };
    assert.equal(
      createDailyEmailServiceFromEnvironment(environment, dependencies),
      null,
      `${missing} should be required`,
    );
  }
  assert.equal(transportCalls, 0);

  const service = createDailyEmailServiceFromEnvironment(completeEnvironment, dependencies);
  assert.equal(transportCalls, 1);
  assert.equal(service.name, 'daily-email-service');
  assert.deepEqual(service.options.transport, {
    name: 'transport',
    options: { user: 'sender@example.test', appPassword: 'test-app-password' },
  });
  assert.deepEqual(service.options.budgetService, {
    database: dependencies.database,
    name: 'budget-service',
  });
  assert.deepEqual(service.options.config, {
    sender: 'sender@example.test',
    recipients: ['first@example.test', 'second@example.test'],
    baseUrl: 'https://expense.example.test',
  });
});

test('server registers scheduler routes before interactive authentication', async () => {
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
  process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  process.env.REPORT_SCHEDULER_SECRET = 'test-scheduler-secret';
  process.env.REPORT_GMAIL_USER = '';
  process.env.REPORT_GMAIL_APP_PASSWORD = '';
  process.env.REPORT_RECIPIENTS = '';
  const { app: serverApp } = require('../server');
  const stack = serverApp._router.stack;
  const routeIndex = stack.findIndex(layer => (
    layer.route?.path === '/api/internal/daily-email/report'
  ));
  const authIndex = stack.findIndex(layer => layer.handle?.name === 'requireAuth');
  assert.notEqual(routeIndex, -1, 'daily report scheduler route should be registered');
  assert.notEqual(authIndex, -1, 'interactive authentication should be registered');
  assert.ok(routeIndex < authIndex, 'scheduler route must run before interactive authentication');

  const response = createResponse();
  await stack[routeIndex].route.stack[0].handle(
    createRequest({ authorization: 'Bearer test-scheduler-secret' }),
    response,
  );
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: 'Daily email is not configured' });
});
