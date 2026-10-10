const crypto = require("crypto");
const systemEventService = require("../services/systemEventService");
const metricsService = require("../services/metricsService");
const logger = require("../utils/logger");
const { canonicalIp, getClientNetworkIdentity } = require('./clientNetworkIdentity');

function proxyMetadata(req) {
  const unknown = { networkIdentitySource: 'unknown', trustedProxy: false,
    forwardedChainLength: 0, socketPeerMatchesCanonical: false };
  try {
    const peer = canonicalIp(req.socket?.remoteAddress);
    const identity = getClientNetworkIdentity(req);
    const client = canonicalIp(identity.ip);
    if (!peer || !client) return unknown;
    const length = identity.forwardedChainLength;
    if (!Number.isInteger(length) || length < 0 || length > 16) return unknown;
    const forwarded = identity.source === 'forwarded' && identity.trustedProxy === true && length > 0;
    return { networkIdentitySource: forwarded ? 'forwarded' : 'direct',
      trustedProxy: forwarded, forwardedChainLength: forwarded ? length : 0,
      socketPeerMatchesCanonical: peer === client };
  } catch { return unknown; }
}

function thresholdMs() {
  const value = Number(process.env.SYSTEM_SLOW_REQUEST_MS || 1500);
  return Number.isFinite(value) && value >= 100 ? value : 1500;
}

function accessLogEnabled() {
  return String(process.env.HTTP_ACCESS_LOG || "false").toLowerCase() === "true";
}

module.exports = function requestTelemetry(req, res, next) {
  const incoming = String(req.get("x-request-id") || "").trim();
  // Header is caller-controlled: only existing opaque correlation formats may be echoed/stored.
  const requestId = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(incoming) ? incoming : crypto.randomUUID();
  const started = process.hrtime.bigint();
  const finishInFlight = metricsService.beginRequest();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    // Express route templates come from code; caller-controlled unmatched paths are not diagnostic labels.
    const route = typeof req.route?.path === 'string' ? `${req.baseUrl || ''}${req.route.path}` : '/unmatched';
    finishInFlight();
    metricsService.recordRequest({ method: req.method, route, statusCode: res.statusCode, durationMs });
    // Count 429 in metrics without per-attempt logs or DB-backed event amplification.
    if (res.locals?.rateLimited) return;

    if (accessLogEnabled()) {
      try { logger.info("HTTP request", {
        requestId,
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.user?.id || null,
        ...proxyMetadata(req),
      }); } catch { /* Access-log observation must not break the request. */ }
    }

    const failed = res.statusCode >= 400;
    const slow = durationMs >= thresholdMs();
    if (!failed && !slow) return;

    systemEventService.safeRecordEvent({
      level: res.statusCode >= 500 ? "error" : "warn",
      category: failed ? "http" : "performance",
      code: failed ? `HTTP_${res.statusCode}` : "SLOW_REQUEST",
      message: failed
        ? `${req.method} ${route} завершился HTTP ${res.statusCode}`
        : `${req.method} ${route} выполнялся ${Math.round(durationMs)} ms`,
      requestId,
      userId: req.user?.id || null,
      route,
      method: req.method,
      statusCode: res.statusCode,
      durationMs,
      metadata: { slowThresholdMs: thresholdMs(), release: "3A" },
    });
  });

  res.on("close", finishInFlight);
  next();
};
module.exports.proxyMetadata = proxyMetadata;
