// Pure projections of trusted paymentReconciliation results. No workflow, persistence or action execution.
const crypto = require('node:crypto');
const { STATES } = require('./paymentProviderContract');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = () => { throw Object.assign(new Error('Invalid operations projection input'), { code: 'OPERATIONS_READ_MODEL_INPUT_INVALID' }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fingerprint = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nullableFingerprint = value => value === null || fingerprint(value);
const boolOrNull = value => value === null || typeof value === 'boolean';
const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const statuses = ['STATE_CONFLICT', 'COMPENSATION_REQUIRED', 'RECONCILIATION_REQUIRED', 'MANUAL_REVIEW_REQUIRED', 'AWAITING_PROVIDER_EVIDENCE', 'NO_ACTION_REQUIRED'];
const queueStatuses = ['MANUAL_REVIEW_REQUIRED', 'COMPENSATION_REQUIRED', 'RECONCILIATION_REQUIRED', 'AWAITING_EVIDENCE'];
const reasons = ['PAYMENT_STATE_CONFLICT', 'PAYMENT_CORRELATION_MISMATCH', 'PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_CURRENCY_MISMATCH',
  'PAYMENT_OR_BOOKING_OUTCOME_UNKNOWN', 'UNRESOLVED_RECOVERY', 'REFUND_REQUIRED', 'CANCELLATION_REQUIRED',
  'BOOKING_PAYMENT_INCONSISTENT', 'WEBHOOK_MISSING', 'DUPLICATE_WEBHOOK_EVENT', 'CONSISTENT_OBSERVATIONS'];
const actions = ['WAIT_FOR_PROVIDER', 'VERIFY_PROVIDER_STATUS', 'REVIEW_PAYMENT', 'REVIEW_BOOKING', 'REVIEW_REFUND',
  'REVIEW_CANCELLATION', 'ESCALATE_RECONCILIATION', 'NO_ACTION'];
const categories = ['PAYMENT_OUTCOME_UNKNOWN', 'PAYMENT_STATE_CONFLICT', 'PAYMENT_CORRELATION_MISMATCH', 'PAYMENT_AMOUNT_MISMATCH',
  'PAYMENT_CURRENCY_MISMATCH', 'BOOKING_PAYMENT_INCONSISTENCY', 'REFUND_REVIEW_REQUIRED', 'CANCELLATION_REVIEW_REQUIRED',
  'RECONCILIATION_REQUIRED', 'AWAITING_PROVIDER_EVIDENCE'];
const paymentStates = ['PAYMENT_NOT_STARTED', 'PAYMENTS_DISABLED', ...Object.values(STATES)];
const bookingStates = ['BOOKING_NOT_STARTED', 'BOOKING_DISABLED', 'BOOKING_PENDING', 'BOOKING_FAILED_FINAL', 'BOOKING_OUTCOME_UNKNOWN', 'BOOKING_CONFIRMED'];
function copyResult(result) {
  const d = result?.diagnostic;
  if (!object(result) || !object(d) || !fingerprint(result.caseId) || !statuses.includes(result.status)
    || !reasons.includes(result.reasonCode) || !actions.includes(result.recommendedNextAction)
    || result.contractOnly !== true || result.commercialSuccess !== false || result.applicationPaymentState !== 'PAYMENTS_DISABLED'
    || result.providerState !== 'PROVIDER_NOT_CALLED' || result.effectApplied !== false
    || ['paymentAttemptAllowed', 'refundAttemptAllowed', 'cancellationAttemptAllowed'].some(key => result[key] !== false)
    || ['manualReviewRequired', 'reconciliationRequired', 'compensationRequired'].some(key => typeof result[key] !== 'boolean')
    || typeof d.requestId !== 'string' || !/^[a-f0-9]{32}$/.test(d.requestId)
    || !fingerprint(d.providerFingerprint) || !fingerprint(d.paymentFingerprint)
    || !paymentStates.includes(d.internalPaymentState) || !paymentStates.includes(d.providerObservedState)
    || result.observedPaymentState !== d.providerObservedState || !bookingStates.includes(d.bookingState)
    || !nullableFingerprint(d.eventFingerprint) || !nullableFingerprint(d.incomingEvidenceFingerprint)
    || !(d.eventType === null || typeof d.eventType === 'string' && Object.hasOwn(STATES, d.eventType))
    || !boolOrNull(d.amountMatch) || !boolOrNull(d.currencyMatch)
    || !Array.isArray(d.previousEvidenceFingerprints) || d.previousEvidenceFingerprints.length > 1000
    || d.previousEvidenceFingerprints.some(value => !fingerprint(value))) invalid();
  // Copy explicit fields only; never spread diagnostics, manualReview or raw adapter data.
  return { caseId: result.caseId, reconciliationStatus: result.status, reasonCode: result.reasonCode,
    recommendedNextAction: result.recommendedNextAction, manualReviewRequired: result.manualReviewRequired,
    reconciliationRequired: result.reconciliationRequired, compensationRequired: result.compensationRequired,
    requestId: d.requestId, providerFingerprint: d.providerFingerprint, paymentFingerprint: d.paymentFingerprint,
    internalPaymentState: d.internalPaymentState, paymentState: d.providerObservedState, bookingState: d.bookingState,
    eventFingerprint: d.eventFingerprint, eventType: d.eventType, amountMatch: d.amountMatch, currencyMatch: d.currencyMatch,
    previousEvidenceFingerprints: [...d.previousEvidenceFingerprints], incomingEvidenceFingerprint: d.incomingEvidenceFingerprint };
}
function classify(r) {
  const captured = [r.internalPaymentState, r.paymentState].includes('PAYMENT_CAPTURED') || r.eventType === 'payment.captured';
  let category = 'RECONCILIATION_REQUIRED';
  if (['PAYMENT_STATE_CONFLICT', 'PAYMENT_CORRELATION_MISMATCH', 'PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_CURRENCY_MISMATCH'].includes(r.reasonCode)) category = r.reasonCode;
  else if (r.reasonCode === 'REFUND_REQUIRED') category = 'REFUND_REVIEW_REQUIRED';
  else if (r.reasonCode === 'CANCELLATION_REQUIRED') category = 'CANCELLATION_REVIEW_REQUIRED';
  else if (r.reasonCode === 'BOOKING_PAYMENT_INCONSISTENT' || r.bookingState === 'BOOKING_OUTCOME_UNKNOWN' && r.paymentState !== 'PAYMENT_OUTCOME_UNKNOWN') category = 'BOOKING_PAYMENT_INCONSISTENCY';
  else if (r.paymentState === 'PAYMENT_OUTCOME_UNKNOWN') category = 'PAYMENT_OUTCOME_UNKNOWN';
  else if (r.reconciliationStatus === 'AWAITING_PROVIDER_EVIDENCE') category = 'AWAITING_PROVIDER_EVIDENCE';
  let priority = 'HIGH';
  if (category === 'REFUND_REVIEW_REQUIRED' || captured && (r.reconciliationStatus === 'STATE_CONFLICT' || r.bookingState === 'BOOKING_FAILED_FINAL')) priority = 'CRITICAL';
  else if (r.reconciliationStatus === 'AWAITING_PROVIDER_EVIDENCE') priority = 'LOW';
  else if (r.reconciliationStatus === 'STATE_CONFLICT' && !captured && ![r.internalPaymentState, r.paymentState].some(state => /UNKNOWN|FAILED_FINAL|CANCELLED/.test(state))
    && !['PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_CURRENCY_MISMATCH'].includes(category)) priority = 'MEDIUM';
  const status = r.reconciliationStatus === 'STATE_CONFLICT' ? 'MANUAL_REVIEW_REQUIRED'
    : r.reconciliationStatus === 'AWAITING_PROVIDER_EVIDENCE' ? 'AWAITING_EVIDENCE' : r.reconciliationStatus;
  return { category, priority, status };
}
function projectCase(result) {
  const r = copyResult(result);
  // A consistent/no-action observation is not an incident and never closes a supplied open case.
  if (r.reconciliationStatus === 'NO_ACTION_REQUIRED') return null;
  return { caseId: r.caseId, caseFamilyId: digest([r.requestId, r.providerFingerprint, r.paymentFingerprint]),
    ...classify(r), reasonCode: r.reasonCode, requestId: r.requestId, providerFingerprint: r.providerFingerprint,
    paymentState: r.paymentState, bookingState: r.bookingState, amountMatch: r.amountMatch, currencyMatch: r.currencyMatch,
    manualReviewRequired: r.manualReviewRequired, reconciliationRequired: r.reconciliationRequired,
    compensationRequired: r.compensationRequired, recommendedNextAction: r.recommendedNextAction,
    contractOnly: true, commercialSuccess: false, applicationPaymentState: 'PAYMENTS_DISABLED', operatorActionsExecutable: false };
}
function aggregate(results) {
  if (!Array.isArray(results) || results.length > 1000) invalid();
  const families = new Map(), identities = new Map();
  for (const result of results) {
    const r = copyResult(result), signature = digest(r);
    if (identities.has(r.caseId) && identities.get(r.caseId) !== signature) invalid();
    identities.set(r.caseId, signature);
    const row = projectCase(result);
    if (!row) continue;
    if (!families.has(row.caseFamilyId)) families.set(row.caseFamilyId, []);
    families.get(row.caseFamilyId).push({ row, r });
  }
  return [...families.values()].map(entries => {
    // All supplied snapshots remain unresolved. Prefer conflict over action review; never infer newest/resolved.
    entries.sort((a, b) => statuses.indexOf(a.r.reconciliationStatus) - statuses.indexOf(b.r.reconciliationStatus)
      || priorities.indexOf(a.row.priority) - priorities.indexOf(b.row.priority) || a.row.caseId.localeCompare(b.row.caseId));
    const selected = entries[0].row;
    const priority = priorities[Math.min(...entries.map(e => priorities.indexOf(e.row.priority)))];
    const relatedCaseIds = [...new Set(entries.map(e => e.row.caseId))].sort();
    const observations = new Map();
    for (const { r } of entries) {
      const observation = { eventFingerprint: r.eventFingerprint, eventType: r.eventType,
        internalPaymentState: r.internalPaymentState, observedPaymentState: r.paymentState, bookingState: r.bookingState,
        reconciliationStatus: r.reconciliationStatus, reasonCode: r.reasonCode, amountMatch: r.amountMatch, currencyMatch: r.currencyMatch,
        recommendedNextAction: r.recommendedNextAction, incomingEvidenceFingerprint: r.incomingEvidenceFingerprint,
        previousEvidenceFingerprints: [...new Set(r.previousEvidenceFingerprints)].sort() };
      observations.set(digest(observation), observation);
    }
    const row = { ...selected, priority,
      manualReviewRequired: entries.some(e => e.row.manualReviewRequired),
      reconciliationRequired: entries.some(e => e.row.reconciliationRequired),
      compensationRequired: entries.some(e => e.row.compensationRequired) };
    return { row, detail: { ...row, paymentFingerprint: entries[0].r.paymentFingerprint, relatedCaseIds,
      timelineOrder: 'DETERMINISTIC_OBSERVATION_ORDER',
      timeline: [...observations.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value) } };
  }).sort((a, b) => priorities.indexOf(a.row.priority) - priorities.indexOf(b.row.priority) || a.row.caseId.localeCompare(b.row.caseId));
}
function validateFilters(filters) {
  if (!object(filters) || Object.keys(filters).some(key => !['priority', 'category', 'status', 'providerFingerprint', 'manualReviewRequired', 'compensationRequired'].includes(key))) invalid();
  for (const [key, values] of [['priority', priorities], ['category', categories], ['status', queueStatuses]])
    if (Object.hasOwn(filters, key) && !values.includes(filters[key])) invalid();
  if (Object.hasOwn(filters, 'providerFingerprint') && !fingerprint(filters.providerFingerprint)) invalid();
  for (const key of ['manualReviewRequired', 'compensationRequired']) if (Object.hasOwn(filters, key) && typeof filters[key] !== 'boolean') invalid();
}
function list(results, filters = {}) {
  validateFilters(filters);
  return { items: aggregate(results).map(value => value.row).filter(row => Object.entries(filters).every(([key, value]) => row[key] === value)) };
}
function detail(results, identity) {
  if (!fingerprint(identity)) invalid();
  return aggregate(results).find(value => value.row.caseFamilyId === identity || value.detail.relatedCaseIds.includes(identity))?.detail ?? null;
}
module.exports = { projectCase, list, detail };
