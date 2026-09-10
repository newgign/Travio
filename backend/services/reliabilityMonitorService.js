const fs = require("fs");
const path = require("path");
const pool = require("../db");
const logger = require("../utils/logger");
const metricsService = require("./metricsService");
const healthMonitorService = require("./healthMonitorService");
const databaseBackupService = require("./databaseBackupService");
const incidentService = require("./incidentService");

const COMPONENT_ORDER = ["database", "api", "backup", "email", "hotelbeds"];
const STATE_RANK = { healthy: 0, degraded: 1, unhealthy: 2 };
let timer = null;
let started = false;
let running = false;
let lastRunAt = null;
let lastError = null;
let lastSnapshot = null;
let latestBackupCache = { name: null, release: null, valid: null };

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return String(raw).trim().toLowerCase() === "true";
}

function numEnv(name, fallback, min = 0) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function intervalMs() {
  return Math.floor(numEnv("RELIABILITY_MONITOR_INTERVAL_MS", 60000, 10000));
}

function thresholds() {
  return {
    apiMinRequests: Math.floor(numEnv("RELIABILITY_API_MIN_REQUESTS", 10, 1)),
    apiDegraded5xxPct: numEnv("RELIABILITY_API_DEGRADED_5XX_PCT", 2, 0),
    apiUnhealthy5xxPct: numEnv("RELIABILITY_API_UNHEALTHY_5XX_PCT", 10, 0),
    backupWarnHours: numEnv("RELIABILITY_BACKUP_WARN_HOURS", 36, 1),
    backupCriticalHours: numEnv("RELIABILITY_BACKUP_CRITICAL_HOURS", 72, 1),
    emailFailedWarn: Math.floor(numEnv("RELIABILITY_EMAIL_FAILED_WARN", 1, 1)),
    emailFailedCritical: Math.floor(numEnv("RELIABILITY_EMAIL_FAILED_CRITICAL", 5, 1)),
    hotelbedsErrorWindowMin: Math.floor(numEnv("RELIABILITY_HOTELBEDS_ERROR_WINDOW_MIN", 15, 1)),
    hotelbedsWarnErrors: Math.floor(numEnv("RELIABILITY_HOTELBEDS_WARN_ERRORS", 1, 1)),
    hotelbedsCriticalErrors: Math.floor(numEnv("RELIABILITY_HOTELBEDS_CRITICAL_ERRORS", 5, 1)),
    historyRetentionDays: Math.floor(numEnv("RELIABILITY_HISTORY_RETENTION_DAYS", 7, 1)),
  };
}

function stateComponent(key, state, label, detail, data = {}) {
  return { key, state, label, detail, data };
}

async function databaseComponent() {
  const startedAt = Date.now();
  try {
    await pool.query("SELECT 1 AS ok");
    const latencyMs = Date.now() - startedAt;
    return stateComponent("database", "healthy", "PostgreSQL", `доступна · ${latencyMs} ms`, { latencyMs });
  } catch (error) {
    return stateComponent("database", "unhealthy", "PostgreSQL", `недоступна · ${error.code || "DB_UNAVAILABLE"}`, { errorCode: error.code || "DB_UNAVAILABLE" });
  }
}

function apiComponent(t) {
  const metrics = metricsService.snapshot();
  const window = metrics.lastFiveMinutes || {};
  const requests = Number(window.requests || 0);
  const serverErrors = Number(window.serverErrors || 0);
  const rate = requests ? Math.round((serverErrors / requests) * 10000) / 100 : 0;
  if (requests < t.apiMinRequests) {
    return stateComponent("api", "healthy", "API 5xx", `недостаточно трафика для порога · ${requests}/${t.apiMinRequests} req`, { requests, serverErrors, serverErrorRatePct: rate, evaluating: false });
  }
  if (rate >= t.apiUnhealthy5xxPct) return stateComponent("api", "unhealthy", "API 5xx", `${rate}% 5xx за 5 минут`, { requests, serverErrors, serverErrorRatePct: rate, evaluating: true });
  if (rate >= t.apiDegraded5xxPct) return stateComponent("api", "degraded", "API 5xx", `${rate}% 5xx за 5 минут`, { requests, serverErrors, serverErrorRatePct: rate, evaluating: true });
  return stateComponent("api", "healthy", "API 5xx", `${rate}% 5xx · ${requests} req / 5 min`, { requests, serverErrors, serverErrorRatePct: rate, evaluating: true });
}

function backupComponent(t) {
  const inventory = databaseBackupService.inventory({ limit: 1 });
  if (!inventory.latest?.modifiedAt) {
    return stateComponent("backup", "degraded", "Backup freshness", "локальная резервная копия не найдена", { count: inventory.count || 0, ageHours: null, compatible: false });
  }

  if (latestBackupCache.name !== inventory.latest.name) {
    try {
      const parsed = databaseBackupService.parseBackupFile(path.join(databaseBackupService.backupDir(), inventory.latest.name));
      latestBackupCache = { name: inventory.latest.name, release: parsed.payload?.release || null, valid: true };
    } catch (error) {
      latestBackupCache = { name: inventory.latest.name, release: null, valid: false, error: error.message };
    }
  }

  const ageHours = Math.max(0, (Date.now() - new Date(inventory.latest.modifiedAt).getTime()) / 3600000);
  const rounded = Math.round(ageHours * 10) / 10;
  const compatible = latestBackupCache.valid === true && ["2N", "3A"].includes(latestBackupCache.release);
  const baseData = { count: inventory.count, ageHours: rounded, latest: inventory.latest.modifiedAt, backupRelease: latestBackupCache.release, compatible };

  if (!latestBackupCache.valid) return stateComponent("backup", "unhealthy", "Backup freshness", "последняя копия не проходит проверку формата/checksum", { ...baseData, error: latestBackupCache.error || "invalid_backup" });
  if (!compatible) return stateComponent("backup", "degraded", "Backup freshness", `последняя копия относится к Sprint ${latestBackupCache.release || "unknown"}; создайте backup 3A`, baseData);
  if (ageHours >= t.backupCriticalHours) return stateComponent("backup", "unhealthy", "Backup freshness", `последняя копия ${rounded} ч назад`, baseData);
  if (ageHours >= t.backupWarnHours) return stateComponent("backup", "degraded", "Backup freshness", `последняя копия ${rounded} ч назад`, baseData);
  return stateComponent("backup", "healthy", "Backup freshness", `свежая · ${rounded} ч · копий ${inventory.count}`, baseData);
}

async function emailComponent(t) {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE status = 'queued' AND created_at < NOW() - INTERVAL '15 minutes')::int AS stuck
    FROM notification_outbox
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);
  const failed = Number(result.rows[0]?.failed || 0);
  const stuck = Number(result.rows[0]?.stuck || 0);
  const total = failed + stuck;
  if (total >= t.emailFailedCritical) return stateComponent("email", "unhealthy", "Email / outbox", `${failed} failed · ${stuck} stuck`, { failed, stuck });
  if (total >= t.emailFailedWarn) return stateComponent("email", "degraded", "Email / outbox", `${failed} failed · ${stuck} stuck`, { failed, stuck });
  return stateComponent("email", "healthy", "Email / outbox", "failed/stuck не обнаружены за 24ч", { failed, stuck });
}

function hotelbedsConfigured() {
  const enabled = boolEnv("HOTELBEDS_ENABLED", false) && boolEnv("HOTELBEDS_BOOKING_ENABLED", false);
  if (!enabled) return { enabled: false, transportReady: true };
  const certPath = String(process.env.HOTELBEDS_MTLS_CERT_PATH || "").trim();
  const keyPath = String(process.env.HOTELBEDS_MTLS_KEY_PATH || "").trim();
  return {
    enabled: true,
    transportReady: Boolean(certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)),
  };
}

async function hotelbedsComponent(t) {
  const config = hotelbedsConfigured();
  if (!config.enabled) return stateComponent("hotelbeds", "healthy", "Hotelbeds TEST", "Booking API отключён конфигурацией", { enabled: false, recentErrors: 0 });
  if (!config.transportReady) return stateComponent("hotelbeds", "unhealthy", "Hotelbeds TEST", "mTLS transport не готов", { enabled: true, transportReady: false, recentErrors: 0 });

  const result = await pool.query(
    `SELECT COUNT(*)::int AS errors
     FROM system_events
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 minute')
       AND category NOT IN ('incident', 'self_test')
       AND (level = 'error' OR status_code >= 500)
       AND (
         UPPER(COALESCE(code,'')) LIKE 'HOTELBEDS_%'
         OR LOWER(COALESCE(metadata->>'provider','')) = 'hotelbeds'
         OR LOWER(message) LIKE '%hotelbeds%'
       )`,
    [t.hotelbedsErrorWindowMin]
  );
  const errors = Number(result.rows[0]?.errors || 0);
  if (errors >= t.hotelbedsCriticalErrors) return stateComponent("hotelbeds", "unhealthy", "Hotelbeds TEST", `${errors} ошибок за ${t.hotelbedsErrorWindowMin} мин`, { enabled: true, transportReady: true, recentErrors: errors });
  if (errors >= t.hotelbedsWarnErrors) return stateComponent("hotelbeds", "degraded", "Hotelbeds TEST", `${errors} ошибок за ${t.hotelbedsErrorWindowMin} мин`, { enabled: true, transportReady: true, recentErrors: errors });
  return stateComponent("hotelbeds", "healthy", "Hotelbeds TEST", `ошибок за ${t.hotelbedsErrorWindowMin} мин: 0`, { enabled: true, transportReady: true, recentErrors: errors });
}

function overallState(components) {
  return components.reduce((worst, item) => STATE_RANK[item.state] > STATE_RANK[worst] ? item.state : worst, "healthy");
}

function incidentDefinition(component) {
  const severity = component.state === "unhealthy" ? "critical" : "warning";
  return {
    key: `reliability:${component.key}`,
    source: component.key,
    severity,
    title: `${component.label}: ${component.state === "unhealthy" ? "UNHEALTHY" : "DEGRADED"}`,
    summary: component.detail,
    metadata: { release: "3A", component: component.key, state: component.state, data: component.data },
  };
}

async function syncIncidents(components) {
  const transitions = [];
  for (const component of components) {
    const key = `reliability:${component.key}`;
    if (component.state === "healthy") {
      const resolved = await incidentService.safeResolveByKey(key, "auto_recovered");
      if (resolved.length) transitions.push({ key, transition: "resolved", count: resolved.length });
    } else {
      const result = await incidentService.safeOpenOrUpdate(incidentDefinition(component));
      if (result) transitions.push({ key, transition: result.created ? "opened" : "updated", id: result.incident?.id || null });
    }
  }
  return transitions;
}

async function persistSnapshot(snapshot, trigger) {
  await pool.query(
    `INSERT INTO reliability_snapshots (overall_state, components, thresholds, trigger)
     VALUES ($1,$2::jsonb,$3::jsonb,$4)`,
    [snapshot.overallState, JSON.stringify(snapshot.components), JSON.stringify(snapshot.thresholds), String(trigger || "interval").slice(0, 30)]
  );
  await pool.query(
    `DELETE FROM reliability_snapshots
     WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [snapshot.thresholds.historyRetentionDays]
  );
}

async function evaluate(trigger = "interval") {
  if (running) return lastSnapshot || { overallState: "unknown", skipped: true };
  running = true;
  const t = thresholds();
  try {
    const database = await databaseComponent();
    let email;
    let hotelbeds;

    if (database.state === "unhealthy") {
      email = stateComponent("email", "degraded", "Email / outbox", "проверка временно недоступна: PostgreSQL DOWN", { monitoringUnavailable: true });
      hotelbeds = stateComponent("hotelbeds", "degraded", "Hotelbeds TEST", "проверка журнала временно недоступна: PostgreSQL DOWN", { monitoringUnavailable: true });
    } else {
      [email, hotelbeds] = await Promise.all([
        emailComponent(t).catch((error) => stateComponent("email", "degraded", "Email / outbox", `monitor error: ${error.code || error.message}`, { monitorError: true })),
        hotelbedsComponent(t).catch((error) => stateComponent("hotelbeds", "degraded", "Hotelbeds TEST", `monitor error: ${error.code || error.message}`, { monitorError: true })),
      ]);
    }

    const components = [database, apiComponent(t), backupComponent(t), email, hotelbeds];
    const snapshot = {
      release: "3A",
      generatedAt: new Date().toISOString(),
      trigger,
      overallState: overallState(components),
      components,
      thresholds: t,
      transitions: [],
      persistence: { incidents: true, history: true },
    };

    // Keep an in-memory view even if PostgreSQL becomes unavailable. Persistent
    // incident/history writes are best-effort and recover automatically later.
    lastSnapshot = snapshot;
    lastRunAt = snapshot.generatedAt;
    lastError = null;

    try {
      snapshot.transitions = await syncIncidents(components);
    } catch (error) {
      snapshot.persistence.incidents = false;
      lastError = error.message;
      logger.warn("RELIABILITY INCIDENT SYNC FAILED", { error: error.message });
    }
    try {
      await persistSnapshot(snapshot, trigger);
    } catch (error) {
      snapshot.persistence.history = false;
      lastError = error.message;
      logger.warn("RELIABILITY HISTORY WRITE FAILED", { error: error.message });
    }
    return snapshot;
  } catch (error) {
    lastError = error.message;
    logger.error("RELIABILITY MONITOR FAILED", { error: error.message });
    throw error;
  } finally {
    running = false;
  }
}

function start() {
  if (started) return status();
  started = true;
  if (!boolEnv("RELIABILITY_MONITOR_ENABLED", true)) return status();
  const initial = setTimeout(() => evaluate("startup").catch(() => {}), 2500);
  initial.unref?.();
  timer = setInterval(() => evaluate("interval").catch(() => {}), intervalMs());
  timer.unref?.();
  return status();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

function status() {
  return {
    enabled: boolEnv("RELIABILITY_MONITOR_ENABLED", true),
    started,
    running,
    intervalMs: intervalMs(),
    lastRunAt,
    lastError,
    overallState: lastSnapshot?.overallState || "unknown",
    lastSnapshot,
    thresholds: thresholds(),
    storage: "postgresql",
  };
}

async function history({ hours = 24, limit = 120 } = {}) {
  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
  const safeLimit = Math.min(Math.max(Number(limit) || 120, 1), 500);
  const result = await pool.query(
    `SELECT id, overall_state, components, thresholds, trigger, created_at
     FROM reliability_snapshots
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [safeHours, safeLimit]
  );
  return result.rows;
}

async function dashboard() {
  const [incidents, counts, recentHistory] = await Promise.all([
    incidentService.list({ limit: 30 }),
    incidentService.counts(),
    history({ hours: 24, limit: 120 }),
  ]);
  const current = lastSnapshot || (recentHistory[0] ? {
    release: "3A",
    generatedAt: recentHistory[0].created_at,
    overallState: recentHistory[0].overall_state,
    components: recentHistory[0].components,
    thresholds: recentHistory[0].thresholds,
    trigger: recentHistory[0].trigger,
  } : null);
  return {
    release: "3A",
    generatedAt: new Date().toISOString(),
    monitor: status(),
    current,
    counts,
    incidents,
    history: recentHistory,
  };
}

module.exports = { start, stop, evaluate, status, history, dashboard, thresholds, COMPONENT_ORDER };
