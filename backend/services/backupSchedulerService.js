const databaseBackupService = require("./databaseBackupService");
const systemEventService = require("./systemEventService");
const logger = require("../utils/logger");

let timer = null;
let started = false;
let running = false;
let lastRunAt = null;
let lastSuccessAt = null;
let lastError = null;
let nextRunAt = null;

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return String(raw).trim().toLowerCase() === "true";
}

function intervalMs() {
  const value = Number(process.env.DB_BACKUP_AUTO_INTERVAL_MS || 24 * 60 * 60 * 1000);
  return Number.isFinite(value) && value >= 60_000 ? Math.floor(value) : 24 * 60 * 60 * 1000;
}

async function runNow(reason = "scheduler") {
  if (running) return { skipped: true, reason: "already_running" };
  running = true;
  lastRunAt = new Date().toISOString();
  try {
    const result = await databaseBackupService.createBackup();
    lastSuccessAt = new Date().toISOString();
    lastError = null;
    await systemEventService.safeRecordEvent({
      level: "info",
      category: "backup",
      code: "AUTO_BACKUP_OK",
      message: `Travio automatic backup completed: ${result.name}`,
      metadata: { release: "3A", reason, encrypted: result.encrypted, tableCount: result.tableCount },
    });
    return { success: true, ...result };
  } catch (error) {
    lastError = error.message;
    await systemEventService.safeRecordEvent({
      level: "error",
      category: "backup",
      code: "AUTO_BACKUP_FAILED",
      message: `Travio automatic backup failed: ${error.message}`,
      metadata: { release: "3A", reason },
    });
    throw error;
  } finally {
    running = false;
    if (boolEnv("DB_BACKUP_AUTO_ENABLED", false)) nextRunAt = new Date(Date.now() + intervalMs()).toISOString();
  }
}

function start() {
  if (started) return status();
  started = true;
  if (!boolEnv("DB_BACKUP_AUTO_ENABLED", false)) return status();

  nextRunAt = new Date(Date.now() + intervalMs()).toISOString();
  timer = setInterval(() => {
    runNow("interval").catch((error) => logger.error("AUTO BACKUP FAILED", { error: error.message }));
  }, intervalMs());
  timer.unref?.();

  if (boolEnv("DB_BACKUP_AUTO_RUN_ON_START", false)) {
    setTimeout(() => runNow("startup").catch((error) => logger.error("STARTUP BACKUP FAILED", { error: error.message })), 1500).unref?.();
  }
  return status();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
  nextRunAt = null;
}

function status() {
  return {
    enabled: boolEnv("DB_BACKUP_AUTO_ENABLED", false),
    started,
    running,
    intervalMs: intervalMs(),
    runOnStart: boolEnv("DB_BACKUP_AUTO_RUN_ON_START", false),
    lastRunAt,
    lastSuccessAt,
    lastError,
    nextRunAt,
  };
}

module.exports = { start, stop, runNow, status };
