const assert = require("node:assert/strict");
const { fingerprint, discount } = require("../services/priceHistoryService");
const offer = { provider: "hotelbeds", providerHotelId: "1", destinationCode: "AYT",
  checkIn: "2030-09-10", checkOut: "2030-09-17", nights: 7, roomName: "Standard",
  roomCode: "DBL.ST", boardCode: "BB", adults: 2, children: 0, occupancy: { rooms: 1, adults: 2, children: 0 },
  currency: "EUR", rateKey: "exact-provider-key", priceSource: "net", price: 100 };
assert(fingerprint(offer));
assert.equal(fingerprint(offer), fingerprint({ ...offer, price: 90 }));
for (const key of ["providerHotelId", "destinationCode", "checkIn", "checkOut", "roomCode", "boardCode", "currency", "rateKey", "priceSource"]) {
  assert.notEqual(fingerprint(offer), fingerprint({ ...offer, [key]: "different" }), key);
}
assert.equal(fingerprint({ ...offer, provider: "mock" }), null);
assert.equal(fingerprint({ ...offer, occupancy: { rooms: 2, adults: 2, children: 0 } }), null);
assert.equal(fingerprint({ ...offer, children: 1 }), null);
assert.equal(discount(100, 100), null);
assert.equal(discount(100, 110), null);
assert.deepEqual(discount(393000, 275000), { originalPrice: 393000, saving: 118000, discountPercent: 30 });
assert.deepEqual(discount(120.50, 100.25), { originalPrice: 120.5, saving: 20.25, discountPercent: 17 });
process.stdout.write("Price history identity and discount tests passed\n");

const config = require("../config/providers");
const manager = require("../providers/providerManager");
const oldEnv = process.env.NODE_ENV;
const oldUrl = config.hotelbeds.bookingBaseUrl;
process.env.NODE_ENV = "production";
config.hotelbeds.bookingBaseUrl = "https://api-mtls.test.hotelbeds.com";
assert.throws(() => manager.getProvider("mock"), { code: "PRODUCTION_PROVIDER_REQUIRED" });
assert.throws(() => manager.getProvider("hotelbeds"), { code: "PRODUCTION_PROVIDER_REQUIRED" });
if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
config.hotelbeds.bookingBaseUrl = oldUrl;
