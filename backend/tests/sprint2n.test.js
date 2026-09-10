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

function testMigration() {
  const sql = migration("017_sprint2n_reliability_alerting.sql");
  assert.ok(sql.includes("operational_incidents"));
  assert.ok(sql.includes("reliability_snapshots"));
  assert.ok(sql.includes("acknowledged"));
  assert.ok(sql.includes("resolved"));
  assert.ok(sql.includes("uq_operational_incidents_active_key"));
}

function testIncidentLifecycle() {
  const service = backend("services/incidentService.js");
  assert.ok(service.includes("openOrUpdate"));
  assert.ok(service.includes("resolveByKey"));
  assert.ok(service.includes("acknowledge"));
  assert.ok(service.includes("INCIDENT_OPENED"));
  assert.ok(service.includes("INCIDENT_RESOLVED"));
  assert.ok(service.includes("INCIDENT_ACKNOWLEDGED"));
}

function testReliabilityMonitor() {
  const monitor = backend("services/reliabilityMonitorService.js");
  for (const component of ["database", "api", "backup", "email", "hotelbeds"]) assert.ok(monitor.includes(`\"${component}\"`));
  assert.ok(monitor.includes("RELIABILITY_API_DEGRADED_5XX_PCT"));
  assert.ok(monitor.includes("RELIABILITY_BACKUP_WARN_HOURS"));
  assert.ok(monitor.includes("RELIABILITY_EMAIL_FAILED_WARN"));
  assert.ok(monitor.includes("RELIABILITY_HOTELBEDS_ERROR_WINDOW_MIN"));
  assert.ok(monitor.includes("auto_recovered"));
  assert.ok(monitor.includes("reliability_snapshots"));
  assert.ok(!monitor.includes("createBooking("));
}

function testLifecycleWiring() {
  const server = backend("server.js");
  assert.ok(server.includes("reliabilityMonitorService.start()"));
  assert.ok(server.includes("reliabilityMonitorService.stop()"));
  assert.ok(server.includes("Sprint 2N") || server.includes("Sprint 3A"));
}

function testAdminApi() {
  const routes = backend("routes/adminOperations.js");
  const controller = backend("controllers/adminOperationsController.js");
  const permissions = backend("services/permissionService.js");
  assert.ok(routes.includes('/system/reliability"'));
  assert.ok(routes.includes('/system/reliability/check"'));
  assert.ok(routes.includes('/system/incidents/:id/acknowledge"'));
  assert.ok(controller.includes("getReliabilityDashboard"));
  assert.ok(controller.includes("acknowledgeIncident"));
  assert.ok(permissions.includes("admin.system.incidents"));
}

function testUi() {
  const sidebar = frontend("components/admin/Sidebar.jsx");
  const incidents = frontend("components/admin/IncidentsCenter.jsx");
  const panel = frontend("pages/AdminPanel.jsx");
  const service = frontend("services/adminService.js");
  assert.ok(sidebar.includes("Инциденты"));
  assert.ok(sidebar.includes("Система / 2N") || sidebar.includes("Система / 3A"));
  assert.ok(incidents.includes("Incident & Reliability Center"));
  assert.ok(incidents.includes("Активные инциденты"));
  assert.ok(incidents.includes("Health history · 24h"));
  assert.ok(incidents.includes("Alert thresholds"));
  assert.ok(panel.includes("IncidentsCenter"));
  assert.ok(service.includes("getAdminReliability"));
  assert.ok(service.includes("acknowledgeAdminIncident"));
}

function testSafeMoneyGateRetained() {
  const gate = backend("services/productionGateService.js");
  assert.ok(gate.includes("productionSalesEnabled: false"));
  assert.ok(gate.includes("realChargesEnabled: false"));
  assert.ok(gate.includes("realRefundsEnabled: false"));
}

function testConfigAndScripts() {
  const env = backend(".env.example");
  const pkg = JSON.parse(backend("package.json"));
  assert.ok(env.includes("RELIABILITY_MONITOR_ENABLED=true"));
  assert.ok(env.includes("RELIABILITY_HISTORY_RETENTION_DAYS=7"));
  assert.ok(pkg.scripts["reliability:check"]);
  assert.ok(pkg.scripts["test:sprint2n"]);
}

function main() {
  testMigration();
  testIncidentLifecycle();
  testReliabilityMonitor();
  testLifecycleWiring();
  testAdminApi();
  testUi();
  testSafeMoneyGateRetained();
  testConfigAndScripts();
  console.log("Sprint 2N reliability-alerting tests passed");
}

main();
