const { timingSafeEqual } = require('node:crypto');

const STATUS_CODE_BY_RESULT = {
  sent: 200,
  already_sent: 200,
  in_progress: 202,
  delivery_unknown: 503,
};
const SAFE_ERROR_CODES = new Set([
  'EAUTH',
  'EDNS',
  'EENVELOPE',
  'EMESSAGE',
  'ETIMEDOUT',
  'ESOCKET',
  'ECONNECTION',
  'SQLITE_BUSY',
  'SQLITE_LOCKED',
  'SQLITE_READONLY',
  'SQLITE_CONSTRAINT',
  'SQLITE_CONSTRAINT_PRIMARYKEY',
  'SQLITE_CONSTRAINT_UNIQUE',
  'SQLITE_CORRUPT',
  'SQLITE_CANTOPEN',
  'SQLITE_FULL',
  'SQLITE_IOERR',
  'SQLITE_MISUSE',
  'SQLITE_ERROR',
]);

function safeErrorClass(error) {
  if (error instanceof TypeError) return 'TypeError';
  if (error instanceof RangeError) return 'RangeError';
  if (error instanceof SyntaxError) return 'SyntaxError';
  if (error instanceof ReferenceError) return 'ReferenceError';
  return 'Error';
}

function safeErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (SAFE_ERROR_CODES.has(code)) return code;
  return 'UNCLASSIFIED';
}

function safeReportDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function writeLog(logger, level, entry) {
  if (typeof logger?.[level] !== 'function') return;
  try {
    logger[level](entry);
  } catch {
    // Logging must never change scheduler delivery behavior.
  }
}

function bearerTokenMatches(authorization, schedulerSecret) {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(schedulerSecret, 'utf8');
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

function registerDailyEmailRoutes(app, service, { schedulerSecret, logger = console } = {}) {
  const hasSchedulerSecret = typeof schedulerSecret === 'string'
    && schedulerSecret.trim().length > 0;

  const handlerFor = (method, kind) => async (req, res) => {
    if (!hasSchedulerSecret) {
      return res.status(503).json({ error: 'Daily email is not configured' });
    }
    if (!bearerTokenMatches(req.headers?.authorization, schedulerSecret)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!service || typeof service[method] !== 'function') {
      return res.status(503).json({ error: 'Daily email is not configured' });
    }

    let result;
    try {
      result = await service[method]();
    } catch (error) {
      writeLog(logger, 'error', {
        event: 'daily_email_scheduler',
        kind,
        reportDate: null,
        outcome: 'failed',
        manualAttention: false,
        errorClass: safeErrorClass(error),
        errorCode: safeErrorCode(error),
      });
      return res.status(500).json({ error: 'Daily email operation failed' });
    }

    const statusCode = STATUS_CODE_BY_RESULT[result?.status];
    if (!statusCode) {
      return res.status(500).json({ error: 'Daily email operation failed' });
    }
    const manualAttention = result.status === 'delivery_unknown';
    writeLog(logger, manualAttention ? 'error' : 'info', {
      event: 'daily_email_scheduler',
      kind,
      reportDate: safeReportDate(result.reportDate),
      outcome: result.status,
      manualAttention,
    });
    return res.status(statusCode).json(result);
  };

  app.post('/api/internal/daily-email/reminder', handlerFor('sendReminder', 'reminder'));
  app.post('/api/internal/daily-email/report', handlerFor('sendReport', 'report'));
}

module.exports = { registerDailyEmailRoutes };
