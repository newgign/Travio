const assert = require("assert");

process.env.JWT_SECRET = "sprint-2e-test-jwt-secret";
process.env.OFFER_TOKEN_SECRET = "sprint-2e-test-offer-secret";
process.env.HOTELBEDS_ENABLED = "true";
process.env.HOTELBEDS_BOOKING_ENABLED = "true";
process.env.HOTELBEDS_API_KEY = "test-api-key";
process.env.HOTELBEDS_SECRET = "test-secret";
process.env.HOTELBEDS_BOOKING_BASE_URL = "https://api-mtls.test.hotelbeds.com";
process.env.HOTELBEDS_CONTENT_BASE_URL = "https://api.test.hotelbeds.com";
process.env.HOTELBEDS_MTLS_CERT_PATH = "/tmp/nonexistent-test-cert.crt";
process.env.HOTELBEDS_MTLS_KEY_PATH = "/tmp/nonexistent-test-key.key";
process.env.HOTELBEDS_ALLOW_PRICE_TOLERANCE = "true";
process.env.HOTELBEDS_BOOKING_TOLERANCE = "2";

const offerTokenService = require("../services/offerTokenService");
const hotelbedsBookingService = require("../services/hotelbedsBookingService");
const hotelbedsProvider = require("../sources/hotelbeds");
const hotelbedsClient = require("../integrations/hotelbeds/client");

async function testOfferTokenRoundTrip() {
  const offer = {
    provider: "hotelbeds",
    providerHotelId: "3424",
    offerId: "rate-old",
    rateKey: "rate-old",
    rateType: "RECHECK",
    recheckRequired: true,
    price: 125.55,
    currency: "EUR",
    adults: 2,
    children: 1,
    childrenAges: "7",
    nights: 5,
  };

  const token = offerTokenService.sign(offer);
  const restored = offerTokenService.verify(token);

  assert.strictEqual(restored.provider, "hotelbeds");
  assert.strictEqual(restored.providerHotelId, "3424");
  assert.strictEqual(restored.rateKey, "rate-old");
  assert.strictEqual(restored.price, 125.55);
  assert.strictEqual(restored.childrenAges, "7");
}

async function testCheckRateMapsToBookableRate() {
  const original = hotelbedsClient.checkRates;

  hotelbedsClient.checkRates = async (rateKey) => {
    assert.strictEqual(rateKey, "rate-old");

    return {
      hotel: {
        currency: "EUR",
        rooms: [
          {
            code: "DBL.ST",
            name: "Double Standard",
            rates: [
              {
                rooms: 1, adults: 2, children: 0,
                rateKey: "rate-new",
                rateType: "BOOKABLE",
                net: "130.25",
                boardCode: "BB",
                boardName: "BED AND BREAKFAST",
                cancellationPolicies: [{ amount: "20.00", from: "2026-10-01T00:00:00Z" }],
              },
            ],
          },
        ],
      },
    };
  };

  try {
    const checked = await hotelbedsProvider.checkRateOffer({
      provider: "hotelbeds",
      providerHotelId: "3424",
      offerId: "rate-old",
      rateKey: "rate-old",
      occupancy: { rooms: 1, adults: 2, children: 0 },
      rateType: "RECHECK",
      recheckRequired: true,
      roomCode: "DBL.ST",
      boardCode: "BB",
      price: 125.55,
      currency: "EUR",
    });

    assert.strictEqual(checked.rateKey, "rate-new");
    assert.strictEqual(checked.rateType, "BOOKABLE");
    assert.strictEqual(checked.recheckRequired, false);
    assert.strictEqual(checked.price, 130.25);
    assert.strictEqual(checked.currency, "EUR");
  } finally {
    hotelbedsClient.checkRates = original;
  }
}

async function testBookingPayload() {
  const payload = hotelbedsBookingService.buildPayload({
    id: 123,
    first_name: "Lead",
    last_name: "Traveler",
    provider_client_reference: "TRAVIO-123",
    provider_offer_id: "rate-bookable",
    comment: "Late arrival",
    offer_snapshot: {
      rateKey: "rate-bookable",
    },
    travelers: [
      {
        type: "CH",
        firstName: "Child",
        lastName: "Traveler",
        roomId: 1,
        order: 3,
      },
      {
        type: "AD",
        firstName: "Lead",
        lastName: "Traveler",
        roomId: 1,
        order: 1,
      },
      {
        type: "AD",
        firstName: "Second",
        lastName: "Traveler",
        roomId: 1,
        order: 2,
      },
    ],
  });

  assert.strictEqual(payload.holder.name, "Lead");
  assert.strictEqual(payload.rooms[0].rateKey, "rate-bookable");
  assert.deepStrictEqual(payload.rooms[0].paxes.map((pax) => pax.type), ["AD", "AD", "CH"]);
  assert.strictEqual(payload.clientReference, "TRAVIO-123");
  assert.strictEqual(payload.tolerance, 0);
  assert.strictEqual(payload.remark, undefined);
}

async function testProviderResponseParsing() {
  const parsed = hotelbedsBookingService.parseBookingResponse({
    booking: {
      reference: "123-456789",
      status: "CONFIRMED",
      currency: "EUR",
      totalNet: 499.9,
      clientReference: "TRAVIO-123",
    },
  });

  assert.strictEqual(parsed.reference, "123-456789");
  assert.strictEqual(parsed.status, "CONFIRMED");
  assert.strictEqual(parsed.currency, "EUR");
  assert.strictEqual(parsed.total, 499.9);
}

async function testCancellationRequestShape() {
  const original = hotelbedsClient.request;
  const captured = [];

  hotelbedsClient.request = async (options) => {
    captured.push(options);
    return { booking: { status: "CONFIRMED" } };
  };

  try {
    await hotelbedsClient.cancelBooking("123-456789", {
      simulation: true,
      language: "ENG",
    });

    await hotelbedsClient.cancelBooking("123-456789", {
      simulation: false,
      language: "ENG",
    });

    assert.strictEqual(captured[0].method, "DELETE");
    assert.strictEqual(captured[0].url, "/hotel-api/1.0/bookings/123-456789");
    assert.strictEqual(captured[0].params.cancellationFlag, "SIMULATION");
    assert.strictEqual(captured[1].params.cancellationFlag, "CANCELLATION");
  } finally {
    hotelbedsClient.request = original;
  }
}

async function main() {
  await testOfferTokenRoundTrip();
  await testCheckRateMapsToBookableRate();
  await testBookingPayload();
  await testProviderResponseParsing();
  await testCancellationRequestShape();

  console.log("✓ Sprint 2E offline contract tests passed");
}

main().catch((error) => {
  console.error("✗ Sprint 2E offline contract tests failed");
  console.error(error.stack || error.message);
  process.exit(1);
});
