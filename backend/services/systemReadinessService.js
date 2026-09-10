const fs = require("fs");
const pool = require("../db");
const paymentGatewayService = require("./paymentGatewayService");
const emailProviderService = require("./emailProviderService");
const permissionService = require("./permissionService");
const productionGateService = require("./productionGateService");
const lifecycleService = require("./lifecycleService");
const databaseBackupService = require("./databaseBackupService");
const rateLimit = require("../middleware/rateLimit");
const metricsService = require("./metricsService");
const healthMonitorService = require("./healthMonitorService");
const backupSchedulerService = require("./backupSchedulerService");
const reliabilityMonitorService = require("./reliabilityMonitorService");

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return String(raw).trim().toLowerCase() === "true";
}

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function fileConfigured(pathValue) {
  const value = String(pathValue || "").trim();
  if (!value) return { configured: false, readable: false };
  try {
    fs.accessSync(value, fs.constants.R_OK);
    return { configured: true, readable: true };
  } catch {
    return { configured: true, readable: false };
  }
}

async function databaseStatus() {
  const started = Date.now();
  try {
    await pool.query("SELECT 1 AS ok");
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, error: error.code || "DB_UNAVAILABLE" };
  }
}

function securityStatus() {
  const jwtSecret = String(process.env.JWT_SECRET || "");
  const cors = String(process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    jwtConfigured: Boolean(jwtSecret),
    jwtStrongEnough: jwtSecret.length >= 32,
    corsConfigured: cors.length > 0,
    corsWildcardBlocked: !cors.includes("*"),
    corsOriginsCount: cors.length,
    requestBodyLimit: String(process.env.REQUEST_BODY_LIMIT || "1mb"),
    xPoweredByDisabled: true,
    securityHeadersEnabled: true,
    securityHeadersCount: 6,
    trustProxy: String(process.env.TRUST_PROXY || "false"),
  };
}

function hotelbedsStatus() {
  const config = require('../config/providers').hotelbeds;
  const cert = fileConfigured(config.mtlsCertPath);
  const key = fileConfigured(config.mtlsKeyPath);
  return {
    ...require('../integrations/hotelbeds/client').readiness(),
    bookingEnabled: config.bookingEnabled, apiKeyConfigured: Boolean(config.apiKey), secretConfigured: Boolean(config.secret),
    mtlsCertConfigured: cert.configured, mtlsCertReadable: cert.readable,
    mtlsKeyConfigured: key.configured, mtlsKeyReadable: key.readable,
    testEndpoint: config.environment === 'test', tolerance: 0, toleranceEnabled: false,
  };
}

function operationsStatus() {
  const limits = rateLimit.status();
  const backup = databaseBackupService.directoryStatus();
  const lifecycle = lifecycleService.state();
  return {
    rateLimit: limits,
    securityHeaders: {
      enabled: true,
      headers: [
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Cross-Origin-Resource-Policy",
        "Content-Security-Policy",
      ],
      hstsInProductionHttps: true,
    },
    gracefulShutdown: {
      enabled: true,
      graceMs: intEnv("SHUTDOWN_GRACE_MS", 10000),
      draining: lifecycle.shuttingDown,
    },
    backups: backup,
    metrics: metricsService.snapshot(),
    healthMonitor: healthMonitorService.status(),
    backupScheduler: backupSchedulerService.status(),
    reliability: reliabilityMonitorService.status(),
    structuredLogging: {
      enabled: true,
      format: String(process.env.LOG_FORMAT || "pretty").toLowerCase(),
      accessLog: String(process.env.HTTP_ACCESS_LOG || "false").toLowerCase() === "true",
      redaction: true,
    },
    restore: {
      defaultMode: "dry-run",
      explicitApplyRequired: true,
      environmentGate: "ALLOW_DATABASE_RESTORE=true",
      transactional: true,
    },
    errorHandling: {
      requestIdIncluded: true,
      json404: true,
      invalidJson400: true,
      payloadTooLarge413: true,
      corsDenied403: true,
      productionStackHidden: true,
    },
  };
}

async function collect() {
  const database = await databaseStatus();
  const payments = paymentGatewayService.readiness();
  const email = emailProviderService.status();
  const hotelbeds = hotelbedsStatus();
  const security = securityStatus();
  const gate = productionGateService.state();
  const operations = operationsStatus();
  const production = process.env.NODE_ENV === "production";

  const checks = [
    { key: "database", label: "PostgreSQL", ready: database.ok, blocker: !database.ok, detail: database.ok ? `${database.latencyMs} ms` : "недоступна" },
    { key: "jwt", label: "JWT secret", ready: security.jwtConfigured && security.jwtStrongEnough, blocker: !(security.jwtConfigured && security.jwtStrongEnough), detail: security.jwtStrongEnough ? "сконфигурирован" : "нужен секрет 32+ символа" },
    { key: "cors", label: "CORS", ready: security.corsConfigured && security.corsWildcardBlocked, blocker: !security.corsWildcardBlocked, detail: `${security.corsOriginsCount} origin(s)` },
    { key: "security_headers", label: "Security headers", ready: operations.securityHeaders.enabled, blocker: false, detail: `${operations.securityHeaders.headers.length} headers` },
    { key: "rate_limit", label: "Rate limiting", ready: operations.rateLimit.api.enabled && operations.rateLimit.auth.enabled, blocker: false, detail: `${operations.rateLimit.api.max}/${Math.round(operations.rateLimit.api.windowMs / 1000)}s · auth ${operations.rateLimit.auth.max}/${Math.round(operations.rateLimit.auth.windowMs / 60000)}m` },
    { key: "graceful_shutdown", label: "Graceful shutdown", ready: operations.gracefulShutdown.enabled, blocker: false, detail: `${operations.gracefulShutdown.graceMs} ms drain` },
    { key: "structured_logging", label: "Structured logging", ready: operations.structuredLogging.enabled && operations.structuredLogging.redaction, blocker: false, detail: `${operations.structuredLogging.format} · secrets redacted` },
    { key: "api_metrics", label: "API metrics", ready: operations.metrics.storage === "memory", blocker: false, detail: `${operations.metrics.totalRequests} requests observed` },
    { key: "health_monitor", label: "Health monitor", ready: operations.healthMonitor.enabled, blocker: false, detail: operations.healthMonitor.enabled ? `${Math.round(operations.healthMonitor.intervalMs / 1000)}s interval` : "disabled by config" },
    { key: "reliability_monitor", label: "Reliability monitor", ready: operations.reliability.enabled, blocker: false, detail: operations.reliability.enabled ? `${Math.round(operations.reliability.intervalMs / 1000)}s · ${operations.reliability.storage}` : "disabled by config" },
    { key: "backup_scheduler", label: "Backup scheduler", ready: true, blocker: false, detail: operations.backupScheduler.enabled ? `${Math.round(operations.backupScheduler.intervalMs / 3600000 * 10) / 10}h interval` : "disabled · manual backup remains available" },
    { key: "backup_dir", label: "Database backup path", ready: operations.backups.writable, blocker: !operations.backups.writable, detail: operations.backups.writable ? `writable · keep ${operations.backups.retention}` : "not writable" },
    { key: "backup_encryption", label: "Backup encryption", ready: operations.backups.encryptionConfigured || !production, blocker: production && !operations.backups.encryptionConfigured, detail: operations.backups.encryptionConfigured ? "AES-256-GCM" : "OFF (development allowed)" },
    { key: "restore_guard", label: "Restore safety guard", ready: operations.restore.explicitApplyRequired && operations.restore.transactional, blocker: false, detail: "dry-run by default" },
    { key: "real_money_gate", label: "Safety gate реальных денег", ready: gate.enforcedSafeMode && !gate.realChargesEnabled && !gate.realRefundsEnabled, blocker: false, detail: "REAL MONEY OFF" },
    { key: "payments", label: "Payment contour", ready: payments.mode === "sandbox" || payments.mode === "disabled", blocker: false, detail: payments.mode },
    { key: "email", label: "Email provider", ready: !email.enabled || email.configured, blocker: email.enabled && !email.configured, detail: `${email.provider} / ${email.mode}` },
    { key: "hotelbeds_test", label: "Hotelbeds TEST endpoint", ready: !hotelbeds.bookingEnabled || hotelbeds.testEndpoint, blocker: hotelbeds.bookingEnabled && !hotelbeds.testEndpoint, detail: hotelbeds.testEndpoint ? "TEST mTLS" : "проверь endpoint" },
    { key: "hotelbeds_mtls", label: "Hotelbeds mTLS files", ready: !hotelbeds.bookingEnabled || (hotelbeds.mtlsCertReadable && hotelbeds.mtlsKeyReadable), blocker: hotelbeds.bookingEnabled && !(hotelbeds.mtlsCertReadable && hotelbeds.mtlsKeyReadable), detail: hotelbeds.mtlsCertReadable && hotelbeds.mtlsKeyReadable ? "читаются" : "не готовы" },
    { key: "tolerance", label: "Booking tolerance", ready: hotelbeds.tolerance === 0 && !hotelbeds.toleranceEnabled, blocker: false, detail: `${hotelbeds.tolerance}%` },
  ];

  const safeModeHealthy = checks.filter((item) => item.blocker).every((item) => item.ready);
  const productionBlockers = [
    "LIVE продажи намеренно выключены",
    "реальные списания намеренно выключены",
    "реальные возвраты намеренно выключены",
  ];
  if (!email.externalDelivery) productionBlockers.push("реальный email-канал не активирован");
  if (!operations.backups.encryptionConfigured) productionBlockers.push("шифрование резервных копий не настроено");
  if (!operations.backupScheduler.enabled) productionBlockers.push("автоматический backup scheduler не включён");
  if (operations.reliability.enabled && operations.reliability.overallState === "unhealthy") productionBlockers.push("reliability monitor сообщает UNHEALTHY");

  return {
    release: "3A",
    environment: process.env.NODE_ENV || "development",
    uptimeSeconds: Math.floor(process.uptime()),
    safeModeHealthy,
    productionReady: false,
    database,
    security,
    operations,
    payments,
    email,
    hotelbeds,
    gate,
    permissions: permissionService.describeRoles(),
    checks,
    productionBlockers,
    message: "Sprint 3A — product/customer experience on top of the Sprint 2N reliability baseline. Production and real-money operations remain intentionally blocked.",
  };
}

module.exports = { collect, databaseStatus, securityStatus, hotelbedsStatus, operationsStatus };
