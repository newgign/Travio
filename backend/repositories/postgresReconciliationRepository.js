// Explicit injected pool only. No pg/db import, env selection or runtime registration.
const contract = require('./reconciliationRepository');
const operations = require('../services/reconciliationOperationsReadModel');
const fail = contract.failure;
const codes = new Set(['RECONCILIATION_CASE_NOT_FOUND', 'RECONCILIATION_CASE_VERSION_CONFLICT', 'RECONCILIATION_EVIDENCE_CONFLICT', 'RECONCILIATION_INVALID_CASE', 'RECONCILIATION_STORAGE_UNAVAILABLE']);
const translate = error => codes.has(error?.code) ? fail(error.code) : fail('RECONCILIATION_STORAGE_UNAVAILABLE');
const identity = id => { if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw fail('RECONCILIATION_INVALID_CASE'); };
const iso = value => new Date(value).toISOString();
function options(input = {}) {
  const keys = ['priority', 'category', 'status', 'manualReviewRequired', 'compensationRequired', 'limit', 'offset', 'sort'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !keys.includes(k))) throw fail('RECONCILIATION_INVALID_FILTER');
  const filters = Object.fromEntries(keys.slice(0, 5).filter(k => Object.hasOwn(input, k)).map(k => [k, input[k]]));
  try { operations.list([], filters); } catch { throw fail('RECONCILIATION_INVALID_FILTER'); }
  const limit = input.limit ?? 100, offset = input.offset ?? 0, sort = input.sort ?? 'priority';
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 9999900 || !['priority', 'lastObservedAt', 'caseId'].includes(sort)) throw fail('RECONCILIATION_INVALID_FILTER');
  return { filters, limit, offset, sort };
}
function record(row, history) {
  if (!row || !Number.isSafeInteger(Number(row.version)) || Number(row.version) < 1 || history.length > 1000) throw fail('RECONCILIATION_STORAGE_UNAVAILABLE');
  return { caseFamilyId: row.case_family_id, requestId: row.request_id, providerFingerprint: row.provider_fingerprint, paymentFingerprint: row.payment_fingerprint,
    latestCaseId: row.latest_case_id, version: Number(row.version), firstObservedAt: iso(row.first_observed_at), lastObservedAt: iso(row.last_observed_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    snapshots: history.map(h => ({ observedAt: iso(h.observed_at), result: h.result })),
    evidence: history.filter(h => h.event_fingerprint !== null).map(h => ({ providerFingerprint: h.provider_fingerprint, paymentFingerprint: h.payment_fingerprint, requestId: h.request_id,
      eventFingerprint: h.event_fingerprint, evidenceDigest: h.evidence_digest, eventType: h.event_type, normalizedState: h.normalized_state, amountMinor: Number(h.amount_minor), currency: h.currency, reconciled: h.reconciled, observedAt: iso(h.observed_at) })) };
}
function createPostgresRepository({ pool } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') throw fail('RECONCILIATION_REPOSITORY_INVALID');
  const history = async (executor, ids) => {
    const response = await executor.query('SELECT * FROM reconciliation_observations WHERE case_family_id = ANY($1::text[]) ORDER BY observed_at, observation_id LIMIT 1001', [ids]);
    if (response.rows.length > 1000) throw fail('RECONCILIATION_STORAGE_UNAVAILABLE');
    return response.rows;
  };
  const consistentRead = async action => {
    let client, begun = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); begun = true;
      const result = await action(client);
      await client.query('COMMIT'); begun = false;
      return result;
    } catch (error) {
      if (begun) await client.query('ROLLBACK').catch(() => {});
      throw translate(error);
    } finally { if (client) client.release(); }
  };
  const read = async (id, alias) => {
    identity(id);
    return consistentRead(async client => {
      const result = await client.query(alias
        ? 'SELECT c.* FROM reconciliation_cases c WHERE c.case_family_id = $1 OR c.case_family_id = (SELECT case_family_id FROM reconciliation_observations WHERE observation_id = $1)'
        : 'SELECT * FROM reconciliation_cases WHERE case_family_id = $1', [id]);
      if (!result.rows.length) throw fail('RECONCILIATION_CASE_NOT_FOUND');
      const row = result.rows[0];
      return { source: 'available', record: record(row, await history(client, [row.case_family_id])) };
    });
  };
  return Object.freeze(contract.assertRepository({
    getCaseById: id => read(id, true), findByCorrelation: id => read(id, false),
    async listCases(input) {
      const { filters, limit, offset, sort } = options(input), values = [], clauses = [];
      const columns = { priority: 'priority', category: 'category', status: 'status', manualReviewRequired: 'manual_review_required', compensationRequired: 'compensation_required' };
      for (const [key, value] of Object.entries(filters)) { values.push(value); clauses.push(`${columns[key]} = $${values.length}`); }
      const ordering = { priority: "CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, case_family_id", lastObservedAt: 'last_observed_at DESC, case_family_id', caseId: 'case_family_id' };
      values.push(limit, offset);
      return consistentRead(async client => {
        const rows = (await client.query(`SELECT * FROM reconciliation_cases${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''} ORDER BY ${ordering[sort]} LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows;
        if (rows.length > limit) throw fail('RECONCILIATION_STORAGE_UNAVAILABLE');
        const observations = rows.length ? await history(client, rows.map(r => r.case_family_id)) : [];
        return { source: 'available', records: rows.map(r => record(r, observations.filter(h => h.case_family_id === r.case_family_id))) };
      });
    },
    async upsertCase(input) {
      const write = contract.prepareWrite(input), d = write.result.diagnostic, e = write.evidence;
      let client, begun = false;
      try {
        client = await pool.connect(); await client.query('BEGIN'); begun = true;
        // Lock deterministic identity namespaces, including absent rows and global event/snapshot aliases.
        const locks = ['case:' + write.caseFamilyId, 'snapshot:' + write.result.caseId];
        if (e) locks.push('event:' + e.providerFingerprint + ':' + e.eventFingerprint);
        for (const key of locks.sort()) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
        const existing = (await client.query('SELECT * FROM reconciliation_cases WHERE case_family_id = $1 FOR UPDATE', [write.caseFamilyId])).rows[0];
        const event = e ? (await client.query('SELECT * FROM reconciliation_observations WHERE provider_fingerprint = $1 AND event_fingerprint = $2', [e.providerFingerprint, e.eventFingerprint])).rows[0] : null;
        if (event && (event.evidence_digest !== e.evidenceDigest || event.case_family_id !== write.caseFamilyId)) throw fail('RECONCILIATION_EVIDENCE_CONFLICT');
        const snapshot = (await client.query('SELECT * FROM reconciliation_observations WHERE observation_id = $1', [write.result.caseId])).rows[0];
        if (snapshot && (snapshot.snapshot_digest !== write.snapshotDigest || snapshot.case_family_id !== write.caseFamilyId)) throw fail('RECONCILIATION_INVALID_CASE');
        const oldHistory = existing ? await history(client, [write.caseFamilyId]) : [];
        if (snapshot || event) {
          if (!existing) throw fail('RECONCILIATION_STORAGE_UNAVAILABLE');
          const output = { code: e ? 'RECONCILIATION_DUPLICATE_EVIDENCE' : 'RECONCILIATION_DUPLICATE_CASE', record: record(existing, oldHistory), effectApplied: false, durable: true, storage: 'POSTGRESQL' };
          await client.query('COMMIT'); begun = false; return output;
        }
        if (write.expectedVersion !== Number(existing?.version ?? 0) || existing && write.observedAt < iso(existing.last_observed_at)) throw fail('RECONCILIATION_CASE_VERSION_CONFLICT');
        if (oldHistory.length >= 1000 || !Number.isSafeInteger(write.expectedVersion + 1)) throw fail('RECONCILIATION_STORAGE_UNAVAILABLE');
        const aggregate = operations.list([...oldHistory.map(h => h.result), write.result]).items[0];
        if (!aggregate) throw fail('RECONCILIATION_INVALID_CASE');
        const values = [write.caseFamilyId, d.requestId, d.providerFingerprint, d.paymentFingerprint, write.result.caseId, write.expectedVersion + 1, aggregate.category, aggregate.priority, aggregate.status, aggregate.manualReviewRequired, aggregate.compensationRequired, existing ? iso(existing.first_observed_at) : write.observedAt, write.observedAt];
        const row = existing ? (await client.query('UPDATE reconciliation_cases SET latest_case_id=$5, version=$6, category=$7, priority=$8, status=$9, manual_review_required=$10, compensation_required=$11, last_observed_at=$13, updated_at=NOW() WHERE case_family_id=$1 AND request_id=$2 AND provider_fingerprint=$3 AND payment_fingerprint=$4 AND first_observed_at=$12 AND version=$14 RETURNING *', [...values, write.expectedVersion])).rows[0]
          : (await client.query('INSERT INTO reconciliation_cases (case_family_id,request_id,provider_fingerprint,payment_fingerprint,latest_case_id,version,category,priority,status,manual_review_required,compensation_required,first_observed_at,last_observed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *', values)).rows[0];
        if (!row) throw fail('RECONCILIATION_CASE_VERSION_CONFLICT');
        const observation = (await client.query('INSERT INTO reconciliation_observations (observation_id,case_family_id,request_id,provider_fingerprint,payment_fingerprint,observed_at,result,snapshot_digest,event_fingerprint,evidence_digest,event_type,normalized_state,amount_minor,currency,reconciled) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
          [write.result.caseId, write.caseFamilyId, d.requestId, d.providerFingerprint, d.paymentFingerprint, write.observedAt, JSON.stringify(write.result), write.snapshotDigest, e?.eventFingerprint ?? null, e?.evidenceDigest ?? null, e?.eventType ?? null, e?.normalizedState ?? null, e?.amountMinor ?? null, e?.currency ?? null, e?.reconciled ?? null])).rows[0];
        const output = { code: 'RECONCILIATION_CASE_STORED', record: record(row, [...oldHistory, observation]), effectApplied: true, durable: true, storage: 'POSTGRESQL' };
        await client.query('COMMIT'); begun = false; return output;
      } catch (error) {
        if (begun) await client.query('ROLLBACK').catch(() => {});
        throw translate(error);
      } finally { if (client) client.release(); }
    },
  }));
}
module.exports = { createPostgresRepository };
