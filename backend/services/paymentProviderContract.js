// Contract-only, server-owned observations. No provider selection, credentials or operation runner.
const STATES = Object.freeze({
  'payment.pending': 'PAYMENT_PENDING', 'payment.authorized': 'PAYMENT_AUTHORIZED',
  'payment.captured': 'PAYMENT_CAPTURED', 'payment.failed': 'PAYMENT_FAILED_FINAL',
  'payment.cancelled': 'PAYMENT_CANCELLED', 'payment.unknown': 'PAYMENT_OUTCOME_UNKNOWN',
});
// Shared observation ordering; reconciliation is adapter evidence, never browser permission.
function observationDecision(from, event) {
  if (from === 'PAYMENT_OUTCOME_UNKNOWN') return event.reconciled && event.state !== from ? 'ACCEPT' : 'UNKNOWN';
  const edges = {
    PAYMENT_NOT_STARTED: ['PAYMENT_PENDING', 'PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED', 'PAYMENT_OUTCOME_UNKNOWN'],
    PAYMENT_PENDING: ['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED', 'PAYMENT_OUTCOME_UNKNOWN'],
    PAYMENT_AUTHORIZED: ['PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_CANCELLED', 'PAYMENT_OUTCOME_UNKNOWN'],
    PAYMENT_CAPTURED: ['PAYMENT_CAPTURED'], PAYMENT_FAILED_FINAL: ['PAYMENT_FAILED_FINAL'], PAYMENT_CANCELLED: ['PAYMENT_CANCELLED'],
  };
  return edges[from]?.includes(event.state) ? 'ACCEPT' : 'CONFLICT';
}
const fail = code => { throw Object.assign(new Error('Payment contract rejected'), { code }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
function cents(value) {
  if (!['number', 'string'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const parts = String(value).split('.');
  const result = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
function trustedIntent(value, providerPaymentId) {
  if (!object(value) || value.state !== 'PAYMENT_INTENT_READY' || value.reviewState !== 'REVIEW_READY'
    || !/^[a-f0-9]{32}$/.test(value.requestId || '') || !id(providerPaymentId)
    || cents(value.amount) === null || !/^[A-Z]{3}$/.test(value.currency || '')) fail('PAYMENT_PREREQUISITE_MISSING');
  // Copy only immutable correlation and money; caller supplies the existing server intent, never browser input.
  return Object.freeze({ requestId: value.requestId, providerPaymentId, amountMinor: cents(value.amount), currency: value.currency });
}
function adapterContract(adapter) {
  if (!object(adapter) || !id(adapter.name) || adapter.name === 'none' || adapter.mode !== 'offline-contract'
    || typeof adapter.verifyWebhook !== 'function' || typeof adapter.normalizeWebhookEvent !== 'function') fail('PAYMENT_PROVIDER_CONTRACT_INVALID');
  return Object.freeze({ name: adapter.name, mode: adapter.mode,
    verifyWebhook: adapter.verifyWebhook.bind(adapter), normalizeWebhookEvent: adapter.normalizeWebhookEvent.bind(adapter) });
}
function normalizeEvent(value) {
  const fields = ['eventId', 'provider', 'paymentId', 'requestId', 'type', 'amount', 'currency', 'reconciled'];
  if (!object(value) || Object.keys(value).some(key => !fields.includes(key)) || !id(value.eventId) || !id(value.provider)
    || !id(value.paymentId) || !/^[a-f0-9]{32}$/.test(value.requestId || '') || cents(value.amount) === null
    || !/^[A-Z]{3}$/.test(value.currency || '') || value.reconciled !== undefined && typeof value.reconciled !== 'boolean') fail('MALFORMED_WEBHOOK');
  if (!Object.hasOwn(STATES, value.type)) fail('UNSUPPORTED_WEBHOOK_EVENT');
  return Object.freeze({ eventId: value.eventId, provider: value.provider, paymentId: value.paymentId,
    requestId: value.requestId, type: value.type, state: STATES[value.type], amountMinor: cents(value.amount),
    currency: value.currency, reconciled: value.reconciled === true });
}
module.exports = { STATES, trustedIntent, adapterContract, normalizeEvent, observationDecision };
