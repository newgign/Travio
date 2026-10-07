// No durable source or endpoint exists. Runtime never fabricates cases or calls another operations API.
export async function readReconciliationList() {
  return { source: 'unavailable', items: [] };
}
export async function readReconciliationDetail() {
  throw Object.assign(new Error('RECONCILIATION_CASE_NOT_FOUND'), { status: 404 });
}
