const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
require('./offlineNetwork.cjs');
Object.assign(process.env, { NODE_ENV: 'test', HOTELBEDS_ENV: 'test', HOTELBEDS_ENABLED: 'true',
  HOTELBEDS_BOOKING_ENABLED: 'false', HOTELBEDS_LIVE_BOOKING_ENABLED: 'false', PAYMENTS_MODE: 'disabled',
  PAYMENTS_PROVIDER: 'none', REAL_CHARGES_ENABLED: 'false', REAL_REFUNDS_ENABLED: 'false',
  PRODUCTION_SALES_ENABLED: 'false', EMAIL_ENABLED: 'false', OFFER_TOKEN_SECRET: 'offline-6n-synthetic-signing-secret' });
const pool = require('../db');
const transport = require('../integrations/hotelbeds/client');
const provider = require('../sources/hotelbeds');
const offers = require('../services/offerService');
const tokens = require('../services/offerTokenService');
const sessions = require('../services/checkoutSessionService');
const booking = require('../services/hotelbedsBookingService');
const payment = require('../services/paymentGatewayService');
const recovery = require('../services/bookingPaymentRecovery');
const lifecycle = require('../services/bookingLifecycle');
const checkoutController = require('../controllers/checkoutController');
const bookingController = require('../controllers/bookingController');
const paymentController = require('../controllers/paymentController');
const token = '12345678-1234-4123-8123-123456789abc';
const rateKey = ' synthetic|20300101|DBL/+%2F=|BB|2~1~8 ';
const filters = { checkIn: '2030-01-01', checkOut: '2030-01-03', nights: 2, people: 2,
  adults: 2, children: 1, childrenAges: '8', hotelCodes: [3424] };
const hotel = (price = '110.25', rateType = 'BOOKABLE') => ({ code: 3424, name: 'Synthetic Hotel', currency: 'EUR',
  rooms: [{ code: 'DBL', name: 'Double', rates: [{ rateKey, rateType, net: price, boardCode: 'BB', boardName: 'Breakfast',
    rateClass: 'NOR', paymentType: 'AT_WEB', packaging: false, rooms: 1, adults: 2, children: 1, childrenAges: '8' }] }] });
const selected = () => offers.generateOffer(provider.normalizeHotel(hotel('110.25', 'RECHECK'), filters), filters);
const guests = () => [{ type: 'AD', firstName: ' SyntheticPrivate ', lastName: ' AdultOne ' },
  { type: 'AD', firstName: 'SyntheticPrivate', lastName: 'AdultTwo', birthDate: '2000-02-29' },
  { type: 'CH', firstName: 'SyntheticPrivate', lastName: 'Child', age: 8 }];
const request = extra => ({ checkoutToken: token, travelers: guests(), review: true, ...extra });
const ready = extra => ({ checkRate: 'CONFIRMED', travelers: 'VALID', review: 'REVIEW_READY', ...extra });
const stored = () => ({ id: 1, user_id: 7, provider: 'hotelbeds', currency: 'EUR',
  provider_status: 'BOOKING_DISABLED', offer_snapshot: { priceEnvironment: 'test' } });
const access = { bookingId: '1', userId: 7 };
let row, checks, forbiddenCalls, logs, checkResponse;
beforeEach(t => {
  row = null; checks = 0; forbiddenCalls = 0; logs = []; checkResponse = { hotel: hotel() };
  const forbidden = () => { forbiddenCalls++; assert.fail('Real provider, mutation or operation forbidden'); };
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(sql, 'SELECT * FROM checkout_sessions WHERE token = $1');
    assert.deepEqual(params, [token]); return { rows: row ? [row] : [] };
  });
  t.mock.method(pool, 'connect', forbidden);
  // In-memory session repository boundary: retain the exact checked offer, never insert a real row.
  t.mock.method(sessions, 'create', async ({ offer }) => {
    row = { token, provider: offer.provider, provider_hotel_id: String(offer.providerHotelId),
      provider_offer_id: offer.offerId, rate_type: offer.rateType, currency: offer.currency, total_amount: offer.price,
      offer_snapshot: structuredClone(offer), expires_at: new Date(Date.now() + 600000).toISOString(), used_at: null };
    return { token, expiresAt: row.expires_at };
  });
  t.mock.method(sessions, 'markUsed', forbidden);
  t.mock.method(transport, 'checkRates', async key => { checks++; assert.equal(key, rateKey); return structuredClone(checkResponse); });
  for (const method of ['availability', 'createBooking', 'cancelBooking', 'getBooking', 'listBookings']) t.mock.method(transport, method, forbidden);
  for (const method of ['createBooking', 'cancelBooking']) t.mock.method(provider, method, forbidden);
  for (const method of ['confirm', 'cancel', 'simulateCancellation', 'sync', 'reconcile']) t.mock.method(booking, method, forbidden);
  t.mock.method(payment, 'createIntent', forbidden);
  for (const method of ['requestSandboxRefund', 'completeSandboxRefund']) t.mock.method(require('../controllers/refundController'), method, forbidden);
  for (const method of ['info', 'warn', 'error']) t.mock.method(require('../utils/logger'), method, (...args) => logs.push(args));
});
afterEach(() => {
  assert.equal(forbiddenCalls, 0);
  assert.doesNotMatch(JSON.stringify(logs), /SyntheticPrivate|AdultOne|AdultTwo|2000-02-29|synthetic\|20300101|offline-6n-synthetic-signing-secret/);
});
async function dispatch(controller, body) {
  let result, status = 200;
  await controller({ requestId: token, body, user: { id: 7, role: 'user' } },
    { status(value) { status = value; return this; }, json(value) { result = value; return value; } }, error => { throw error; });
  return { status, body: result };
}
const checkout = (extra = {}, offer = selected()) => dispatch(checkoutController.getCheckout,
  { provider: 'hotelbeds', hotelId: '3424', offerToken: tokens.sign(offer), ...extra });
const submitBooking = (body = request()) => dispatch(bookingController.createBookingIntent, body);
const submitPayment = (body = request()) => dispatch(paymentController.createCheckoutPaymentIntent, body);
async function initialized() { const result = await checkout(); assert.equal(result.body.checkRateStatus, 'CONFIRMED'); return result; }
const cancel = (body = {}, record = stored()) => booking.prepareCancellationIntent(body, record, access);
const refund = (body = {}, record = stored(), charge = null) => payment.prepareRefundIntent(body, record, charge, access);

test('safe RC connects signed search, real CheckRate normalization, guests, review, booking and payment contracts', async () => {
  await initialized(); assert.equal(checks, 1); assert.equal(row.offer_snapshot.checkRatePerformed, true);
  const intent = booking.prepareIntent(request(), row); assert.equal(intent.state, 'INTENT_READY');
  assert.equal(intent.travelers.length, 3); assert.equal(booking.reviewPreview(intent, row).state, 'REVIEW_READY');
  const b = await submitBooking(), p = await submitPayment();
  assert.equal(b.status, 503); assert.equal(b.body.code, 'BOOKING_DISABLED'); assert.equal(p.status, 503); assert.equal(p.body.code, 'PAYMENTS_DISABLED');
  const state = lifecycle.validateLifecycleState(ready({ booking: b.body.state, payment: p.body.state }));
  assert.equal(state.valid, true); assert.equal(state.category, 'SAFE_DISABLED_TERMINAL');
  assert.equal(b.body.success, false); assert.equal(p.body.success, false);
});
test('opaque trusted rateKey survives signed selection, provider mock and private intent byte for byte', async () => {
  await initialized(); assert.equal(row.offer_snapshot.rateKey, rateKey); assert.equal(booking.prepareIntent(request(), row).rateKey, rateKey);
});
test('changed CheckRate money replaces stale search money and requires current-token acceptance', async () => {
  checkResponse.hotel.rooms[0].rates[0].net = '120.75'; const result = await checkout();
  assert.equal(result.body.checkRateStatus, 'PRICE_CHANGED'); assert.equal(result.body.previousTotal, 110.25);
  assert.equal((await submitBooking()).body.code, 'VALIDATION_ERROR');
  const accepted = request({ acceptedPriceToken: token });
  assert.equal((await submitBooking(accepted)).body.review.offer.price, 120.75);
  assert.equal((await submitPayment(accepted)).body.intent.amount, 120.75);
});
test('CheckRate uses signed occupancy and currency despite browser search overrides', async () => {
  const result = await checkout({ price: 1, currency: 'USD', people: 9, filters: { children: 9 }, rateKey: 'forged' });
  assert.equal(result.body.total, 110.25); assert.equal(row.currency, 'EUR'); assert.deepEqual(row.offer_snapshot.occupancy, { rooms: 1, adults: 2, children: 1 });
});
test('valid BOOKABLE selection reaches provider mock without premature Availability refresh', async () => {
  const result = await checkout({}, { ...selected(), rateType: 'BOOKABLE', recheckRequired: false });
  assert.equal(result.body.checkRateStatus, 'CONFIRMED'); assert.equal(checks, 1);
});
test('provider-derived unavailable occurs after CheckRate mock, creates no trusted session', async () => {
  checkResponse.hotel.rooms[0].rates = []; const result = await checkout();
  assert.equal(checks, 1); assert.equal(result.body.checkRateStatus, 'UNAVAILABLE'); assert.equal(row, null);
});
test('tampered signed offer fails before provider and cannot create session', async () => {
  const parts = tokens.sign(selected()).split('.'); parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
  assert.equal((await checkout({ offerToken: parts.join('.') })).body.code, 'OFFER_TOKEN_INVALID'); assert.equal(checks, 0); assert.equal(row, null);
});
test('stale search snapshot cannot directly become Review or payment', async () => {
  await initialized(); row.offer_snapshot.checkRatePerformed = false;
  assert.equal((await submitBooking()).body.review, undefined); assert.equal((await submitPayment()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
});
test('tampered booking price rejected after successful CheckRate', async () => {
  await initialized(); assert.equal((await submitBooking(request({ price: 1 }))).body.code, 'VALIDATION_ERROR');
});
test('tampered booking currency rejected after successful CheckRate', async () => {
  await initialized(); assert.equal((await submitBooking(request({ currency: 'USD' }))).body.code, 'VALIDATION_ERROR');
});
test('client occupancy and forged guests count cannot override server contract', async () => {
  await initialized(); assert.equal((await submitBooking(request({ occupancy: { adults: 1 } }))).body.code, 'VALIDATION_ERROR');
  assert.equal((await submitBooking(request({ travelers: guests().slice(1) }))).body.validationKind, 'OCCUPANCY_MISMATCH');
});
test('adult-child distribution and child age must match confirmed occupancy', async () => {
  await initialized(); const values = guests(); values[2].type = 'AD'; delete values[2].age;
  assert.equal((await submitBooking(request({ travelers: values }))).body.validationKind, 'OCCUPANCY_MISMATCH');
  values[2] = { ...guests()[2], age: 9 }; assert.equal((await submitBooking(request({ travelers: values }))).body.validationKind, 'OCCUPANCY_MISMATCH');
});
test('missing names block review instead of fabricating travellers', async () => {
  await initialized(); const values = guests(); delete values[0].firstName;
  const result = await submitBooking(request({ travelers: values })); assert.equal(result.body.review, undefined);
  assert.equal(result.body.validationKind, 'TRAVELLER_VALIDATION_ERROR'); assert.doesNotMatch(JSON.stringify(result.body), /SyntheticPrivate|AdultOne/);
});
test('normalization preserves entered guest data through intent and review without invented DOB', async () => {
  await initialized(); const intent = booking.prepareIntent(request(), row), review = booking.reviewPreview(intent, row);
  assert.equal(intent.travelers[0].firstName, 'SyntheticPrivate'); assert.equal(review.travelers[0].lastName, 'AdultOne');
  assert.equal(review.travelers[1].birthDate, '2000-02-29'); assert.equal(Object.hasOwn(review.travelers[0], 'birthDate'), false);
});
test('malformed DOB blocks booking and payment without PII in error', async () => {
  await initialized(); const values = guests(); values[0].birthDate = '2030-02-30';
  for (const submit of [submitBooking, submitPayment]) { const result = await submit(request({ travelers: values })); assert.equal(result.body.success, false); assert.doesNotMatch(JSON.stringify(result.body), /SyntheticPrivate|2030-02-30/); }
});
test('room board hotel and stay remain checked server facts through Review', async () => {
  await initialized(); const r = (await submitBooking()).body.review;
  assert.equal(r.hotel, 'Synthetic Hotel'); assert.equal(r.offer.room, 'Double'); assert.equal(r.offer.board, 'Breakfast');
  assert.deepEqual(r.stay, { checkIn: '2030-01-01', checkOut: '2030-01-03', nights: 2 });
});
test('user-facing Review excludes opaque rate/session identifiers and raw provider secrets', async () => {
  await initialized(); row.offer_snapshot.rawPayload = 'private-raw-sentinel'; row.offer_snapshot.secret = 'private-secret-sentinel';
  const r = (await submitBooking()).body.review;
  assert.doesNotMatch(JSON.stringify(r), /rateKey|checkoutToken|12345678|providerHotelId|private-raw|private-secret|synthetic\|/);
});
test('direct review step bypass cannot manufacture ready state', async () => {
  await initialized(); for (const extra of [{ state: 'REVIEW_READY' }, { step: 3 }, { reviewReady: true }]) assert.equal((await submitBooking(request(extra))).body.review, undefined);
});
test('expired confirmed session blocks both intent endpoints', async () => {
  await initialized(); row.expires_at = new Date(Date.now() - 1).toISOString();
  assert.equal((await submitBooking()).body.code, 'VALIDATION_ERROR'); assert.equal((await submitPayment()).body.code, 'PAYMENT_PREREQUISITE_MISSING');
});
test('inconsistent session columns cannot substitute a different confirmed rate or price', async () => {
  await initialized(); row.total_amount = 1; assert.equal((await submitBooking()).body.code, 'VALIDATION_ERROR');
  row.total_amount = 110.25; row.provider_offer_id = 'forged'; assert.equal((await submitBooking()).body.review, undefined);
});
test('ordinary booking boundary has no guest PII, fake booking or provider reference', async () => {
  await initialized(); const body = request(); delete body.review; const result = (await submitBooking(body)).body;
  assert.equal(result.providerState, 'PROVIDER_NOT_CALLED'); assert.doesNotMatch(JSON.stringify(result), /SyntheticPrivate|birthDate|bookingId|provider_booking_id|BOOKED|PAID/);
});
test('payment amount and currency cannot be altered by browser', async () => {
  await initialized(); for (const extra of [{ price: 1 }, { currency: 'USD' }, { amount: 1 }]) assert.equal((await submitPayment(request(extra))).body.code, 'PAYMENT_VALIDATION_ERROR');
  const result = (await submitPayment()).body; assert.equal(result.intent.amount, 110.25); assert.equal(result.intent.currency, 'EUR');
});
test('payment requires explicit review and cannot accept client ready assertion', async () => {
  await initialized(); const body = request(); delete body.review;
  assert.equal((await submitPayment(body)).body.code, 'PAYMENT_PREREQUISITE_MISSING'); assert.equal((await submitPayment(request({ state: 'REVIEW_READY' }))).body.code, 'PAYMENT_VALIDATION_ERROR');
});
test('card input rejected and payment boundary has no paid authorized captured result', async () => {
  await initialized(); assert.equal((await submitPayment(request({ cardNumber: 'synthetic-card', cvv: 'synthetic' }))).body.code, 'PAYMENT_VALIDATION_ERROR');
  const result = (await submitPayment()).body; assert.equal(result.paymentState, 'PAYMENT_NOT_STARTED'); assert.equal(result.intent.paymentProvider, 'none');
  assert.equal(result.providerState, 'PROVIDER_NOT_CALLED'); assert.doesNotMatch(JSON.stringify(result), /PAID|AUTHORIZED|CAPTURED|paymentId|SyntheticPrivate/);
});
test('sequential and concurrent duplicate booking submits remain stable and read-only', async () => {
  await initialized(); const all = await Promise.all([submitBooking(), submitBooking(), submitBooking()]); all.push(await submitBooking());
  for (const result of all) { assert.equal(result.body.code, 'BOOKING_DISABLED'); assert.deepEqual(result.body.review, all[0].body.review); }
  assert.equal(row.used_at, null); assert.equal(checks, 1);
});
test('duplicate payment submits keep same correlation and never initiate payment', async () => {
  await initialized(); const all = await Promise.all([submitPayment(), submitPayment(), submitPayment()]); all.push(await submitPayment());
  for (const result of all) { assert.equal(result.body.code, 'PAYMENTS_DISABLED'); assert.equal(result.body.intent.requestId, all[0].body.intent.requestId); }
  assert.equal(row.used_at, null);
});
test('retryable final and unknown failures remain distinct without automatic retry', async () => {
  await initialized(); const requestId = booking.prepareIntent(request(), row).requestId;
  assert.equal(recovery.classifyFailure({ code: 'ETIMEDOUT' }, { dispatch: 'NOT_SENT' }), 'RETRYABLE');
  assert.equal(recovery.classifyFailure({ code: 'BOOKING_REJECTED' }, { dispatch: 'SENT', outcomeKnown: true }), 'NON_RETRYABLE');
  const plan = recovery.plan({ requestId, booking: { state: 'confirmation_unknown' } });
  assert.equal(plan.bookingOutcome, 'OUTCOME_UNKNOWN'); assert.equal(plan.bookingRetry, 'RECONCILIATION_REQUIRED'); assert.equal(plan.bookingAttemptAllowed, false);
});
test('partial booking-success payment-failure requires cancellation and cannot complete', async () => {
  await initialized(); const requestId = booking.prepareIntent(request(), row).requestId;
  const plan = recovery.plan({ requestId, booking: { state: 'CONFIRMED', providerResultObserved: true },
    payment: { state: 'failed', error: { code: 'PAYMENT_REJECTED' }, dispatch: 'SENT', outcomeKnown: true } });
  assert.equal(plan.compensation, 'CANCELLATION_REQUIRED'); assert.equal(plan.success, false); assert.equal(plan.compensationAttemptAllowed, false);
  assert.equal(lifecycle.validateLifecycleState(ready({ booking: 'BOOKING_CONFIRMED', payment: 'PAYMENT_FAILED_FINAL',
    evidence: { booking: true }, recovery: plan.state, compensation: plan.compensation, completed: true })).valid, false);
});
test('partial payment-success booking-failure requires refund, not false success', async () => {
  await initialized(); const requestId = booking.prepareIntent(request(), row).requestId;
  const plan = recovery.plan({ requestId, booking: { state: 'confirmation_failed', error: { code: 'BOOKING_REJECTED' }, dispatch: 'SENT', outcomeKnown: true },
    payment: { state: 'paid', providerResultObserved: true } });
  assert.equal(plan.compensation, 'REFUND_REQUIRED'); assert.equal(plan.success, false); assert.equal(plan.paymentAttemptAllowed, false);
  assert.equal(lifecycle.validateLifecycleState(ready({ booking: 'BOOKING_FAILED_FINAL', payment: 'PAID', evidence: { payment: true }, completed: true })).valid, false);
});
test('cancellation intent requires actual same-booking provider evidence, not disabled review', async () => {
  await initialized(); assert.equal(cancel().intent.eligibility, 'REAL_CONFIRMED_BOOKING_REQUIRED');
  const record = stored(); Object.assign(record, { provider_status: 'CONFIRMED', provider_booking_id: 'private-reference',
    provider_response: { booking: { reference: 'private-reference', status: 'CONFIRMED', currency: 'EUR' } } });
  assert.equal(cancel({}, record).intent.eligibility, 'ELIGIBLE_PROVIDER_BOOKING'); assert.equal(cancel({}, record).cancellationAvailable, false);
});
test('client cancellation state and provider reference cannot override ownership or stored facts', () => {
  for (const body of [{ state: 'CANCELLED' }, { providerReference: 'forged' }]) assert.throws(() => cancel(body), { code: 'COMPENSATION_INTENT_INVALID' });
  assert.throws(() => booking.prepareCancellationIntent({}, stored(), { ...access, userId: 99 }), { code: 'BOOKING_ACCESS_DENIED' });
});
test('refund requires actual charge; local paid sandbox cannot fabricate refund eligibility', () => {
  assert.equal(refund().intent.eligibility, 'REAL_CHARGE_REQUIRED');
  assert.equal(refund({}, stored(), { booking_id: 1, status: 'paid', gateway_provider: 'sandbox', external_id: 'sbx_private', amount: 110.25, refunded_amount: 0 }).intent.eligibility, 'REAL_CHARGE_REQUIRED');
});
test('client refund money and currency cannot override trusted refund intent', () => {
  for (const body of [{ amount: 999 }, { currency: 'USD' }, { state: 'refunded' }]) assert.throws(() => refund(body), { code: 'COMPENSATION_INTENT_INVALID' });
  assert.equal(refund().intent.amount, null); assert.equal(refund().refundAvailable, false);
});
test('duplicate cancellation/refund validations stay unavailable with no fake operation results', () => {
  for (const operation of [cancel, refund]) {
    const first = operation(); for (let i = 0; i < 3; i++) assert.deepEqual(operation(), first);
    assert.equal(first.success, false); assert.equal(first.providerState, 'PROVIDER_NOT_CALLED');
    assert.doesNotMatch(JSON.stringify(first), /CANCELLED|REFUNDED|private-reference|external_id/);
  }
});
test('unknown compensation outcomes remain reconciliation-required and never complete', async () => {
  await initialized(); const plan = recovery.compensationPlan({ requestId: booking.prepareIntent(request(), row).requestId,
    cancellation: { state: 'CANCELLATION_OUTCOME_UNKNOWN' }, refund: { state: 'REFUND_OUTCOME_UNKNOWN' } });
  assert.equal(plan.reconciliationRequired, true); assert.equal(plan.compensationCompleted, false); assert.equal(plan.refundAttemptAllowed, false);
  assert.equal(lifecycle.validateLifecycleState(ready({ cancellation: 'CANCELLATION_OUTCOME_UNKNOWN', refund: 'REFUND_OUTCOME_UNKNOWN',
    reconciliationRequired: true, completed: true })).valid, false);
});
test('Review ready without CheckRate and unavailable operations marked completed are invalid', () => {
  for (const state of [ready({ checkRate: 'NOT_CONFIRMED' }), ready({ cancellation: 'CANCELLED', cancellationAvailable: false }),
    ready({ refund: 'refunded', refundAvailable: false })]) assert.equal(lifecycle.validateLifecycleState(state).valid, false);
});
test('compensation or reconciliation obligation blocks even evidenced terminal success', () => {
  const evidenced = ready({ booking: 'BOOKING_CONFIRMED', payment: 'PAID', evidence: { booking: true, payment: true }, completed: true });
  for (const extra of [{ compensation: 'REFUND_REQUIRED' }, { reconciliationRequired: true }]) assert.equal(lifecycle.validateLifecycleState({ ...evidenced, ...extra }).valid, false);
});
test('impossible jumps and unknown without reconciliation cannot become success or final failure', () => {
  assert.equal(lifecycle.validateTransition(ready(), ready({ booking: 'BOOKING_CONFIRMED', evidence: { booking: true } })), false);
  const unknown = ready({ booking: 'BOOKING_OUTCOME_UNKNOWN', reconciliationRequired: true });
  assert.equal(lifecycle.validateTransition(unknown, ready({ booking: 'BOOKING_FAILED_FINAL' })), false);
  assert.equal(lifecycle.validateTransition(ready({ booking: 'BOOKING_DISABLED' }), ready({ booking: 'BOOKING_PENDING' })), false);
});
test('disabled is safe terminal, distinct from failed and unknown, and never successful', async () => {
  await initialized(); const b = (await submitBooking()).body, p = (await submitPayment()).body;
  const disabled = lifecycle.validateLifecycleState(ready({ booking: b.state, payment: p.state }));
  assert.equal(disabled.category, 'SAFE_DISABLED_TERMINAL'); assert.equal(lifecycle.validateLifecycleState(ready({ booking: 'BOOKING_FAILED_FINAL' })).category, 'FAILED_TERMINAL');
  assert.equal(lifecycle.validateLifecycleState(ready({ booking: 'BOOKING_OUTCOME_UNKNOWN', reconciliationRequired: true })).category, 'UNKNOWN');
  assert.equal(lifecycle.validateLifecycleState(ready({ booking: b.state, payment: p.state, success: true })).valid, false);
});
test('internal failure produces safe response without logging input or raw provider error', async t => {
  await initialized(); t.mock.method(pool, 'query', async () => { throw Error('private-password SyntheticPrivate 2000-02-29 raw-provider'); });
  for (const submit of [submitBooking, submitPayment]) { const result = await submit(); assert.equal(result.status, 503); assert.equal(result.body.success, false);
    assert.doesNotMatch(JSON.stringify(result.body), /private-password|SyntheticPrivate|2000-02-29|raw-provider|stack/); }
});
