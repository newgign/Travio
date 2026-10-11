const crypto = require("crypto");
const { createMemoryStore, validateDecision } = require('../services/limiterStore');
const { getClientNetworkIdentity } = require('./clientNetworkIdentity');

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function keyFor(req, scope) {
  const raw = `${scope}:${getClientNetworkIdentity(req).ip}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function createRateLimiter({
  name = "api",
  windowMs = 60_000,
  max = 600,
  skip = () => false,
  key = req => keyFor(req, name),
  maxKeys = 10000,
  privateBucket = false,
  now = Date.now,
  store: suppliedStore,
  storeTimeoutMs = 1000,
} = {}) {
  if (!suppliedStore) require('../config/abuseProtection').configuration();
  const safeWindowMs = positiveInt(windowMs, 60_000);
  const safeMax = positiveInt(max, 600);
  const safeMaxKeys = positiveInt(maxKeys, 10000);
  const store = suppliedStore || createMemoryStore({ maxKeys: safeMaxKeys });
  if (!Number.isSafeInteger(storeTimeoutMs) || storeTimeoutMs < 1 || storeTimeoutMs > 3000)
    throw Object.assign(Error('Limiter store invalid'), { code: 'LIMITER_STORE_INVALID' });
  if (!store || typeof store.consume !== 'function') throw Object.assign(Error('Limiter store invalid'), { code: 'LIMITER_STORE_INVALID' });
  function reject(res, req, seconds) {
    res.setHeader('Retry-After', String(seconds));
    // Fixed local signal only; telemetry must not persist attacker headers/identifiers.
    res.locals = res.locals || {};
    res.locals.rateLimited = true;
    return res.status(429).json({ success: false, message: 'Too many requests. Try again later.',
      code: "RATE_LIMITED", errors: [], requestId: req.requestId || null });
  }

  function middleware(req, res, next) {
    if (String(process.env.RATE_LIMIT_ENABLED || "true").toLowerCase() === "false") return next();
    if (skip(req)) return next();

    const time = now();
    const bucket = key(req);
    if (bucket == null) return next();
    // Scope each bucket so independent categories cannot share counters accidentally.
    const scopedKey = crypto.createHash('sha256').update(`${name}:${bucket}`).digest('hex');
    const options = { limit: safeMax, windowMs: safeWindowMs, now: time };
    const unavailable = () => {
      res.locals = res.locals || {};
      res.locals.rateLimited = true;
      res.setHeader('Retry-After', '1');
      return res.status(503).json({ success: false, code: 'ABUSE_PROTECTION_UNAVAILABLE' });
    };
    const finish = value => {
      const decision = validateDecision(value, options);
      const resetSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
      if (decision.capacity) return reject(res, req, resetSeconds);
      res.setHeader('RateLimit-Policy', `${safeMax};w=${Math.ceil(safeWindowMs / 1000)}`);
      res.setHeader('RateLimit-Limit', String(safeMax));
      if (!privateBucket) res.setHeader('RateLimit-Remaining', String(decision.remaining));
      res.setHeader('RateLimit-Reset', String(resetSeconds));
      if (!decision.allowed) return reject(res, req, resetSeconds);
      return next();
    };
    let decision;
    let asynchronous;
    try { decision = store.consume(scopedKey, options); asynchronous = decision && typeof decision.then === 'function'; }
    catch { return unavailable(); }
    if (asynchronous) return new Promise((resolve, rejectPromise) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(unavailable()); } }, storeTimeoutMs);
      Promise.resolve(decision).then(value => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { validateDecision(value, options); } catch { resolve(unavailable()); return; }
        try { resolve(finish(value)); } catch (error) { rejectPromise(error); }
      }, () => { if (!settled) { settled = true; clearTimeout(timer); resolve(unavailable()); } });
    });
    try { validateDecision(decision, options); } catch { return unavailable(); }
    return finish(decision);
  }

  middleware.describe = () => ({
    name,
    enabled: String(process.env.RATE_LIMIT_ENABLED || "true").toLowerCase() !== "false",
    windowMs: safeWindowMs,
    max: safeMax,
    storage: suppliedStore ? 'injected-contract' : 'memory',
    maxKeys: safeMaxKeys,
  });

  return middleware;
}

const apiRateLimiter = createRateLimiter({
  name: "api",
  windowMs: positiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000),
  max: positiveInt(process.env.API_RATE_LIMIT_MAX, 600),
});

const authRateLimiter = createRateLimiter({
  name: "auth",
  windowMs: positiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60_000),
  max: positiveInt(process.env.AUTH_RATE_LIMIT_MAX, 30),
});

// Random per-process HMAC prevents a reusable raw-email/dictionary key in memory.
function createLoginAccountLimiter(options = {}) {
  const { accountKeySecret, ...limiterOptions } = options;
  if (accountKeySecret !== undefined && (!Buffer.isBuffer(accountKeySecret) || accountKeySecret.length !== 32))
    throw Object.assign(Error('Account key configuration invalid'), { code: 'LIMITER_STORE_INVALID' });
  const secret = accountKeySecret ? Buffer.from(accountKeySecret) : crypto.randomBytes(32);
  const limiter = createRateLimiter({ name: 'login-account', windowMs: 15 * 60000, max: 30, ...limiterOptions,
    privateBucket: true, key: req => crypto.createHmac('sha256', secret).update(req.body.email.trim().toLowerCase()).digest('hex') });
  return function loginAccountLimit(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.email !== 'string'
      || body.email.length > 254 || !body.email.trim() || typeof body.password !== 'string'
      || Buffer.byteLength(body.password, 'utf8') > 1024 || !body.password) {
      return res.status(400).json({ code: 'AUTH_INPUT_INVALID' });
    }
    // All attempts count, including success; no success-reset race or DB account lookup.
    return limiter(req, res, next);
  };
}
const loginAccountLimiter = createLoginAccountLimiter({
  windowMs: positiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60000),
  max: positiveInt(process.env.AUTH_RATE_LIMIT_MAX, 30),
});
const publicRateLimiter = createRateLimiter({ name: 'public-expensive',
  windowMs: positiveInt(process.env.PUBLIC_RATE_LIMIT_WINDOW_MS, 60000),
  max: positiveInt(process.env.PUBLIC_RATE_LIMIT_MAX, 60) });

function status() {
  return {
    api: apiRateLimiter.describe(),
    auth: authRateLimiter.describe(),
    public: publicRateLimiter.describe(),
  };
}

module.exports = { createRateLimiter, createLoginAccountLimiter, apiRateLimiter, authRateLimiter, loginAccountLimiter, publicRateLimiter, status };
