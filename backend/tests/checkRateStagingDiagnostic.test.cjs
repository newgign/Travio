const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', HOTELBEDS_ENV: 'test', HOTELBEDS_ENABLED: 'true', HOTELBEDS_BOOKING_ENABLED: 'false',
  HOTELBEDS_LIVE_BOOKING_ENABLED: 'false', PAYMENTS_MODE: 'disabled', EMAIL_ENABLED: 'false', OFFER_TOKEN_SECRET: 'offline-6i-synthetic-signing-secret' });
const provider = require('../sources/hotelbeds');
const transport = require('../integrations/hotelbeds/client');
const { HotelbedsClient } = transport;
const controller = require('../controllers/checkoutController');
const tokens = require('../services/offerTokenService');
const offers = require('../services/offerService');
const sessions = require('../services/checkoutSessionService');
const diagnostic = require('../services/checkRateDiagnostic');
const logger = require('../utils/logger');
const requestId = '12345678-1234-4123-8123-123456789abc';
const key = ' synthetic|20300101|DBL/+%2F=Ω|NOR|BB|2~2~5~9 ';
const filters = () => ({ checkIn: '2030-01-01', checkOut: '2030-01-03', nights: 2, people: 2, adults: 2, children: 2, childrenAges: '5,9', hotelCodes: [3424] });
const rate = (rateKey = key) => ({ rateKey, rateType: 'RECHECK', net: '100.00', boardCode: 'BB', boardName: 'Breakfast', rateClass: 'NOR',
  paymentType: 'AT_WEB', packaging: false, rooms: 1, adults: 2, children: 2, childrenAges: '5,9' });
const hotel = (rateKey = key) => ({ code: 3424, name: 'Synthetic Hotel', currency: 'EUR', rooms: [{ code: 'DBL', name: 'Double', rates: [rate(rateKey)] }] });
const selected = (rateKey = key) => offers.generateOffer(provider.normalizeHotel(hotel(rateKey), filters()), filters());
const response = () => { const value = hotel(); value.rooms[0].rates[0].rateType = 'BOOKABLE'; return { hotel: value }; };
let events, captured, checkedKey, http;
beforeEach(t => {
  events = []; captured = null; checkedKey = null;
  t.mock.method(logger, 'info', (message, meta) => { if (message === 'checkRateDiagnostic') events.push(meta); });
  t.mock.method(logger, 'warn', () => {});
  t.mock.method(require('../db'), 'query', () => assert.fail('Real DB forbidden'));
  t.mock.method(require('../db'), 'connect', () => assert.fail('Real DB connection forbidden'));
  t.mock.method(sessions, 'create', async value => { captured = value; return { token: 'synthetic-session', expiresAt: '2030-01-01' }; });
  for (const method of ['createBooking', 'cancelBooking']) t.mock.method(transport, method, () => assert.fail('Booking forbidden'));
  t.mock.method(require('../services/paymentGatewayService'), 'createIntent', () => assert.fail('Payment forbidden'));
  t.mock.method(require('../services/hotelbedsTestAccess'), 'begin', async () => ({ synthetic: true }));
  t.mock.method(require('../services/hotelbedsTestAccess'), 'finish', async () => {});
  http = new HotelbedsClient({ ...transport.config, enabled: true, environment: 'test', configurationErrors: [], apiKey: 'synthetic-api-key', secret: 'synthetic-api-secret', requestIntervalMs: 0, maxRetries: 0 });
  t.mock.method(http, 'getBookingAgent', () => undefined);
  t.mock.method(http.bookingHttp, 'request', async config => { assert.equal(config.url, '/hotel-api/1.0/checkrates'); checkedKey = config.data.rooms[0].rateKey; return { status: 200, data: response() }; });
  t.mock.method(transport, 'checkRates', value => http.checkRates(value));
});
async function checkout(offer = selected(), patch = {}, id = requestId) {
  let body, status = 200;
  await controller.getCheckout({ requestId: id, body: { provider: 'hotelbeds', hotelId: '3424', offerToken: tokens.sign(offer), ...patch } },
    { status(value) { status = value; return this; }, json(value) { body = value; } }, error => { throw error; });
  return { body, status };
}
const outcome = () => events.findLast(value => value.stage === 'NORMALIZED_OUTCOME');
function wireError(t, status, code) { t.mock.method(http.bookingHttp, 'request', async () => { throw { code, response: status ? { status, data: { error: { code: 'private-provider-code', message: 'Synthetic Guest DOB email signature private' } } } : undefined }; }); }

test('Availability key remains exact through normalization and generated selected offer', () => { const normalized = provider.normalizeHotel(hotel(), filters()); assert.equal(normalized.rateKey, key); assert.equal(selected().rateKey, key); });
test('signed trusted token and JSON browser transport preserve exact key bytes', () => { const value = selected(); const serialized = JSON.parse(JSON.stringify({ ...value, offerToken: tokens.sign(value) })); assert.equal(tokens.verify(serialized.offerToken).rateKey, key); assert.equal(diagnostic.fingerprint(serialized.rateKey), diagnostic.fingerprint(key)); });
test('trusted key reaches real CheckRate builder unchanged and session receives checked key', async () => { await checkout(); assert.equal(checkedKey, key); assert.equal(captured.offer.rateKey, key); });
test('special characters whitespace and encoding markers are never transformed', async () => { const value = selected(' Aa/+%2F=中文|~_:- '); const result = await checkout(value); assert.equal(checkedKey, value.rateKey); assert.equal(result.body.checkRateStatus, 'CONFIRMED'); });
test('long realistic synthetic key remains exact without log truncation corruption', async () => { const long = '20300101|20300103|W|3424|DBL|BB|NOR|' + 'Synthetic/+%2F='.repeat(100); await checkout(selected(long)); assert.equal(checkedKey, long); const prepared = events.find(value => value.stage === 'PROVIDER_REQUEST_PREPARED'); assert.equal(prepared.rateKeyLength, Buffer.byteLength(long)); assert.doesNotMatch(JSON.stringify(events), /Synthetic\/\+%2F/); });
test('trusted decoded and outgoing fingerprints are stable', async () => { await checkout(); const stages = events.filter(value => ['TRUSTED_OFFER_DECODED', 'PROVIDER_REQUEST_PREPARED'].includes(value.stage)); assert.equal(stages.length, 2); assert.equal(stages[0].rateKeyFingerprint, stages[1].rateKeyFingerprint); assert.equal(stages[0].rateKeyFingerprint.length, 16); });
test('adults children and child ages preserved from Availability request to session', async () => { const payload = provider.buildAvailabilityRequest(filters()); assert.deepEqual(payload.occupancies[0], { rooms: 1, adults: 2, children: 2, paxes: [{ type: 'CH', age: 5 }, { type: 'CH', age: 9 }] }); await checkout(); assert.deepEqual(captured.offer.occupancy, { rooms: 1, adults: 2, children: 2 }); assert.equal(captured.offer.childrenAges, '5,9'); assert.equal(captured.filters.people, 2); });
test('browser occupancy and child age overrides ignored in favor of signed selection', async () => { await checkout(selected(), { people: 99, filters: { adults: 99, children: 0, childrenAges: '17,17' }, rateKey: 'browser-forged', price: 1 }); assert.equal(checkedKey, key); assert.equal(captured.filters.children, 2); assert.equal(captured.filters.childrenAges, '5,9'); assert.equal(captured.offer.price, 100); });
test('missing trusted ages cannot be filled by browser filters', async () => { const value = selected(); delete value.childrenAges; const result = await checkout(value, { filters: { childrenAges: '5,9' } }); assert.equal(result.body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(checkedKey, null); assert.equal(captured, null); });
test('blank or fractional child age cannot default to zero or be silently dropped', () => { for (const childrenAges of ['5,', ',9', '5,9.5', '5,18']) assert.throws(() => provider.buildAvailabilityRequest({ ...filters(), childrenAges }), { code: 'HOTELBEDS_CHILD_AGES_INVALID' }); });
test('outgoing envelope contains only rooms and exact trusted rateKey not booking data', async t => { let sent; t.mock.method(http, 'request', async value => { sent = value; return response(); }); await http.checkRates(key); assert.deepEqual(sent, { channel: 'booking', method: 'POST', url: '/hotel-api/1.0/checkrates', data: { rooms: [{ rateKey: key }] } }); assert.doesNotMatch(JSON.stringify(sent), /holder|paxes|price|currency|signature|Api-key/); });
test('transport applies credentials only at request layer and retains TEST endpoint', async t => { t.mock.method(http.bookingHttp, 'request', async value => { assert.equal(value.baseURL, 'https://api-mtls.test.hotelbeds.com'); assert.equal(value.headers['Api-key'], 'synthetic-api-key'); assert.match(value.headers['X-Signature'], /^[a-f0-9]{64}$/); return { status: 200, data: response() }; }); await checkout(); assert.equal(outcome().environment, 'test'); });
test('valid empty provider rate list alone supports UNAVAILABLE', async t => { const value = response(); value.hotel.rooms[0].rates = []; t.mock.method(http.bookingHttp, 'request', async () => ({ status: 200, data: value })); const result = await checkout(); assert.equal(result.body.checkRateStatus, 'UNAVAILABLE'); assert.equal(outcome().reason, 'RATE_UNAVAILABLE'); });
test('explicit existing normalized RATE_NOT_AVAILABLE stays unavailable', async t => { t.mock.method(transport, 'checkRates', async () => { throw Object.assign(Error('private'), { code: 'RATE_NOT_AVAILABLE' }); }); assert.equal((await checkout()).body.checkRateStatus, 'UNAVAILABLE'); });
test('timeout is technical not unavailable', async t => { wireError(t, null, 'ECONNABORTED'); assert.equal((await checkout()).body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().reason, 'PROVIDER_TIMEOUT'); });
test('network failure is technical not unavailable', async t => { wireError(t, null, 'ECONNRESET'); assert.equal((await checkout()).body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().reason, 'NETWORK_ERROR'); });
test('HTTP 429 is technical and safely diagnosed', async t => { wireError(t, 429); assert.equal((await checkout()).body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().httpStatus, 429); assert.equal(outcome().reason, 'PROVIDER_RATE_LIMITED'); });
test('provider 5xx is technical not unavailable', async t => { wireError(t, 503); assert.equal((await checkout()).body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().reason, 'PROVIDER_SERVER_ERROR'); });
test('401 and 403 auth failures remain technical', async t => { for (const status of [401, 403]) { wireError(t, status); assert.equal((await checkout()).body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().reason, 'PROVIDER_AUTH_ERROR'); } });
test('unknown HTTP 400 and 422 must not manufacture RATE_NOT_AVAILABLE', async t => { for (const status of [400, 422]) { wireError(t, status); const result = await checkout(); assert.equal(result.body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().reason, 'PROVIDER_REJECTED_REQUEST'); assert.equal(outcome().httpStatus, status); } });
test('HTTP 404 endpoint rejection is not evidence of an expired rate', async t => { wireError(t, 404); assert.equal((await checkout()).body.checkRateStatus, 'RETRYABLE_ERROR'); });
test('malformed provider response and missing signing configuration are technical', async t => {
  t.mock.method(http.bookingHttp, 'request', async () => ({ status: 200, data: {} }));
  assert.equal((await checkout()).body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().reason, 'MALFORMED_PROVIDER_RESPONSE');
  const signed = tokens.sign(selected());
  t.mock.method(tokens, 'getSecret', () => { throw Object.assign(Error('Synthetic configuration missing'), { code: 'OFFER_TOKEN_SECRET_MISSING' }); });
  let body;
  await controller.getCheckout({ requestId, body: { provider: 'hotelbeds', hotelId: '3424', offerToken: signed } },
    { status() { return this; }, json(value) { body = value; } }, error => { throw error; });
  assert.equal(body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().reason, 'INTERNAL_ERROR');
});
test('provider children missing required response ages is malformed not unavailable', async t => { const value = response(); delete value.hotel.rooms[0].rates[0].childrenAges; t.mock.method(http.bookingHttp, 'request', async () => ({ status: 200, data: value })); assert.equal((await checkout()).body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().reason, 'MALFORMED_PROVIDER_RESPONSE'); });
test('unknown 2xx error envelope preserves actual HTTP observation without raw body', async t => { t.mock.method(http.bookingHttp, 'request', async () => ({ status: 200, data: { error: { code: 'unrecognized-private-code', message: 'private' } } })); const result = await checkout(); assert.equal(result.body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().httpStatus, 200); assert.equal(outcome().reason, 'UNKNOWN_PROVIDER_ERROR'); });
test('unknown internal exception is not silently unavailable', async t => { t.mock.method(http.bookingHttp, 'request', async () => { throw Error('private SQL stack'); }); assert.equal((await checkout()).body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(outcome().reason, 'INTERNAL_ERROR'); });
test('request ID preserved across received decoded prepared response and outcome stages', async () => { const result = await checkout(); assert.equal(result.body.requestId, requestId); for (const stage of ['REQUEST_RECEIVED', 'TRUSTED_OFFER_DECODED', 'PROVIDER_REQUEST_PREPARED', 'PROVIDER_RESPONSE_RECEIVED', 'NORMALIZED_OUTCOME']) assert.ok(events.some(value => value.requestId === requestId && value.stage === stage)); });
test('diagnostics exclude raw key credentials JWT and traveller/contact PII', async () => { await checkout({ ...selected(), firstName: 'SyntheticPrivateGuest', birthDate: '1999-01-01', email: 'private@example.invalid', phone: 'private-phone', apiKey: 'private-key' }); const text = JSON.stringify(events); assert.ok(!text.includes(key)); assert.doesNotMatch(text, /synthetic-api-key|synthetic-api-secret|SyntheticPrivateGuest|1999-01-01|private@example|private-phone|private-key|eyJ|Authorization|X-Signature/); assert.ok(!logger.format('info', 'checkRateDiagnostic', events[2]).includes(key)); });
test('normalized CONFIRMED PRICE_CHANGED and UNAVAILABLE outcomes are recorded safely', async t => { assert.equal((await checkout()).body.checkRateStatus, 'CONFIRMED'); assert.equal(outcome().outcome, 'CONFIRMED'); const value = response(); value.hotel.rooms[0].rates[0].net = '120'; t.mock.method(http.bookingHttp, 'request', async () => ({ status: 200, data: value })); assert.equal((await checkout()).body.checkRateStatus, 'PRICE_CHANGED'); assert.equal(outcome().outcome, 'PRICE_CHANGED'); });
test('confirmed provider key rotation is explicit and session uses returned same-product key', async t => { const value = response(); value.hotel.rooms[0].rates[0].rateKey = 'synthetic-refreshed-key'; t.mock.method(http.bookingHttp, 'request', async options => { checkedKey = options.data.rooms[0].rateKey; return { status: 200, data: value }; }); await checkout(); assert.equal(checkedKey, key); assert.equal(captured.offer.rateKey, 'synthetic-refreshed-key'); assert.equal(outcome().returnedRateKeyFingerprint, diagnostic.fingerprint('synthetic-refreshed-key')); });
test('untrusted correlation text is replaced and cannot leak into diagnostics', async () => { const result = await checkout(selected(), {}, 'private@example.invalid'); assert.match(result.body.requestId, /^[a-f0-9-]{36}$/); assert.doesNotMatch(JSON.stringify(events), /private@example/); });
test('concurrent requests retain independent correlation and share only one provider call', async t => { let release, calls = 0; const wait = new Promise(resolve => { release = resolve; }); t.mock.method(http.bookingHttp, 'request', async () => { calls++; await wait; return { status: 200, data: response() }; }); const value = selected(); const first = checkout(value), secondId = '22345678-1234-4123-8123-123456789abc', second = checkout(value, {}, secondId); await new Promise(resolve => setImmediate(resolve)); release(); const results = await Promise.all([first, second]); assert.equal(calls, 1); assert.equal(results[1].body.requestId, secondId); assert.ok(events.some(value => value.stage === 'PROVIDER_REQUEST_SHARED' && value.sharedRequestId === requestId)); });
test('inconsistent trusted occupancy fails before transport while TEST booking/payment stay off', async () => { const value = selected(); value.occupancy.adults = 3; assert.equal((await checkout(value)).body.checkRateStatus, 'RETRYABLE_ERROR'); assert.equal(checkedKey, null); assert.equal(transport.config.environment, 'test'); assert.equal(transport.config.bookingEnabled, false); assert.equal(process.env.PAYMENTS_MODE, 'disabled'); });
