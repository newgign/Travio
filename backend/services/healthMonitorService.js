const pool = require("../db");
const logger = require("../utils/logger");
const systemEventService = require("./systemEventService");

const MAX_SAMPLES = 120;
let timer = null;
let started = false;
let lastState = null;
let lastSampleAt = null;
let lastLatencyMs = null;
let consecutiveFailures = 0;
const samples = [];

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return String(raw).trim().toLowerCase() === "true";
}

function intervalMs() {
  const value = Number(process.env.HEALTH_MONITOR_INTERVAL_MS || 60000);
  return Number.isFinite(value) && value >= 10000 ? Math.floor(value) : 60000;
}

async function sample() {
  const startedAt = Date.now();
  let ok = false;
  let errorCode = null;
  try {
    await pool.query("SELECT 1 AS ok");
    ok = true;
  } catch (error) {
    errorCode = error.code || "DB_UNAVAILABLE";
  }
  const latencyMs = Date.now() - startedAt;
  const now = new Date().toISOString();
  lastSampleAt = now;
  lastLatencyMs = latencyMs;
  consecutiveFailures = ok ? 0 : consecutiveFailures + 1;
  samples.push({ at: now, ok, latencyMs, errorCode });
  while (samples.length > MAX_SAMPLES) samples.shift();

  if (lastState !== null && lastState !== ok) {
    await systemEventService.safeRecordEvent({
      level: ok ? "info" : "error",
      category: "health",
      code: ok ? "DATABASE_RECOVERED" : "DATABASE_DOWN",
      message: ok
        ? `PostgreSQL health monitor recovered (${latencyMs} ms)`
        : `PostgreSQL health monitor failed (${errorCode || "unknown"})`,
      durationMs: latencyMs,
      metadata: { release: "3A", consecutiveFailures },
    });
  }
  lastState = ok;
  return { ok, latencyMs, at: now, errorCode };
}

function start() {
  if (started) return status();
  started = true;
  if (!boolEnv("HEALTH_MONITOR_ENABLED", true)) return status();

  sample().catch((error) => logger.warn("HEALTH MONITOR SAMPLE FAILED", { error: error }));
  timer = setInterval(() => {
    sample().catch((error) => logger.warn("HEALTH MONITOR SAMPLE FAILED", { error: error }));
  }, intervalMs());
  timer.unref?.();
  return status();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

function status() {
  const recentSamples = samples.slice(-20);
  const healthyCount = recentSamples.filter((item) => item.ok).length;
  return {
    enabled: boolEnv("HEALTH_MONITOR_ENABLED", true),
    started,
    intervalMs: intervalMs(),
    lastState: lastState === null ? "unknown" : lastState ? "healthy" : "unhealthy",
    lastSampleAt,
    lastLatencyMs,
    consecutiveFailures,
    recentAvailabilityPct: recentSamples.length ? Math.round((healthyCount / recentSamples.length) * 10000) / 100 : null,
    samples: recentSamples,
    storage: "memory",
  };
}

module.exports = { start, stop, sample, status };
