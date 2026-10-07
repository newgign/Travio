const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
require('./offlineNetwork.cjs');
Object.assign(process.env, { NODE_ENV: 'test', PAYMENTS_MODE: 'disabled', PAYMENTS_PROVIDER: 'none',
  REAL_CHARGES_ENABLED: 'false', REAL_REFUNDS_ENABLED: 'false', PRODUCTION_SALES_ENABLED: 'false',
  HOTELBEDS_ENV: 'test', HOTELBEDS_BOOKING_ENABLED: 'false', HOTELBEDS_LIVE_BOOKING_ENABLED: 'false' });
const { evaluate } = require('../services/paymentReconciliation');
const { normalizeEvent } = require('../services/paymentProviderContract');
const ev = (type = 'payment.pending', extra = {}) => normalizeEvent({ eventId: 'synthetic_event', provider: 'synthetic_mock',
  paymentId: 'synthetic_payment', requestId: 'a'.repeat(32), type, amount: '110.25', currency: 'EUR', ...extra });
const base = extra => ({ intent: { state: 'PAYMENT_INTENT_READY', reviewState: 'REVIEW_READY', requestId: 'a'.repeat(32), amount: '110.25', currency: 'EUR' },
  provider: 'synthetic_mock', providerPaymentId: 'synthetic_payment', paymentState: 'PAYMENT_PENDING',
  booking: { state: 'BOOKING_CONFIRMED', providerResultObserved: true }, ...extra });
const run = extra => evaluate(base(extra));
const captured = extra => run({ paymentState: 'PAYMENT_CAPTURED', previousEvidence: [ev('payment.captured')], ...extra });
const unknown = extra => run({ paymentState: 'PAYMENT_OUTCOME_UNKNOWN', ...extra });
let calls;
beforeEach(t => {
  calls = 0;
  const forbidden = () => { calls++; assert.fail('Offline evaluation attempted an operation'); };
  const pool = require('../db'); t.mock.method(pool, 'query', forbidden); t.mock.method(pool, 'connect', forbidden);
  for (const name of ['availability', 'checkRates', 'createBooking', 'cancelBooking', 'getBooking', 'listBookings']) t.mock.method(require('../integrations/hotelbeds/client'), name, forbidden);
  for (const name of ['confirm', 'cancel', 'simulateCancellation', 'reconcile']) t.mock.method(require('../services/hotelbedsBookingService'), name, forbidden);
  t.mock.method(require('../services/paymentGatewayService'), 'createIntent', forbidden);
  for (const name of ['requestSandboxRefund', 'completeSandboxRefund']) t.mock.method(require('../controllers/refundController'), name, forbidden);
  for (const name of ['info', 'warn', 'error']) t.mock.method(require('../utils/logger'), name, forbidden);
});
afterEach(() => assert.equal(calls, 0));
test('unknown requires reconciliation', () => assert.equal(unknown().status, 'RECONCILIATION_REQUIRED'));
test('unknown never becomes paid', () => { const r = unknown(); assert.equal(r.observedPaymentState, 'PAYMENT_OUTCOME_UNKNOWN'); assert.equal(r.commercialSuccess, false); });
test('ordinary failed evidence cannot clear unknown', () => assert.equal(unknown({ event: ev('payment.failed') }).observedPaymentState, 'PAYMENT_OUTCOME_UNKNOWN'));
test('ordinary capture cannot clear unknown', () => assert.equal(unknown({ event: ev('payment.captured') }).observedPaymentState, 'PAYMENT_OUTCOME_UNKNOWN'));
test('unknown evaluation is deterministic', () => assert.deepEqual(unknown(), unknown()));
test('trusted explicit reconciliation derives capture only in contract', () => { const r = unknown({ event: ev('payment.captured', { reconciled: true }) }); assert.equal(r.observedPaymentState, 'PAYMENT_CAPTURED'); assert.equal(r.applicationPaymentState, 'PAYMENTS_DISABLED'); });
test('captured then failed conflicts and preserves both fingerprints', () => { const r = captured({ event: ev('payment.failed', { eventId: 'later' }) }); assert.equal(r.status, 'STATE_CONFLICT'); assert.equal(r.manualReviewRequired, true); assert.equal(r.diagnostic.previousEvidenceFingerprints.length, 1); assert.ok(r.diagnostic.incomingEvidenceFingerprint); });
test('failed then captured conflicts', () => assert.equal(run({ paymentState: 'PAYMENT_FAILED_FINAL', previousEvidence: [ev('payment.failed')], event: ev('payment.captured', { eventId: 'later' }) }).status, 'STATE_CONFLICT'));
test('contradictory accepted finals conflict without incoming event', () => assert.equal(captured({ previousEvidence: [ev('payment.captured'), ev('payment.failed', { eventId: 'later' })] }).status, 'STATE_CONFLICT'));
test('stale pending cannot overwrite capture', () => { const r = captured({ event: ev('payment.pending', { eventId: 'stale' }) }); assert.equal(r.status, 'STATE_CONFLICT'); assert.equal(r.observedPaymentState, 'PAYMENT_CAPTURED'); });
test('timestamps never establish provider ordering', () => assert.throws(() => run({ event: { ...ev(), timestamp: 999999 } }), { code: 'RECONCILIATION_INPUT_INVALID' }));
test('matching trusted money evaluated', () => { const r = run({ event: ev() }); assert.equal(r.diagnostic.amountMatch, true); assert.equal(r.diagnostic.currencyMatch, true); });
test('amount mismatch requires review', () => { const r = run({ event: ev('payment.captured', { amount: '1.00' }) }); assert.equal(r.reasonCode, 'PAYMENT_AMOUNT_MISMATCH'); assert.equal(r.manualReviewRequired, true); assert.equal(r.commercialSuccess, false); });
test('currency mismatch requires review', () => assert.equal(run({ event: ev('payment.captured', { currency: 'USD' }) }).reasonCode, 'PAYMENT_CURRENCY_MISMATCH'));
test('browser money is ignored', () => assert.deepEqual(run({ event: ev(), browserAmount: 1, browserCurrency: 'USD' }), run({ event: ev() })));
test('captured with failed booking recommends refund review', () => { const r = captured({ booking: { state: 'BOOKING_FAILED_FINAL', providerResultObserved: false } }); assert.equal(r.status, 'COMPENSATION_REQUIRED'); assert.equal(r.recommendedNextAction, 'REVIEW_REFUND'); assert.equal(r.refundAttemptAllowed, false); });
test('capture with unknown booking requires reconciliation', () => assert.equal(captured({ booking: { state: 'BOOKING_OUTCOME_UNKNOWN', providerResultObserved: false } }).status, 'RECONCILIATION_REQUIRED'));
test('confirmed booking with failed payment recommends cancellation review', () => { const r = run({ paymentState: 'PAYMENT_FAILED_FINAL' }); assert.equal(r.recommendedNextAction, 'REVIEW_CANCELLATION'); assert.equal(r.cancellationAttemptAllowed, false); });
test('confirmed booking with unknown payment requires reconciliation', () => assert.equal(unknown().reconciliationRequired, true));
test('unresolved recovery blocks consistent pair', () => { const r = captured({ recoveryState: 'RECOVERY_PENDING' }); assert.equal(r.status, 'RECONCILIATION_REQUIRED'); assert.equal(r.commercialSuccess, false); });
test('unknown booking and payment require human review', () => assert.equal(unknown({ booking: { state: 'BOOKING_OUTCOME_UNKNOWN', providerResultObserved: false } }).manualReviewRequired, true));
test('capture without trusted evidence becomes unresolved observation', () => assert.equal(run({ paymentState: 'PAYMENT_CAPTURED' }).observedPaymentState, 'PAYMENT_OUTCOME_UNKNOWN'));
test('booking confirmation without evidence is unknown', () => assert.equal(captured({ booking: { state: 'BOOKING_CONFIRMED', providerResultObserved: false } }).diagnostic.bookingState, 'BOOKING_OUTCOME_UNKNOWN'));
test('consistent capture and booking have no commercial success', () => { const r = captured(); assert.equal(r.status, 'NO_ACTION_REQUIRED'); assert.equal(r.commercialSuccess, false); });
test('manual projection has exact operational allowlist', () => assert.deepEqual(Object.keys(unknown().manualReview).sort(), ['caseId', 'reasonCode', 'recommendedNextAction', 'requestId', 'providerFingerprint', 'paymentFingerprint', 'internalPaymentState', 'providerObservedState', 'bookingState', 'eventFingerprint', 'eventType', 'previousEvidenceFingerprints', 'incomingEvidenceFingerprint', 'amountMatch', 'currencyMatch'].sort()));
test('secrets auth payload and PII in unused input never leak', () => { const marker = 'private-sensitive-marker'; const r = unknown({ webhookSecret: marker, rawBody: marker, Authorization: marker, traveler: { email: marker }, intent: { ...base().intent, offerToken: marker } }); assert.doesNotMatch(JSON.stringify(r), /private-sensitive-marker|webhookSecret|Authorization|offerToken|email/); });
test('secret-like operational ids are fingerprinted', () => { const r = run({ provider: 'private_marker', providerPaymentId: 'private_payment', paymentState: 'PAYMENT_OUTCOME_UNKNOWN' }); assert.doesNotMatch(JSON.stringify(r), /private_marker|private_payment/); });
test('raw additions to normalized evidence rejected with fixed error', () => assert.throws(() => run({ event: { ...ev(), rawBody: 'sensitive' } }), { code: 'RECONCILIATION_INPUT_INVALID' }));
test('case identity deterministic across object property ordering', () => { const a = base(); assert.equal(evaluate(a).caseId, evaluate({ ...a, intent: { currency: 'EUR', amount: '110.25', requestId: 'a'.repeat(32), reviewState: 'REVIEW_READY', state: 'PAYMENT_INTENT_READY' } }).caseId); });
test('same evidence produces same complete decision', () => assert.deepEqual(run({ event: ev() }), run({ event: ev() })));
test('duplicate accepted capture has no effect', () => { const r = captured({ event: ev('payment.captured') }); assert.equal(r.reasonCode, 'DUPLICATE_WEBHOOK_EVENT'); assert.equal(r.effectApplied, false); });
test('same id different evidence conflicts', () => assert.equal(run({ previousEvidence: [ev()], event: ev('payment.authorized') }).status, 'STATE_CONFLICT'));
test('correlation mismatch never changes internal observation', () => { const r = run({ event: ev('payment.captured', { requestId: 'b'.repeat(32) }) }); assert.equal(r.reasonCode, 'PAYMENT_CORRELATION_MISMATCH'); assert.equal(r.observedPaymentState, 'PAYMENT_PENDING'); });
test('malformed money and forged normalized state rejected', () => { for (const change of [{ amountMinor: true }, { amountMinor: 1.1 }, { amountMinor: -1 }, { state: 'PAID' }]) assert.throws(() => run({ event: { ...ev(), ...change } }), { code: 'RECONCILIATION_INPUT_INVALID' }); });
test('wrong prior correlation and unbounded history fail closed', () => { for (const previousEvidence of [[ev('payment.pending', { paymentId: 'other' })], Array(1001).fill(ev())]) assert.throws(() => run({ previousEvidence }), { code: 'RECONCILIATION_INPUT_INVALID' }); });
test('no automatic actions or fake paid/refunded even for compensation', () => { for (const r of [unknown(), captured(), captured({ booking: { state: 'BOOKING_FAILED_FINAL', providerResultObserved: false } })]) { assert.equal(r.effectApplied, false); assert.equal(r.paymentAttemptAllowed, false); assert.equal(r.refundAttemptAllowed, false); assert.equal(r.cancellationAttemptAllowed, false); assert.equal(r.providerState, 'PROVIDER_NOT_CALLED'); assert.doesNotMatch(JSON.stringify(r), /"(?:PAID|REFUNDED|RESOLVED)"/); } });
test('unknown in accepted history cannot be cleared by ordinary evidence', () => assert.equal(captured({ previousEvidence: [ev('payment.unknown'), ev('payment.captured', { eventId: 'later' })] }).status, 'STATE_CONFLICT'));
test('accepted authorization cannot silently regress to pending', () => assert.equal(run({ previousEvidence: [ev('payment.authorized')] }).status, 'STATE_CONFLICT'));
