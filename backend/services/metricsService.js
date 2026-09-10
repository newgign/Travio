const MAX_RECENT = 5000;
const MAX_DURATIONS = 1000;
const MAX_ROUTES = 100;

const startedAt = Date.now();
let inFlight = 0;
let totalRequests = 0;
let totalDurationMs = 0;
let maxDurationMs = 0;
const statusClasses = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, other: 0 };
const recent = [];
const durations = [];
const routes = new Map();

function routeKey(method, route) {
  const cleanMethod = String(method || "GET").toUpperCase().slice(0, 12);
  const cleanRoute = String(route || "/").split("?")[0].slice(0, 180);
  return `${cleanMethod} ${cleanRoute}`;
}

function classFor(statusCode) {
  const code = Number(statusCode);
  if (code >= 200 && code < 300) return "2xx";
  if (code >= 300 && code < 400) return "3xx";
  if (code >= 400 && code < 500) return "4xx";
  if (code >= 500 && code < 600) return "5xx";
  return "other";
}

function beginRequest() {
  inFlight += 1;
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    inFlight = Math.max(0, inFlight - 1);
  };
}

function recordRequest({ method, route, statusCode, durationMs }) {
  const duration = Math.max(0, Number(durationMs) || 0);
  totalRequests += 1;
  totalDurationMs += duration;
  maxDurationMs = Math.max(maxDurationMs, duration);
  const cls = classFor(statusCode);
  statusClasses[cls] = (statusClasses[cls] || 0) + 1;

  durations.push(duration);
  if (durations.length > MAX_DURATIONS) durations.shift();

  const now = Date.now();
  recent.push({ at: now, statusCode: Number(statusCode) || 0, durationMs: duration });
  while (recent.length > MAX_RECENT) recent.shift();
  while (recent.length && recent[0].at < now - 15 * 60_000) recent.shift();

  const key = routeKey(method, route);
  let item = routes.get(key);
  if (!item) {
    if (routes.size >= MAX_ROUTES) {
      const oldest = routes.keys().next().value;
      if (oldest) routes.delete(oldest);
    }
    item = { key, count: 0, errors: 0, totalDurationMs: 0, maxDurationMs: 0, lastSeenAt: now };
    routes.set(key, item);
  }
  item.count += 1;
  item.errors += Number(statusCode) >= 400 ? 1 : 0;
  item.totalDurationMs += duration;
  item.maxDurationMs = Math.max(item.maxDurationMs, duration);
  item.lastSeenAt = now;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index] * 100) / 100;
}

function recentWindow(windowMs) {
  const since = Date.now() - windowMs;
  const items = recent.filter((item) => item.at >= since);
  const count = items.length;
  const errors = items.filter((item) => item.statusCode >= 400).length;
  const serverErrors = items.filter((item) => item.statusCode >= 500).length;
  const avg = count ? items.reduce((sum, item) => sum + item.durationMs, 0) / count : 0;
  return {
    windowMs,
    requests: count,
    errors,
    serverErrors,
    errorRatePct: count ? Math.round((errors / count) * 10000) / 100 : 0,
    averageLatencyMs: Math.round(avg * 100) / 100,
    p95LatencyMs: percentile(items.map((item) => item.durationMs), 95),
  };
}

function snapshot() {
  const avg = totalRequests ? totalDurationMs / totalRequests : 0;
  const topRoutes = [...routes.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((item) => ({
      route: item.key,
      requests: item.count,
      errors: item.errors,
      errorRatePct: item.count ? Math.round((item.errors / item.count) * 10000) / 100 : 0,
      averageLatencyMs: item.count ? Math.round((item.totalDurationMs / item.count) * 100) / 100 : 0,
      maxLatencyMs: Math.round(item.maxDurationMs * 100) / 100,
      lastSeenAt: new Date(item.lastSeenAt).toISOString(),
    }));

  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    inFlight,
    totalRequests,
    statusClasses: { ...statusClasses },
    averageLatencyMs: Math.round(avg * 100) / 100,
    p50LatencyMs: percentile(durations, 50),
    p95LatencyMs: percentile(durations, 95),
    maxLatencyMs: Math.round(maxDurationMs * 100) / 100,
    lastMinute: recentWindow(60_000),
    lastFiveMinutes: recentWindow(5 * 60_000),
    topRoutes,
    storage: "memory",
  };
}

module.exports = { beginRequest, recordRequest, snapshot };
