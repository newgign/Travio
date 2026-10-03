const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.HOTELBEDS_ENV = 'test';
process.env.HOTELBEDS_ENABLED = 'true';
process.env.HOTELBEDS_BOOKING_ENABLED = 'false';
process.env.OFFER_TOKEN_SECRET = 'offline-sprint6e-synthetic-offer-secret';
const jwt = require('jsonwebtoken');
const tokens = require('../services/offerTokenService');
const client = require('../integrations/hotelbeds/client');
const provider = require('../sources/hotelbeds');
const sessions = require('../services/checkoutSessionService');
const manager = require('../providers/providerManager');
const controller = require('../controllers/checkoutController');
const config = require('../config/providers');
const offer = { provider: 'hotelbeds', priceEnvironment: 'test', providerHotelId: '3424',
  offerId: 'offline-old', rateKey: 'offline-old', rateType: 'RECHECK', recheckRequired: true,
  price: 100, currency: 'EUR', roomCode: 'DBL', roomName: 'Double', boardCode: 'BB', boardName: 'Breakfast',
  food: 'Breakfast', rateClass: 'NOR', paymentType: 'AT_WEB', packaging: false,
  adults: 2, children: 0, occupancy: { rooms: 1, adults: 2, children: 0 }, nights: 2,
  checkIn: '2030-01-01', checkOut: '2030-01-03' };
const response = (price = '100.00', patch = {}) => ({ hotel: { code: 3424, currency: 'EUR', rooms: [{ code: 'DBL', name: 'Double', rates: [{
  rateKey: 'offline-new', rateType: 'BOOKABLE', net: price, boardCode: 'BB', boardName: 'Breakfast',
  rateClass: 'NOR', paymentType: 'AT_WEB', packaging: false, rooms: 1, adults: 2, children: 0, ...patch,
}] }] } });
let captured, calls;
beforeEach(t => {
  captured = null; calls = 0;
  t.mock.method(client, 'checkRates', async key => { assert.equal(key, offer.rateKey); calls++; return response(); });
  for (const method of ['createBooking', 'cancelBooking']) t.mock.method(client, method, () => assert.fail('Mutation forbidden'));
  t.mock.method(require('../db'), 'query', () => assert.fail('Real DB query forbidden'));
  t.mock.method(manager, 'getProvider', name => { assert.equal(name, 'hotelbeds'); return provider; });
  t.mock.method(sessions, 'create', async data => { captured = data; return { token: 'offline-checkout', expiresAt: '2030-01-01' }; });
  t.mock.method(require('../utils/logger'), 'info', () => {});
});
async function review(patch = {}) {
  let body, status = 200;
  await controller.getCheckout({ body: { provider: 'hotelbeds', hotelId: '3424', offerToken: tokens.sign(offer), ...patch } },
    { status(value) { status = value; return this; }, json(value) { body = value; return value; } }, error => { throw error; });
  return { body, status };
}
test('valid signed selection is confirmed without an extra Availability', async t => {
  t.mock.method(client, 'availability', () => assert.fail('Unnecessary Availability'));
  const result = await review(); assert.equal(result.body.checkRateStatus, 'CONFIRMED'); assert.equal(calls, 1);
});
test('tampered signature rejected before provider or session', async () => {
  const parts = tokens.sign(offer).split('.'); parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
  const result = await review({ offerToken: parts.join('.') });
  assert.equal(result.body.checkRateStatus, 'UNAVAILABLE'); assert.equal(result.body.code, 'OFFER_TOKEN_INVALID'); assert.equal(calls, 0); assert.equal(captured, null);
});
test('expired signed selection rejected before provider', async () => {
  const token = jwt.sign({ type: 'travio_provider_offer', offer }, process.env.OFFER_TOKEN_SECRET, { expiresIn: -1 });
  assert.equal((await review({ offerToken: token })).body.code, 'OFFER_TOKEN_EXPIRED'); assert.equal(calls, 0);
});
test('invalid signed rate shape fails before provider', async () => {
  assert.equal((await review({ offerToken: tokens.sign({ ...offer, rateKey: null }) })).body.code, 'OFFER_TOKEN_INVALID'); assert.equal(calls, 0);
});
test('client price currency room board and rate cannot override signed selection', async () => {
  const { body } = await review({ price: 1, currency: 'USD', roomCode: 'SUITE', boardCode: 'AI', rateKey: 'tampered' });
  assert.equal(body.total, 100); assert.equal(body.tour.currency, 'EUR'); assert.equal(body.tour.roomCode, 'DBL'); assert.equal(body.tour.boardCode, 'BB');
});
test('hotel mismatch rejected before provider', async () => {
  assert.equal((await review({ hotelId: '999' })).body.code, 'OFFER_HOTEL_MISMATCH'); assert.equal(calls, 0);
});
test('same numeric price preserves old and confirmed totals', async () => {
  const { body } = await review(); assert.equal(body.previousTotal, 100); assert.equal(body.total, 100); assert.equal(body.priceChangedAtCheckRate, false);
});
for (const [label, price] of [['increase', '120.25'], ['decrease', '90.50']]) test(`price ${label} requires explicit confirmation`, async t => {
  t.mock.method(client, 'checkRates', async () => response(price));
  const { body } = await review(); assert.equal(body.checkRateStatus, 'PRICE_CHANGED'); assert.equal(body.total, Number(price)); assert.equal(body.previousTotal, 100);
  assert.equal(captured.offer.priceConfirmationRequired, true);
});
test('money comparison uses numeric cents rather than formatted strings', async t => {
  t.mock.method(client, 'checkRates', async () => response('100.000'));
  assert.equal((await review()).body.checkRateStatus, 'CONFIRMED');
});
test('currency preserved and currency substitution rejected', async t => {
  const value = response(); value.hotel.currency = 'USD'; t.mock.method(client, 'checkRates', async () => value);
  assert.equal((await review()).body.checkRateStatus, 'UNAVAILABLE'); assert.equal(captured, null);
});
test('empty valid rate list means unavailable', async t => {
  const value = response(); value.hotel.rooms[0].rates = []; t.mock.method(client, 'checkRates', async () => value);
  assert.equal((await review()).body.checkRateStatus, 'UNAVAILABLE');
});
test('explicit provider unavailable rate remains unavailable', async t => {
  t.mock.method(client, 'checkRates', async () => { throw Object.assign(Error('private'), { code: 'RATE_NOT_AVAILABLE' }); });
  assert.equal((await review()).body.checkRateStatus, 'UNAVAILABLE');
});
test('timeout auth throttling and network failures are retryable, never unavailable', async t => {
  for (const code of ['TIMEOUT', 'AUTH_ERROR', 'RATE_LIMIT', 'PROVIDER_UNAVAILABLE', 'ECONNRESET']) {
    t.mock.method(client, 'checkRates', async () => { throw Object.assign(Error('private'), { code }); });
    const result = await review(); assert.equal(result.status, 503); assert.equal(result.body.checkRateStatus, 'RETRYABLE_ERROR');
  }
});
test('malformed response or missing price/type is retryable', async t => {
  for (const value of [null, {}, { hotel: { code: 3424 } }, response('invalid'), response('100', { rateType: null }), response('100', { rateKey: null })]) {
    t.mock.method(client, 'checkRates', async () => value);
    assert.equal((await review()).body.checkRateStatus, 'RETRYABLE_ERROR');
  }
});
test('unresolved RECHECK does not create a session', async t => {
  t.mock.method(client, 'checkRates', async () => response('100', { rateType: 'RECHECK' }));
  assert.equal((await review()).body.checkRateStatus, 'UNAVAILABLE'); assert.equal(captured, null);
});
test('raw credentials stack and provider payload cannot leak through review errors', async t => {
  t.mock.method(client, 'checkRates', async () => { throw Object.assign(Error('Authorization private-provider-sentinel'), { response: { secret: 'private-provider-sentinel' } }); });
  const result = await review(); assert.doesNotMatch(JSON.stringify(result), /Authorization|private-provider-sentinel|stack|secret/);
});
test('confirmed rate and price become authoritative session snapshot, booking stays off', async t => {
  t.mock.method(client, 'checkRates', async () => response('111.10'));
  const { body } = await review(); assert.equal(body.tour.rateKey, 'offline-new'); assert.equal(captured.offer.rateKey, 'offline-new');
  assert.equal(captured.offer.price, 111.1); assert.equal(body.total, captured.offer.price); assert.equal(body.tour.bookingDisabled, true);
});
test('TEST environment mismatch and LIVE review blocked before provider', async () => {
  const mismatched = await review({ offerToken: tokens.sign({ ...offer, priceEnvironment: 'live' }) });
  assert.equal(mismatched.body.code, 'OFFER_ENVIRONMENT_MISMATCH'); assert.equal(calls, 0);
  const original = config.hotelbeds.environment;
  try { config.hotelbeds.environment = 'live'; assert.equal((await review({ offerToken: tokens.sign({ ...offer, priceEnvironment: 'live' }) })).body.checkRateStatus, 'RETRYABLE_ERROR'); }
  finally { config.hotelbeds.environment = original; }
  assert.equal(calls, 0);
});
test('simultaneous identical CheckRate shares pending call but later retry is fresh', async t => {
  let release; const deferred = new Promise(resolve => { release = resolve; });
  t.mock.method(client, 'checkRates', async () => { calls++; await deferred; return response(); });
  const first = provider.checkRateOffer(offer), second = provider.checkRateOffer({ ...offer }); assert.equal(calls, 1);
  release(); assert.deepEqual(await first, await second); await provider.checkRateOffer(offer); assert.equal(calls, 2);
});
test('BOOKABLE retains existing refresh path without unnecessary CheckRate', async t => {
  const value = response('105', { rateKey: offer.rateKey });
  t.mock.method(client, 'availability', async () => ({ hotels: { hotels: [value.hotel] } }));
  const { body } = await review({ offerToken: tokens.sign({ ...offer, rateType: 'BOOKABLE', recheckRequired: false }) });
  assert.equal(calls, 0); assert.equal(body.total, 105); assert.equal(body.checkRateStatus, 'PRICE_CHANGED');
});
test('BOOKABLE malformed refresh is retryable and cannot use stale search price', async t => {
  t.mock.method(client, 'availability', async () => ({}));
  const { body } = await review({ offerToken: tokens.sign({ ...offer, rateType: 'BOOKABLE', recheckRequired: false }) });
  assert.equal(body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(captured, null);
});
