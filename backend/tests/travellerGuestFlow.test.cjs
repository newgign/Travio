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
  row = fixture();
  t.mock.method(pool, 'query', async (sql, params) => { assert.equal(sql, 'SELECT * FROM checkout_sessions WHERE token = $1'); assert.deepEqual(params, [token]); return { rows: [row] }; });
  t.mock.method(pool, 'connect', () => assert.fail('DB mutation forbidden'));
  for (const name of ['availability', 'checkRates', 'createBooking', 'cancelBooking']) t.mock.method(require('../integrations/hotelbeds/client'), name, () => assert.fail('Provider forbidden'));
  t.mock.method(require('../sources/hotelbeds'), 'createBooking', () => assert.fail('Booking forbidden'));
  t.mock.method(require('../services/paymentGatewayService'), 'createIntent', () => assert.fail('Payment forbidden'));
  t.mock.method(require('../services/checkoutSessionService'), 'markUsed', () => assert.fail('Session consumption forbidden'));
});
const intent = (travelers = guests(), extra = {}) => service.prepareIntent({ checkoutToken: token, travelers, ...extra }, row);
const rejects = (travelers, kind = 'TRAVELLER_VALIDATION_ERROR') => assert.throws(() => intent(travelers), error => error.code === 'BOOKING_INTENT_TRAVELERS_INVALID' && error.validationKind === kind);
async function submit(travelers = guests(), extra = {}) {
  let status, body;
  await controller.createBookingIntent({ body: { checkoutToken: token, travelers, ...extra } }, { status(value) { status = value; return this; }, json(value) { body = value; } });
  return { status, body };
}
test('two adults normalize without DOB or ages', () => {
  Object.assign(row.offer_snapshot, { children: 0, childrenAges: null, occupancy: { rooms: 1, adults: 2, children: 0 } });
  const result = intent(guests().slice(0, 2)); assert.equal(result.travelers.length, 2); assert.equal(result.travelers[0].firstName, 'Synthetic'); assert.equal(result.travelers[0].birthDate, undefined); assert.equal(result.travelers[0].age, undefined);
});
test('adult and child normalized model reaches intent', () => { const result = intent(); assert.equal(result.travelers[2].age, 8); assert.equal(result.travelers[2].type, 'CH'); assert.equal(result.travelers[0].roomId, 1); });
test('too few guests rejected', () => rejects(guests().slice(1), 'OCCUPANCY_MISMATCH'));
test('extra guest rejected', () => rejects([...guests(), guests()[0]], 'OCCUPANCY_MISMATCH'));
test('wrong adult child distribution rejected', () => rejects(guests().map(value => ({ ...value, type: 'AD' })), 'OCCUPANCY_MISMATCH'));
test('missing first name rejected', () => { const values = guests(); delete values[0].firstName; rejects(values); });
test('missing last name rejected', () => { const values = guests(); delete values[0].lastName; rejects(values); });
test('blank after trim rejected', () => rejects(guests().map(value => ({ ...value, firstName: ' \t ' }))));
test('international names preserved and trimmed', () => { const values = guests(); values[0].firstName = ' 李–Әлия '; values[0].lastName = " O’Connor-Иванова "; assert.equal(intent(values).travelers[0].firstName, '李–Әлия'); assert.equal(intent(values).travelers[0].lastName, 'O’Connor-Иванова'); });
test('malformed traveller arrays safely rejected', async () => { for (const value of [null, {}, 'text', [null], [[], ...guests().slice(1)]]) assert.equal((await submit(value)).body.code, 'VALIDATION_ERROR'); });
test('unknown traveller fields and nested aliases rejected', () => { for (const patch of [{ passport: 'synthetic' }, { dateOfBirth: '2000-01-01' }, { contact: {} }, { first_name: 'synthetic' }]) { const values = guests(); Object.assign(values[0], patch); rejects(values); } });
test('unsupported duplicate lead flags rejected', () => rejects(guests().map(value => ({ ...value, leadGuest: true }))));
test('child or external lead identity cannot bypass holder convention', () => { const values = guests(); values[2].leadGuest = true; rejects(values); assert.throws(() => intent(guests(), { leadGuest: { firstName: 'external' } }), { code: 'BOOKING_INTENT_INVALID' }); });
test('first adult remains the only holder in existing provider mapping', () => { const model = intent(); const payload = service.buildPayload({ id: 1, travelers: model.travelers, offer_snapshot: row.offer_snapshot }); assert.deepEqual(payload.holder, { name: 'Synthetic', surname: 'AdultOne' }); assert.equal(payload.rooms[0].paxes.length, 3); });
test('explicit optional valid DOB retained without adding a requirement', () => { const values = guests(); values[0].birthDate = '2000-02-29'; assert.equal(intent(values).travelers[0].birthDate, '2000-02-29'); });
test('future and impossible optional DOB rejected', () => { for (const birthDate of ['2999-01-01', '2001-02-29', '2000-02-30', 'not-a-date', null]) { const values = guests(); values[0].birthDate = birthDate; rejects(values); } });
test('blank optional DOB omitted and names never replaced', () => { const values = guests().map(value => ({ ...value, birthDate: '' })); assert.ok(intent(values).travelers.every(value => !Object.hasOwn(value, 'birthDate'))); values[0].firstName = ''; rejects(values); });
test('missing child age cannot default to zero', () => { const values = guests(); delete values[2].age; rejects(values); });
test('wrong child age cannot replace confirmed age', () => { const values = guests(); values[2].age = 9; rejects(values, 'OCCUPANCY_MISMATCH'); });
test('client occupancy and expected counts rejected', () => { for (const extra of [{ occupancy: { adults: 1 } }, { expectedTravelers: 1 }, { adults: 1 }, { childrenAges: '9' }]) assert.throws(() => intent(guests(), extra), { code: 'BOOKING_INTENT_INVALID' }); });
test('server snapshot occupancy is authoritative over search filters', () => { row.search_filters = { adults: 99, children: 0 }; assert.equal(intent().expectedTravelers, 3); row.offer_snapshot.occupancy.adults = 1; assert.throws(() => intent(), { code: 'BOOKING_INTENT_OCCUPANCY_INVALID' }); });
test('confirmed CheckRate remains required and accepted changed price remains token-bound', () => { row.offer_snapshot.checkRatePerformed = false; assert.throws(() => intent(), { code: 'CHECKRATE_CONFIRMATION_REQUIRED' }); row = fixture(); row.offer_snapshot.priceConfirmationRequired = true; assert.throws(() => intent(), { code: 'RATE_CHANGED' }); assert.equal(intent(guests(), { acceptedPriceToken: token }).state, 'INTENT_READY'); });
test('valid endpoint ends disabled without provider booking payment or DB writes', async () => { const result = await submit(); assert.equal(result.status, 503); assert.equal(result.body.code, 'BOOKING_DISABLED'); assert.equal(result.body.providerState, 'PROVIDER_NOT_CALLED'); });
test('correctable errors are distinct and PII-free', async () => { const names = guests(); names[0].firstName = ' '; const invalid = (await submit(names)).body; assert.equal(invalid.validationKind, 'TRAVELLER_VALIDATION_ERROR'); const count = (await submit([])).body; assert.equal(count.validationKind, 'OCCUPANCY_MISMATCH'); assert.doesNotMatch(JSON.stringify([invalid, count]), /AdultOne|birthDate|firstName|stack/); });
test('boundary and unexpected errors never leak guests or fake confirmation', async t => { const boundary = (await submit()).body; assert.doesNotMatch(JSON.stringify(boundary), /Synthetic|AdultOne|firstName|lastName|birthDate|BOOKED|CONFIRMED|PAID|bookingId/); assert.equal(boundary.success, false); t.mock.method(pool, 'query', async () => { throw Error('Synthetic private SQL stack'); }); const error = (await submit()).body; assert.equal(error.code, 'RETRYABLE_INTERNAL_ERROR'); assert.doesNotMatch(JSON.stringify(error), /Synthetic|private|SQL|stack/); });
