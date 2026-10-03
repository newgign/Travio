const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', HOTELBEDS_ENV: 'test', HOTELBEDS_ENABLED: 'true', HOTELBEDS_BOOKING_ENABLED: 'false',
  HOTELBEDS_LIVE_BOOKING_ENABLED: 'false', PRODUCTION_SALES_ENABLED: 'false', REAL_CHARGES_ENABLED: 'false', REAL_REFUNDS_ENABLED: 'false', PAYMENTS_MODE: 'disabled', EMAIL_ENABLED: 'false' });
const pool = require('../db');
const service = require('../services/hotelbedsBookingService');
const controller = require('../controllers/bookingController');
const token = '12345678-1234-4123-8123-123456789abc';
const guests = () => [{ type: 'AD', firstName: ' Synthetic ', lastName: ' AdultOne ' }, { type: 'AD', firstName: 'Synthetic', lastName: 'AdultTwo' },
  { type: 'CH', firstName: 'Synthetic', lastName: 'Child', age: 8 }];
const fixture = () => ({ token, provider: 'hotelbeds', provider_hotel_id: '3424', provider_offer_id: 'synthetic-rate', rate_type: 'BOOKABLE', currency: 'EUR', total_amount: 110,
  expires_at: new Date(Date.now() + 600000).toISOString(), used_at: null,
  offer_snapshot: { provider: 'hotelbeds', providerHotelId: '3424', offerId: 'synthetic-rate', rateKey: 'synthetic-rate', rateType: 'BOOKABLE', recheckRequired: false,
    checkRatePerformed: true, checkedRateAt: new Date(Date.now() - 1000).toISOString(), priceEnvironment: 'test', price: 110, currency: 'EUR',
    roomCode: 'DBL', boardCode: 'BB', paymentType: 'AT_WEB', packaging: false, checkIn: '2030-01-01', checkOut: '2030-01-03', nights: 2,
    occupancy: { rooms: 1, adults: 2, children: 1 }, adults: 2, children: 1, childrenAges: '8' } });
let row;
beforeEach(t => {
  row = fixture(); Object.assign(row.offer_snapshot, { name: 'Synthetic Confirmed Hotel', roomName: 'Confirmed Double', boardName: 'Confirmed Breakfast' });
  t.mock.method(pool, 'query', async (sql, params) => { assert.equal(sql, 'SELECT * FROM checkout_sessions WHERE token = $1'); assert.deepEqual(params, [token]); return { rows: [row] }; });
  t.mock.method(pool, 'connect', () => assert.fail('DB mutation forbidden'));
  for (const name of ['availability', 'checkRates', 'createBooking', 'cancelBooking']) t.mock.method(require('../integrations/hotelbeds/client'), name, () => assert.fail('Provider forbidden'));
  t.mock.method(require('../sources/hotelbeds'), 'createBooking', () => assert.fail('Booking forbidden'));
  t.mock.method(require('../services/paymentGatewayService'), 'createIntent', () => assert.fail('Payment forbidden'));
  t.mock.method(require('../services/checkoutSessionService'), 'markUsed', () => assert.fail('Session consumption forbidden'));
});
async function submit(travelers = guests(), extra = {}) {
  let status, body;
  await controller.createBookingIntent({ body: { checkoutToken: token, travelers, review: true, ...extra } }, { status(value) { status = value; return this; }, json(value) { body = value; } });
  return { status, body };
}

test('valid confirmed intent becomes REVIEW_READY inside disabled response', async () => { const result = await submit(); assert.equal(result.status, 503); assert.equal(result.body.code, 'BOOKING_DISABLED'); assert.equal(result.body.review.state, 'REVIEW_READY'); });
test('CheckRate confirmation required before review', async () => { row.offer_snapshot.checkRatePerformed = false; const result = await submit(); assert.equal(result.body.validationKind, 'CHECKRATE_REQUIRED'); assert.equal(result.body.review, undefined); });
test('stale search snapshot cannot become ready review', async () => { row.offer_snapshot.rateType = 'RECHECK'; row.offer_snapshot.recheckRequired = true; assert.equal((await submit()).body.code, 'VALIDATION_ERROR'); });
test('missing confirmed offer fails safely', async () => { row.offer_snapshot = null; const result = await submit(); assert.equal(result.body.review, undefined); assert.equal(result.body.code, 'VALIDATION_ERROR'); });
test('expired and used checkout cannot be reviewed', async () => { row.expires_at = new Date(Date.now() - 1).toISOString(); assert.equal((await submit()).body.validationKind, 'CHECKRATE_REQUIRED'); row = fixture(); row.used_at = new Date().toISOString(); assert.equal((await submit()).body.review, undefined); });
test('invalid traveller state cannot become ready review', async () => { const values = guests(); values[0].firstName = ' '; const result = await submit(values); assert.equal(result.body.validationKind, 'TRAVELLER_VALIDATION_ERROR'); assert.equal(result.body.review, undefined); });
test('occupancy mismatch prevents preview', async () => { const result = await submit(guests().slice(1)); assert.equal(result.body.validationKind, 'OCCUPANCY_MISMATCH'); assert.equal(result.body.review, undefined); });
test('confirmed price wins and browser price tampering rejected', async () => { assert.equal((await submit()).body.review.offer.price, 110); assert.equal((await submit(guests(), { price: 1 })).body.code, 'VALIDATION_ERROR'); });
test('confirmed currency preserved without conversion', async () => { assert.equal((await submit()).body.review.offer.currency, 'EUR'); assert.equal((await submit(guests(), { currency: 'USD' })).body.review, undefined); });
test('confirmed room and board descriptions preserved', async () => { const model = (await submit()).body.review; assert.equal(model.offer.room, 'Confirmed Double'); assert.equal(model.offer.board, 'Confirmed Breakfast'); });
test('confirmed stay dates and nights preserved', async () => assert.deepEqual((await submit()).body.review.stay, { checkIn: '2030-01-01', checkOut: '2030-01-03', nights: 2 }));
test('confirmed hotel label preserved and arbitrary browser hotel rejected', async () => { assert.equal((await submit()).body.review.hotel, 'Synthetic Confirmed Hotel'); assert.equal((await submit(guests(), { hotel: 'Browser hotel' })).body.review, undefined); });
test('normalized international names preserved in explicit preview', async () => { const values = guests(); values[0].firstName = ' 李–Әлия '; const model = (await submit(values)).body.review; assert.equal(model.travelers[0].firstName, '李–Әлия'); assert.equal(model.travelers[0].lastName, 'AdultOne'); });
test('DOB is never manufactured', async () => assert.ok((await submit()).body.review.travelers.every(value => !Object.hasOwn(value, 'birthDate'))));
test('explicit optional DOB retained only when valid', async () => { const values = guests(); values[0].birthDate = '2000-02-29'; assert.equal((await submit(values)).body.review.travelers[0].birthDate, '2000-02-29'); values[0].birthDate = '2999-01-01'; assert.equal((await submit(values)).body.review, undefined); });
test('safe preview excludes tokens rateKey provider IDs secrets and raw payload', async () => { Object.assign(row.offer_snapshot, { rawPayload: 'private', secret: 'private', token: 'private' }); const text = JSON.stringify((await submit()).body); assert.doesNotMatch(text, /rateKey|synthetic-rate|providerHotelId|3424|requestId|checkoutToken|12345678|rawPayload|secret|private|roomId/); });
test('TEST booking/payment unavailable and no fake confirmation', async () => { const result = (await submit()).body; assert.equal(result.success, false); assert.equal(result.providerState, 'PROVIDER_NOT_CALLED'); assert.equal(result.review.environment, 'test'); assert.equal(result.review.bookingAvailable, false); assert.equal(result.review.paymentAvailable, false); assert.doesNotMatch(JSON.stringify(result), /BOOKED|CONFIRMED|PAID|bookingId|paymentId/); });
test('perfect guests cannot execute provider booking payment or mutation', async () => { await submit(); await assert.rejects(service.confirm({}), { code: 'HOTELBEDS_BOOKING_DISABLED' }); });
test('direct step values cannot bypass backend checks', async () => { for (const extra of [{ step: 3 }, { state: 'REVIEW_READY' }, { reviewReady: true }]) assert.equal((await submit(guests(), extra)).body.review, undefined); });
test('malformed input and review flags rejected', async () => { for (const values of [null, {}, [null]]) assert.equal((await submit(values)).body.code, 'VALIDATION_ERROR'); for (const review of [false, 'true', {}, 1]) assert.equal((await submit(guests(), { review })).body.code, 'VALIDATION_ERROR'); });
test('duplicate final validation has zero provider attempts or writes', async () => { const results = await Promise.all([submit(), submit(), submit()]); for (const result of results) assert.equal(result.body.review.state, 'REVIEW_READY'); assert.deepEqual(results[0].body.review, results[1].body.review); });
test('error output has no guest PII or raw internal message', async t => { const invalid = guests(); invalid[0].firstName = ''; assert.doesNotMatch(JSON.stringify((await submit(invalid)).body), /AdultOne|Synthetic|birthDate|firstName/); t.mock.method(pool, 'query', async () => { throw Error('Synthetic DOB private SQL stack'); }); const result = await submit(); assert.equal(result.body.code, 'RETRYABLE_INTERNAL_ERROR'); assert.doesNotMatch(JSON.stringify(result.body), /Synthetic|DOB|private|SQL|stack/); });
test('ordinary 6F intent remains PII-free without explicit review opt-in', async () => { const result = await submit(guests(), { review: undefined }); assert.equal(result.body.code, 'VALIDATION_ERROR'); let body; await controller.createBookingIntent({ body: { checkoutToken: token, travelers: guests() } }, { status() { return this; }, json(value) { body = value; } }); assert.equal(body.code, 'BOOKING_DISABLED'); assert.equal(body.review, undefined); assert.doesNotMatch(JSON.stringify(body), /Synthetic|firstName|birthDate/); });
test('missing display labels are explicit null rather than technical IDs', async () => { row.offer_snapshot.name = 'Hotelbeds #3424'; row.offer_snapshot.roomName = row.offer_snapshot.roomCode; row.offer_snapshot.boardName = row.offer_snapshot.boardCode; const model = (await submit()).body.review; assert.equal(model.hotel, null); assert.equal(model.offer.room, null); assert.equal(model.offer.board, null); });
