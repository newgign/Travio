// Pure projections of trusted server state. Never accepts HTTP/provider payloads or executes actions.
const { createHash } = require('node:crypto');
const operations = require('./reconciliationOperationsReadModel');
const lifecycle = require('./bookingLifecycle');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = () => { throw Object.assign(new Error('Invalid operational signal input'), { code: 'OPERATIONAL_SIGNAL_INPUT_INVALID' }); };
const fingerprint = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const severities = ['INFO', 'WARNING', 'HIGH', 'CRITICAL'];
const rules = Object.freeze({
  PAYMENT_OUTCOME_UNKNOWN: ['HIGH', 'PAYMENT', 'VERIFY_PROVIDER_STATUS'],
  PAYMENT_STATE_CONFLICT: ['HIGH', 'PAYMENT', 'ESCALATE_RECONCILIATION'],
  PAYMENT_CORRELATION_MISMATCH: ['HIGH', 'PAYMENT', 'ESCALATE_RECONCILIATION'],
  PAYMENT_AMOUNT_MISMATCH: ['HIGH', 'PAYMENT', 'REVIEW_PAYMENT'],
  PAYMENT_CURRENCY_MISMATCH: ['HIGH', 'PAYMENT', 'REVIEW_PAYMENT'],
  BOOKING_OUTCOME_UNKNOWN: ['HIGH', 'BOOKING', 'VERIFY_PROVIDER_STATUS'],
  BOOKING_PAYMENT_INCONSISTENCY: ['HIGH', 'LIFECYCLE', 'ESCALATE_RECONCILIATION'],
  RECONCILIATION_REQUIRED: ['HIGH', 'RECONCILIATION', 'ESCALATE_RECONCILIATION'],
  COMPENSATION_REQUIRED: ['CRITICAL', 'RECOVERY', 'ESCALATE_RECONCILIATION'],
  REFUND_REVIEW_REQUIRED: ['HIGH', 'RECOVERY', 'REVIEW_REFUND'],
  CANCELLATION_REVIEW_REQUIRED: ['HIGH', 'RECOVERY', 'REVIEW_CANCELLATION'],
  BOOKING_DISABLED: ['INFO', 'BOUNDARY', 'NO_ACTION'],
  PAYMENTS_DISABLED: ['INFO', 'BOUNDARY', 'NO_ACTION'],
  RECONCILIATION_STORAGE_DISABLED: ['INFO', 'BOUNDARY', 'NO_ACTION'],
  RETRYABLE_SAFE_CONDITION: ['WARNING', 'RECOVERY', 'REVIEW_BOOKING'],
});
const projectionFields = Object.freeze(['signalId', 'signalCode', 'severity', 'category', 'reasonCode', 'requestId', 'caseId',
  'provider', 'paymentState', 'bookingState', 'lifecycleState', 'requiresAttention']);

// Reject accessors/custom serialization before touching values; bound traversal of ignored extras too.
function copyData(value, depth = 0, seen = new WeakSet(), budget = { left: 10000 }) {
  if (--budget.left < 0 || depth > 12) invalid();
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value) || Object.getOwnPropertySymbols(value).length
    || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  seen.add(value);
  const result = Array.isArray(value) ? [] : Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === 'length') continue;
    if (!Object.hasOwn(descriptor, 'value')) invalid();
    Object.defineProperty(result, key, { value: copyData(descriptor.value, depth + 1, seen, budget), enumerable: true });
  }
  seen.delete(value);
  return result;
}
const canonical = {
  booking: ['BOOKING_NOT_STARTED', 'BOOKING_DISABLED', 'BOOKING_PENDING', 'BOOKING_FAILED_RETRYABLE', 'BOOKING_FAILED_FINAL', 'BOOKING_OUTCOME_UNKNOWN', 'BOOKING_CONFIRMED'],
  payment: ['PAYMENT_NOT_STARTED', 'PAYMENTS_DISABLED', 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'PAYMENT_FAILED_RETRYABLE', 'PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED', 'PAYMENT_OUTCOME_UNKNOWN', 'PAID', 'PAYMENT_CAPTURED'],
};
function classify(input) {
  const data = copyData(input);
  if (!data || Array.isArray(data) || typeof data.requestId !== 'string' || !/^[a-f0-9]{32}$/.test(data.requestId)) invalid();
  if (data.providerFingerprint !== undefined && !fingerprint(data.providerFingerprint)) invalid();
  const r = data.reconciliation;
  let row = null;
  if (r !== undefined) {
    try { row = operations.projectCase(r); } catch { invalid(); }
    if (r.diagnostic.requestId !== data.requestId || data.providerFingerprint !== undefined && data.providerFingerprint !== r.diagnostic.providerFingerprint) invalid();
  }
  const s = data.lifecycle ?? {};
  if (!s || typeof s !== 'object' || Array.isArray(s)) invalid();
  let booking = s.booking ?? r?.diagnostic.bookingState ?? 'BOOKING_NOT_STARTED';
  let payment = s.payment ?? r?.observedPaymentState ?? 'PAYMENT_NOT_STARTED';
  if (!canonical.booking.includes(booking) || !canonical.payment.includes(payment)) invalid();
  // If both projections are supplied they must describe the same observation.
  if (r && (s.booking !== undefined && booking !== r.diagnostic.bookingState || s.payment !== undefined && payment !== r.observedPaymentState)) invalid();
  const evidence = s.evidence ?? {};
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) || Object.values(evidence).some(value => typeof value !== 'boolean')) invalid();
  const captured = r ? r.observedPaymentState === 'PAYMENT_CAPTURED' && r.status !== 'STATE_CONFLICT'
    : ['PAYMENT_CAPTURED', 'PAID'].includes(payment) && evidence.payment === true;
  if (!r && booking === 'BOOKING_CONFIRMED' && evidence.booking !== true) booking = 'BOOKING_OUTCOME_UNKNOWN';
  if (['PAYMENT_CAPTURED', 'PAID'].includes(payment) && !captured) payment = 'PAYMENT_OUTCOME_UNKNOWN';
  if (payment === 'PAID') payment = 'PAYMENT_CAPTURED';
  let inspection;
  try {
    inspection = lifecycle.validateLifecycleState({ ...(r ? { checkRate: 'CONFIRMED', travelers: 'VALID', review: 'REVIEW_READY' } : {}), ...s, booking, payment: payment === 'PAYMENT_AUTHORIZED' ? 'PAYMENT_PENDING' : payment === 'PAYMENT_CANCELLED' ? 'PAYMENT_FAILED_FINAL' : payment,
      evidence: r ? { ...evidence, booking: booking === 'BOOKING_CONFIRMED', payment: captured } : evidence });
  } catch { invalid(); }
  if (inspection.errors.includes('INVALID_STATE_SHAPE')) invalid();
  const context = { requestId: data.requestId, caseId: r?.caseId ?? null, provider: r?.diagnostic.providerFingerprint ?? data.providerFingerprint ?? 'none',
    bookingState: booking, paymentState: payment, lifecycleState: inspection.status };
  const family = row?.caseFamilyId ?? digest([context.requestId, context.provider]);
  const signals = new Map();
  const add = (code, reason = code, critical = false) => {
    const [level, category, action] = rules[code];
    const severity = critical ? 'CRITICAL' : level;
    const conditionId = digest([family, code]);
    const signal = { signalId: digest([conditionId, severity, reason]), conditionId, signalCode: code, severity, category, reasonCode: reason,
      ...context, recommendedOperatorAction: action, requiresAttention: severity !== 'INFO' };
    signals.set(code, Object.freeze(signal));
  };
  if (row) {
    const code = Object.hasOwn(rules, row.category) ? row.category : 'RECONCILIATION_REQUIRED';
    // 7D's risk priority is reused, not a claim that a capture actually occurred.
    if (row.category !== 'AWAITING_PROVIDER_EVIDENCE') add(code, row.reasonCode, row.priority === 'CRITICAL' && !['PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_CURRENCY_MISMATCH'].includes(code));
    if (row.reconciliationRequired) add('RECONCILIATION_REQUIRED', row.reasonCode);
    if (row.compensationRequired) add('COMPENSATION_REQUIRED', row.reasonCode);
  }
  if (booking === 'BOOKING_DISABLED') add('BOOKING_DISABLED');
  if (payment === 'PAYMENTS_DISABLED') add('PAYMENTS_DISABLED');
  if (data.storageDisabled !== undefined && typeof data.storageDisabled !== 'boolean') invalid();
  if (data.storageDisabled === true) add('RECONCILIATION_STORAGE_DISABLED');
  if (payment === 'PAYMENT_OUTCOME_UNKNOWN') add('PAYMENT_OUTCOME_UNKNOWN');
  if (booking === 'BOOKING_OUTCOME_UNKNOWN') add('BOOKING_OUTCOME_UNKNOWN');
  if (s.reconciliationRequired === true || s.recovery === 'RECONCILIATION_REQUIRED') add('RECONCILIATION_REQUIRED');
  if ((s.compensation && s.compensation !== 'NONE') || s.recovery === 'COMPENSATION_REQUIRED') add('COMPENSATION_REQUIRED');
  if (s.compensation === 'REFUND_REQUIRED' || /^REFUND_(?:OUTCOME_UNKNOWN|FAILED_FINAL|FAILED_RETRYABLE)$/.test(s.refund ?? '')) add('REFUND_REVIEW_REQUIRED', 'REFUND_REQUIRED', captured);
  if (s.compensation === 'CANCELLATION_REQUIRED' || /^CANCELLATION_(?:OUTCOME_UNKNOWN|FAILED_FINAL|FAILED_RETRYABLE)$/.test(s.cancellation ?? '')) add('CANCELLATION_REVIEW_REQUIRED', 'CANCELLATION_REQUIRED', captured);
  const inconsistent = !inspection.valid && inspection.errors.some(code => !['UNKNOWN_REQUIRES_RECONCILIATION', 'PROVIDER_RESULT_EVIDENCE_MISSING'].includes(code))
    || captured && booking === 'BOOKING_FAILED_FINAL' || booking === 'BOOKING_CONFIRMED' && payment === 'PAYMENT_FAILED_FINAL';
  if (inconsistent) add('BOOKING_PAYMENT_INCONSISTENCY', 'BOOKING_PAYMENT_INCONSISTENT', captured && booking === 'BOOKING_FAILED_FINAL');
  if (booking === 'BOOKING_FAILED_RETRYABLE' || payment === 'PAYMENT_FAILED_RETRYABLE') add('RETRYABLE_SAFE_CONDITION');
  return Object.freeze([...signals.values()].sort((a, b) => severities.indexOf(b.severity) - severities.indexOf(a.severity) || a.signalCode.localeCompare(b.signalCode)));
}
function toLogProjection(signal) {
  const s = copyData(signal);
  if (!s || !fingerprint(s.signalId) || !Object.hasOwn(rules, s.signalCode) || !severities.includes(s.severity)
    || s.category !== rules[s.signalCode][1] || !/^[a-f0-9]{32}$/.test(s.requestId ?? '') || !(s.caseId === null || fingerprint(s.caseId))
    || !(s.provider === 'none' || fingerprint(s.provider)) || !canonical.booking.includes(s.bookingState) || !canonical.payment.includes(s.paymentState)
    || !['LIFECYCLE_INVALID', 'READY_FOR_BOOKING', 'RECONCILIATION_REQUIRED', 'RECOVERY_REQUIRED', 'BOOKING_DISABLED', 'PAYMENTS_DISABLED', 'COMPLETED', 'CANCELLATION_PENDING', 'REFUND_PENDING', 'BOOKING_IN_PROGRESS', 'FAILED_FINAL', 'PAYMENT_REQUIRED', 'REVIEW_NOT_READY'].includes(s.lifecycleState)
    || ![...Object.keys(rules), 'BOOKING_PAYMENT_INCONSISTENT', 'PAYMENT_OR_BOOKING_OUTCOME_UNKNOWN', 'UNRESOLVED_RECOVERY', 'REFUND_REQUIRED', 'CANCELLATION_REQUIRED'].includes(s.reasonCode)
    || s.requiresAttention !== (s.severity !== 'INFO')) invalid();
  const baseSeverity = rules[s.signalCode][0];
  if (s.severity !== baseSeverity && !(s.severity === 'CRITICAL' && ['PAYMENT_STATE_CONFLICT', 'PAYMENT_CORRELATION_MISMATCH', 'BOOKING_PAYMENT_INCONSISTENCY', 'REFUND_REVIEW_REQUIRED', 'CANCELLATION_REVIEW_REQUIRED'].includes(s.signalCode))) invalid();
  return Object.freeze(Object.fromEntries(projectionFields.map(key => [key, s[key]])));
}
function compare(previous, current) {
  const a = toLogProjection(previous), b = toLogProjection(current);
  if (!fingerprint(previous.conditionId) || !fingerprint(current.conditionId)) invalid();
  if (previous.conditionId !== current.conditionId) return 'DISTINCT';
  if (a.signalId === b.signalId) return 'DUPLICATE';
  return severities.indexOf(b.severity) > severities.indexOf(a.severity) ? 'ESCALATION' : 'UPDATE';
}
module.exports = { classify, toLogProjection, compare, projectionFields };
