// Pure server-owned evidence evaluator. No HTTP wiring, persistence, provider calls or action runner.
const crypto = require('node:crypto');
const contract = require('./paymentProviderContract');
const recovery = require('./bookingPaymentRecovery');
const lifecycle = require('./bookingLifecycle');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = () => { throw Object.assign(new Error('Invalid reconciliation evidence'), { code: 'RECONCILIATION_INPUT_INVALID' }); };
const paymentStates = ['PAYMENT_NOT_STARTED', 'PAYMENTS_DISABLED', ...Object.values(contract.STATES)];
const bookingStates = ['BOOKING_NOT_STARTED', 'BOOKING_DISABLED', 'BOOKING_PENDING', 'BOOKING_FAILED_FINAL', 'BOOKING_OUTCOME_UNKNOWN', 'BOOKING_CONFIRMED'];
function eventCopy(value) {
  const keys = ['eventId', 'provider', 'paymentId', 'requestId', 'type', 'state', 'amountMinor', 'currency', 'reconciled'];
  if (!value || typeof value !== 'object' || Object.keys(value).some(key => !keys.includes(key))
    || !Number.isSafeInteger(value.amountMinor) || value.amountMinor <= 0) invalid();
  let normalized;
  try { normalized = contract.normalizeEvent({ eventId: value.eventId, provider: value.provider, paymentId: value.paymentId,
    requestId: value.requestId, type: value.type, amount: `${Math.floor(value.amountMinor / 100)}.${String(value.amountMinor % 100).padStart(2, '0')}`,
    currency: value.currency, reconciled: value.reconciled }); } catch { invalid(); }
  if (normalized.state !== value.state || normalized.amountMinor !== value.amountMinor) invalid();
  return normalized;
}
function evaluate(input = {}) {
  let trusted;
  try { trusted = contract.trustedIntent(input.intent, input.providerPaymentId); } catch { invalid(); }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.provider || '') || input.provider === 'none'
    || !paymentStates.includes(input.paymentState) || !bookingStates.includes(input.booking?.state)
    || typeof input.booking.providerResultObserved !== 'boolean'
    || !['RECOVERY_NOT_REQUIRED', 'RECOVERY_PENDING', 'RECONCILIATION_REQUIRED', 'COMPENSATION_REQUIRED'].includes(input.recoveryState ?? 'RECOVERY_NOT_REQUIRED')
    || !Array.isArray(input.previousEvidence ?? []) || (input.previousEvidence ?? []).length > 1000) invalid();
  const previous = (input.previousEvidence ?? []).map(eventCopy), event = input.event ? eventCopy(input.event) : null;
  const matches = e => e.provider === input.provider && e.paymentId === trusted.providerPaymentId && e.requestId === trusted.requestId;
  // Previously accepted evidence must already belong to this immutable intent. No timestamps or browser money.
  if (previous.some(e => !matches(e) || e.amountMinor !== trusted.amountMinor || e.currency !== trusted.currency)) invalid();
  const digests = new Map();
  let historicalConflict = false, lastAccepted = null;
  for (const e of previous) {
    if (digests.has(e.eventId) && digests.get(e.eventId) !== hash(e)) historicalConflict = true;
    if (!digests.has(e.eventId)) {
      if (lastAccepted && contract.observationDecision(lastAccepted.state, e) !== 'ACCEPT') historicalConflict = true;
      lastAccepted = e;
    }
    digests.set(e.eventId, hash(e));
  }
  const finals = new Set(previous.filter(e => ['PAYMENT_CAPTURED', 'PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED'].includes(e.state)).map(e => e.state));
  if (finals.size > 1) historicalConflict = true;
  let state = input.paymentState, reason = null, duplicate = false;
  const amountMatch = event ? event.amountMinor === trusted.amountMinor : null;
  const currencyMatch = event ? event.currency === trusted.currency : null;
  if (historicalConflict) reason = 'PAYMENT_STATE_CONFLICT';
  else if (event && !matches(event)) reason = 'PAYMENT_CORRELATION_MISMATCH';
  else if (amountMatch === false) reason = 'PAYMENT_AMOUNT_MISMATCH';
  else if (currencyMatch === false) reason = 'PAYMENT_CURRENCY_MISMATCH';
  else if (event && digests.has(event.eventId)) {
    duplicate = digests.get(event.eventId) === hash(event);
    if (!duplicate) reason = 'PAYMENT_STATE_CONFLICT';
  }
  // Accepted history and the internal observation cannot disagree silently.
  if (!reason && lastAccepted && lastAccepted.state !== state && state !== 'PAYMENT_OUTCOME_UNKNOWN') reason = 'PAYMENT_STATE_CONFLICT';
  if (!reason && finals.size && !finals.has(state) && state !== 'PAYMENT_OUTCOME_UNKNOWN') reason = 'PAYMENT_STATE_CONFLICT';
  if (!reason && event && !duplicate) {
    if (finals.size && !finals.has(event.state)) reason = 'PAYMENT_STATE_CONFLICT';
    else {
      const ordering = contract.observationDecision(state, event);
      if (ordering === 'CONFLICT') reason = 'PAYMENT_STATE_CONFLICT';
      else if (ordering === 'ACCEPT') state = event.state;
    }
  }
  // A local capture label alone is not provider evidence. Unknown is never resolved by duplicate/ordinary evidence.
  const capturedEvidence = previous.some(e => e.state === 'PAYMENT_CAPTURED')
    || !reason && !duplicate && event?.state === 'PAYMENT_CAPTURED' && state === 'PAYMENT_CAPTURED';
  if (state === 'PAYMENT_CAPTURED' && !capturedEvidence) state = 'PAYMENT_OUTCOME_UNKNOWN';
  const booking = input.booking.state === 'BOOKING_CONFIRMED' && !input.booking.providerResultObserved
    ? 'BOOKING_OUTCOME_UNKNOWN' : input.booking.state;
  const bookingObservation = { state: ({ BOOKING_CONFIRMED: 'CONFIRMED', BOOKING_PENDING: 'confirming', BOOKING_FAILED_FINAL: 'confirmation_failed',
    BOOKING_OUTCOME_UNKNOWN: 'confirmation_unknown' })[booking] || booking, providerResultObserved: input.booking.providerResultObserved,
    error: { code: 'BOOKING_REJECTED' }, dispatch: 'SENT', outcomeKnown: true };
  const paymentObservation = { state: state === 'PAYMENT_CAPTURED' ? 'paid' : state === 'PAYMENT_OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN'
    : ['PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED'].includes(state) ? 'failed'
      : ['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'].includes(state) ? 'pending' : state,
    providerResultObserved: capturedEvidence === true, error: { code: 'PAYMENT_REJECTED' }, dispatch: 'SENT', outcomeKnown: true };
  const plan = recovery.plan({ requestId: trusted.requestId, booking: bookingObservation, payment: paymentObservation });
  const unresolved = (input.recoveryState ?? 'RECOVERY_NOT_REQUIRED') !== 'RECOVERY_NOT_REQUIRED';
  const inspected = lifecycle.validateLifecycleState({ checkRate: 'CONFIRMED', travelers: 'VALID', review: 'REVIEW_READY', booking,
    payment: state === 'PAYMENT_AUTHORIZED' ? 'PAYMENT_PENDING' : state === 'PAYMENT_CANCELLED' ? 'PAYMENT_FAILED_FINAL' : state,
    evidence: { booking: input.booking.providerResultObserved, payment: capturedEvidence === true },
    recovery: unresolved ? input.recoveryState : plan.reconciliationRequired ? 'RECONCILIATION_REQUIRED' : plan.state,
    reconciliationRequired: plan.reconciliationRequired, compensation: plan.compensation });
  let status = 'NO_ACTION_REQUIRED', action = 'NO_ACTION', manual = false;
  if (reason) { status = 'STATE_CONFLICT'; action = 'ESCALATE_RECONCILIATION'; manual = true; }
  else if (plan.reconciliationRequired || unresolved) { status = 'RECONCILIATION_REQUIRED'; reason = plan.reconciliationRequired ? 'PAYMENT_OR_BOOKING_OUTCOME_UNKNOWN' : 'UNRESOLVED_RECOVERY'; action = 'VERIFY_PROVIDER_STATUS'; manual = true; }
  else if (plan.compensation !== 'NONE') { status = 'COMPENSATION_REQUIRED'; reason = plan.compensation; action = plan.compensation === 'REFUND_REQUIRED' ? 'REVIEW_REFUND' : 'REVIEW_CANCELLATION'; manual = true; }
  else if (!inspected.valid) { status = 'MANUAL_REVIEW_REQUIRED'; reason = 'BOOKING_PAYMENT_INCONSISTENT'; action = 'REVIEW_BOOKING'; manual = true; }
  else if (['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'].includes(state)) { status = 'AWAITING_PROVIDER_EVIDENCE'; reason = 'WEBHOOK_MISSING'; action = 'WAIT_FOR_PROVIDER'; }
  reason ??= duplicate ? 'DUPLICATE_WEBHOOK_EVENT' : 'CONSISTENT_OBSERVATIONS';
  // IDs are fingerprints to avoid echoing arbitrary operational labels or secret-like strings.
  const diagnostic = { requestId: trusted.requestId, providerFingerprint: hash(input.provider), paymentFingerprint: hash(trusted.providerPaymentId),
    internalPaymentState: input.paymentState, providerObservedState: state, bookingState: booking,
    eventFingerprint: event ? hash(event.eventId) : null, eventType: event?.type ?? null,
    previousEvidenceFingerprints: previous.map(hash), incomingEvidenceFingerprint: event ? hash(event) : null, amountMatch, currencyMatch };
  const caseId = hash({ diagnostic, recoveryState: input.recoveryState ?? 'RECOVERY_NOT_REQUIRED', amountMinor: trusted.amountMinor, currency: trusted.currency });
  const result = { status, reasonCode: reason, manualReviewRequired: manual,
    reconciliationRequired: manual && (status === 'STATE_CONFLICT' || status === 'RECONCILIATION_REQUIRED' || status === 'MANUAL_REVIEW_REQUIRED'),
    compensationRequired: !reason?.includes('MISMATCH') && !historicalConflict && status === 'COMPENSATION_REQUIRED',
    recommendedNextAction: action, observedPaymentState: state, caseId, diagnostic,
    contractOnly: true, commercialSuccess: false, applicationPaymentState: 'PAYMENTS_DISABLED', providerState: 'PROVIDER_NOT_CALLED',
    effectApplied: false, paymentAttemptAllowed: false, refundAttemptAllowed: false, cancellationAttemptAllowed: false };
  return { ...result, manualReview: manual ? { caseId, reasonCode: reason, recommendedNextAction: action, ...diagnostic } : null };
}
module.exports = { evaluate };
