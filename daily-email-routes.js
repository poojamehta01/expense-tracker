const { timingSafeEqual } = require('node:crypto');

const STATUS_CODE_BY_RESULT = {
  sent: 200,
  already_sent: 200,
  in_progress: 202,
  delivery_unknown: 503,
};

function bearerTokenMatches(authorization, schedulerSecret) {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(schedulerSecret, 'utf8');
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

function registerDailyEmailRoutes(app, service, { schedulerSecret } = {}) {
  const hasSchedulerSecret = typeof schedulerSecret === 'string'
    && schedulerSecret.trim().length > 0;

  const handlerFor = method => async (req, res) => {
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
    } catch {
      return res.status(500).json({ error: 'Daily email operation failed' });
    }

    const statusCode = STATUS_CODE_BY_RESULT[result?.status];
    if (!statusCode) {
      return res.status(500).json({ error: 'Daily email operation failed' });
    }
    return res.status(statusCode).json(result);
  };

  app.post('/api/internal/daily-email/reminder', handlerFor('sendReminder'));
  app.post('/api/internal/daily-email/report', handlerFor('sendReport'));
}

module.exports = { registerDailyEmailRoutes };
