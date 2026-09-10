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

function testAdminAuditSchema() {
  const sql = migration("013_sprint2j_admin_operations.sql");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS admin_actions"));
  assert.ok(sql.includes("admin_user_id"));
  assert.ok(sql.includes("booking_id"));
  assert.ok(sql.includes("idx_admin_actions_created_at"));
}

function testAdminApiProtected() {
  const routes = backend("routes/adminOperations.js");
  const server = backend("server.js");
  assert.ok(routes.includes('router.use(authMiddleware, requireRole("admin"))'));
  assert.ok(routes.includes('router.get("/overview", getOverview)'));
  assert.ok(routes.includes('router.get("/bookings", getBookings)'));
  assert.ok(routes.includes('router.get("/refunds", getRefunds)'));
  assert.ok(routes.includes('router.get("/notifications", getNotifications)'));
  assert.ok(routes.includes('router.get("/readiness", getReadiness)'));
  assert.ok(server.includes('app.use("/api/admin", adminOperationsRoutes)'));
}

function testOperationalSafety() {
  const controller = backend("controllers/adminOperationsController.js");
  const booking = backend("controllers/bookingController.js");
  const provider = backend("controllers/providerBookingController.js");
  const users = backend("controllers/userController.js");
  const tours = backend("controllers/tourController.js");
  assert.ok(controller.includes("productionSalesEnabled: false"));
  assert.ok(controller.includes("realChargesEnabled: false"));
  assert.ok(controller.includes("realRefundsEnabled: false"));
  assert.ok(controller.includes("HOTELBEDS_BOOKING_TOLERANCE"));
  assert.ok(booking.includes('actionType: "booking_status_changed"'));
  assert.ok(booking.includes('actionType: "booking_deleted"'));
  assert.ok(provider.includes('actionType: "provider_sync"'));
  assert.ok(users.includes('actionType: "user_deleted"'));
  assert.ok(users.includes('ADMIN_SELF_DELETE_BLOCKED'));
  assert.ok(tours.includes('actionType: "tour_created"'));
  assert.ok(tours.includes('actionType: "tour_updated"'));
  assert.ok(tours.includes('actionType: "tour_deleted"'));
}

function testAdminUi() {
  const app = frontend("pages/AdminPanel.jsx");
  const bookings = frontend("components/admin/BookingsTable.jsx");
  const operations = frontend("components/admin/OperationsCenter.jsx");
  const refunds = frontend("components/admin/RefundsTable.jsx");
  const notifications = frontend("components/admin/NotificationsTable.jsx");
  const service = frontend("services/adminService.js");

  assert.ok(app.includes('tab === "operations"'));
  assert.ok(app.includes('tab === "refunds"'));
  assert.ok(app.includes('tab === "notifications"'));
  assert.ok(bookings.includes("Reconcile HB"));
  assert.ok(bookings.includes("Открыть заказ"));
  assert.ok(operations.includes("Production-readiness"));
  assert.ok(operations.includes("LIVE продажи выключены"));
  assert.ok(refunds.includes("Возвраты"));
  assert.ok(notifications.includes("Email / outbox"));
  assert.ok(service.includes("getAdminOverview"));
  assert.ok(service.includes("getAdminReadiness"));
}

function main() {
  testAdminAuditSchema();
  testAdminApiProtected();
  testOperationalSafety();
  testAdminUi();
  console.log("Sprint 2J admin operations and production-readiness tests passed");
}

main();
