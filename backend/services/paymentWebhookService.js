const crypto = require('node:crypto');
const contract = require('./paymentProviderContract');
const lifecycle = require('./bookingLifecycle');
const recovery = require('./bookingPaymentRecovery');

function createProcessor({ adapter, intent, providerPaymentId } = {}) {
  const reply = (code, extra = {}) => ({ code, contractOnly: true, commercialSuccess: false,
    applicationPaymentState: 'PAYMENTS_DISABLED', providerState: 'PROVIDER_NOT_CALLED', ...extra });
  // Not wired to HTTP, DB or live provider. Default is disabled, regardless of requested payment flags.
  if (!adapter) return Object.freeze({ process: async () => reply('PAYMENTS_DISABLED') });
  if (process.env.NODE_ENV !== 'test') throw Object.assign(new Error('Offline payment contract only'), { code: 'PAYMENTS_DISABLED' });
  const provider = contract.adapterContract(adapter), trusted = contract.trustedIntent(intent, providerPaymentId);
  const seen = new Map(); let state = 'PAYMENT_NOT_STARTED', tail = Promise.resolve();
  const edges = {
    PAYMENT_NOT_STARTED: ['PAYMENT_PENDING', 'PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED', 'PAYMENT_OUTCOME_UNKNOWN'],
    PAYMENT_PENDING: ['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED', 'PAYMENT_OUTCOME_UNKNOWN'],
    PAYMENT_AUTHORIZED: ['PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_CANCELLED', 'PAYMENT_OUTCOME_UNKNOWN'],
    PAYMENT_CAPTURED: ['PAYMENT_CAPTURED'], PAYMENT_FAILED_FINAL: ['PAYMENT_FAILED_FINAL'], PAYMENT_CANCELLED: ['PAYMENT_CANCELLED'],
  };
  async function accept(rawBody, authentication) {
    // Preserve exact raw bytes; bounded Buffer only, no parsed browser JSON or logging.
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 65536) return reply('MALFORMED_WEBHOOK');
    const raw = Buffer.from(rawBody);
    try { if (await provider.verifyWebhook(raw, authentication) !== true) return reply('INVALID_WEBHOOK_SIGNATURE'); }
    catch { return reply('INVALID_WEBHOOK_SIGNATURE'); }
    let event;
    try { event = contract.normalizeEvent(await provider.normalizeWebhookEvent(raw)); }
    catch (error) { return reply(error?.code === 'UNSUPPORTED_WEBHOOK_EVENT' ? error.code : 'MALFORMED_WEBHOOK'); }
    if (event.provider !== provider.name || event.paymentId !== trusted.providerPaymentId || event.requestId !== trusted.requestId)
      return reply('PAYMENT_CORRELATION_MISMATCH');
    if (event.amountMinor !== trusted.amountMinor) return reply('PAYMENT_AMOUNT_MISMATCH');
    if (event.currency !== trusted.currency) return reply('PAYMENT_CURRENCY_MISMATCH');
    const digest = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
    if (seen.has(event.eventId)) return reply(seen.get(event.eventId) === digest ? 'DUPLICATE_WEBHOOK_EVENT' : 'PAYMENT_STATE_CONFLICT');
    if (seen.size >= 1000) return reply('PAYMENT_STATE_CONFLICT'); // Fail closed; never evict replay protection silently.
    const resolving = state === 'PAYMENT_OUTCOME_UNKNOWN';
    if (resolving ? !event.reconciled || event.state === 'PAYMENT_OUTCOME_UNKNOWN' : !edges[state]?.includes(event.state))
      return reply(resolving ? 'PAYMENT_OUTCOME_UNKNOWN' : 'PAYMENT_STATE_CONFLICT');
    // Authorization is not capture. Validate a hypothetical server-evidenced booking projection only;
    // no booking record or payment state is written, and the real application stays disabled.
    const projection = { checkRate: 'CONFIRMED', travelers: 'VALID', review: 'REVIEW_READY', booking: 'BOOKING_CONFIRMED',
      evidence: { booking: true, payment: event.state === 'PAYMENT_CAPTURED' },
      payment: event.state === 'PAYMENT_AUTHORIZED' ? 'PAYMENT_PENDING'
        : event.state === 'PAYMENT_CANCELLED' ? 'PAYMENT_FAILED_FINAL' : event.state };
    const plan = recovery.plan({ requestId: trusted.requestId, booking: { state: 'CONFIRMED', providerResultObserved: true },
      payment: { state: event.state === 'PAYMENT_CAPTURED' ? 'paid' : event.state === 'PAYMENT_OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN'
        : ['PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED'].includes(event.state) ? 'failed' : 'pending',
      providerResultObserved: event.state === 'PAYMENT_CAPTURED', error: { code: 'PAYMENT_REJECTED' }, dispatch: 'SENT', outcomeKnown: true } });
    projection.recovery = plan.reconciliationRequired ? 'RECONCILIATION_REQUIRED' : plan.state;
    projection.compensation = plan.compensation; projection.reconciliationRequired = plan.reconciliationRequired;
    if (!lifecycle.validateLifecycleState(projection).valid) return reply('PAYMENT_STATE_CONFLICT');
    // Synchronous commit after all async adapter work. Serialized processor prevents concurrent duplicate effects.
    const effectApplied = state !== event.state;
    state = event.state; seen.set(event.eventId, digest);
    return reply(state === 'PAYMENT_OUTCOME_UNKNOWN' ? 'PAYMENT_OUTCOME_UNKNOWN' : 'WEBHOOK_EVENT_ACCEPTED',
      { provider: provider.name, eventId: event.eventId, requestId: trusted.requestId, normalizedState: state,
        reconciliationRequired: plan.reconciliationRequired, compensation: plan.compensation,
        effectApplied, amountMinor: trusted.amountMinor, currency: trusted.currency });
  }
  return Object.freeze({ process(rawBody, authentication) {
    // Copy bytes immediately, before queueing, so caller mutation cannot alter queued signature input.
    const raw = Buffer.isBuffer(rawBody) ? Buffer.from(rawBody) : rawBody;
    const result = tail.then(() => accept(raw, authentication));
    tail = result.catch(() => {}); return result;
  } });
}
module.exports = { createProcessor };
