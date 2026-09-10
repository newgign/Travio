const crypto = require("crypto");
const systemEventService = require("../services/systemEventService");
const metricsService = require("../services/metricsService");
const logger = require("../utils/logger");

function thresholdMs() {
  const value = Number(process.env.SYSTEM_SLOW_REQUEST_MS || 1500);
  return Number.isFinite(value) && value >= 100 ? value : 1500;
}

function accessLogEnabled() {
  return String(process.env.HTTP_ACCESS_LOG || "false").toLowerCase() === "true";
}

module.exports = function requestTelemetry(req, res, next) {
  const incoming = String(req.get("x-request-id") || "").trim();
  const requestId = incoming && incoming.length <= 80 ? incoming : crypto.randomUUID();
  const started = process.hrtime.bigint();
  const finishInFlight = metricsService.beginRequest();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const route = String(req.originalUrl || req.url || "").split("?")[0];
    finishInFlight();
    metricsService.recordRequest({ method: req.method, route, statusCode: res.statusCode, durationMs });

    if (accessLogEnabled()) {
      logger.info("HTTP request", {
        requestId,
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.user?.id || null,
      });
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
