import authFetch from './authFetch';
import { labels } from '../utils/reconciliationPresentation';
// Authenticated GET only. The server's default repository is disabled; never substitute demo data.
export function readReconciliationList(filters = {}) {
  const query = new URLSearchParams({ page: '1', limit: '100' });
  for (const [key, value] of Object.entries(filters)) {
    if (!['priority', 'category', 'status', 'manualReviewRequired', 'compensationRequired'].includes(key)) throw Error('INVALID_RECONCILIATION_FILTER');
    if (value === '') continue;
    if (['manualReviewRequired', 'compensationRequired'].includes(key)) {
      if (typeof value !== 'boolean') throw Error('INVALID_RECONCILIATION_FILTER');
    } else if (typeof value !== 'string' || !Object.hasOwn(labels[key], value)) throw Error('INVALID_RECONCILIATION_FILTER');
    query.set(key, String(value));
  }
  return authFetch(`/admin/reconciliation?${query}`, { method: 'GET' });
}
export function readReconciliationDetail(caseId) {
  if (typeof caseId !== 'string' || !/^[a-f0-9]{64}$/.test(caseId)) throw Error('INVALID_RECONCILIATION_CASE_ID');
  return authFetch(`/admin/reconciliation/${caseId}`, { method: 'GET' });
}
