const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', HOTELBEDS_ENV: 'test', HOTELBEDS_ENABLED: 'true',
  HOTELBEDS_BOOKING_ENABLED: 'false', HOTELBEDS_LIVE_BOOKING_ENABLED: 'false', PAYMENTS_MODE: 'disabled',
  PAYMENTS_PROVIDER: 'none', REAL_CHARGES_ENABLED: 'false', REAL_REFUNDS_ENABLED: 'false',
  PRODUCTION_SALES_ENABLED: 'false', EMAIL_ENABLED: 'false', JWT_SECRET: 'offline-6l-synthetic-auth-secret' });
const bookingService = require('../services/hotelbedsBookingService');
const paymentService = require('../services/paymentGatewayService');
const recovery = require('../services/bookingPaymentRecovery');
const cancellationController = require('../controllers/providerBookingController');
const refundController = require('../controllers/refundController');
const pool = require('../db');
const access = { bookingId: '1', userId: 7 };
const fixture = () => ({ id: 1, user_id: 7, provider: 'hotelbeds', provider_booking_id: 'synthetic-private-reference',
  provider_status: 'CONFIRMED', currency: 'EUR', offer_snapshot: { priceEnvironment: 'test' },
  provider_response: { booking: { reference: 'synthetic-private-reference', status: 'CONFIRMED', currency: 'EUR' } } });
const charge = () => ({ id: 10, booking_id: 1, status: 'paid', amount: '110.25', refunded_amount: '10.00',
  gateway_provider: 'synthetic-future-psp', external_id: 'synthetic-private-transaction', metadata: { realCharge: true, currency: 'EUR' } });
let booking, payment, reads, forbiddenCalls;
beforeEach(t => {
  booking = fixture(); payment = null; reads = 0; forbiddenCalls = 0;
  const forbidden = () => { forbiddenCalls++; assert.fail('Provider or DB mutation forbidden'); };
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.deepEqual(params, ['1']); reads++;
    if (sql === 'SELECT * FROM bookings WHERE id = $1') return { rows: booking ? [booking] : [] };
    assert.equal(sql, 'SELECT * FROM payments WHERE booking_id = $1 ORDER BY id DESC LIMIT 1');
    return { rows: payment ? [payment] : [] };
  });
  t.mock.method(pool, 'connect', forbidden);
  for (const method of ['availability', 'checkRates', 'createBooking', 'cancelBooking', 'getBooking', 'listBookings'])
    t.mock.method(require('../integrations/hotelbeds/client'), method, forbidden);
  for (const method of ['cancel', 'simulateCancellation', 'confirm', 'sync', 'reconcile']) t.mock.method(bookingService, method, forbidden);
  t.mock.method(paymentService, 'createIntent', forbidden);
  for (const method of ['requestSandboxRefund', 'completeSandboxRefund']) t.mock.method(refundController, method, forbidden);
  for (const method of ['info', 'warn', 'error']) t.mock.method(require('../utils/logger'), method, forbidden);
});
const cancellation = (request = {}, options = access) => bookingService.prepareCancellationIntent(request, booking, options);
const refund = (request = {}, options = access) => paymentService.prepareRefundIntent(request, booking, payment, options);
function cancelled(penalty = '20.25') {
  booking.provider_status = 'CANCELLED'; booking.provider_response.booking.status = 'CANCELLED';
  if (penalty !== undefined) booking.provider_response.booking.cancellationAmount = penalty;
}
async function submit(controller, body = {}, user = { id: 7, role: 'user' }) {
  let status, result;
  await controller({ params: { id: '1' }, user, body }, { status(value) { status = value; return this; }, json(value) { result = value; } });
  assert.equal(forbiddenCalls, 0); return { status, body: result };
}
const requestId = require('node:crypto').createHash('sha256').update('booking-1').digest('hex').slice(0, 32);
const comp = (cancellation, refund, extra = {}) => recovery.compensationPlan({ requestId, cancellation, refund, ...extra });

test('unconfirmed booking cannot become eligible for cancellation', () => {
  booking.provider_status = 'local_pending'; delete booking.provider_booking_id;
  assert.equal(cancellation().intent.eligibility, 'REAL_CONFIRMED_BOOKING_REQUIRED');
});
test('review and disabled intent states are not confirmed bookings', () => {
  for (const state of ['REVIEW_READY', 'INTENT_READY', 'BOOKING_DISABLED', 'confirming', 'confirmation_unknown', 'confirmation_failed']) {
    booking.provider_status = state; assert.equal(cancellation().intent.eligibility, 'REAL_CONFIRMED_BOOKING_REQUIRED');
  }
});
test('booking identity must match stored row, reference and provider evidence', () => {
  assert.throws(() => cancellation({}, { ...access, bookingId: '2' }), { code: 'BOOKING_NOT_FOUND' });
  booking.provider_response.booking.reference = 'other'; assert.equal(cancellation().intent.eligibility, 'REAL_CONFIRMED_BOOKING_REQUIRED');
  booking = fixture(); delete booking.provider_response; assert.equal(cancellation().intent.eligibility, 'REAL_CONFIRMED_BOOKING_REQUIRED');
});
test('arbitrary booking ID does not bypass owner access', async () => {
  const result = await submit(cancellationController.createCancellationIntent, {}, { id: 999, role: 'user' });
  assert.equal(result.status, 403); assert.equal(result.body.code, 'BOOKING_ACCESS_DENIED');
  assert.equal(cancellation({}, { ...access, userId: 999, isAdmin: true }).state, 'CANCELLATION_UNAVAILABLE');
});
test('client booking state and eligibility cannot establish cancellation', () => {
  for (const field of ['state', 'providerState', 'eligible', 'review', 'bookingId'])
    assert.throws(() => cancellation({ [field]: 'CONFIRMED' }), { code: 'COMPENSATION_INTENT_INVALID' });
});
test('client reference and environment rejected; stored environment remains TEST only', () => {
  for (const request of [{ providerReference: 'forged' }, { environment: 'live' }])
    assert.throws(() => cancellation(request), { code: 'COMPENSATION_INTENT_INVALID' });
  booking.offer_snapshot.priceEnvironment = 'live'; assert.equal(cancellation().intent.eligibility, 'REAL_CONFIRMED_BOOKING_REQUIRED');
});
test('client penalty cannot override trusted estimate', () => {
  assert.throws(() => cancellation({ penalty: 0 }), { code: 'COMPENSATION_INTENT_INVALID' });
});
test('saved same-booking quote supplies estimated penalty and exact currency', () => {
  booking.provider_cancellation_snapshot = { booking: { ...booking.provider_response.booking, cancellationAmount: '20.25' } };
  const value = cancellation(); assert.equal(value.intent.estimatedPenalty, 20.25); assert.equal(value.intent.currency, 'EUR');
  assert.equal(value.intent.penaltyStatus, 'ESTIMATE_ONLY'); assert.equal(value.cancellationAvailable, false);
});
test('missing null blank or malformed penalty stays UNKNOWN, never default zero', () => {
  for (const penalty of [undefined, null, '', ' ', {}, 'invalid']) {
    booking.provider_cancellation_snapshot = { booking: { ...booking.provider_response.booking, cancellationAmount: penalty } };
    assert.equal(cancellation().intent.estimatedPenalty, null); assert.equal(cancellation().intent.penaltyStatus, 'UNKNOWN');
  }
});
test('unrelated quote reference or currency cannot determine penalty', () => {
  for (const patch of [{ reference: 'other' }, { currency: 'USD' }]) {
    booking.provider_cancellation_snapshot = { booking: { ...booking.provider_response.booking, cancellationFee: '20.25', ...patch } };
    assert.equal(cancellation().intent.estimatedPenalty, null);
  }
});
test('cancellation never emits fake completed state or calls provider', () => {
  const value = cancellation(); assert.equal(value.code, 'CANCELLATION_UNAVAILABLE'); assert.equal(value.success, false);
  assert.equal(value.providerState, 'PROVIDER_NOT_CALLED'); assert.doesNotMatch(JSON.stringify(value), /CANCELLED|REFUNDED|SUCCESS/);
  assert.equal(forbiddenCalls, 0);
});
test('pre-dispatch cancellation transient failure is retryable', () => {
  const value = comp({ state: 'failed', error: { code: 'TIMEOUT' }, dispatch: 'NOT_SENT' });
  assert.equal(value.cancellationOutcome, 'RETRYABLE'); assert.equal(value.cancellationAttemptAllowed, false);
});
test('known cancellation rejection is final and unavailable is non-retryable', () => {
  assert.equal(comp({ state: 'failed', error: { status: 422 }, dispatch: 'SENT', outcomeKnown: true }).cancellationOutcome, 'NON_RETRYABLE');
  assert.equal(recovery.classifyFailure({ code: 'CANCELLATION_UNAVAILABLE' }), 'NON_RETRYABLE');
});
test('possibly accepted cancellation timeout remains unknown and requires reconciliation', () => {
  const value = comp({ state: 'failed', error: { code: 'ECONNRESET' }, dispatch: 'SENT' });
  assert.equal(value.cancellationOutcome, 'OUTCOME_UNKNOWN'); assert.equal(value.reconciliationRequired, true);
  assert.equal(value.refundPrerequisiteSatisfied, false);
});
test('duplicate cancellation intents never produce attempts or writes', async () => {
  const results = await Promise.all([submit(cancellationController.createCancellationIntent), submit(cancellationController.createCancellationIntent)]);
  assert.deepEqual(results[0], results[1]); assert.equal(results[0].status, 503); assert.equal(reads, 2);
});
test('no real charge means refund unavailable with unknown amount', () => {
  const value = refund(); assert.equal(value.code, 'REFUND_UNAVAILABLE'); assert.equal(value.intent.eligibility, 'REAL_CHARGE_REQUIRED');
  assert.equal(value.intent.amount, null); assert.equal(value.intent.currency, null);
});
test('sandbox paid and unproven local paid are not refundable real charges', () => {
  for (const patch of [{ gateway_provider: 'sandbox' }, { metadata: { realCharge: false, currency: 'EUR' } }, { external_id: 'sbx_fake' }]) {
    payment = { ...charge(), ...patch }; assert.equal(refund().intent.eligibility, 'REAL_CHARGE_REQUIRED');
  }
});
test('payment must match trusted booking and real transaction facts', () => {
  for (const patch of [{ booking_id: 2 }, { status: 'pending' }, { external_id: null }, { metadata: { realCharge: true } }, { refunded_amount: undefined }]) {
    payment = { ...charge(), ...patch }; assert.equal(refund().intent.eligibility, 'REAL_CHARGE_REQUIRED');
  }
});
test('client refund amount currency and transaction identity rejected', () => {
  for (const field of ['refundAmount', 'amount', 'currency', 'transactionId', 'paymentId', 'refundStatus'])
    assert.throws(() => refund({ [field]: 'forged' }), { code: 'COMPENSATION_INTENT_INVALID' });
});
test('trusted charged cents minus actual penalty and prior refunds remain authoritative', () => {
  payment = charge(); cancelled(); const value = refund();
  assert.equal(value.intent.amount, 80); assert.equal(value.intent.currency, 'EUR'); assert.equal(value.intent.eligibility, 'REFUNDABLE_CHARGE');
  assert.equal(value.refundAvailable, false);
});
test('unknown actual penalty cannot fabricate refund amount', () => {
  payment = charge(); cancelled(null); assert.equal(refund().intent.amount, null); assert.equal(refund().intent.eligibility, 'PENALTY_UNKNOWN');
});
test('saved cancellation simulation cannot satisfy cancellation-before-refund', () => {
  payment = charge(); booking.provider_cancellation_snapshot = { booking: { ...booking.provider_response.booking, status: 'CANCELLED', cancellationAmount: 0 } };
  assert.equal(refund().intent.eligibility, 'CANCELLATION_REQUIRED'); assert.equal(refund().intent.amount, null);
  assert.equal(comp({ state: 'CANCELLATION_PENDING' }).refundPrerequisiteSatisfied, false);
});
test('refund boundary never emits fake refund success or calls refund provider', () => {
  payment = charge(); cancelled(); const value = refund(); assert.equal(value.state, 'REFUND_UNAVAILABLE');
  assert.equal(value.providerState, 'PROVIDER_NOT_CALLED'); assert.equal(value.success, false);
  assert.doesNotMatch(JSON.stringify(value), /REFUNDED|CANCELLED|SUCCESS/); assert.equal(forbiddenCalls, 0);
});
test('pre-dispatch refund failure is retryable without execution', () => {
  const value = comp({}, { state: 'failed', error: { status: 503 }, dispatch: 'NOT_SENT' });
  assert.equal(value.refundOutcome, 'RETRYABLE'); assert.equal(value.refundAttemptAllowed, false);
});
test('explicit known refund rejection is final', () => {
  assert.equal(comp({}, { state: 'failed', error: { status: 400 }, dispatch: 'SENT', outcomeKnown: true }).refundOutcome, 'NON_RETRYABLE');
  assert.equal(recovery.classifyFailure({ code: 'REFUND_UNAVAILABLE' }), 'NON_RETRYABLE');
});
test('refund response lost after dispatch is unknown, never refunded or failed', () => {
  const value = comp({}, { state: 'failed', error: { code: 'TIMEOUT' }, dispatch: 'SENT' });
  assert.equal(value.refundOutcome, 'OUTCOME_UNKNOWN'); assert.equal(value.reconciliationRequired, true); assert.equal(value.compensationCompleted, false);
});
test('repeated and concurrent refund intents produce no duplicate attempts or rows', async () => {
  const results = await Promise.all([submit(refundController.createRefundIntent), submit(refundController.createRefundIntent)]);
  results.push(await submit(refundController.createRefundIntent));
  for (const result of results) assert.deepEqual(result, results[0]); assert.equal(reads, 6);
  assert.equal(results[0].body.intent.requestId, requestId);
});
test('future cancellation result plus refund failure remains unresolved', () => {
  const value = comp({ state: 'CANCELLED', providerResultObserved: true }, { state: 'failed', error: { status: 422 }, dispatch: 'SENT', outcomeKnown: true });
  assert.equal(value.state, 'COMPENSATION_REQUIRED'); assert.equal(value.compensation, 'REFUND_REQUIRED'); assert.equal(value.success, false);
  assert.equal(value.refundPrerequisiteSatisfied, true); assert.equal(value.refundAttemptAllowed, false);
});
test('future refund result plus unknown cancellation requires reconciliation', () => {
  const value = comp({ state: 'CANCELLATION_OUTCOME_UNKNOWN' }, { state: 'refunded', providerResultObserved: true });
  assert.equal(value.state, 'RECOVERY_PENDING'); assert.equal(value.reconciliationRequired, true); assert.equal(value.compensationCompleted, false);
});
test('6K obligations and stable compensation correlation preserved, no automatic action', () => {
  const extra = { booking: { state: 'CONFIRMED', providerResultObserved: true }, payment: { state: 'failed', error: { status: 422 }, dispatch: 'NOT_SENT' } };
  const value = comp({}, {}, extra), repeat = comp({}, {}, extra);
  assert.equal(value.compensation, 'CANCELLATION_REQUIRED'); assert.deepEqual(value.actionKeys, repeat.actionKeys);
  assert.equal(value.actionKeys.cancellation, `${requestId}:cancellation`); assert.equal(value.actionKeys.refund, `${requestId}:refund`);
  assert.equal(value.compensationAttemptAllowed, false); assert.equal(value.compensationCompleted, false);
  assert.equal(comp({ state: 'CANCELLED' }, { state: 'refunded' }).reconciliationRequired, true);
});
test('public errors and previews omit raw secrets references and guest PII', async t => {
  Object.assign(booking, { first_name: 'SyntheticPrivate', secret: 'private-secret' });
  assert.doesNotMatch(JSON.stringify(cancellation()), /SyntheticPrivate|private-secret|synthetic-private-reference|provider_response/);
  t.mock.method(pool, 'query', async () => { throw Error('Authorization JWT DB-url SyntheticPrivate stack'); });
  const result = await submit(refundController.createRefundIntent);
  assert.equal(result.body.code, 'INTERNAL_RETRYABLE_ERROR'); assert.doesNotMatch(JSON.stringify(result.body), /Authorization|JWT|DB-url|SyntheticPrivate|stack/);
});
test('auth protects intent routes; refund access denied before payment read', async t => {
  const denied = await submit(refundController.createRefundIntent, {}, { id: 999, role: 'user' });
  assert.equal(denied.status, 403); assert.equal(reads, 1);
  const express = require('express'), app = express(); app.use(express.json());
  app.use('/bookings', require('../routes/bookingRoutes')); app.use('/payments', require('../routes/paymentRoutes'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const send = route => new Promise((resolve, reject) => {
    const req = require('node:http').request(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/json' } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode)); res.on('error', reject);
    }); req.on('error', reject); req.end('{}');
  });
  assert.equal(await send('/bookings/1/provider/cancel/intent'), 401); assert.equal(await send('/payments/1/refund/intent'), 401);
  assert.equal(reads, 1);
});
test('zero genuine penalty is preserved, invalid money never produces a refund', () => {
  payment = charge(); cancelled({ amount: '0.00' }); assert.equal(refund().intent.amount, 100.25);
  payment.refunded_amount = '111'; assert.equal(refund().intent.eligibility, 'REAL_CHARGE_REQUIRED');
  payment = charge(); payment.metadata.currency = 'USD'; assert.equal(refund().intent.currency, null);
  payment = charge(); payment.amount = 'not-money'; assert.equal(refund().intent.amount, null);
});
