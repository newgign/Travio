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

function testSystemEventSchema() {
  const sql = migration("014_sprint2k_system_operations.sql");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS system_events"));
  assert.ok(sql.includes("request_id"));
  assert.ok(sql.includes("duration_ms"));
  assert.ok(sql.includes("idx_system_events_created_at"));
}

function testHealthAndTelemetry() {
  const server = backend("server.js");
  const health = backend("routes/health.js");
  const telemetry = backend("middleware/requestTelemetry.js");
  assert.ok(server.includes('app.use("/api/health", healthRoutes)'));
  assert.ok(server.includes("app.use(requestTelemetry)"));
  assert.ok(health.includes('router.get("/live"'));
  assert.ok(health.includes('router.get("/ready"'));
  assert.ok(telemetry.includes("x-request-id"));
  assert.ok(telemetry.includes("SLOW_REQUEST"));
  assert.ok(!telemetry.includes("req.body"));
}

function testHardSafetyGate() {
  const gate = backend("services/productionGateService.js");
  const payment = backend("services/paymentGatewayService.js");
  const refund = backend("services/refundReadinessService.js");
  assert.ok(gate.includes("productionSalesEnabled: false"));
  assert.ok(gate.includes("realChargesEnabled: false"));
  assert.ok(gate.includes("realRefundsEnabled: false"));
  assert.ok(payment.includes("productionGateService.state()"));
  assert.ok(refund.includes("realRefundEnabled: false"));
}

function testRbac() {
  const permissions = backend("services/permissionService.js");
  const middleware = backend("middleware/requirePermission.js");
  const routes = backend("routes/adminOperations.js");
  assert.ok(permissions.includes('"admin.system.read"'));
  assert.ok(permissions.includes('"admin.system.selftest"'));
  assert.ok(middleware.includes("PERMISSION_DENIED"));
  assert.ok(routes.includes('requirePermission("admin.operations.read")'));
  assert.ok(routes.includes('router.get("/system/status"'));
  assert.ok(routes.includes('router.post("/system/self-test"'));
}

function testEmailProviderBoundary() {
  const provider = backend("services/emailProviderService.js");
  const notification = backend("services/notificationService.js");
  assert.ok(provider.includes('provider === "console"'));
  assert.ok(provider.includes('provider === "resend"'));
  assert.ok(provider.includes("externalDelivery"));
  assert.ok(notification.includes("emailProviderService.send"));
}

function testAdminSystemUi() {
  const app = frontend("pages/AdminPanel.jsx");
  const sidebar = frontend("components/admin/Sidebar.jsx");
  const system = frontend("components/admin/SystemCenter.jsx");
  const service = frontend("services/adminService.js");
  assert.ok(app.includes('tab === "system"'));
  assert.ok(sidebar.includes("Система / 2K") || sidebar.includes("Система / 2L") || sidebar.includes("Система / 2M") || sidebar.includes("Система / 2N") || sidebar.includes("Система / 3A"));
  assert.ok(system.includes("Production blockers"));
  assert.ok(system.includes("RBAC / permissions"));
  assert.ok(system.includes("System events"));
  assert.ok(system.includes("Запустить self-test"));
  assert.ok(service.includes("getAdminSystemStatus"));
  assert.ok(service.includes("runAdminSystemSelfTest"));
}

function main() {
  testSystemEventSchema();
  testHealthAndTelemetry();
  testHardSafetyGate();
  testRbac();
  testEmailProviderBoundary();
  testAdminSystemUi();
  console.log("Sprint 2K pre-production hardening tests passed");
}

main();
