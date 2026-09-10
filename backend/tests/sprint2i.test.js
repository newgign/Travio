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

function testBookingDetailsApi() {
  const routes = backend("routes/bookingRoutes.js");
  const controller = backend("controllers/bookingController.js");
  assert.ok(routes.includes('router.get("/:id/details", authMiddleware, getMyBookingDetails)'));
  assert.ok(controller.includes("const getMyBookingDetails"));
  assert.ok(controller.includes("bookingEventService.listEvents"));
  assert.ok(controller.includes("refundReadiness"));
  assert.ok(controller.includes("notification_outbox"));
}

function testLifecycleAuditMigration() {
  const sql = migration("011_sprint2i_booking_workspace.sql");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS booking_events"));
  assert.ok(sql.includes("UNIQUE(booking_id, event_key)"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS refund_requests"));
  assert.ok(sql.includes("refunded_amount"));
  assert.ok(sql.includes("refund_status"));
  assert.ok(sql.includes("booking-created"));
  assert.ok(sql.includes("payment_completed"));
}

function testAuditHooks() {
  const events = backend("services/bookingEventService.js");
  const booking = backend("controllers/bookingController.js");
  const payment = backend("controllers/paymentController.js");
  const provider = backend("controllers/providerBookingController.js");
  const voucher = backend("controllers/voucherController.js");
  assert.ok(events.includes("ON CONFLICT (booking_id, event_key)"));
  assert.ok(booking.includes('type: "booking_created"'));
  assert.ok(payment.includes('type: "payment_completed"'));
  assert.ok(provider.includes('type: "provider_synced"'));
  assert.ok(provider.includes('type: "booking_cancelled"'));
  assert.ok(voucher.includes('type: "voucher_generated"'));
}

function testRefundSafety() {
  const service = backend("services/refundReadinessService.js");
  assert.ok(service.includes("realRefundEnabled: false"));
  assert.ok(service.includes("requestEnabled: false"));
  assert.ok(service.includes('sandbox-ready'));
  assert.ok(service.includes('mode: "provider-managed"'));
}

function testCustomerBookingWorkspace() {
  const app = frontend("App.jsx");
  const details = frontend("pages/BookingDetails.jsx");
  const bookings = frontend("pages/MyBookings.jsx");
  const service = frontend("services/bookingService.js");
  const success = frontend("components/checkout/SuccessStep.jsx");
  assert.ok(app.includes('path="/my-bookings/:bookingId"'));
  assert.ok(details.includes("История заказа"));
  assert.ok(details.includes("Audit trail"));
  assert.ok(details.includes("Реальный refund"));
  assert.ok(details.includes("Реального списания денег не было"));
  assert.ok(details.includes("Синхронизировать HB"));
  assert.ok(bookings.includes("🧾 Открыть заказ"));
  assert.ok(service.includes("getBookingDetails"));
  assert.ok(success.includes("🧾 Открыть заказ"));
}

function testSprint2HPatchesPreserved() {
  const notification = backend("services/notificationService.js");
  const paymentController = backend("controllers/paymentController.js");
  const success = frontend("components/checkout/SuccessStep.jsx");
  assert.ok(notification.includes("status = $1::varchar(30)"));
  assert.ok(paymentController.includes('readiness.mode !== "sandbox"'));
  assert.ok(paymentController.includes('"sandboxCompleted":true'));
  assert.ok(success.includes("Оплата проведена в sandbox. Реального списания денег не было."));
}


function testMockBookingSnapshotCompleteness() {
  const offer = backend("services/offerService.js");
  const voucher = backend("services/voucherService.js");
  const details = frontend("pages/BookingDetails.jsx");

  assert.ok(offer.includes("defaultMockDepartureDate"));
  assert.ok(offer.includes('(provider === "mock" ? defaultMockDepartureDate() : null)'));
  assert.ok(offer.includes("checkIn: hotel.checkIn || departureDate || null"));
  assert.ok(offer.includes("addDaysIso(hotel.checkIn || departureDate, nights)"));
  assert.ok(offer.includes("roomName: hotel.roomName || roomType || null"));
  assert.ok(details.includes("offer.roomType || offer.room_type"));
  assert.ok(voucher.includes("offer.roomType"));
}


function testSandboxRefundFlow() {
  const routes = backend("routes/paymentRoutes.js");
  const controller = backend("controllers/refundController.js");
  const readiness = backend("services/refundReadinessService.js");
  const sql = migration("012_sprint2i_sandbox_refund.sql");
  const details = frontend("pages/BookingDetails.jsx");
  const paymentService = frontend("services/paymentService.js");
  assert.ok(routes.includes('router.post("/:id/refund/request", authMiddleware, requestSandboxRefund)'));
  assert.ok(routes.includes('router.post("/:id/refund/complete-sandbox", authMiddleware, completeSandboxRefund)'));
  assert.ok(controller.includes('code = "REAL_CHARGE_REFUND_BLOCKED"'));
  assert.ok(controller.includes("refund_status = 'requested'"));
  assert.ok(controller.includes("refund_status = 'refunded'"));
  assert.ok(controller.includes("refunded_amount = amount"));
  assert.ok(controller.includes("provider_status = 'local_refunded'"));
  assert.ok(controller.includes('type: "refund_requested"'));
  assert.ok(controller.includes('type: "refund_completed"'));
  assert.ok(controller.includes("realRefund: false"));
  assert.ok(readiness.includes("completeEnabled"));
  assert.ok(sql.includes("ux_refund_requests_one_full_refund_per_payment"));
  assert.ok(sql.includes("ux_refund_requests_idempotency"));
  assert.ok(paymentService.includes("requestSandboxRefund"));
  assert.ok(paymentService.includes("completeSandboxRefund"));
  assert.ok(details.includes("Запросить тестовый возврат"));
  assert.ok(details.includes("Завершить sandbox-возврат"));
  assert.ok(details.includes("Реального возврата денег не было"));
}

function main() {
  testSandboxRefundFlow();
  testMockBookingSnapshotCompleteness();
  testBookingDetailsApi();
  testLifecycleAuditMigration();
  testAuditHooks();
  testRefundSafety();
  testCustomerBookingWorkspace();
  testSprint2HPatchesPreserved();
  console.log("Sprint 2I booking workspace and audit-trail tests passed");
}

main();
