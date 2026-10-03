const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', HOTELBEDS_ENV: 'test', HOTELBEDS_ENABLED: 'true', HOTELBEDS_BOOKING_ENABLED: 'false',
  PAYMENTS_MODE: 'disabled', PAYMENTS_PROVIDER: 'none', REAL_CHARGES_ENABLED: 'false', REAL_REFUNDS_ENABLED: 'false', PRODUCTION_SALES_ENABLED: 'false' });
const lifecycle = require('../services/bookingLifecycle');
const ready = patch => ({ checkRate: 'CONFIRMED', travelers: 'VALID', review: 'REVIEW_READY', ...patch });
const confirmed = patch => ready({ booking: 'CONFIRMED', evidence: { booking: true }, ...patch });
const paid = patch => confirmed({ payment: 'paid', evidence: { booking: true, payment: true }, ...patch });
const valid = value => assert.equal(lifecycle.validateLifecycleState(value).valid, true);
const invalid = value => { const result = lifecycle.validateLifecycleState(value); assert.equal(result.valid, false); assert.equal(result.status, 'LIFECYCLE_INVALID'); };
beforeEach(t => {
  const forbidden = () => assert.fail('No provider/DB/logging operation');
  const pool = require('../db'); t.mock.method(pool, 'query', forbidden); t.mock.method(pool, 'connect', forbidden);
  for (const method of ['availability', 'checkRates', 'createBooking', 'cancelBooking', 'getBooking', 'listBookings'])
    t.mock.method(require('../integrations/hotelbeds/client'), method, forbidden);
  for (const method of ['createIntent']) t.mock.method(require('../services/paymentGatewayService'), method, forbidden);
  for (const method of ['confirm', 'cancel', 'simulateCancellation', 'reconcile']) t.mock.method(require('../services/hotelbedsBookingService'), method, forbidden);
  for (const method of ['requestSandboxRefund', 'completeSandboxRefund']) t.mock.method(require('../controllers/refundController'), method, forbidden);
  for (const method of ['info', 'warn', 'error']) t.mock.method(require('../utils/logger'), method, forbidden);
});

test('confirmed CheckRate valid travellers and ready review are consistent', () => { valid(ready()); assert.equal(lifecycle.deriveLifecycleStatus(ready()), 'READY_FOR_BOOKING'); });
test('current staging disabled lifecycle valid and not technical failure', () => {
  const state = ready({ booking: 'BOOKING_DISABLED', payment: 'PAYMENTS_DISABLED' }); valid(state);
  assert.equal(lifecycle.deriveLifecycleStatus(state), 'BOOKING_DISABLED'); assert.equal(lifecycle.validateLifecycleState(state).category, 'SAFE_DISABLED_TERMINAL');
});
test('review without confirmed CheckRate invalid', () => invalid(ready({ checkRate: 'NOT_CONFIRMED' })));
test('review with invalid travellers invalid', () => invalid(ready({ travelers: 'INVALID' })));
test('unavailable and retryable CheckRate cannot become ready review', () => { for (const checkRate of ['UNAVAILABLE', 'RETRYABLE_ERROR']) invalid(ready({ checkRate })); });
test('booking cannot begin before valid review', () => invalid({ booking: 'confirming' }));
test('pending payment before booking or at disabled booking invalid', () => { invalid(ready({ payment: 'pending' })); invalid(ready({ booking: 'BOOKING_DISABLED', payment: 'pending' })); });
test('paid with failed booking requires explicit recovery inconsistency', () => {
  invalid(ready({ booking: 'BOOKING_FAILED_FINAL', payment: 'paid', evidence: { payment: true } }));
  valid(ready({ booking: 'BOOKING_FAILED_FINAL', payment: 'paid', evidence: { payment: true }, recovery: 'COMPENSATION_REQUIRED', compensation: 'REFUND_REQUIRED' }));
});
test('cancelled when cancellation unavailable invalid', () => invalid(paid({ cancellation: 'CANCELLED', cancellationAvailable: false, evidence: { booking: true, payment: true, cancellation: true } })));
test('refunded when refund unavailable invalid', () => invalid(paid({ refund: 'refunded', refundAvailable: false, evidence: { booking: true, payment: true, refund: true } })));
test('completed with compensation required invalid', () => invalid(paid({ completed: true, compensation: 'REFUND_REQUIRED', recovery: 'COMPENSATION_REQUIRED' })));
test('completed with reconciliation required invalid', () => invalid(paid({ completed: true, reconciliationRequired: true })));
test('booking unknown requires explicit reconciliation', () => {
  invalid(ready({ booking: 'confirmation_unknown' }));
  const value = ready({ booking: 'confirmation_unknown', reconciliationRequired: true }); valid(value);
  assert.equal(lifecycle.deriveLifecycleStatus(value), 'RECONCILIATION_REQUIRED');
});
test('payment unknown stays distinct from paid and final failure', () => {
  const value = confirmed({ payment: 'PAYMENT_OUTCOME_UNKNOWN', reconciliationRequired: true }); valid(value);
  assert.equal(lifecycle.validateLifecycleState(value).category, 'UNKNOWN');
});
test('cancellation unknown requires reconciliation and cannot imply success', () => {
  const value = paid({ cancellation: 'CANCELLATION_OUTCOME_UNKNOWN', reconciliationRequired: true }); valid(value); invalid({ ...value, success: true });
});
test('refund unknown requires reconciliation', () => { const value = paid({ refund: 'REFUND_OUTCOME_UNKNOWN', recovery: 'RECONCILIATION_REQUIRED' }); valid(value); assert.equal(lifecycle.deriveLifecycleStatus(value), 'RECONCILIATION_REQUIRED'); });
test('unknown booking cannot assume cancellation succeeded', () => invalid(ready({ booking: 'BOOKING_OUTCOME_UNKNOWN', reconciliationRequired: true, cancellation: 'CANCELLED', evidence: { cancellation: true } })));
test('confirmed booking plus failed payment remains unresolved', () => {
  invalid(confirmed({ payment: 'failed' })); const value = confirmed({ payment: 'failed', recovery: 'COMPENSATION_REQUIRED', compensation: 'CANCELLATION_REQUIRED' }); valid(value);
  assert.equal(lifecycle.deriveLifecycleStatus(value), 'RECOVERY_REQUIRED'); invalid({ ...value, completed: true });
});
test('captured payment plus failed booking requires refund compensation', () => {
  const value = ready({ booking: 'BOOKING_FAILED_FINAL', payment: 'PAYMENT_CAPTURED', evidence: { payment: true }, recovery: 'COMPENSATION_REQUIRED', compensation: 'REFUND_REQUIRED' });
  valid(value); assert.equal(lifecycle.deriveLifecycleStatus(value), 'RECOVERY_REQUIRED'); invalid({ ...value, success: true });
});
test('cancelled booking with final refund failure cannot resolve', () => {
  const value = paid({ cancellation: 'CANCELLED', refund: 'REFUND_FAILED_FINAL', evidence: { booking: true, payment: true, cancellation: true }, recovery: 'COMPENSATION_REQUIRED', compensation: 'REFUND_REQUIRED' });
  valid(value); invalid({ ...value, completed: true });
});
test('refund observed plus cancellation unknown requires reconciliation', () => {
  const value = paid({ cancellation: 'CANCELLATION_OUTCOME_UNKNOWN', refund: 'refunded', reconciliationRequired: true, evidence: { booking: true, payment: true, refund: true } });
  valid(value); assert.equal(lifecycle.deriveLifecycleStatus(value), 'RECONCILIATION_REQUIRED');
});
test('success labels without provider-operation evidence do not manufacture completed state', () => { invalid(ready({ booking: 'CONFIRMED', payment: 'paid' })); assert.notEqual(lifecycle.deriveLifecycleStatus(ready()), 'COMPLETED'); });
test('genuine hypothetical evidenced completion may be validated only', () => { valid(paid({ completed: true })); assert.equal(lifecycle.deriveLifecycleStatus(paid()), 'COMPLETED'); });
test('review to disabled booking and disabled payment transition allowed', () => assert.equal(lifecycle.validateTransition(ready(), ready({ booking: 'BOOKING_DISABLED', payment: 'PAYMENTS_DISABLED' })), true));
test('booking pending to retryable failure allowed', () => assert.equal(lifecycle.validateTransition(ready({ booking: 'confirming' }), ready({ booking: 'BOOKING_FAILED_RETRYABLE' })), true));
test('booking pending to unknown allowed with reconciliation', () => assert.equal(lifecycle.validateTransition(ready({ booking: 'confirming' }), ready({ booking: 'confirmation_unknown', reconciliationRequired: true })), true));
test('payment pending to retryable failure allowed with recovery', () => assert.equal(lifecycle.validateTransition(confirmed({ payment: 'pending' }), confirmed({ payment: 'PAYMENT_FAILED_RETRYABLE', recovery: 'RECOVERY_PENDING' })), true));
test('cancellation and refund pending to unknown accepted', () => {
  assert.equal(lifecycle.validateTransition(paid({ cancellation: 'CANCELLATION_PENDING' }), paid({ cancellation: 'CANCELLATION_OUTCOME_UNKNOWN', reconciliationRequired: true })), true);
  const canceled = paid({ cancellation: 'CANCELLED', evidence: { booking: true, payment: true, cancellation: true } });
  assert.equal(lifecycle.validateTransition({ ...canceled, refund: 'REFUND_PENDING' }, { ...canceled, refund: 'REFUND_OUTCOME_UNKNOWN', reconciliationRequired: true }), true);
});
test('review to paid and not-started to refunded are impossible jumps', () => { assert.equal(lifecycle.validateTransition(ready(), paid()), false); assert.equal(lifecycle.validateTransition(ready(), paid({ refund: 'refunded', evidence: { booking: true, payment: true, refund: true } })), false); });
test('disabled boundaries never transition to cancelled or refunded', () => {
  assert.equal(lifecycle.validateTransition(ready({ booking: 'BOOKING_DISABLED' }), paid({ cancellation: 'CANCELLED', evidence: { booking: true, payment: true, cancellation: true } })), false);
  assert.equal(lifecycle.validateTransition(confirmed({ payment: 'PAYMENTS_DISABLED' }), paid({ refund: 'refunded', evidence: { booking: true, payment: true, refund: true } })), false);
});
test('unknown cannot become success or final failure without reconciliation evidence', () => {
  const before = ready({ booking: 'confirmation_unknown', reconciliationRequired: true });
  const after = confirmed({ reconciliationRequired: false }); assert.equal(lifecycle.validateTransition(before, after), false);
  assert.equal(lifecycle.validateTransition(before, after, { reconciled: true }), true);
  assert.equal(lifecycle.validateTransition(before, ready({ booking: 'BOOKING_FAILED_FINAL' })), false);
});
test('terminal states cannot go backwards; explicit recovery needed for failure retry', () => {
  assert.equal(lifecycle.validateTransition(paid(), ready()), false);
  const before = ready({ booking: 'BOOKING_FAILED_FINAL' }), after = ready({ booking: 'confirming' });
  assert.equal(lifecycle.validateTransition(before, after), false); assert.equal(lifecycle.validateTransition(before, after, { recoveryAuthorized: true }), true);
});
test('compensation cannot disappear without explicit recovery authorization', () => {
  const before = paid({ recovery: 'COMPENSATION_REQUIRED', compensation: 'REFUND_REQUIRED' });
  assert.equal(lifecycle.validateTransition(before, paid()), false);
});
test('shared disabled contracts make no provider DB or payment operation', () => {
  const recovery = require('../services/bookingPaymentRecovery'), requestId = 'a'.repeat(32);
  assert.equal(recovery.disabledBoundary('booking', requestId).state, 'BOOKING_DISABLED');
  assert.equal(recovery.disabledBoundary('payment', requestId).state, 'PAYMENTS_DISABLED');
});
test('provider reference alone cannot support already-confirmed success', () => {
  const booking = { provider_booking_id: 'synthetic-reference', provider_status: 'confirmation_unknown' };
  assert.equal(lifecycle.providerConfirmationConsistent(booking), false);
  booking.provider_status = 'CONFIRMED'; assert.equal(lifecycle.providerConfirmationConsistent(booking), false);
  booking.provider_response = { booking: { reference: booking.provider_booking_id, status: 'CONFIRMED' } };
  assert.equal(lifecycle.providerConfirmationConsistent(booking), true);
});
test('malformed states and secrets stay out of consistency errors', () => {
  for (const value of [null, [], { booking: 'Authorization-private-secret' }, { completed: 'true' }, { evidence: { booking: 'yes' } }]) {
    const result = lifecycle.validateLifecycleState(value); assert.equal(result.valid, false); assert.doesNotMatch(JSON.stringify(result), /Authorization|private-secret/);
  }
  assert.throws(() => lifecycle.assertLifecycleState({ success: true }), { code: 'LIFECYCLE_INCONSISTENT' });
});
