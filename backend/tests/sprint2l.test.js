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

function testMaintenanceSchema() {
  const sql = migration("015_sprint2l_maintenance.sql");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS maintenance_runs"));
  assert.ok(sql.includes("artifact_name"));
  assert.ok(sql.includes("checksum"));
}

function testSecurityHeaders() {
  const source = backend("middleware/securityHeaders.js");
  assert.ok(source.includes("X-Content-Type-Options"));
  assert.ok(source.includes("X-Frame-Options"));
  assert.ok(source.includes("Content-Security-Policy"));
  assert.ok(source.includes("Strict-Transport-Security"));
}

function testRateLimit() {
  const source = backend("middleware/rateLimit.js");
  assert.ok(source.includes("RateLimit-Limit"));
  assert.ok(source.includes("Retry-After"));
  assert.ok(source.includes('code: "RATE_LIMITED"'));
  assert.ok(source.includes("AUTH_RATE_LIMIT_MAX"));
}

function testGracefulShutdown() {
  const server = backend("server.js");
  const health = backend("routes/health.js");
  assert.ok(server.includes("draining requests"));
  assert.ok(server.includes("server.close("));
  assert.ok(server.includes("pool.end()"));
  assert.ok(server.includes("SHUTDOWN_GRACE_MS"));
  assert.ok(health.includes('"draining"'));
}

function testErrorBoundary() {
  const handler = backend("middleware/errorHandler.js");
  const notFound = backend("middleware/notFound.js");
  assert.ok(handler.includes("INVALID_JSON"));
  assert.ok(handler.includes("PAYLOAD_TOO_LARGE"));
  assert.ok(handler.includes("CORS_ORIGIN_DENIED"));
  assert.ok(handler.includes("requestId"));
  assert.ok(notFound.includes("ROUTE_NOT_FOUND"));
}

function testBackupRestoreGuard() {
  const service = backend("services/databaseBackupService.js");
  const restore = backend("scripts/restoreDatabase.js");
  assert.ok(service.includes("aes-256-gcm"));
  assert.ok(service.includes("scryptSync"));
  assert.ok(service.includes("checksum mismatch") || service.includes("checksum mismatch".replace(/^./, "C")));
  assert.ok(service.includes("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"));
  assert.ok(service.includes("TRUNCATE TABLE"));
  assert.ok(service.includes("ROLLBACK"));
  assert.ok(service.includes("ALLOW_DATABASE_RESTORE"));
  assert.ok(restore.includes('args.includes("--apply")'));
}

function testPreflightAndScripts() {
  const pkg = JSON.parse(backend("package.json"));
  assert.ok(pkg.scripts["backup:create"]);
  assert.ok(pkg.scripts["backup:verify"]);
  assert.ok(pkg.scripts["backup:restore"]);
  assert.ok(pkg.scripts.preflight);
  assert.ok(pkg.scripts["test:sprint2l"]);
}

function testSystemUi() {
  const sidebar = frontend("components/admin/Sidebar.jsx");
  const center = frontend("components/admin/SystemCenter.jsx");
  const panel = frontend("pages/AdminPanel.jsx");
  assert.ok(sidebar.includes("Система / 2L") || sidebar.includes("Система / 2M") || sidebar.includes("Система / 2N") || sidebar.includes("Система / 3A"));
  assert.ok(center.includes("2L deployment safeguards"));
  assert.ok(center.includes("Database backups"));
  assert.ok(center.includes("Graceful shutdown"));
  assert.ok(center.includes("npm run backup:create"));
  assert.ok(panel.includes("Sprint 2L") || panel.includes("Sprint 2M") || panel.includes("Sprint 2N") || panel.includes("Sprint 3A"));
}

function testRealMoneyStillBlocked() {
  const gate = backend("services/productionGateService.js");
  assert.ok(gate.includes("productionSalesEnabled: false"));
  assert.ok(gate.includes("realChargesEnabled: false"));
  assert.ok(gate.includes("realRefundsEnabled: false"));
}

function main() {
  testMaintenanceSchema();
  testSecurityHeaders();
  testRateLimit();
  testGracefulShutdown();
  testErrorBoundary();
  testBackupRestoreGuard();
  testPreflightAndScripts();
  testSystemUi();
  testRealMoneyStillBlocked();
  console.log("Sprint 2L deployment-safety tests passed");
}

main();
