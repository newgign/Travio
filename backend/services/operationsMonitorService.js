const metricsService = require("./metricsService");
const healthMonitorService = require("./healthMonitorService");
const backupSchedulerService = require("./backupSchedulerService");
const databaseBackupService = require("./databaseBackupService");
const reliabilityMonitorService = require("./reliabilityMonitorService");

function collect() {
  return {
    release: "3A",
    generatedAt: new Date().toISOString(),
    metrics: metricsService.snapshot(),
    healthMonitor: healthMonitorService.status(),
    backupScheduler: backupSchedulerService.status(),
    reliability: reliabilityMonitorService.status(),
    backups: databaseBackupService.inventory({ limit: 10 }),
  };
}

module.exports = { collect };
