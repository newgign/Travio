const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', HOTELBEDS_ENV: 'test', HOTELBEDS_ENABLED: 'true',
  HOTELBEDS_BOOKING_ENABLED: 'false', HOTELBEDS_LIVE_BOOKING_ENABLED: 'false', PAYMENTS_MODE: 'disabled',
  PAYMENTS_PROVIDER: 'none', PRODUCTION_SALES_ENABLED: 'false', REAL_CHARGES_ENABLED: 'false',
  REAL_REFUNDS_ENABLED: 'false', EMAIL_ENABLED: 'false', JWT_SECRET: 'offline-6j-synthetic-jwt-secret' });
const pool = require('../db');
const service = require('../services/paymentGatewayService');
const controller = require('../controllers/paymentController');
const booking = require('../services/hotelbedsBookingService');
const sessions = require('../services/checkoutSessionService');
const token = '12345678-1234-4123-8123-123456789abc';
const guests = () => [{ type: 'AD', firstName: 'SyntheticPrivate', lastName: 'AdultOne' },
  { type: 'AD', firstName: 'SyntheticPrivate', lastName: 'AdultTwo', birthDate: '2000-02-29' }];
const fixture = () => ({ token, provider: 'hotelbeds', provider_hotel_id: '7654', provider_offer_id: 'synthetic-private-rate',
  rate_type: 'BOOKABLE', currency: 'EUR', total_amount: '2075.98', expires_at: new Date(Date.now() + 600000).toISOString(), used_at: null,
  offer_snapshot: { provider: 'hotelbeds', providerHotelId: '7654', offerId: 'synthetic-private-rate', rateKey: 'synthetic-private-rate',
    rateType: 'BOOKABLE', recheckRequired: false, checkRatePerformed: true, checkedRateAt: new Date(Date.now() - 1000).toISOString(),
    priceEnvironment: 'test', price: 2075.98, currency: 'EUR', roomCode: 'DBL.SU', boardCode: 'BB', paymentType: 'AT_WEB',
    packaging: false, checkIn: '2030-01-01', checkOut: '2030-01-08', nights: 7,
    occupancy: { rooms: 1, adults: 2, children: 0 }, adults: 2, children: 0, childrenAges: [] } });
let row, reads, providerCalls;
beforeEach(t => {
  row = fixture(); reads = 0; providerCalls = 0;
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(sql, 'SELECT * FROM checkout_sessions WHERE token = $1'); assert.deepEqual(params, [token]);
    reads++; return { rows: row ? [row] : [] };
  });
  t.mock.method(pool, 'connect', () => assert.fail('No DB connections or mutations'));
  t.mock.method(sessions, 'create', () => assert.fail('No new session'));
  t.mock.method(sessions, 'markUsed', () => assert.fail('No session consumption'));
  const forbidden = () => { providerCalls++; assert.fail('Provider operations forbidden'); };
  for (const method of ['availability', 'checkRates', 'createBooking', 'cancelBooking'])
    t.mock.method(require('../integrations/hotelbeds/client'), method, forbidden);
  t.mock.method(require('../sources/hotelbeds'), 'createBooking', forbidden);
  t.mock.method(booking, 'confirm', forbidden);
  t.mock.method(service, 'createIntent', forbidden);
  t.mock.method(require('../controllers/refundController'), 'completeSandboxRefund', forbidden);
  for (const method of ['info', 'warn', 'error']) t.mock.method(require('../utils/logger'), method, () => assert.fail('No intent/PII logging'));
});
const payload = extra => ({ checkoutToken: token, travelers: guests(), review: true, ...extra });
async function submit(body = payload()) {
  let result, status;
  await controller.createCheckoutPaymentIntent({ body, user: { id: 1, role: 'user' } },
    { status(value) { status = value; return this; }, json(value) { result = value; } });
  assert.equal(providerCalls, 0);
  return { status, body: result };
}

test('validated booking intent and server REVIEW_READY produce safe payment preview', async () => {
  const result = await submit(); assert.equal(result.status, 503);
  assert.equal(result.body.intent.state, 'PAYMENT_INTENT_READY'); assert.equal(result.body.intent.reviewState, 'REVIEW_READY');
  assert.equal(result.body.intent.provider, 'hotelbeds'); assert.equal(result.body.intent.hotelId, '7654');
  assert.equal(result.body.intent.environment, 'test'); assert.equal(result.body.intent.mode, 'disabled');
  assert.equal(result.body.intent.paymentProvider, 'none'); assert.equal(reads, 1);
});
test('explicit review prerequisite required; browser ready state cannot substitute', async () => {
  for (const review of [undefined, false, 'true', 1]) {
    const request = payload(); if (review === undefined) delete request.review; else request.review = review;
    assert.equal((await submit(request)).body.code, 'PAYMENT_PREREQUISITE_MISSING');
  }
  assert.equal(reads, 0);
  assert.equal((await submit(payload({ state: 'REVIEW_READY' }))).body.code, 'PAYMENT_VALIDATION_ERROR');
});
test('server booking intent must be INTENT_READY', async t => {
  t.mock.method(booking, 'prepareIntent', () => ({ state: 'VALIDATION_FAILED' }));
  t.mock.method(booking, 'reviewPreview', () => ({ state: 'REVIEW_READY' }));
  assert.equal((await submit()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
});
test('server review must actually be REVIEW_READY', async t => {
  t.mock.method(booking, 'reviewPreview', () => ({ state: 'REVIEW_NOT_READY' }));
  assert.equal((await submit()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
});
test('confirmed CheckRate required, search snapshot is insufficient', async () => {
  row.offer_snapshot.checkRatePerformed = false;
  const result = await submit(); assert.equal(result.body.code, 'PAYMENT_PREREQUISITE_MISSING'); assert.equal(result.body.intent, undefined);
});
test('stale CheckRate rejected even if session has not expired', async () => {
  row.offer_snapshot.checkedRateAt = new Date(Date.now() - (sessions.getTtlMinutes() + 1) * 60000).toISOString();
  assert.equal((await submit()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
});
test('expired or used checkout sessions cannot produce payment intent', async () => {
  row.expires_at = new Date(Date.now() - 1000).toISOString(); assert.equal((await submit()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
  row = fixture(); row.used_at = new Date().toISOString(); assert.equal((await submit()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
});
test('missing or malformed session token cannot select arbitrary booking', async () => {
  for (const checkoutToken of [undefined, '', 'arbitrary', 123, {}]) assert.equal((await submit(payload({ checkoutToken }))).body.code, 'PAYMENT_PREREQUISITE_MISSING');
  assert.equal(reads, 0); row = null; assert.equal((await submit()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
});
test('invalid travellers rejected before preview', async () => {
  const travelers = guests(); travelers[0].firstName = ' ';
  assert.equal((await submit(payload({ travelers }))).body.code, 'PAYMENT_VALIDATION_ERROR');
});
test('occupancy and child-age requirements reuse booking validator', async () => {
  assert.equal((await submit(payload({ travelers: guests().slice(1) }))).body.code, 'PAYMENT_VALIDATION_ERROR');
  const child = { type: 'CH', firstName: 'Synthetic', lastName: 'Child', age: 9 };
  Object.assign(row.offer_snapshot, { children: 1, childrenAges: '8', occupancy: { rooms: 1, adults: 2, children: 1 } });
  assert.equal((await submit(payload({ travelers: [...guests(), child] }))).body.code, 'PAYMENT_VALIDATION_ERROR');
});
test('trusted confirmed decimal amount preserved exactly', async () => {
  const value = (await submit()).body.intent;
  assert.equal(value.amount, 2075.98); assert.equal(Math.round(value.amount * 100), 207598);
});
test('confirmed currency used without conversion or fallback', async () => {
  assert.equal((await submit()).body.intent.currency, 'EUR');
  row.currency = row.offer_snapshot.currency = 'USD'; assert.equal((await submit()).body.intent.currency, 'USD');
});
test('client price and stale search price cannot change payment amount', async () => {
  for (const price of [1, 621.32, '2075.97']) {
    const result = await submit(payload({ price })); assert.equal(result.body.code, 'PAYMENT_VALIDATION_ERROR'); assert.equal(result.body.intent, undefined);
  }
  assert.equal((await submit()).body.intent.amount, 2075.98);
});
test('client currency substitution rejected', async () => {
  assert.equal((await submit(payload({ currency: 'USD' }))).body.code, 'PAYMENT_VALIDATION_ERROR');
});
test('money validation uses cents rather than formatted string equality', async () => {
  assert.equal((await submit(payload({ price: '2075.9800', currency: 'EUR' }))).body.intent.amount, 2075.98);
  row.total_amount = '2075.97'; assert.equal((await submit()).body.code, 'PAYMENT_VALIDATION_ERROR');
});
test('changed confirmed price requires token-bound acceptance', async () => {
  row.offer_snapshot.priceConfirmationRequired = true;
  assert.equal((await submit()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
  assert.equal((await submit(payload({ acceptedPriceToken: token }))).body.intent.amount, 2075.98);
});
test('client provider environment and selected product cannot override session', async () => {
  for (const patch of [{ provider: 'mock' }, { hotelId: '999' }, { rateKey: 'forged' }, { priceEnvironment: 'live' }])
    assert.equal((await submit(payload(patch))).body.code, 'PAYMENT_VALIDATION_ERROR');
  row.offer_snapshot.priceEnvironment = 'live'; assert.equal((await submit()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
});
test('final boundary truthful: payment not started and booking disabled', async () => {
  const value = (await submit()).body;
  assert.equal(value.success, false); assert.equal(value.code, 'PAYMENTS_DISABLED'); assert.equal(value.state, 'PAYMENTS_DISABLED');
  assert.equal(value.paymentState, 'PAYMENT_NOT_STARTED'); assert.equal(value.providerState, 'PROVIDER_NOT_CALLED');
  assert.equal(value.bookingState, 'BOOKING_DISABLED'); assert.equal(value.bookingAvailable, false); assert.equal(value.paymentAvailable, false);
});
test('provider payment booking and refund functions remain unreachable', async () => {
  await submit(); assert.equal(providerCalls, 0);
});
test('concurrent and repeated submissions have no writes and reuse booking correlation', async () => {
  const values = await Promise.all([submit(), submit(), submit()]); const retry = await submit();
  for (const value of [...values, retry]) assert.deepEqual(value.body, values[0].body);
  assert.match(values[0].body.intent.requestId, /^[a-f0-9]{32}$/); assert.equal(reads, 4);
});
test('malformed input rejected safely', async () => {
  for (const body of [null, undefined, [], 'text', 1, {}]) assert.ok(['PAYMENT_VALIDATION_ERROR', 'PAYMENT_PREREQUISITE_MISSING'].includes((await submit(body === undefined ? null : body)).body.code));
  for (const travelers of [null, {}, [null]]) assert.equal((await submit(payload({ travelers }))).body.code, 'PAYMENT_VALIDATION_ERROR');
});
test('card credentials references and client payment states are not accepted', async () => {
  for (const field of ['cardNumber', 'cvv', 'cvc', 'expiry', 'cardholder', 'threeDS', 'bankAccount', 'paymentToken', 'bookingReference', 'bookingId', 'amount', 'paymentStatus', 'paymentProvider', 'mode']) {
    assert.equal((await submit(payload({ [field]: 'synthetic-untrusted' }))).body.code, 'PAYMENT_VALIDATION_ERROR');
  }
});
test('preview excludes PII keys tokens secrets and transaction references', async () => {
  Object.assign(row.offer_snapshot, { secret: 'private-secret', rawPayload: 'private-body', cardNumber: 'synthetic-card' });
  const value = JSON.stringify((await submit()).body);
  assert.doesNotMatch(value, /SyntheticPrivate|AdultOne|birthDate|firstName|2000-02-29|synthetic-private-rate|checkoutToken|12345678|private-secret|private-body|cardNumber|transactionId|bookingReference|paymentId|externalId/);
});
test('no fake paid authorized captured refunded or successful state', async () => {
  assert.doesNotMatch(JSON.stringify((await submit()).body), /PAID|AUTHORIZED|CAPTURED|REFUNDED|SUCCESS|sbx_/);
});
test('technical errors remain retryable with no decline or raw error', async t => {
  t.mock.method(pool, 'query', async () => { throw Error('SyntheticPrivate Authorization JWT database-url stack'); });
  const result = await submit(); assert.equal(result.status, 503); assert.equal(result.body.code, 'INTERNAL_RETRYABLE_ERROR');
  assert.doesNotMatch(JSON.stringify(result.body), /SyntheticPrivate|Authorization|JWT|database-url|stack|declined|card rejected|payment failed/);
});
test('existing production gate and safe defaults retained; requested flags cannot activate this boundary', async t => {
  const state = service.readiness(); assert.equal(state.mode, 'disabled'); assert.equal(state.provider, 'none');
  assert.equal(state.realChargesEnabled, false); assert.equal(state.productionSalesEnabled, false);
  assert.equal(require('../config/providers').hotelbeds.bookingEnabled, false);
  for (const [name, value] of Object.entries({ PAYMENTS_MODE: 'sandbox', PAYMENTS_PROVIDER: 'future', REAL_CHARGES_ENABLED: 'true',
    REAL_REFUNDS_ENABLED: 'true', PRODUCTION_SALES_ENABLED: 'true' })) {
    const previous = process.env[name]; t.after(() => { process.env[name] = previous; }); process.env[name] = value;
  }
  assert.equal(require('../services/productionGateService').state().realRefundsEnabled, false);
  const result = await submit(); assert.equal(result.body.code, 'PAYMENTS_DISABLED'); assert.equal(result.body.paymentAvailable, false);
  assert.equal(service.readiness().realChargesEnabled, false); assert.equal(service.readiness().productionSalesEnabled, false);
});
test('payment checkout route requires existing authentication and has no browser activation', async t => {
  const express = require('express'); const app = express(); app.use(express.json()); app.use('/payments', require('../routes/paymentRoutes'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/payments/intent`;
  const send = authorization => new Promise((resolve, reject) => {
    const request = require('node:http').request(url, { method: 'POST', headers: { 'Content-Type': 'application/json',
      Connection: 'close', ...(authorization ? { Authorization: authorization } : {}) } }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
      response.on('error', reject);
    });
    request.on('error', reject); request.end(JSON.stringify(payload()));
  });
  const unauthorized = await send();
  assert.equal(unauthorized.status, 401); assert.equal(reads, 0);
  const jwt = require('jsonwebtoken').sign({ id: 1, role: 'user' }, process.env.JWT_SECRET);
  const response = await send(`Bearer ${jwt}`);
  assert.equal(response.status, 503); assert.equal(response.body.code, 'PAYMENTS_DISABLED'); assert.equal(providerCalls, 0);
});
