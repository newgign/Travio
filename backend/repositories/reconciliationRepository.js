// Persistence contract only. No pg/DB import, adapter selection, startup wiring or successful noop writes.
const crypto = require('node:crypto');
const operations = require('../services/reconciliationOperationsReadModel');
const providerContract = require('../services/paymentProviderContract');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const failure = code => Object.assign(new Error('Reconciliation storage rejected'), { code });
function exact(value, fields, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !fields.includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) throw failure(code);
}
const diagnosticFields = ['requestId', 'providerFingerprint', 'paymentFingerprint', 'internalPaymentState', 'providerObservedState',
  'bookingState', 'eventFingerprint', 'eventType', 'previousEvidenceFingerprints', 'incomingEvidenceFingerprint', 'amountMatch', 'currencyMatch'];
const resultFields = ['status', 'reasonCode', 'manualReviewRequired', 'reconciliationRequired', 'compensationRequired', 'recommendedNextAction',
  'observedPaymentState', 'caseId', 'diagnostic', 'contractOnly', 'commercialSuccess', 'applicationPaymentState', 'providerState', 'effectApplied',
  'paymentAttemptAllowed', 'refundAttemptAllowed', 'cancellationAttemptAllowed', 'manualReview'];
function validateHistory(history, code) {
  if (!Array.isArray(history) || Object.getPrototypeOf(history) !== Array.prototype || history.length > 1000
    || Reflect.ownKeys(history).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(history, key), 'value')))
    || Array.from({ length: history.length }, (_, index) => index).some(index => !Object.hasOwn(history, index)
      || typeof history[index] !== 'string' || !/^[a-f0-9]{64}$/.test(history[index]))) throw failure(code);
}
function caseSnapshot(value) {
  const code = 'RECONCILIATION_INVALID_CASE';
  exact(value, resultFields, code); exact(value.diagnostic, diagnosticFields, code);
  validateHistory(value.diagnostic.previousEvidenceFingerprints, code);
  let row;
  try { row = operations.projectCase(value); } catch { throw failure(code); }
  if (!row || value.manualReviewRequired !== (value.manualReview !== null)) throw failure(code);
  if (value.manualReview !== null) {
    exact(value.manualReview, ['caseId', 'reasonCode', 'recommendedNextAction', ...diagnosticFields], code);
    for (const key of ['caseId', 'reasonCode', 'recommendedNextAction']) if (value.manualReview[key] !== value[key]) throw failure(code);
    validateHistory(value.manualReview.previousEvidenceFingerprints, code);
    for (const key of diagnosticFields) {
      if (key === 'previousEvidenceFingerprints') {
        if (JSON.stringify(value.manualReview[key]) !== JSON.stringify(value.diagnostic[key])) throw failure(code);
      } else if (value.manualReview[key] !== value.diagnostic[key]) throw failure(code);
    }
  }
  // Validation precedes serialization. Reject nested objects/accessors through the existing scalar schema.
  const result = Object.fromEntries(resultFields.filter(key => key !== 'manualReview' && key !== 'diagnostic').map(key => [key, value[key]]));
  result.diagnostic = Object.fromEntries(diagnosticFields.map(key => [key, key === 'previousEvidenceFingerprints' ? [...value.diagnostic[key]] : value.diagnostic[key]]));
  result.manualReview = value.manualReview === null ? null : { caseId: result.caseId, reasonCode: result.reasonCode,
    recommendedNextAction: result.recommendedNextAction, ...result.diagnostic };
  return { result, caseFamilyId: row.caseFamilyId, snapshotDigest: digest(result) };
}
function normalizedEvidence(value) {
  const code = 'RECONCILIATION_INVALID_EVIDENCE';
  const fields = ['eventId', 'provider', 'paymentId', 'requestId', 'type', 'state', 'amountMinor', 'currency', 'reconciled'];
  exact(value, fields, code);
  if (!Number.isSafeInteger(value.amountMinor) || value.amountMinor <= 0 || typeof value.reconciled !== 'boolean'
    || typeof value.type !== 'string' || typeof value.requestId !== 'string') throw failure(code);
  let event;
  try {
    event = providerContract.normalizeEvent({ eventId: value.eventId, provider: value.provider, paymentId: value.paymentId,
      requestId: value.requestId, type: value.type, amount: `${Math.floor(value.amountMinor / 100)}.${String(value.amountMinor % 100).padStart(2, '0')}`,
      currency: value.currency, reconciled: value.reconciled });
  } catch { throw failure(code); }
  if (value.state !== event.state || value.amountMinor !== event.amountMinor) throw failure(code);
  // Persist fingerprints of arbitrary provider labels/references, never the original identifiers.
  return { eventFingerprint: digest(event.eventId), providerFingerprint: digest(event.provider), paymentFingerprint: digest(event.paymentId),
    requestId: event.requestId, eventType: event.type, normalizedState: event.state, amountMinor: event.amountMinor,
    currency: event.currency, reconciled: event.reconciled, evidenceDigest: digest(event) };
}
function prepareWrite(input) {
  exact(input, ['result', 'evidence', 'observedAt', 'expectedVersion'], 'RECONCILIATION_INVALID_CASE');
  const copied = caseSnapshot(input.result), d = copied.result.diagnostic;
  if (typeof input.observedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.observedAt)
    || !Number.isFinite(Date.parse(input.observedAt)) || new Date(input.observedAt).toISOString() !== input.observedAt
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw failure('RECONCILIATION_INVALID_CASE');
  const evidence = input.evidence == null ? null : normalizedEvidence(input.evidence);
  if ((d.incomingEvidenceFingerprint !== null) !== Boolean(evidence)) throw failure('RECONCILIATION_INVALID_EVIDENCE');
  if (evidence && (evidence.evidenceDigest !== d.incomingEvidenceFingerprint || evidence.eventFingerprint !== d.eventFingerprint
    || evidence.eventType !== d.eventType || evidence.providerFingerprint !== d.providerFingerprint
    || evidence.paymentFingerprint !== d.paymentFingerprint || evidence.requestId !== d.requestId)) throw failure('RECONCILIATION_INVALID_EVIDENCE');
  return { ...copied, evidence, observedAt: input.observedAt, expectedVersion: input.expectedVersion };
}
function assertRepository(repository) {
  if (!repository || ['upsertCase', 'getCaseById', 'findByCorrelation', 'listCases'].some(key => typeof repository[key] !== 'function'))
    throw failure('RECONCILIATION_REPOSITORY_INVALID');
  return repository;
}
function createDisabledRepository() {
  return Object.freeze({
    async upsertCase() { throw failure('RECONCILIATION_STORAGE_DISABLED'); },
    async getCaseById() { return { source: 'unavailable', record: null }; },
    async findByCorrelation() { return { source: 'unavailable', record: null }; },
    async listCases() { return { source: 'unavailable', records: [] }; },
  });
}
function createRuntimeRepository(env = process.env) {
  require('../config/reconciliationStorage').storageMode(env);
  return createDisabledRepository();
}
module.exports = { repository: createRuntimeRepository(), createRuntimeRepository, createDisabledRepository, assertRepository, prepareWrite, failure };
