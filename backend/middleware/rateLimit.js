const crypto = require("crypto");

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function keyFor(req, scope) {
  const raw = `${scope}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function createRateLimiter({
  name = "api",
  windowMs = 60_000,
  max = 600,
  skip = () => false,
} = {}) {
  const store = new Map();
  const safeWindowMs = positiveInt(windowMs, 60_000);
  const safeMax = positiveInt(max, 600);

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, item] of store.entries()) {
      if (!item || item.resetAt <= now) store.delete(key);
    }
  }, Math.max(30_000, safeWindowMs));
  cleanup.unref?.();

  function middleware(req, res, next) {
    if (String(process.env.RATE_LIMIT_ENABLED || "true").toLowerCase() === "false") return next();
    if (skip(req)) return next();

    const now = Date.now();
    const key = keyFor(req, name);
    let item = store.get(key);
    if (!item || item.resetAt <= now) {
      item = { count: 0, resetAt: now + safeWindowMs };
      store.set(key, item);
    }

    item.count += 1;
    const remaining = Math.max(0, safeMax - item.count);
    const resetSeconds = Math.max(1, Math.ceil((item.resetAt - now) / 1000));

    res.setHeader("RateLimit-Policy", `${safeMax};w=${Math.ceil(safeWindowMs / 1000)}`);
    res.setHeader("RateLimit-Limit", String(safeMax));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (item.count > safeMax) {
      res.setHeader("Retry-After", String(resetSeconds));
      return res.status(429).json({
        success: false,
        message: "Слишком много запросов. Повторите попытку позже.",
        code: "RATE_LIMITED",
        errors: [],
        requestId: req.requestId || null,
      });
    }

    next();
  }

  middleware.describe = () => ({
    name,
    enabled: String(process.env.RATE_LIMIT_ENABLED || "true").toLowerCase() !== "false",
    windowMs: safeWindowMs,
    max: safeMax,
    storage: "memory",
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

function status() {
  return {
    api: apiRateLimiter.describe(),
    auth: authRateLimiter.describe(),
  };
}

module.exports = { createRateLimiter, apiRateLimiter, authRateLimiter, status };
