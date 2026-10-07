// TEST ONLY. No environment selects this repository; no durable or cross-instance guarantees.
const contract = require('../../repositories/reconciliationRepository');
const hash = value => require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = value => structuredClone(value);
function createTestRepository({ available = true } = {}) {
  if (process.env.NODE_ENV !== 'test') throw contract.failure('RECONCILIATION_STORAGE_DISABLED');
  const records = new Map(), events = new Map(), identities = new Map();
  const check = () => { if (!available) throw contract.failure('RECONCILIATION_STORAGE_UNAVAILABLE'); };
  const identity = value => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw contract.failure('RECONCILIATION_INVALID_CASE'); };
  const result = (code, record, effectApplied = false) => ({ code, record: copy(record), effectApplied, durable: false, storage: 'TEST_ONLY' });
  return contract.assertRepository({
    async upsertCase(input) {
      check(); const write = contract.prepareWrite(input);
      const existing = records.get(write.caseFamilyId);
      const eventKey = write.evidence ? hash([write.evidence.providerFingerprint, write.evidence.eventFingerprint]) : null;
      const oldEvent = eventKey ? events.get(eventKey) : null;
      if (oldEvent && (oldEvent.digest !== write.evidence.evidenceDigest || oldEvent.family !== write.caseFamilyId))
        throw Object.assign(contract.failure('RECONCILIATION_EVIDENCE_CONFLICT'), { state: 'STATE_CONFLICT' });
      if (identities.has(write.result.caseId) && identities.get(write.result.caseId) !== write.snapshotDigest)
        throw contract.failure('RECONCILIATION_INVALID_CASE');
      if (existing?.snapshots.some(s => s.result.caseId === write.result.caseId)) return result(write.evidence ? 'RECONCILIATION_DUPLICATE_EVIDENCE' : 'RECONCILIATION_DUPLICATE_CASE', existing);
      // Duplicate webhook cannot update version/time/state. Different trusted reevaluation without the event may be stored separately.
      if (oldEvent) return result('RECONCILIATION_DUPLICATE_EVIDENCE', existing);
      if (write.expectedVersion !== (existing?.version ?? 0)) throw contract.failure('RECONCILIATION_CASE_VERSION_CONFLICT');
      if (existing && write.observedAt < existing.lastObservedAt) throw contract.failure('RECONCILIATION_CASE_VERSION_CONFLICT');
      if (records.size >= 1000 && !existing || (existing?.snapshots.length ?? 0) >= 1000 || events.size >= 1000 && write.evidence)
        throw contract.failure('RECONCILIATION_STORAGE_UNAVAILABLE');
      const record = existing ? copy(existing) : { caseFamilyId: write.caseFamilyId, requestId: write.result.diagnostic.requestId,
        providerFingerprint: write.result.diagnostic.providerFingerprint, paymentFingerprint: write.result.diagnostic.paymentFingerprint,
        version: 0, firstObservedAt: write.observedAt, createdAt: write.observedAt, snapshots: [], evidence: [] };
      record.version++; record.lastObservedAt = record.updatedAt = write.observedAt; record.latestCaseId = write.result.caseId;
      record.snapshots.push({ observedAt: write.observedAt, result: write.result });
      if (write.evidence) record.evidence.push({ ...write.evidence, observedAt: write.observedAt });
      // One synchronous commit after complete validation; not a distributed transaction simulation.
      records.set(write.caseFamilyId, record); identities.set(write.result.caseId, write.snapshotDigest);
      if (eventKey) events.set(eventKey, { digest: write.evidence.evidenceDigest, family: write.caseFamilyId });
      return result('RECONCILIATION_CASE_STORED', record, true);
    },
    async getCaseById(id) {
      check(); identity(id);
      const record = records.get(id) || [...records.values()].find(r => r.snapshots.some(s => s.result.caseId === id));
      if (!record) throw contract.failure('RECONCILIATION_CASE_NOT_FOUND');
      return { source: 'available', record: copy(record) };
    },
    async findByCorrelation(id) {
      check(); identity(id); const record = records.get(id);
      if (!record) throw contract.failure('RECONCILIATION_CASE_NOT_FOUND');
      return { source: 'available', record: copy(record) };
    },
    async listCases() { check(); return { source: 'available', records: [...records.values()].sort((a, b) => a.caseFamilyId.localeCompare(b.caseFamilyId)).map(copy) }; },
  });
}
module.exports = { createTestRepository };
