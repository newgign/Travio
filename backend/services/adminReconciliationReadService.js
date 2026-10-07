const contract = require('../repositories/reconciliationRepository');
const operations = require('./reconciliationOperationsReadModel');
const error = (code, status) => Object.assign(new Error('Reconciliation read unavailable'), { code, status });
function parseQuery(query = {}) {
  const allowed = ['priority', 'category', 'status', 'manualReviewRequired', 'compensationRequired', 'page', 'limit'];
  if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !allowed.includes(key))) throw error('INVALID_RECONCILIATION_FILTER', 400);
  const filters = {};
  for (const key of allowed.slice(0, 5)) if (Object.hasOwn(query, key)) {
    const value = query[key];
    if (typeof value !== 'string') throw error('INVALID_RECONCILIATION_FILTER', 400);
    if (['manualReviewRequired', 'compensationRequired'].includes(key)) {
      if (!['true', 'false'].includes(value)) throw error('INVALID_RECONCILIATION_FILTER', 400);
      filters[key] = value === 'true';
    } else filters[key] = value;
  }
  try { operations.list([], filters); } catch { throw error('INVALID_RECONCILIATION_FILTER', 400); }
  const integer = (key, fallback, max) => {
    if (!Object.hasOwn(query, key)) return fallback;
    if (typeof query[key] !== 'string' || !/^[1-9]\d*$/.test(query[key]) || !Number.isSafeInteger(Number(query[key])) || Number(query[key]) > max) throw error('INVALID_RECONCILIATION_FILTER', 400);
    return Number(query[key]);
  };
  return { filters, page: integer('page', 1, 100000), limit: integer('limit', 25, 100) };
}
function snapshots(records) {
  if (!Array.isArray(records) || records.length > 1000) throw error('RECONCILIATION_SOURCE_UNAVAILABLE', 503);
  const results = [];
  for (const record of records) {
    if (!record || !Array.isArray(record.snapshots) || record.snapshots.length > 1000) throw error('RECONCILIATION_SOURCE_UNAVAILABLE', 503);
    for (const snapshot of record.snapshots) {
      if (!snapshot?.result || results.length >= 1000) throw error('RECONCILIATION_SOURCE_UNAVAILABLE', 503);
      results.push(snapshot.result);
    }
  }
  return results;
}
function createService(repository = contract.repository) {
  contract.assertRepository(repository);
  return Object.freeze({
    async list(query) {
      const { filters, page, limit } = parseQuery(query);
      try {
        const response = await repository.listCases();
        if (response?.source === 'unavailable' && Array.isArray(response.records) && !response.records.length)
          return { source: 'unavailable', code: 'RECONCILIATION_SOURCE_UNAVAILABLE', items: [], pagination: { page, limit, total: 0, pages: 1 } };
        if (response?.source !== 'available') throw error('RECONCILIATION_SOURCE_UNAVAILABLE', 503);
        const items = operations.list(snapshots(response.records), filters).items;
        return { source: 'available', items: items.slice((page - 1) * limit, page * limit),
          pagination: { page, limit, total: items.length, pages: Math.max(1, Math.ceil(items.length / limit)) } };
      } catch { throw error('RECONCILIATION_SOURCE_UNAVAILABLE', 503); }
    },
    async detail(caseId, query = {}) {
      if (typeof caseId !== 'string' || !/^[a-f0-9]{64}$/.test(caseId) || Object.keys(query).length) throw error('INVALID_RECONCILIATION_FILTER', 400);
      let response;
      try { response = await repository.getCaseById(caseId); }
      catch (cause) { throw error(cause?.code === 'RECONCILIATION_CASE_NOT_FOUND' ? cause.code : 'RECONCILIATION_SOURCE_UNAVAILABLE', cause?.code === 'RECONCILIATION_CASE_NOT_FOUND' ? 404 : 503); }
      if (response?.source === 'unavailable' && response.record === null || response?.source === 'available' && response.record === null) throw error('RECONCILIATION_CASE_NOT_FOUND', 404);
      if (response?.source !== 'available') throw error('RECONCILIATION_SOURCE_UNAVAILABLE', 503);
      let projected;
      try { projected = operations.detail(snapshots([response.record]), caseId); } catch { throw error('RECONCILIATION_SOURCE_UNAVAILABLE', 503); }
      if (!projected) throw error('RECONCILIATION_CASE_NOT_FOUND', 404);
      return projected;
    },
  });
}
module.exports = { createService, parseQuery };
