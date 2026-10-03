// Pure recovery policy for trusted server observations, not an operation runner or persisted state machine.
// No browser route accepts these observations. Current intent boundaries never start operations.
const disabledCodes = new Set(['BOOKING_DISABLED', 'HOTELBEDS_BOOKING_DISABLED', 'PAYMENTS_DISABLED',
  'PAYMENT_GATEWAY_DISABLED', 'HOTELBEDS_TEST_PAYMENT_BLOCKED', 'CANCELLATION_UNAVAILABLE', 'REFUND_UNAVAILABLE']);
const finalCodes = new Set(['VALIDATION_ERROR', 'PAYMENT_VALIDATION_ERROR', 'PAYMENT_PREREQUISITE_MISSING',
  'BOOKING_REJECTED', 'PAYMENT_REJECTED', 'RATE_NOT_AVAILABLE', 'HOTELBEDS_RATE_EXPIRED']);
function classifyFailure(error = {}, { dispatch = 'UNKNOWN', outcomeKnown = false } = {}) {
  if (!['NOT_SENT', 'SENT', 'UNKNOWN'].includes(dispatch) || typeof outcomeKnown !== 'boolean')
    throw Object.assign(new Error('Invalid recovery observation'), { code: 'RECOVERY_INPUT_INVALID' });
  if (disabledCodes.has(error?.code)) return 'NON_RETRYABLE';
  // A lost response after possible dispatch must be reconciled before any retry.
  if (dispatch !== 'NOT_SENT' && !outcomeKnown) return 'OUTCOME_UNKNOWN';
  const code = error?.code || '', status = Number(error?.providerHttpStatus || error?.status || error?.response?.status);
  if (finalCodes.has(code) || /^BOOKING_INTENT_|^CHECKOUT_SESSION_/.test(code)
    || (status >= 400 && status < 500 && status !== 429)) return 'NON_RETRYABLE';
  if (['TIMEOUT', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN',
    'RATE_LIMIT', 'PROVIDER_UNAVAILABLE', 'RETRYABLE_INTERNAL_ERROR', 'INTERNAL_RETRYABLE_ERROR'].includes(code)
    || status === 429 || status >= 500) return 'RETRYABLE';
  return 'NON_RETRYABLE';
}
function observation(operation, value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Object.assign(new Error('Invalid recovery observation'), { code: 'RECOVERY_INPUT_INVALID' });
  const state = value.state || (operation === 'booking' ? 'BOOKING_NOT_STARTED' : 'PAYMENT_NOT_STARTED');
  if (state === 'BOOKING_DISABLED' && operation === 'booking' || state === 'PAYMENTS_DISABLED' && operation === 'payment') return 'DISABLED';
  if (state === (operation === 'booking' ? 'BOOKING_NOT_STARTED' : 'PAYMENT_NOT_STARTED')) return 'NOT_STARTED';
  if (state === (operation === 'booking' ? 'confirming' : 'pending') || operation === 'payment' && state === 'requires_action') return 'PENDING';
  if (state === (operation === 'booking' ? 'confirmation_unknown' : 'OUTCOME_UNKNOWN')) return 'OUTCOME_UNKNOWN';
  // Existing success labels alone (including legacy sandbox paid) are not provider-operation evidence.
  if (operation === 'booking' && ['CONFIRMED', 'MODIFIED'].includes(state) || operation === 'payment' && state === 'paid')
    return value.providerResultObserved === true ? 'OBSERVED_RESULT' : 'OUTCOME_UNKNOWN';
  if (state === (operation === 'booking' ? 'confirmation_failed' : 'failed'))
    return classifyFailure(value.error, { dispatch: value.dispatch || 'UNKNOWN', outcomeKnown: value.outcomeKnown === true });
  throw Object.assign(new Error('Invalid recovery observation'), { code: 'RECOVERY_INPUT_INVALID' });
}
function plan({ requestId, booking, payment } = {}) {
  if (typeof requestId !== 'string' || !/^[a-f0-9]{32}$/.test(requestId))
    throw Object.assign(new Error('Invalid recovery correlation'), { code: 'RECOVERY_INPUT_INVALID' });
  const bookingOutcome = observation('booking', booking), paymentOutcome = observation('payment', payment);
  const unknown = [bookingOutcome, paymentOutcome].includes('OUTCOME_UNKNOWN');
  const unsuccessful = value => ['DISABLED', 'NON_RETRYABLE', 'RETRYABLE'].includes(value);
  const cancellation = bookingOutcome === 'OBSERVED_RESULT' && unsuccessful(paymentOutcome);
  const refund = paymentOutcome === 'OBSERVED_RESULT' && unsuccessful(bookingOutcome);
  const compensation = cancellation ? 'CANCELLATION_REQUIRED' : refund ? 'REFUND_REQUIRED' : 'NONE';
  const retry = value => value === 'OUTCOME_UNKNOWN' ? 'RECONCILIATION_REQUIRED'
    : value === 'RETRYABLE' ? 'EXPLICIT_RETRY_AFTER_REVALIDATION' : value === 'PENDING' ? 'WAIT' : 'DO_NOT_RETRY';
  return { state: unknown ? 'RECOVERY_PENDING' : compensation !== 'NONE' ? 'COMPENSATION_REQUIRED'
      : [bookingOutcome, paymentOutcome].some(value => ['PENDING', 'RETRYABLE'].includes(value)) ? 'RECOVERY_PENDING' : 'RECOVERY_NOT_REQUIRED',
    requestId, bookingOutcome, paymentOutcome, reconciliationRequired: unknown,
    compensation, compensationCompleted: false, success: false,
    // Policies describe future explicit decisions. They never authorize execution in this sprint.
    bookingRetry: retry(bookingOutcome), paymentRetry: bookingOutcome === 'OBSERVED_RESULT' ? retry(paymentOutcome) : 'DO_NOT_RETRY',
    bookingAttemptAllowed: false, paymentAttemptAllowed: false, compensationAttemptAllowed: false,
    actionKeys: { booking: `${requestId}:booking`, payment: `${requestId}:payment`, compensation: `${requestId}:compensation` } };
}
function disabledBoundary(operation, requestId) {
  if (!['booking', 'payment'].includes(operation)) throw Object.assign(new Error('Invalid recovery operation'), { code: 'RECOVERY_INPUT_INVALID' });
  // Derive current policy internally; no hypothetical states or recovery actions are exposed to the UI.
  const recovery = plan({ requestId, booking: { state: 'BOOKING_DISABLED' }, payment: { state: 'PAYMENTS_DISABLED' } });
  require('./bookingLifecycle').assertLifecycleState({ booking: 'BOOKING_DISABLED', payment: 'PAYMENTS_DISABLED' });
  return { success: recovery.success, code: operation === 'booking' ? 'BOOKING_DISABLED' : 'PAYMENTS_DISABLED',
    state: operation === 'booking' ? 'BOOKING_DISABLED' : 'PAYMENTS_DISABLED', providerState: 'PROVIDER_NOT_CALLED' };
}
function compensationObservation(operation, value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Object.assign(new Error('Invalid recovery observation'), { code: 'RECOVERY_INPUT_INVALID' });
  const prefix = operation === 'cancellation' ? 'CANCELLATION' : 'REFUND';
  const state = value.state || `${prefix}_NOT_STARTED`;
  if (state === `${prefix}_NOT_STARTED`) return 'NOT_STARTED';
  if (state === `${prefix}_UNAVAILABLE`) return 'DISABLED';
  if (state === `${prefix}_PENDING`) return 'PENDING';
  if (state === `${prefix}_OUTCOME_UNKNOWN`) return 'OUTCOME_UNKNOWN';
  if (state === 'failed') return classifyFailure(value.error, { dispatch: value.dispatch || 'UNKNOWN', outcomeKnown: value.outcomeKnown === true });
  if (state === (operation === 'cancellation' ? 'CANCELLED' : 'refunded'))
    return value.providerResultObserved === true ? 'OBSERVED_RESULT' : 'OUTCOME_UNKNOWN';
  throw Object.assign(new Error('Invalid recovery observation'), { code: 'RECOVERY_INPUT_INVALID' });
}
function compensationPlan({ requestId, booking, payment, cancellation, refund } = {}) {
  const recovery = plan({ requestId, booking, payment });
  const cancellationOutcome = compensationObservation('cancellation', cancellation);
  const refundOutcome = compensationObservation('refund', refund);
  const unknown = recovery.reconciliationRequired || [cancellationOutcome, refundOutcome].includes('OUTCOME_UNKNOWN');
  const refundRequired = cancellationOutcome === 'OBSERVED_RESULT' && ['RETRYABLE', 'NON_RETRYABLE', 'DISABLED'].includes(refundOutcome);
  const compensation = refundRequired ? 'REFUND_REQUIRED' : recovery.compensation;
  return { ...recovery, cancellationOutcome, refundOutcome, compensation,
    state: unknown ? 'RECOVERY_PENDING' : compensation !== 'NONE' ? 'COMPENSATION_REQUIRED'
      : [cancellationOutcome, refundOutcome].some(value => ['PENDING', 'RETRYABLE'].includes(value)) ? 'RECOVERY_PENDING' : recovery.state,
    reconciliationRequired: unknown, compensationCompleted: false,
    refundPrerequisiteSatisfied: !unknown && (cancellationOutcome === 'OBSERVED_RESULT'
      || recovery.compensation === 'REFUND_REQUIRED' && recovery.bookingOutcome === 'NON_RETRYABLE'),
    cancellationAttemptAllowed: false, refundAttemptAllowed: false,
    actionKeys: { ...recovery.actionKeys, cancellation: `${requestId}:cancellation`, refund: `${requestId}:refund` } };
}
module.exports = { classifyFailure, plan, disabledBoundary, compensationPlan };
