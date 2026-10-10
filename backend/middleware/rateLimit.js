const crypto = require("crypto");
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
} = {}) {
  const store = new Map();
  const safeWindowMs = positiveInt(windowMs, 60_000);
  const safeMax = positiveInt(max, 600);
  const safeMaxKeys = positiveInt(maxKeys, 10000);
  let nextCleanup = 0;
  function cleanup(time) {
    for (const [key, item] of store) {
      if (item.resetAt <= time) store.delete(key);
    }
    nextCleanup = time + Math.min(30000, safeWindowMs);
  }
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
    if (time >= nextCleanup) cleanup(time);
    let item = store.get(bucket);
    if (!item || item.resetAt <= time) {
      if (store.size >= safeMaxKeys) cleanup(time);
      if (!store.has(bucket) && store.size >= safeMaxKeys) return reject(res, req, Math.max(1, Math.ceil(safeWindowMs / 1000)));
      item = { count: 0, resetAt: time + safeWindowMs };
      store.set(bucket, item);
    }

    item.count += 1;
    const remaining = Math.max(0, safeMax - item.count);
    const resetSeconds = Math.max(1, Math.ceil((item.resetAt - time) / 1000));

    res.setHeader("RateLimit-Policy", `${safeMax};w=${Math.ceil(safeWindowMs / 1000)}`);
    res.setHeader("RateLimit-Limit", String(safeMax));
    if (!privateBucket) res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (item.count > safeMax) {
      return reject(res, req, resetSeconds);
    }

    next();
  }

  middleware.describe = () => ({
    name,
    enabled: String(process.env.RATE_LIMIT_ENABLED || "true").toLowerCase() !== "false",
    windowMs: safeWindowMs,
    max: safeMax,
    storage: "memory",
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
  const secret = crypto.randomBytes(32);
  const limiter = createRateLimiter({ name: 'login-account', windowMs: 15 * 60000, max: 30, ...options,
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
