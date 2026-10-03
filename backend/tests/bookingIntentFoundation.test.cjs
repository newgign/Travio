const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.HOTELBEDS_ENV = 'test';
process.env.HOTELBEDS_ENABLED = 'true';
process.env.HOTELBEDS_BOOKING_ENABLED = 'false';
process.env.HOTELBEDS_LIVE_BOOKING_ENABLED = 'false';
process.env.PRODUCTION_SALES_ENABLED = 'false';
process.env.REAL_CHARGES_ENABLED = 'false';
process.env.REAL_REFUNDS_ENABLED = 'false';
process.env.PAYMENTS_MODE = 'disabled';
process.env.EMAIL_ENABLED = 'false';
process.env.JWT_SECRET = 'offline-sprint6f-synthetic-session-secret';
const jwt = require('jsonwebtoken');
const pool = require('../db');
const service = require('../services/hotelbedsBookingService');
const sessions = require('../services/checkoutSessionService');
const controller = require('../controllers/bookingController');
const source = require('../sources/hotelbeds');
const transport = require('../integrations/hotelbeds/client');
const config = require('../config/providers').hotelbeds;
const token = '12345678-1234-4123-8123-123456789abc';
const offer = () => ({ provider: 'hotelbeds', providerHotelId: '3424', offerId: 'offline-confirmed-rate', rateKey: 'offline-confirmed-rate',
  rateType: 'BOOKABLE', recheckRequired: false, checkRatePerformed: true, checkedRateAt: new Date(Date.now() - 1000).toISOString(),
  price: 110.25, currency: 'EUR', priceEnvironment: 'test', priceConfirmationRequired: false, bookingDisabled: true,
  roomCode: 'DBL', roomName: 'Double', boardCode: 'BB', boardName: 'Breakfast', paymentType: 'AT_WEB', packaging: false,
  checkIn: '2030-01-01', checkOut: '2030-01-03', nights: 2, adults: 2, children: 1, childrenAges: '8',
  occupancy: { rooms: 1, adults: 2, children: 1 } });
const session = () => ({ token, provider: 'hotelbeds', provider_hotel_id: '3424', provider_offer_id: 'offline-confirmed-rate',
  rate_type: 'BOOKABLE', currency: 'EUR', total_amount: '110.25', offer_snapshot: offer(),
  expires_at: new Date(Date.now() + 20 * 60000).toISOString(), used_at: null });
const request = () => ({ checkoutToken: token, travelers: [
  { type: 'AD', firstName: 'Synthetic', lastName: 'AdultOne', roomId: 1 },
  { type: 'AD', firstName: 'Synthetic', lastName: 'AdultTwo', roomId: 1 },
  { type: 'CH', firstName: 'Synthetic', lastName: 'Child', age: 8, roomId: 1 },
] });
let row, reads;
beforeEach(t => {
  row = session(); reads = 0;
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(sql, 'SELECT * FROM checkout_sessions WHERE token = $1'); assert.deepEqual(params, [token]); reads++;
    return { rows: row ? [row] : [] };
  });
  t.mock.method(pool, 'connect', () => assert.fail('No real DB connection or booking transaction'));
  for (const name of ['availability', 'checkRates', 'createBooking', 'cancelBooking']) t.mock.method(transport, name, () => assert.fail('Provider call forbidden'));
  t.mock.method(source, 'createBooking', () => assert.fail('Booking adapter forbidden'));
  t.mock.method(require('../services/paymentGatewayService'), 'createIntent', () => assert.fail('Payment forbidden'));
  t.mock.method(sessions, 'markUsed', () => assert.fail('Intent must not consume checkout'));
});
async function submit(body = request()) {
  let status, result;
  await controller.createBookingIntent({ body, user: { id: 7 } }, { status(value) { status = value; return this; }, json(value) { result = value; return value; } });
  return { status, result };
}
test('confirmed server CheckRate session produces ready intent and disabled boundary', async () => {
  const { status, result } = await submit(); assert.equal(status, 503); assert.equal(result.code, 'BOOKING_DISABLED');
  assert.equal(result.intent.state, 'INTENT_READY'); assert.equal(result.providerState, 'PROVIDER_NOT_CALLED'); assert.equal(reads, 1);
});
test('stale search snapshot without CheckRate cannot become intent', async () => {
  delete row.offer_snapshot.checkRatePerformed; delete row.offer_snapshot.checkedRateAt;
  assert.equal((await submit()).result.code, 'VALIDATION_ERROR');
});
test('client supplied confirmation markers and offer payload cannot manufacture trust', async () => {
  assert.equal((await submit({ ...request(), confirmedOffer: offer(), checkRatePerformed: true })).result.code, 'VALIDATION_ERROR');
});
test('malformed and tampered opaque tokens rejected without querying DB', async () => {
  for (const value of ['', 'search-jwt-sentinel', null, 123, {}, token + 'x']) assert.equal((await submit({ ...request(), checkoutToken: value })).result.code, 'VALIDATION_ERROR');
  assert.equal(reads, 0);
});
test('unknown valid-shape token cannot authorize confirmation', async () => {
  row = null; assert.equal((await submit()).result.code, 'VALIDATION_ERROR');
});
test('expired used and malformed session expiry rejected', async () => {
  for (const patch of [{ expires_at: new Date(Date.now() - 1).toISOString() }, { used_at: new Date().toISOString() }, { expires_at: 'invalid' }]) {
    row = { ...session(), ...patch }; assert.equal((await submit()).result.code, 'VALIDATION_ERROR');
  }
});
test('old missing or future CheckRate timestamps cannot confirm an intent', async () => {
  for (const checkedRateAt of [null, 'invalid', new Date(Date.now() - 3600000).toISOString(), new Date(Date.now() + 60000).toISOString()]) {
    row = session(); row.offer_snapshot.checkedRateAt = checkedRateAt; assert.equal((await submit()).result.code, 'VALIDATION_ERROR');
  }
});
test('hotel mismatch rejected rather than replacing server identity', async () => {
  assert.equal((await submit({ ...request(), hotelId: '999' })).result.code, 'VALIDATION_ERROR');
});
test('rate mismatch rejected rather than replacing confirmed rate', async () => {
  assert.equal((await submit({ ...request(), rateKey: 'offline-search-rate' })).result.code, 'VALIDATION_ERROR');
});
test('wrong price and currency rejected; numeric exact cents accepted', async () => {
  for (const patch of [{ price: 100 }, { price: false }, { currency: 'USD' }]) assert.equal((await submit({ ...request(), ...patch })).result.code, 'VALIDATION_ERROR');
  assert.equal((await submit({ ...request(), price: '110.250', currency: 'EUR' })).result.code, 'BOOKING_DISABLED');
});
test('inconsistent server columns and offer snapshot fail closed', async () => {
  for (const patch of [{ provider_hotel_id: '999' }, { provider_offer_id: 'stale' }, { total_amount: '1' }, { currency: 'USD' }, { token: 'mismatch' }]) {
    row = { ...session(), ...patch }; assert.equal((await submit()).result.code, 'VALIDATION_ERROR');
  }
});
test('room board dates and occupancy expectations preserved from confirmation', async () => {
  const { intent } = (await submit()).result;
  assert.deepEqual(intent.room, { code: 'DBL', name: 'Double' }); assert.deepEqual(intent.board, { code: 'BB', name: 'Breakfast' });
  assert.deepEqual(intent.occupancy, { rooms: 1, adults: 2, children: 1 }); assert.equal(intent.expectedTravelers, 3);
  assert.equal(intent.checkIn, '2030-01-01'); assert.equal(intent.checkOut, '2030-01-03'); assert.equal(intent.nights, 2);
});
test('TEST environment retained and browser cannot select LIVE/provider', async () => {
  assert.equal((await submit()).result.intent.environment, 'test');
  for (const patch of [{ priceEnvironment: 'live' }, { provider: 'mock' }]) assert.equal((await submit({ ...request(), ...patch })).result.code, 'VALIDATION_ERROR');
  row.offer_snapshot.priceEnvironment = 'live'; assert.equal((await submit()).result.code, 'VALIDATION_ERROR');
});
test('changed provider price needs acceptance of the current checkout token', async () => {
  row.offer_snapshot.priceConfirmationRequired = true;
  assert.equal((await submit()).result.code, 'VALIDATION_ERROR');
  assert.equal((await submit({ ...request(), acceptedPriceToken: 'stale-token' })).result.code, 'VALIDATION_ERROR');
  assert.equal((await submit({ ...request(), acceptedPriceToken: token })).result.code, 'BOOKING_DISABLED');
});
test('traveler count type name room and child ages must match signed occupancy', async () => {
  const variants = [[], request().travelers.slice(1), request().travelers.map((value, index) => index === 2 ? { ...value, type: 'AD' } : value),
    request().travelers.map(value => ({ ...value, firstName: '' })), request().travelers.map(value => ({ ...value, roomId: 2 })),
    request().travelers.map(value => value.type === 'CH' ? { ...value, age: 9 } : value)];
  for (const travelers of variants) assert.equal((await submit({ ...request(), travelers })).result.code, 'VALIDATION_ERROR');
});
test('malformed stored stay dates occupancy and rate types rejected', async () => {
  for (const patch of [{ checkIn: '2030-02-30' }, { nights: 3 }, { occupancy: { rooms: 2, adults: 2, children: 1 } },
    { rateType: 'RECHECK' }, { recheckRequired: true }, { paymentType: 'AT_HOTEL' }, { packaging: true }, { boardCode: null }]) {
    row = session(); Object.assign(row.offer_snapshot, patch); assert.equal((await submit()).result.code, 'VALIDATION_ERROR');
  }
});
test('valid intent invokes existing safety guard but never adapter or transport', async t => {
  let guardCalls = 0; const original = service.assertBookingAllowed;
  t.mock.method(service, 'assertBookingAllowed', function() { guardCalls++; return original.call(this); });
  await submit(); assert.equal(guardCalls, 1); await assert.rejects(service.confirm({}), { code: 'HOTELBEDS_BOOKING_DISABLED' });
});
test('disabled response has no fake booking/payment/reference or traveler PII', async () => {
  const text = JSON.stringify((await submit()).result);
  assert.doesNotMatch(text, /CONFIRMED|BOOKED|PAID|bookingId|provider_booking_id|payment|AdultOne|firstName|lastName|12345678/);
  assert.equal((await submit()).result.success, false);
});
test('sequential and concurrent duplicates have same intent identifier and zero side effects', async () => {
  const results = await Promise.all([submit(), submit(), submit()]); const next = await submit();
  for (const value of [...results, next]) { assert.equal(value.result.intent.requestId, results[0].result.intent.requestId); assert.equal(value.result.code, 'BOOKING_DISABLED'); }
  assert.equal(reads, 4); // Independent read-only validations; no durable booking attempt.
});
test('DB and unexpected internal errors return safe retryable outcome without secrets', async t => {
  t.mock.method(pool, 'query', async () => { throw Error('private-sentinel Authorization password raw-provider'); });
  const { result } = await submit(); assert.equal(result.code, 'RETRYABLE_INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(result), /private-sentinel|Authorization|password|raw-provider|stack/);
});
test('malformed top-level bodies fail safely', async () => {
  for (const body of [null, [], 'text', {}, { ...request(), travelers: [null] }, { ...request(), price: {} }]) assert.equal((await submit(body)).result.code, 'VALIDATION_ERROR');
});
test('booking LIVE payment and production sales guards remain false', () => {
  assert.equal(config.environment, 'test'); assert.equal(config.bookingEnabled, false); assert.equal(config.liveBookingEnabled, false);
  const state = require('../services/productionGateService').state();
  assert.equal(state.productionSalesEnabled, false); assert.equal(state.realChargesEnabled, false); assert.equal(state.realRefundsEnabled, false);
  assert.equal(process.env.PAYMENTS_MODE, 'disabled'); assert.equal(process.env.EMAIL_ENABLED, 'false');
});
test('legacy Hotelbeds booking creation blocked before transaction with current flags', async () => {
  let status, body;
  await controller.createBooking({ body: { provider: 'hotelbeds', checkoutToken: token }, user: { id: 7 } },
    { status(value) { status = value; return this; }, json(value) { body = value; } });
  assert.equal(status, 503); assert.equal(body.code, 'BOOKING_DISABLED'); assert.equal(reads, 0);
});
test('booking intent route requires authentication and returns expected disabled semantics', async () => {
  // Exercise the registered route and real auth middleware without opening local sockets.
  const route = require('../routes/bookingRoutes').stack.find(layer => layer.route?.path === '/intent').route;
  assert.equal(route.methods.post, true); assert.equal(route.stack.length, 2);
  async function dispatch(auth) {
    let status, result, authenticated = false;
    const req = { body: request(), get: name => name === 'Authorization' ? auth : undefined };
    const res = { status(value) { status = value; return this; }, json(value) { result = value; return value; } };
    route.stack[0].handle(req, res, () => { authenticated = true; });
    if (authenticated) await route.stack[1].handle(req, res);
    return { status, result };
  }
  assert.equal((await dispatch()).status, 401); assert.equal(reads, 0);
  const auth = jwt.sign({ id: 7, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '1m' });
  const response = await dispatch(`Bearer ${auth}`);
  assert.equal(response.status, 503); assert.equal(response.result.code, 'BOOKING_DISABLED');
});
