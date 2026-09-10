const assert = require("assert");
const fs = require("fs");
const path = require("path");

process.env.JWT_SECRET = "sprint-2f-test-jwt-secret";
process.env.OFFER_TOKEN_SECRET = "sprint-2f-test-offer-secret";
process.env.HOTELBEDS_ENABLED = "true";
process.env.HOTELBEDS_BOOKING_ENABLED = "true";
process.env.HOTELBEDS_API_KEY = "test-api-key";
process.env.HOTELBEDS_SECRET = "test-secret";
process.env.HOTELBEDS_BOOKING_BASE_URL = "https://api-mtls.test.hotelbeds.com";
process.env.HOTELBEDS_CONTENT_BASE_URL = "https://api.test.hotelbeds.com";
process.env.HOTELBEDS_MTLS_CERT_PATH = "/tmp/nonexistent-test-cert.crt";
process.env.HOTELBEDS_MTLS_KEY_PATH = "/tmp/nonexistent-test-key.key";
process.env.HOTELBEDS_ALLOW_PRICE_TOLERANCE = "false";
process.env.HOTELBEDS_BOOKING_TOLERANCE = "2";

const hotelbedsBookingService = require("../services/hotelbedsBookingService");
const hotelbedsProvider = require("../sources/hotelbeds");
const hotelbedsClient = require("../integrations/hotelbeds/client");

function sampleBooking(overrides = {}) {
  return {
    id: 24,
    first_name: "Test",
    last_name: "Traveller",
    provider_client_reference: "TRAVIO-24",
    provider_offer_id: "rate-bookable",
    booking_date: "2026-09-06T16:27:00.000Z",
    offer_snapshot: {
      provider: "hotelbeds",
      rateKey: "rate-bookable",
      rateType: "BOOKABLE",
      paymentType: "AT_WEB",
      price: 87.96,
      currency: "EUR",
    },
    travelers: [
      { type: "AD", firstName: "Test", lastName: "One", roomId: 1, order: 1 },
      { type: "AD", firstName: "Test", lastName: "Two", roomId: 1, order: 2 },
    ],
    ...overrides,
  };
}

function testPriceToleranceDisabledByDefault() {
  const payload = hotelbedsBookingService.buildPayload(sampleBooking());
  assert.strictEqual(hotelbedsBookingService.effectiveTolerance(), 0);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(payload, "tolerance"), true);
  assert.strictEqual(payload.tolerance, 0);
}

function testAtHotelBlocked() {
  assert.throws(
    () => hotelbedsBookingService.buildPayload(sampleBooking({
      offer_snapshot: {
        rateKey: "rate-at-hotel",
        rateType: "BOOKABLE",
        paymentType: "AT_HOTEL",
      },
    })),
    (error) => error.code === "HOTELBEDS_AT_HOTEL_UNSUPPORTED"
  );
}

function testFacilityMapping() {
  const info = hotelbedsProvider.normalizeFacilities([
    { description: { content: "Wi-fi" }, indYesOrNo: true },
    { description: { content: "Outdoor freshwater pool" }, indLogic: true },
    { description: { content: "Car park" }, indYesOrNo: true },
    { description: { content: "Gym" }, indLogic: false },
  ]);

  assert.strictEqual(info.flags.wifi, true);
  assert.strictEqual(info.flags.pool, true);
  assert.strictEqual(info.flags.parking, true);
  assert.strictEqual(info.flags.gym, false);
  assert.ok(info.names.includes("Wi-fi"));
}

async function testReconciliationFindsClientReference() {
  const original = hotelbedsProvider.listBookings;

  hotelbedsProvider.listBookings = async (params) => {
    assert.strictEqual(params.clientReference, "TRAVIO-24");
    assert.strictEqual(params.filterType, "CREATION");
    return {
      bookings: [
        {
          reference: "138-3099624",
          status: "CONFIRMED",
          clientReference: "TRAVIO-24",
          currency: "EUR",
          totalNet: 87.96,
        },
      ],
    };
  };

  try {
    const result = await hotelbedsBookingService.reconcile(sampleBooking());
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.reference, "138-3099624");
    assert.strictEqual(result.status, "CONFIRMED");
    assert.strictEqual(result.total, 87.96);
  } finally {
    hotelbedsProvider.listBookings = original;
  }
}

async function testReconciliationNoMatch() {
  const original = hotelbedsProvider.listBookings;
  hotelbedsProvider.listBookings = async () => ({ bookings: [] });

  try {
    const result = await hotelbedsBookingService.reconcile(sampleBooking());
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.clientReference, "TRAVIO-24");
  } finally {
    hotelbedsProvider.listBookings = original;
  }
}

async function testSyncFallsBackToBookingList() {
  const originalGet = hotelbedsProvider.getBooking;
  const originalList = hotelbedsProvider.listBookings;

  hotelbedsProvider.getBooking = async () => {
    const error = new Error("Hotelbeds API (500): Internal server error");
    error.status = 500;
    error.code = "HOTELBEDS_500";
    throw error;
  };

  hotelbedsProvider.listBookings = async () => ({
    bookings: [
      {
        reference: "138-3099624",
        status: "CONFIRMED",
        clientReference: "TRAVIO-24",
        currency: "EUR",
        total: 89.71,
      },
    ],
  });

  try {
    const result = await hotelbedsBookingService.syncWithFallback(sampleBooking({
      provider_booking_id: "138-3099624",
    }));
    assert.strictEqual(result.source, "booking_list_fallback");
    assert.strictEqual(result.reference, "138-3099624");
    assert.strictEqual(result.total, 89.71);
  } finally {
    hotelbedsProvider.getBooking = originalGet;
    hotelbedsProvider.listBookings = originalList;
  }
}

async function testBookingListClientShape() {
  const original = hotelbedsClient.request;
  let captured = null;

  hotelbedsClient.request = async (options) => {
    captured = options;
    return { bookings: [] };
  };

  try {
    await hotelbedsClient.listBookings({ clientReference: "TRAVIO-24" });
    assert.strictEqual(captured.method, "GET");
    assert.strictEqual(captured.url, "/hotel-api/1.0/bookings");
    assert.strictEqual(captured.params.clientReference, "TRAVIO-24");
  } finally {
    hotelbedsClient.request = original;
  }
}


function testProviderStatusSqlHasExplicitType() {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/providerBookingController.js"),
    "utf8"
  );
  const reconcileSource = fs.readFileSync(
    path.join(__dirname, "../scripts/reconcileHotelbedsBookings.js"),
    "utf8"
  );

  assert.ok(
    controllerSource.includes("provider_status = $2::varchar(50)"),
    "providerBookingController must explicitly type provider_status parameter $2"
  );
  assert.ok(
    controllerSource.includes("WHEN $2::varchar(50) IN ('CONFIRMED', 'MODIFIED')"),
    "providerBookingController must use the same explicit type for parameter $2 in CASE"
  );
  assert.ok(
    reconcileSource.includes("provider_status = $2::varchar(50)"),
    "reconcileHotelbedsBookings must explicitly type provider_status parameter $2"
  );
  assert.ok(
    reconcileSource.includes("WHEN $2::varchar(50) IN ('CONFIRMED', 'MODIFIED')"),
    "reconcileHotelbedsBookings must use the same explicit type for parameter $2 in CASE"
  );
}

async function main() {
  testPriceToleranceDisabledByDefault();
  testProviderStatusSqlHasExplicitType();
  testAtHotelBlocked();
  testFacilityMapping();
  await testReconciliationFindsClientReference();
  await testReconciliationNoMatch();
  await testSyncFallsBackToBookingList();
  await testBookingListClientShape();
  console.log("✓ Sprint 2F offline resilience tests passed");
}

main().catch((error) => {
  console.error("✗ Sprint 2F offline resilience tests failed");
  console.error(error.stack || error.message);
  process.exit(1);
});
