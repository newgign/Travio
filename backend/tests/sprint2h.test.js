const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { buildVoucherPdf, transliterate } = require("../services/simplePdfService");
const paymentGatewayService = require("../services/paymentGatewayService");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function testRealPdfGenerator() {
  const pdf = buildVoucherPdf({
    voucherCode: "TV-000030",
    travioReference: "TRAVIO-30",
    providerReference: "321-11025029",
    providerStatus: "CONFIRMED",
    status: "CONFIRMED",
    isTest: true,
    hotel: "Sawasdee Siam",
    city: "PATTAYA",
    country: "Thailand",
    checkIn: "2026-10-12",
    checkOut: "2026-10-15",
    nights: 3,
    people: 1,
    boardCode: "RO",
    roomName: "Double or Twin Superior",
    amount: 54.33,
    currency: "EUR",
    quotedAmount: 54.33,
    quotedCurrency: "EUR",
    priceChanged: false,
    travelers: [{ type: "AD", firstName: "Test", lastName: "Traveller", birthDate: "1990-01-01" }],
    holder: { firstName: "Test", lastName: "Traveller", phone: "+77000000000", email: "test@example.com" },
    generatedAt: "2026-09-07T10:00:00.000Z",
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.strictEqual(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.ok(pdf.length > 1500);
  const source = pdf.toString("binary");
  assert.ok(source.includes("TRAVIO-30"));
  assert.ok(source.includes("321-11025029"));
  assert.ok(source.includes("01.01.1990"));
  assert.strictEqual(transliterate("Турция"), "Turtsiya");
}

function testPdfRouteAndFrontendDownload() {
  const routes = read("routes/bookingRoutes.js");
  const controller = read("controllers/voucherController.js");
  const bookingService = fs.readFileSync(path.join(__dirname, "../../frontend/src/services/bookingService.js"), "utf8");
  const voucherPage = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/Voucher.jsx"), "utf8");
  assert.ok(routes.includes('router.get("/:id/voucher.pdf"'));
  assert.ok(controller.includes('res.setHeader("Content-Type", "application/pdf")'));
  assert.ok(bookingService.includes("downloadBookingVoucherPdf"));
  assert.ok(voucherPage.includes("⬇️ Скачать PDF"));
}

function testNotificationCenterContracts() {
  const service = read("services/notificationService.js");
  const routes = read("routes/notifications.js");
  const server = read("server.js");
  assert.ok(service.includes('provider === "console"'));
  assert.ok(service.includes("attempts < 3"));
  assert.ok(service.includes("queueTestNotification"));
  assert.ok(routes.includes('router.post("/test"'));
  assert.ok(routes.includes('router.post("/:id/retry"'));
  assert.ok(server.includes('app.use("/api/notifications", notificationRoutes)'));
}

function testPaymentReadinessSafeDefaults() {
  const oldMode = process.env.PAYMENTS_MODE;
  const oldProvider = process.env.PAYMENTS_PROVIDER;
  delete process.env.PAYMENTS_MODE;
  delete process.env.PAYMENTS_PROVIDER;
  const state = paymentGatewayService.readiness();
  assert.strictEqual(state.mode, "disabled");
  assert.strictEqual(state.realChargesEnabled, false);
  assert.strictEqual(state.sandboxAvailable, false);
  if (oldMode === undefined) delete process.env.PAYMENTS_MODE; else process.env.PAYMENTS_MODE = oldMode;
  if (oldProvider === undefined) delete process.env.PAYMENTS_PROVIDER; else process.env.PAYMENTS_PROVIDER = oldProvider;
}

function testMigrationAndPaymentRoutes() {
  const migration = fs.readFileSync(
    path.join(__dirname, "../../database/migrations/010_sprint2h_delivery_payments.sql"),
    "utf8"
  );
  const paymentRoutes = read("routes/paymentRoutes.js");
  assert.ok(migration.includes("attempts INTEGER"));
  assert.ok(migration.includes("idempotency_key"));
  assert.ok(migration.includes("idx_payments_idempotency_key"));
  assert.ok(paymentRoutes.includes('router.get("/readiness"'));
  assert.ok(paymentRoutes.includes('router.post("/:id/intent"'));
}

function testFrontendServiceCenterAndHistory() {
  const profile = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/Profile.jsx"), "utf8");
  const bookings = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/MyBookings.jsx"), "utf8");
  assert.ok(profile.includes("Email-центр"));
  assert.ok(profile.includes("Платёжный контур"));
  assert.ok(profile.includes("sendTestNotification"));
  assert.ok(bookings.includes('status === "test"'));
  assert.ok(bookings.includes("downloadBookingVoucherPdf"));
  assert.ok(bookings.includes("🧾"));
}

function testSprint2GDateFixPreserved() {
  const travelerController = read("controllers/travelerProfileController.js");
  const travelerStep = fs.readFileSync(path.join(__dirname, "../../frontend/src/components/checkout/TravelerStep.jsx"), "utf8");
  assert.ok(travelerController.includes("birth_date::text AS birth_date"));
  assert.ok(travelerStep.includes("birthDate: dateOnlyValue(saved.birth_date)"));
}


function testNotificationOutboxSqlTypesAreExplicit() {
  const service = read("services/notificationService.js");
  assert.ok(service.includes("status = $1::varchar(30)"));
  assert.ok(service.includes("WHEN $1::varchar(30) = 'sent'"));
  assert.ok(service.includes("provider = COALESCE($2::varchar(40), provider)"));
  assert.ok(service.includes("provider_message_id = COALESCE($3::varchar(255), provider_message_id)"));
  assert.ok(service.includes("next_attempt_at = $6::timestamp"));
  assert.ok(service.includes("WHERE id = $7::integer"));
}

function testSandboxPaymentCompletionIsGated() {
  const controller = read("controllers/paymentController.js");
  const checkout = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/Checkout.jsx"),
    "utf8"
  );

  assert.ok(controller.includes('readiness.mode !== "sandbox"'));
  assert.ok(controller.includes('code: "PAYMENT_GATEWAY_DISABLED"'));
  assert.ok(controller.includes('code: "PAYMENT_INTENT_REQUIRED"'));
  assert.ok(controller.includes("gateway_provider = 'sandbox'"));
  assert.ok(controller.includes("idempotency_key IS NOT NULL"));
  assert.ok(controller.includes('"sandboxCompleted":true'));
  assert.ok(checkout.includes("createPaymentIntent(currentBookingId)"));
  assert.ok(checkout.includes("await payBooking(currentBookingId, method)"));
}

function testSuccessCopyMatchesProvider() {
  const success = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/components/checkout/SuccessStep.jsx"),
    "utf8"
  );

  assert.ok(success.includes('payment?.gateway_provider === "sandbox"'));
  assert.ok(success.includes("payment?.metadata?.realCharge === false"));
  assert.ok(success.includes("Оплата проведена в sandbox. Реального списания денег не было."));
  assert.ok(success.includes("Hotelbeds-бронь можно синхронизировать"));
}
function main() {
  testRealPdfGenerator();
  testSuccessCopyMatchesProvider();
  testSandboxPaymentCompletionIsGated();
  testNotificationOutboxSqlTypesAreExplicit();
  testPdfRouteAndFrontendDownload();
  testNotificationCenterContracts();
  testPaymentReadinessSafeDefaults();
  testMigrationAndPaymentRoutes();
  testFrontendServiceCenterAndHistory();
  testSprint2GDateFixPreserved();
  console.log("Sprint 2H delivery and payments-readiness tests passed");
}

main();
