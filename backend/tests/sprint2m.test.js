const assert = require("assert");
const fs = require("fs");
const path = require("path");

function backend(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}
function frontend(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../../frontend/src", relativePath), "utf8");
}
function migration(name) {
  return fs.readFileSync(path.join(__dirname, "../../database/migrations", name), "utf8");
}

function testOperationalIndexes() {
  const sql = migration("016_sprint2m_operational_indexes.sql");
  assert.ok(sql.includes("idx_system_events_code_created_at"));
  assert.ok(sql.includes("idx_system_events_http_errors"));
  assert.ok(sql.includes("idx_maintenance_runs_operation_created_at"));
}

function testMetricsPipeline() {
  const metrics = backend("services/metricsService.js");
  const telemetry = backend("middleware/requestTelemetry.js");
  const routes = backend("routes/adminOperations.js");
  assert.ok(metrics.includes("totalRequests"));
  assert.ok(metrics.includes("p95LatencyMs"));
  assert.ok(metrics.includes("lastFiveMinutes"));
  assert.ok(metrics.includes("topRoutes"));
  assert.ok(telemetry.includes("metricsService.beginRequest"));
  assert.ok(telemetry.includes("metricsService.recordRequest"));
  assert.ok(routes.includes('router.get("/system/metrics"'));
}

function testHealthMonitor() {
  const monitor = backend("services/healthMonitorService.js");
  assert.ok(monitor.includes("HEALTH_MONITOR_ENABLED"));
  assert.ok(monitor.includes("HEALTH_MONITOR_INTERVAL_MS"));
  assert.ok(monitor.includes("DATABASE_DOWN"));
  assert.ok(monitor.includes("DATABASE_RECOVERED"));
  assert.ok(!monitor.includes("setInterval(() => sample(), 1000"));
}

function testBackupAutomation() {
  const scheduler = backend("services/backupSchedulerService.js");
  const backup = backend("services/databaseBackupService.js");
  const pkg = JSON.parse(backend("package.json"));
  assert.ok(scheduler.includes("DB_BACKUP_AUTO_ENABLED"));
  assert.ok(scheduler.includes("DB_BACKUP_AUTO_INTERVAL_MS"));
  assert.ok(scheduler.includes("createBackup"));
  assert.ok(backup.includes("cleanupRetention"));
  assert.ok(backup.includes("DB_BACKUP_MAX_AGE_DAYS"));
  assert.ok(backup.includes("function inventory"));
  assert.ok(pkg.scripts["backup:cleanup"]);
  assert.ok(pkg.scripts["backup:scheduled"]);
}

function testStructuredLogger() {
  const logger = backend("utils/logger.js");
  const telemetry = backend("middleware/requestTelemetry.js");
  assert.ok(logger.includes("LOG_FORMAT"));
  assert.ok(logger.includes("[redacted]"));
  assert.ok(logger.includes('release = "2M"') || logger.includes('release = "2N"') || logger.includes('release = "3A"'));
  assert.ok(telemetry.includes("HTTP_ACCESS_LOG"));
  assert.ok(!telemetry.includes("req.body"));
}

function testLifecycleStartsAndStopsMonitors() {
  const server = backend("server.js");
  assert.ok(server.includes("healthMonitorService.start()"));
  assert.ok(server.includes("backupSchedulerService.start()"));
  assert.ok(server.includes("healthMonitorService.stop()"));
  assert.ok(server.includes("backupSchedulerService.stop()"));
  assert.ok(server.includes("Sprint 2M") || server.includes("Sprint 2N") || server.includes("Sprint 3A"));
}

function testSystemUi() {
  const sidebar = frontend("components/admin/Sidebar.jsx");
  const center = frontend("components/admin/SystemCenter.jsx");
  const service = frontend("services/adminService.js");
  const panel = frontend("pages/AdminPanel.jsx");
  assert.ok(sidebar.includes("Система / 2M") || sidebar.includes("Система / 2N") || sidebar.includes("Система / 3A"));
  assert.ok(center.includes("2M operational monitoring"));
  assert.ok(center.includes("Backup scheduler"));
  assert.ok(center.includes("Average latency"));
  assert.ok(center.includes("Top API routes"));
  assert.ok(service.includes("getAdminSystemMetrics"));
  assert.ok(panel.includes("Sprint 2M") || panel.includes("Sprint 2N") || panel.includes("Sprint 3A"));
}

function testSafetyStillBlocked() {
  const gate = backend("services/productionGateService.js");
  assert.ok(gate.includes("productionSalesEnabled: false"));
  assert.ok(gate.includes("realChargesEnabled: false"));
  assert.ok(gate.includes("realRefundsEnabled: false"));
}

function main() {
  testOperationalIndexes();
  testMetricsPipeline();
  testHealthMonitor();
  testBackupAutomation();
  testStructuredLogger();
  testLifecycleStartsAndStopsMonitors();
  testSystemUi();
  testSafetyStillBlocked();
  console.log("Sprint 2M automated-operations tests passed");
}

main();
