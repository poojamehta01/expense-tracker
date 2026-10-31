function createHttpPolicy(config, { limit = 120, windowMs = 60000 } = {}) {
  const origin = new URL(config.baseUrl); const origins = new Set([origin.origin, ...(config.allowedOrigins || [])]);
  const windows = new Map();
  return (req, res, next) => {
    const host = req.headers.host;
    const forwarded = req.headers['x-forwarded-host'];
    if (typeof host !== 'string' || host.toLowerCase() !== origin.host ||
      (forwarded && (typeof forwarded !== 'string' || forwarded.toLowerCase() !== origin.host)) ||
      (req.headers.origin && !origins.has(req.headers.origin))) return res.status(403).json({ error: 'forbidden_origin' });
    const now = Date.now();
    for (const [key, entry] of windows) if (entry.until <= now) windows.delete(key);
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = windows.get(key);
    if (!entry) {
      if (windows.size >= 10000) return res.status(429).json({ error: 'rate_limited' });
      entry = { count: 0, until: now + windowMs }; windows.set(key, entry);
    }
    if (++entry.count > limit) { res.setHeader('Retry-After', String(Math.ceil((entry.until-now)/1000))); return res.status(429).json({ error: 'rate_limited' }); }
    next();
  };
}
module.exports = { createHttpPolicy };
