const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { buildVoucherModel, statusLabel } = require("../services/voucherService");
const { bookingEmailContent, escapeHtml } = require("../services/notificationTemplates");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function testConfirmedTestVoucher() {
  const booking = {
    id: 26,
    provider: "hotelbeds",
    provider_client_reference: "TRAVIO-26",
    provider_booking_id: "76-9792934",
    provider_status: "CONFIRMED",
    status: "Подтверждена",
    hotel: "Alanya Beach Hotel",
    country: "Турция",
    city: "ALANYA",
    total_amount: "131.93",
    quoted_amount: "131.93",
    currency: "EUR",
    quoted_currency: "EUR",
    people: 2,
    first_name: "TEST",
    last_name: "ONE",
    email: "test@example.com",
    phone: "+77000000000",
    booking_date: "2026-09-07T10:00:00Z",
    search_filters: {
      departureDate: "2026-10-12",
      nights: 3,
    },
    offer_snapshot: {
      name: "Alanya Beach Hotel",
      boardCode: "BB",
      rateType: "BOOKABLE",
      paymentType: "AT_WEB",
      price: 131.93,
      currency: "EUR",
    },
    travelers: [
      { type: "AD", firstName: "TEST", lastName: "ONE", birthDate: "1990-01-01" },
      { type: "AD", firstName: "TEST", lastName: "TWO", birthDate: "1992-02-02" },
    ],
  };

  const voucher = buildVoucherModel(booking, {
    generatedAt: new Date("2026-09-07T10:30:00Z"),
  });

  assert.strictEqual(voucher.voucherCode, "TV-000026");
  assert.strictEqual(voucher.status, "CONFIRMED");
  assert.strictEqual(voucher.isTest, true);
  assert.ok(voucher.testNotice.includes("NOT VALID FOR TRAVEL"));
  assert.strictEqual(voucher.providerReference, "76-9792934");
  assert.strictEqual(voucher.checkIn, "2026-10-12");
  assert.strictEqual(voucher.checkOut, "2026-10-15");
  assert.strictEqual(voucher.nights, 3);
  assert.strictEqual(voucher.amount, 131.93);
  assert.strictEqual(voucher.priceChanged, false);
  assert.strictEqual(voucher.travelers.length, 2);
}

function testCancelledVoucherStatus() {
  assert.strictEqual(
    statusLabel({
      provider_status: "CANCELLED",
      status: "Отменена",
    }),
    "CANCELLED"
  );
}

function testPriceAuditVoucher() {
  const voucher = buildVoucherModel({
    id: 25,
    provider: "hotelbeds",
    provider_status: "CONFIRMED",
    total_amount: 101.68,
    quoted_amount: 99.69,
    currency: "EUR",
    quoted_currency: "EUR",
    people: 2,
    travelers: [],
    offer_snapshot: {},
    search_filters: {},
  });

  assert.strictEqual(voucher.priceChanged, true);
  assert.strictEqual(voucher.amount, 101.68);
  assert.strictEqual(voucher.quotedAmount, 99.69);
}

function testNotificationTemplateEscapesHtml() {
  assert.strictEqual(
    escapeHtml('<script>alert("x")</script>'),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
  );

  const email = bookingEmailContent(
    {
      id: 1,
      provider: "hotelbeds",
      provider_client_reference: "TRAVIO-1",
      provider_booking_id: "HB-1",
      hotel: "<Hotel>",
      total_amount: 10,
      currency: "EUR",
    },
    "booking_confirmed"
  );

  assert.ok(email.subject.includes("<Hotel>"));
  assert.ok(email.html.includes("&lt;Hotel&gt;"));
  assert.ok(email.html.includes("TEST"));
}

function testCustomerCabinetRoutesExist() {
  const authRoutes = read("routes/auth.js");
  const travelerRoutes = read("routes/travelers.js");
  const bookingRoutes = read("routes/bookingRoutes.js");
  const server = read("server.js");

  assert.ok(authRoutes.includes('router.put("/profile"'));
  assert.ok(authRoutes.includes('router.put("/password"'));
  assert.ok(travelerRoutes.includes("router.use(authMiddleware)"));
  assert.ok(travelerRoutes.includes('router.get("/", listTravelers)'));
  assert.ok(bookingRoutes.includes('router.get("/:id/voucher"'));
  assert.ok(server.includes('app.use("/api/travelers", travelerRoutes)'));
}

function testOwnershipAndNoPasswordLeakContracts() {
  const travelerController = read("controllers/travelerProfileController.js");
  const authController = read("controllers/authController.js");

  assert.ok(
    travelerController.includes("WHERE id = $6 AND user_id = $7"),
    "Traveler update must be scoped to the authenticated user"
  );
  assert.ok(
    travelerController.includes("WHERE id = $1 AND user_id = $2"),
    "Traveler delete must be scoped to the authenticated user"
  );

  const publicUserStart = authController.indexOf("function buildPublicUser");
  const publicUserEnd = authController.indexOf("async function bookingStats");
  const publicUserSource = authController.slice(publicUserStart, publicUserEnd);
  assert.ok(!publicUserSource.includes("password:"), "Public user must not expose password");
}

function testNotificationOutboxIsIdempotent() {
  const migration = fs.readFileSync(
    path.join(__dirname, "../../database/migrations/009_sprint2g_customer_cabinet.sql"),
    "utf8"
  );
  const notificationService = read("services/notificationService.js");

  assert.ok(migration.includes("idx_notification_outbox_booking_event"));
  assert.ok(notificationService.includes("ON CONFLICT (booking_id, event_type)"));
  assert.ok(notificationService.includes('return { status: "duplicate" }'));
}

function testSprint2FPriceGuardStillPresent() {
  const bookingService = read("services/hotelbedsBookingService.js");
  assert.ok(
    bookingService.includes("payload.tolerance = this.effectiveTolerance()"),
    "Sprint 2G must preserve explicit Hotelbeds tolerance=0 behavior"
  );
}

function testFrontendRoutesContract() {
  const app = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/App.jsx"),
    "utf8"
  );
  const myBookings = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/MyBookings.jsx"),
    "utf8"
  );

  assert.ok(app.includes('path="/profile"'));
  assert.ok(app.includes('path="/voucher/:bookingId"'));
  assert.ok(myBookings.includes("📄 Ваучер / PDF"));
  assert.ok(myBookings.includes("🔎 Найти новый тариф"));
}

function testTravelerBirthDateIsDateOnly() {
  const travelerController = read("controllers/travelerProfileController.js");
  const travelerStep = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/components/checkout/TravelerStep.jsx"),
    "utf8"
  );
  const profilePage = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/Profile.jsx"),
    "utf8"
  );

  assert.ok(
    travelerController.includes("birth_date::text AS birth_date"),
    "Traveler API must serialize PostgreSQL DATE as YYYY-MM-DD text"
  );
  assert.ok(
    travelerStep.includes("birthDate: dateOnlyValue(saved.birth_date)"),
    "Checkout must not slice an ISO timestamp as if it were a date-only value"
  );
  assert.ok(
    profilePage.includes("dateOnlyLabel(traveler.birth_date)"),
    "Profile must display birth dates without timezone conversion"
  );
}

function main() {
  testConfirmedTestVoucher();
  testCancelledVoucherStatus();
  testPriceAuditVoucher();
  testNotificationTemplateEscapesHtml();
  testCustomerCabinetRoutesExist();
  testOwnershipAndNoPasswordLeakContracts();
  testNotificationOutboxIsIdempotent();
  testSprint2FPriceGuardStillPresent();
  testFrontendRoutesContract();
  testTravelerBirthDateIsDateOnly();

  console.log("Sprint 2G customer cabinet tests passed");
}

main();
