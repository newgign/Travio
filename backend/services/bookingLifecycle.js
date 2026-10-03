// Server-only consistency checks. No execution, persistence or browser-supplied success evidence.
const aliases = {
  booking: { confirming: 'BOOKING_PENDING', confirmation_unknown: 'BOOKING_OUTCOME_UNKNOWN', confirmation_failed: 'BOOKING_FAILED_FINAL',
    CONFIRMED: 'BOOKING_CONFIRMED', MODIFIED: 'BOOKING_CONFIRMED' },
  payment: { pending: 'PAYMENT_PENDING', requires_action: 'PAYMENT_PENDING', paid: 'PAID', failed: 'PAYMENT_FAILED_FINAL', OUTCOME_UNKNOWN: 'PAYMENT_OUTCOME_UNKNOWN' },
  cancellation: { CANCELLED: 'CANCELLATION_CONFIRMED', CANCELED: 'CANCELLATION_CONFIRMED' },
  refund: { refunded: 'REFUND_CONFIRMED' },
};
const defaults = { checkRate: 'NOT_CONFIRMED', travelers: 'INVALID', review: 'REVIEW_NOT_READY',
  booking: 'BOOKING_NOT_STARTED', payment: 'PAYMENT_NOT_STARTED', cancellation: 'CANCELLATION_NOT_STARTED',
  refund: 'REFUND_NOT_STARTED', recovery: 'RECOVERY_NOT_REQUIRED', compensation: 'NONE' };
const states = {
  checkRate: ['NOT_CONFIRMED', 'CONFIRMED', 'PRICE_CHANGED', 'UNAVAILABLE', 'RETRYABLE_ERROR'], travelers: ['INVALID', 'VALID'],
  review: ['REVIEW_NOT_READY', 'REVIEW_READY'],
  booking: ['BOOKING_NOT_STARTED', 'BOOKING_DISABLED', 'BOOKING_PENDING', 'BOOKING_FAILED_RETRYABLE', 'BOOKING_FAILED_FINAL', 'BOOKING_OUTCOME_UNKNOWN', 'BOOKING_CONFIRMED'],
  payment: ['PAYMENT_NOT_STARTED', 'PAYMENTS_DISABLED', 'PAYMENT_PENDING', 'PAYMENT_FAILED_RETRYABLE', 'PAYMENT_FAILED_FINAL', 'PAYMENT_OUTCOME_UNKNOWN', 'PAID', 'PAYMENT_CAPTURED'],
  cancellation: ['CANCELLATION_NOT_STARTED', 'CANCELLATION_UNAVAILABLE', 'CANCELLATION_PENDING', 'CANCELLATION_FAILED_RETRYABLE', 'CANCELLATION_FAILED_FINAL', 'CANCELLATION_OUTCOME_UNKNOWN', 'CANCELLATION_CONFIRMED'],
  refund: ['REFUND_NOT_STARTED', 'REFUND_UNAVAILABLE', 'REFUND_PENDING', 'REFUND_FAILED_RETRYABLE', 'REFUND_FAILED_FINAL', 'REFUND_OUTCOME_UNKNOWN', 'REFUND_CONFIRMED'],
  recovery: ['RECOVERY_NOT_REQUIRED', 'RECOVERY_PENDING', 'COMPENSATION_REQUIRED', 'RECONCILIATION_REQUIRED'],
  compensation: ['NONE', 'CANCELLATION_REQUIRED', 'REFUND_REQUIRED'],
};
function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (['completed', 'success', 'reconciliationRequired', 'cancellationAvailable', 'refundAvailable'].some(key => key in input && typeof input[key] !== 'boolean')) return null;
  const result = {};
  for (const key of Object.keys(defaults)) {
    const value = input[key] ?? defaults[key];
    result[key] = aliases[key]?.[value] || value;
    if (!states[key].includes(result[key])) return null;
  }
  const evidence = input.evidence ?? {};
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)
    || Object.values(evidence).some(value => typeof value !== 'boolean')) return null;
  return { ...result, evidence, completed: input.completed === true, success: input.success === true,
    reconciliationRequired: input.reconciliationRequired === true,
    cancellationAvailable: input.cancellationAvailable, refundAvailable: input.refundAvailable };
}
function inspect(input) {
  const s = normalize(input), errors = [];
  if (!s) return { valid: false, errors: ['INVALID_STATE_SHAPE'], status: 'LIFECYCLE_INVALID' };
  const bookingResult = s.booking === 'BOOKING_CONFIRMED', paymentResult = ['PAID', 'PAYMENT_CAPTURED'].includes(s.payment);
  const cancellationResult = s.cancellation === 'CANCELLATION_CONFIRMED', refundResult = s.refund === 'REFUND_CONFIRMED';
  const unknown = Object.values(s).some(value => typeof value === 'string' && value.endsWith('_OUTCOME_UNKNOWN'));
  const unresolved = s.recovery !== 'RECOVERY_NOT_REQUIRED' || s.compensation !== 'NONE' || s.reconciliationRequired || unknown;
  if (s.review === 'REVIEW_READY' && (s.checkRate !== 'CONFIRMED' || s.travelers !== 'VALID')) errors.push('REVIEW_PREREQUISITES_MISSING');
  if ((bookingResult || s.booking === 'BOOKING_PENDING') && s.review !== 'REVIEW_READY') errors.push('BOOKING_REVIEW_REQUIRED');
  if (bookingResult && s.evidence.booking !== true || paymentResult && s.evidence.payment !== true
    || cancellationResult && s.evidence.cancellation !== true || refundResult && s.evidence.refund !== true) errors.push('PROVIDER_RESULT_EVIDENCE_MISSING');
  if (s.payment === 'PAYMENT_PENDING' && !bookingResult) errors.push('PAYMENT_BEFORE_BOOKING');
  if (paymentResult && !bookingResult && !(s.booking === 'BOOKING_FAILED_FINAL' && unresolved)) errors.push('PAYMENT_WITHOUT_BOOKING_OR_RECOVERY');
  if (cancellationResult && s.cancellationAvailable === false || refundResult && s.refundAvailable === false) errors.push('UNAVAILABLE_OPERATION_COMPLETED');
  if (unknown && !(s.reconciliationRequired || s.recovery === 'RECONCILIATION_REQUIRED')) errors.push('UNKNOWN_REQUIRES_RECONCILIATION');
  if (s.booking === 'BOOKING_OUTCOME_UNKNOWN' && cancellationResult) errors.push('CANCELLATION_WITH_UNKNOWN_BOOKING');
  if (cancellationResult && !bookingResult) errors.push('CANCELLATION_WITHOUT_BOOKING');
  if (refundResult && !paymentResult) errors.push('REFUND_WITHOUT_CHARGE');
  if (s.cancellation === 'CANCELLATION_PENDING' && !bookingResult) errors.push('CANCELLATION_WITHOUT_BOOKING');
  if (s.refund === 'REFUND_PENDING' && !(paymentResult && (cancellationResult || s.booking === 'BOOKING_FAILED_FINAL' && unresolved))) errors.push('REFUND_PREREQUISITES_MISSING');
  const partial = bookingResult && ['PAYMENT_FAILED_FINAL', 'PAYMENT_FAILED_RETRYABLE'].includes(s.payment)
    || paymentResult && s.booking === 'BOOKING_FAILED_FINAL'
    || cancellationResult && ['REFUND_FAILED_FINAL', 'REFUND_FAILED_RETRYABLE'].includes(s.refund);
  if (partial && !unresolved) errors.push('PARTIAL_FAILURE_REQUIRES_RECOVERY');
  const terminalSuccess = bookingResult && paymentResult && !unresolved && !cancellationResult && !refundResult
    && ![s.cancellation, s.refund].some(value => /PENDING|FAILED|UNKNOWN/.test(value));
  if ((s.completed || s.success) && !terminalSuccess) errors.push('FALSE_SUCCESS');
  let status = 'READY_FOR_BOOKING', category = 'UNRESOLVED';
  if (unknown || s.reconciliationRequired || s.recovery === 'RECONCILIATION_REQUIRED') status = 'RECONCILIATION_REQUIRED';
  else if (unresolved || partial) status = 'RECOVERY_REQUIRED';
  else if (s.booking === 'BOOKING_DISABLED') { status = 'BOOKING_DISABLED'; category = 'SAFE_DISABLED_TERMINAL'; }
  else if (s.payment === 'PAYMENTS_DISABLED') { status = 'PAYMENTS_DISABLED'; category = 'SAFE_DISABLED_TERMINAL'; }
  else if (terminalSuccess) { status = 'COMPLETED'; category = 'SUCCESSFUL_TERMINAL'; }
  else if (s.cancellation === 'CANCELLATION_PENDING') status = 'CANCELLATION_PENDING';
  else if (s.refund === 'REFUND_PENDING') status = 'REFUND_PENDING';
  else if (s.booking === 'BOOKING_PENDING' || s.payment === 'PAYMENT_PENDING') status = 'BOOKING_IN_PROGRESS';
  else if (Object.values(s).some(value => typeof value === 'string' && value.endsWith('_FAILED_FINAL'))) { status = 'FAILED_FINAL'; category = 'FAILED_TERMINAL'; }
  else if (Object.values(s).some(value => typeof value === 'string' && value.endsWith('_FAILED_RETRYABLE'))) { status = 'RECOVERY_REQUIRED'; category = 'RETRYABLE'; }
  else if (bookingResult) status = 'PAYMENT_REQUIRED';
  else if (s.review !== 'REVIEW_READY') status = 'REVIEW_NOT_READY';
  if (status === 'RECONCILIATION_REQUIRED') category = 'UNKNOWN';
  return { valid: errors.length === 0, errors, status: errors.length ? 'LIFECYCLE_INVALID' : status, category: errors.length ? 'INVALID' : category };
}
function assertLifecycleState(input) {
  const result = inspect(input);
  if (!result.valid) throw Object.assign(new Error('Lifecycle state is inconsistent'), { code: 'LIFECYCLE_INCONSISTENT', status: 503 });
  return result;
}
function validateTransition(before, after, { reconciled = false, recoveryAuthorized = false } = {}) {
  const a = normalize(before), b = normalize(after);
  if (!a || !b || !inspect(before).valid || !inspect(after).valid) return false;
  if ((a.recovery !== 'RECOVERY_NOT_REQUIRED' || a.compensation !== 'NONE')
    && b.recovery === 'RECOVERY_NOT_REQUIRED' && b.compensation === 'NONE' && !recoveryAuthorized) return false;
  for (const key of ['checkRate', 'travelers', 'review', 'booking', 'payment', 'cancellation', 'refund']) {
    const from = a[key], to = b[key]; if (from === to) continue;
    if (key === 'checkRate' || key === 'travelers' || key === 'review') {
      if (![a.booking, a.payment].every(value => /NOT_STARTED|DISABLED/.test(value))) return false;
      continue;
    }
    const prefix = key.toUpperCase(), pending = `${prefix}_PENDING`;
    if (from.endsWith('_DISABLED') || from.endsWith('_UNAVAILABLE')) return false;
    if (from.endsWith('_NOT_STARTED') && (to === pending || to.endsWith('_DISABLED') || to.endsWith('_UNAVAILABLE'))) continue;
    if (from === pending && (to.endsWith('_FAILED_RETRYABLE') || to.endsWith('_FAILED_FINAL') || to.endsWith('_OUTCOME_UNKNOWN')
      || ['BOOKING_CONFIRMED', 'PAID', 'PAYMENT_CAPTURED', 'CANCELLATION_CONFIRMED', 'REFUND_CONFIRMED'].includes(to))) continue;
    if (from.endsWith('_OUTCOME_UNKNOWN') && reconciled && !to.endsWith('_NOT_STARTED')) continue;
    if (from.endsWith('_FAILED_RETRYABLE') && to === pending && recoveryAuthorized) continue;
    if (from.endsWith('_FAILED_FINAL') && to === pending && recoveryAuthorized) continue;
    return false;
  }
  return true;
}
function providerConfirmationConsistent(booking) {
  const raw = booking?.provider_response;
  const result = raw?.booking || raw?.bookings?.booking || raw?.bookings?.[0] || raw?.bookings?.bookings?.[0];
  return Boolean(booking?.provider_booking_id && ['CONFIRMED', 'MODIFIED'].includes(booking.provider_status)
    && result?.reference === booking.provider_booking_id && result.status === booking.provider_status);
}
module.exports = { validateLifecycleState: inspect, assertLifecycleState, validateTransition,
  deriveLifecycleStatus: input => inspect(input).status, providerConfirmationConsistent };
