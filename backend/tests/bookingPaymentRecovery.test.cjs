const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', HOTELBEDS_ENV: 'test', HOTELBEDS_ENABLED: 'true',
  HOTELBEDS_BOOKING_ENABLED: 'false', HOTELBEDS_LIVE_BOOKING_ENABLED: 'false', PAYMENTS_MODE: 'disabled',
  PAYMENTS_PROVIDER: 'none', PRODUCTION_SALES_ENABLED: 'false', REAL_CHARGES_ENABLED: 'false',
  REAL_REFUNDS_ENABLED: 'false', EMAIL_ENABLED: 'false' });
const recovery = require('../services/bookingPaymentRecovery');
const pool = require('../db');
const bookingService = require('../services/hotelbedsBookingService');
const paymentService = require('../services/paymentGatewayService');
const bookingController = require('../controllers/bookingController');
const paymentController = require('../controllers/paymentController');
const token = '12345678-1234-4123-8123-123456789abc';
const requestId = require('node:crypto').createHash('sha256').update(token).digest('hex').slice(0, 32);
const guests = () => [{ type: 'AD', firstName: 'SyntheticPrivate', lastName: 'One' }, { type: 'AD', firstName: 'SyntheticPrivate', lastName: 'Two' }];
const fixture = () => ({ token, provider: 'hotelbeds', provider_hotel_id: '7654', provider_offer_id: 'synthetic-private-key',
  rate_type: 'BOOKABLE', currency: 'EUR', total_amount: '2075.98', expires_at: new Date(Date.now() + 600000).toISOString(),
  offer_snapshot: { provider: 'hotelbeds', providerHotelId: '7654', offerId: 'synthetic-private-key', rateKey: 'synthetic-private-key',
    rateType: 'BOOKABLE', recheckRequired: false, checkRatePerformed: true, checkedRateAt: new Date(Date.now() - 1000).toISOString(),
    price: 2075.98, currency: 'EUR', priceEnvironment: 'test', roomCode: 'DBL', boardCode: 'BB', paymentType: 'AT_WEB',
    packaging: false, checkIn: '2030-01-01', checkOut: '2030-01-03', nights: 2,
    adults: 2, children: 0, childrenAges: [], occupancy: { rooms: 1, adults: 2, children: 0 } } });
let row, reads, forbiddenCalls;
beforeEach(t => {
  row = fixture(); reads = 0; forbiddenCalls = 0;
  const forbidden = () => { forbiddenCalls++; assert.fail('No provider/DB mutation/recovery execution'); };
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(sql, 'SELECT * FROM checkout_sessions WHERE token = $1'); assert.deepEqual(params, [token]);
    reads++; return { rows: [row] };
  });
  t.mock.method(pool, 'connect', forbidden);
  for (const method of ['availability', 'checkRates', 'createBooking', 'cancelBooking', 'getBooking', 'listBookings'])
    t.mock.method(require('../integrations/hotelbeds/client'), method, forbidden);
  for (const method of ['confirm', 'cancel', 'simulateCancellation', 'reconcile', 'sync']) t.mock.method(bookingService, method, forbidden);
  t.mock.method(paymentService, 'createIntent', forbidden);
  t.mock.method(require('../controllers/refundController'), 'requestSandboxRefund', forbidden);
  t.mock.method(require('../controllers/refundController'), 'completeSandboxRefund', forbidden);
  t.mock.method(require('../services/checkoutSessionService'), 'markUsed', forbidden);
  for (const method of ['info', 'warn', 'error']) t.mock.method(require('../utils/logger'), method, forbidden);
});
const plan = (booking = {}, payment = {}) => recovery.plan({ requestId, booking, payment });
const failed = (operation, code, extra = {}) => ({ state: operation === 'booking' ? 'confirmation_failed' : 'failed',
  error: { code }, dispatch: 'NOT_SENT', ...extra });
const observedBooking = () => ({ state: 'CONFIRMED', providerResultObserved: true });
const observedPayment = () => ({ state: 'paid', providerResultObserved: true });
async function submit(controller) {
  let body, status;
  await controller({ body: { checkoutToken: token, travelers: guests(), review: true }, user: { id: 1 } },
    { status(value) { status = value; return this; }, json(value) { body = value; } });
  assert.equal(forbiddenCalls, 0); return { status, body };
}

test('booking failure prevents any payment start or retry', () => {
  const value = plan(failed('booking', 'BOOKING_REJECTED'));
  assert.equal(value.bookingOutcome, 'NON_RETRYABLE'); assert.equal(value.paymentOutcome, 'NOT_STARTED');
  assert.equal(value.paymentRetry, 'DO_NOT_RETRY'); assert.equal(value.paymentAttemptAllowed, false);
});
test('booking disabled remains terminal and never retryable', () => {
  const value = plan({ state: 'BOOKING_DISABLED' }); assert.equal(value.bookingOutcome, 'DISABLED');
  assert.equal(value.bookingRetry, 'DO_NOT_RETRY'); assert.equal(value.bookingAttemptAllowed, false);
  assert.equal(recovery.classifyFailure({ code: 'HOTELBEDS_BOOKING_DISABLED' }), 'NON_RETRYABLE');
});
test('payment disabled blocks downstream action', () => {
  const value = plan({}, { state: 'PAYMENTS_DISABLED' }); assert.equal(value.paymentOutcome, 'DISABLED');
  assert.equal(value.paymentAttemptAllowed, false); assert.equal(value.compensationAttemptAllowed, false);
  assert.equal(recovery.classifyFailure({ code: 'PAYMENTS_DISABLED' }), 'NON_RETRYABLE');
});
test('booking timeout before dispatch is explicit retryable failure', () => {
  const value = plan(failed('booking', 'TIMEOUT')); assert.equal(value.bookingOutcome, 'RETRYABLE');
  assert.equal(value.bookingRetry, 'EXPLICIT_RETRY_AFTER_REVALIDATION'); assert.equal(value.bookingAttemptAllowed, false);
});
test('booking 5xx with known no-result outcome is retryable, no automatic execution', () => {
  const value = plan(failed('booking', 'PROVIDER_UNAVAILABLE', { dispatch: 'SENT', outcomeKnown: true, error: { status: 503 } }));
  assert.equal(value.bookingOutcome, 'RETRYABLE'); assert.equal(value.state, 'RECOVERY_PENDING');
});
test('explicit known booking rejection is non-retryable', () => {
  assert.equal(plan(failed('booking', 'BOOKING_REJECTED', { dispatch: 'SENT', outcomeKnown: true })).bookingOutcome, 'NON_RETRYABLE');
});
test('invalid input and auth errors do not become retry loops', () => {
  for (const error of [{ code: 'BOOKING_INTENT_INVALID' }, { code: 'VALIDATION_ERROR' }, { status: 401 }, { status: 403 }])
    assert.equal(recovery.classifyFailure(error, { dispatch: 'NOT_SENT' }), 'NON_RETRYABLE');
});
test('booking response lost after dispatch remains unknown, never confirmed failure', () => {
  const value = plan(failed('booking', 'TIMEOUT', { dispatch: 'SENT' }));
  assert.equal(value.bookingOutcome, 'OUTCOME_UNKNOWN'); assert.equal(value.reconciliationRequired, true);
  assert.equal(value.bookingRetry, 'RECONCILIATION_REQUIRED'); assert.equal(value.paymentRetry, 'DO_NOT_RETRY');
});
test('missing dispatch evidence is conservatively unknown', () => {
  assert.equal(recovery.classifyFailure({ code: 'ECONNRESET' }), 'OUTCOME_UNKNOWN');
  assert.equal(recovery.classifyFailure({ status: 503 }, { dispatch: 'SENT' }), 'OUTCOME_UNKNOWN');
});
test('payment transient failure before dispatch is retryable only after booking evidence', () => {
  const value = plan(observedBooking(), failed('payment', 'ECONNREFUSED'));
  assert.equal(value.paymentOutcome, 'RETRYABLE'); assert.equal(value.paymentRetry, 'EXPLICIT_RETRY_AFTER_REVALIDATION');
  assert.equal(value.paymentAttemptAllowed, false);
});
test('explicit known payment rejection is final without invented paid state', () => {
  const value = plan(observedBooking(), failed('payment', 'PAYMENT_REJECTED', { dispatch: 'SENT', outcomeKnown: true }));
  assert.equal(value.paymentOutcome, 'NON_RETRYABLE'); assert.equal(value.paymentRetry, 'DO_NOT_RETRY'); assert.equal(value.success, false);
});
test('unknown payment result requires reconciliation rather than retry', () => {
  const value = plan(observedBooking(), failed('payment', 'TIMEOUT', { dispatch: 'SENT' }));
  assert.equal(value.paymentOutcome, 'OUTCOME_UNKNOWN'); assert.equal(value.paymentRetry, 'RECONCILIATION_REQUIRED');
  assert.equal(value.state, 'RECOVERY_PENDING');
});
test('existing confirming booking state prevents duplicate attempts', () => {
  const value = plan({ state: 'confirming' }); assert.equal(value.bookingOutcome, 'PENDING');
  assert.equal(value.bookingRetry, 'WAIT'); assert.equal(value.bookingAttemptAllowed, false); assert.equal(value.paymentAttemptAllowed, false);
});
test('existing pending payment state prevents duplicate payment attempts', () => {
  for (const state of ['pending', 'requires_action']) {
    const value = plan(observedBooking(), { state }); assert.equal(value.paymentRetry, 'WAIT'); assert.equal(value.paymentAttemptAllowed, false);
  }
});
test('concurrent booking intent submissions remain disabled with zero attempts or writes', async () => {
  const values = await Promise.all([submit(bookingController.createBookingIntent), submit(bookingController.createBookingIntent)]);
  for (const value of values) { assert.equal(value.status, 503); assert.equal(value.body.code, 'BOOKING_DISABLED'); assert.equal(value.body.review.state, 'REVIEW_READY'); }
  assert.equal(reads, 2); assert.deepEqual(values[0], values[1]);
});
test('concurrent and repeated payment submissions remain disabled with zero attempts or writes', async () => {
  const values = await Promise.all([submit(paymentController.createCheckoutPaymentIntent), submit(paymentController.createCheckoutPaymentIntent)]);
  values.push(await submit(paymentController.createCheckoutPaymentIntent));
  for (const value of values) { assert.equal(value.body.code, 'PAYMENTS_DISABLED'); assert.deepEqual(value, values[0]); }
  assert.equal(reads, 3);
});
test('action correlation is stable per validated request, not a new transaction reference', () => {
  const first = plan(), second = plan(); assert.deepEqual(first.actionKeys, second.actionKeys);
  assert.equal(first.actionKeys.booking, `${requestId}:booking`); assert.equal(first.actionKeys.payment, `${requestId}:payment`);
  assert.notEqual(first.actionKeys.booking, first.actionKeys.compensation);
  assert.throws(() => recovery.plan({ requestId: token }), { code: 'RECOVERY_INPUT_INVALID' });
});
test('future observed booking plus payment failure requires cancellation, never full success', () => {
  const value = plan(observedBooking(), failed('payment', 'PAYMENT_REJECTED'));
  assert.equal(value.state, 'COMPENSATION_REQUIRED'); assert.equal(value.compensation, 'CANCELLATION_REQUIRED'); assert.equal(value.success, false);
});
test('future observed payment plus booking failure requires refund, never full success', () => {
  const value = plan(failed('booking', 'BOOKING_REJECTED'), observedPayment());
  assert.equal(value.state, 'COMPENSATION_REQUIRED'); assert.equal(value.compensation, 'REFUND_REQUIRED'); assert.equal(value.success, false);
});
test('payment exists with unknown booking: reconcile before choosing refund', () => {
  const value = plan({ state: 'confirmation_unknown' }, observedPayment());
  assert.equal(value.reconciliationRequired, true); assert.equal(value.compensation, 'NONE'); assert.equal(value.state, 'RECOVERY_PENDING');
});
test('booking exists with unknown payment: reconcile before choosing cancellation', () => {
  const value = plan(observedBooking(), { state: 'OUTCOME_UNKNOWN' });
  assert.equal(value.reconciliationRequired, true); assert.equal(value.compensation, 'NONE'); assert.equal(value.compensationAttemptAllowed, false);
});
test('even hypothetical two observed results do not emit commercial success', () => {
  const value = plan(observedBooking(), observedPayment()); assert.equal(value.success, false);
  assert.equal(value.state, 'RECOVERY_NOT_REQUIRED'); assert.equal(value.compensation, 'NONE');
  assert.doesNotMatch(JSON.stringify(value), /BOOKED|PAID|REFUNDED|CANCELLED|AUTHORIZED|CAPTURED/);
});
test('unproven success labels including sandbox paid never imply provider operations', () => {
  const value = plan({ state: 'CONFIRMED' }, { state: 'paid' });
  assert.equal(value.bookingOutcome, 'OUTCOME_UNKNOWN'); assert.equal(value.paymentOutcome, 'OUTCOME_UNKNOWN'); assert.equal(value.success, false);
});
test('compensation intent never executes or claims completion and duplicate plans share identity', () => {
  const first = plan(observedBooking(), failed('payment', 'PAYMENT_REJECTED'));
  const second = plan(observedBooking(), failed('payment', 'PAYMENT_REJECTED'));
  assert.equal(first.compensationCompleted, false); assert.equal(first.compensationAttemptAllowed, false);
  assert.equal(first.actionKeys.compensation, second.actionKeys.compensation); assert.equal(forbiddenCalls, 0);
});
test('malformed recovery observations rejected rather than becoming success', () => {
  for (const booking of [null, [], { state: 'BOOKED' }, { state: 'arbitrary' }])
    assert.throws(() => plan(booking), { code: 'RECOVERY_INPUT_INVALID' });
  assert.throws(() => recovery.classifyFailure({}, { dispatch: 'invalid' }), { code: 'RECOVERY_INPUT_INVALID' });
});
test('recovery output excludes secrets raw errors and traveller PII', () => {
  const value = plan(failed('booking', 'TIMEOUT', { error: { code: 'TIMEOUT', message: 'SyntheticPrivate JWT Authorization secret DB-url',
    stack: 'private-stack', response: { data: 'private-body' } }, firstName: 'SyntheticPrivate' }));
  assert.doesNotMatch(JSON.stringify(value), /SyntheticPrivate|JWT|Authorization|secret|DB-url|private-stack|private-body|message|stack/);
});
test('safe booking/payment boundaries stay unchanged and all real operations remain off', async () => {
  const b = await submit(bookingController.createBookingIntent), p = await submit(paymentController.createCheckoutPaymentIntent);
  assert.equal(b.body.providerState, 'PROVIDER_NOT_CALLED'); assert.equal(p.body.providerState, 'PROVIDER_NOT_CALLED');
  assert.equal(p.body.paymentState, 'PAYMENT_NOT_STARTED'); assert.equal(p.body.bookingAvailable, false); assert.equal(p.body.paymentAvailable, false);
  assert.equal(paymentService.readiness().mode, 'disabled'); assert.equal(paymentService.readiness().provider, 'none');
  const gate = require('../services/productionGateService').state();
  assert.equal(gate.realChargesEnabled, false); assert.equal(gate.realRefundsEnabled, false); assert.equal(gate.productionSalesEnabled, false);
});
test('history projection preserves unknown/failure facts without introducing confirmed records', () => {
  const { publicBooking } = require('../services/bookingHistoryPublic');
  for (const provider_status of ['confirming', 'confirmation_unknown', 'confirmation_failed']) {
    const value = publicBooking({ id: 1, provider: 'hotelbeds', provider_status, status: 'Новая', offer_snapshot: {}, payment_status: 'pending' });
    assert.equal(value.provider_status, provider_status); assert.equal(value.status, 'Новая'); assert.equal(value.confirmed_at, null);
    assert.equal(value.payment_status, 'pending'); assert.equal(forbiddenCalls, 0);
  }
});
