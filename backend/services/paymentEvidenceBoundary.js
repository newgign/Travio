// Server-only, pure assessment. Claims describe missing prerequisites, never prove provenance.
// No registered live adapter/verifier/merchant binding or committed payment-evidence store exists.
const { createHash } = require('node:crypto');
const lifecycle = require('./bookingLifecycle');
const recovery = require('./bookingPaymentRecovery');
const levels = Object.freeze(['NONE', 'SYNTHETIC', 'SANDBOX', 'UNVERIFIED_PROVIDER']);
const capabilities = Object.freeze({ liveAdapter: false, authenticityVerifier: false,
  merchantBinding: false, durableEvidenceStore: false });
const paymentStates = ['PAYMENT_NOT_STARTED', 'PAYMENTS_DISABLED', 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED',
  'PAYMENT_CAPTURED', 'PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED', 'PAYMENT_OUTCOME_UNKNOWN', 'PAID', 'SETTLED'];
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const requestId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const invalid = () => { throw Error('PAYMENT_EVIDENCE_INPUT_INVALID'); };
// Do not execute getters/toJSON or echo rejected input. Bound even ignored nested data.
function snapshot(value, depth = 0, budget = { left: 256 }) {
  if (--budget.left < 0 || depth > 5) invalid();
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const copy = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !Object.hasOwn(d, 'value')) invalid();
    Object.defineProperty(copy, key, { value: snapshot(d.value, depth + 1, budget), enumerable: true });
  }
  return copy;
}
function exact(value, fields) {
  if (!value || typeof value !== 'object' || Object.keys(value).some(key => !fields.includes(key))) invalid();
}
function evaluatePaymentEvidence(input = {}) {
  let level = 'NONE', liveLooking = false;
  const meta = { provider: 'none', requestId: null, paymentState: 'PAYMENT_NOT_STARTED',
    amountMatch: null, currencyMatch: null, merchantBindingMatch: false, durableEvidence: false };
  const reply = (reasonCode, manual = false, reconciliation = false, compensation = false) => Object.freeze({
    accepted: false, commercialPaymentConfirmed: false, contractOnly: true, commercialSuccess: false,
    classification: liveLooking ? 'LIVE_EVIDENCE_REJECTED' : 'NON_COMMERCIAL_EVIDENCE',
    reasonCode, evidenceLevel: level, manualReviewRequired: manual,
    reconciliationRequired: reconciliation, compensationRequired: compensation,
    safeMetadata: Object.freeze({ ...meta }),
  });
  try {
    const data = snapshot(input);
    exact(data, ['trustedIntent', 'providerEvidence', 'providerContext', 'persistenceContext', 'lifecycleContext']);
    const t = data.trustedIntent, e = data.providerEvidence, p = data.providerContext ?? {},
      store = data.persistenceContext ?? {}, s = data.lifecycleContext ?? {};
    exact(t, ['requestId', 'providerPaymentId', 'amountMinor', 'currency']);
    if (!requestId(t.requestId) || !id(t.providerPaymentId) || !Number.isSafeInteger(t.amountMinor)
      || t.amountMinor <= 0 || typeof t.currency !== 'string' || !/^[A-Z]{3}$/.test(t.currency)) invalid();
    meta.requestId = t.requestId;
    if (e === null || e === undefined) return reply('PAYMENT_EVIDENCE_MISSING');
    exact(e, ['provider', 'eventId', 'paymentId', 'requestId', 'amountMinor', 'currency', 'state', 'source']);
    exact(p, ['selectedProvider', 'environment', 'authenticityVerified', 'merchantBindingVerified',
      'merchantBindingMatch', 'successSemanticsVerified']);
    exact(store, ['mode', 'durablyCommitted', 'idempotencyEnforced', 'provider', 'eventId', 'paymentId', 'requestId']);
    exact(s, ['checkRate', 'travelers', 'review', 'booking', 'payment', 'evidence', 'recovery', 'compensation',
      'reconciliationRequired', 'conflict', 'cancellation', 'refund']);
    for (const key of ['authenticityVerified', 'merchantBindingVerified', 'merchantBindingMatch', 'successSemanticsVerified'])
      if (p[key] !== undefined && typeof p[key] !== 'boolean') invalid();
    for (const key of ['durablyCommitted', 'idempotencyEnforced'])
      if (store[key] !== undefined && typeof store[key] !== 'boolean') invalid();
    if (!['SYNTHETIC', 'SANDBOX', 'PROVIDER'].includes(e.source) || !paymentStates.includes(e.state)
      || !Number.isSafeInteger(e.amountMinor) || e.amountMinor <= 0 || typeof e.currency !== 'string'
      || !/^[A-Z]{3}$/.test(e.currency)) invalid();
    level = e.source === 'PROVIDER' ? 'UNVERIFIED_PROVIDER' : e.source;
    liveLooking = e.source === 'PROVIDER' && p.environment === 'LIVE';
    meta.provider = id(e.provider) ? hash(e.provider) : 'none';
    meta.paymentState = e.state;
    meta.amountMatch = e.amountMinor === t.amountMinor;
    meta.currencyMatch = e.currency === t.currency;
    meta.merchantBindingMatch = p.merchantBindingVerified === true && p.merchantBindingMatch === true;
    meta.durableEvidence = store.mode === 'durable' && store.durablyCommitted === true && store.idempotencyEnforced === true
      && id(e.eventId) && store.eventId === e.eventId && store.provider === e.provider
      && store.paymentId === t.providerPaymentId && store.requestId === t.requestId;
    if (!id(e.provider) || e.provider === 'none' || !id(p.selectedProvider) || p.selectedProvider === 'none')
      return reply('PAYMENT_PROVIDER_UNAVAILABLE');
    if (!id(e.paymentId) || !requestId(e.requestId) || e.provider !== p.selectedProvider
      || e.paymentId !== t.providerPaymentId || e.requestId !== t.requestId) return reply('PAYMENT_CORRELATION_MISMATCH', true, true);
    if (meta.amountMatch === false) return reply('PAYMENT_AMOUNT_MISMATCH', true, true);
    if (meta.currencyMatch === false) return reply('PAYMENT_CURRENCY_MISMATCH', true, true);
    if (!id(e.eventId)) return reply('PAYMENT_EVIDENCE_IDENTITY_MISSING', true, true);
    if (s.conflict === true) return reply('PAYMENT_STATE_CONFLICT', true, true);
    if (e.state === 'PAYMENT_OUTCOME_UNKNOWN' || s.payment === 'PAYMENT_OUTCOME_UNKNOWN')
      return reply('PAYMENT_OUTCOME_UNKNOWN', true, true);
    if (s.booking === 'BOOKING_OUTCOME_UNKNOWN') return reply('BOOKING_OUTCOME_UNKNOWN', true, true);
    if (s.reconciliationRequired === true || ['RECONCILIATION_REQUIRED', 'RECOVERY_PENDING'].includes(s.recovery))
      return reply('RECONCILIATION_REQUIRED', true, true);
    if (s.recovery === 'COMPENSATION_REQUIRED' || s.compensation && s.compensation !== 'NONE')
      return reply('COMPENSATION_REQUIRED', true, false, true);
    // Reuse the existing consistency/recovery engines; observed capture is not recognition of money.
    const payment = e.state === 'PAYMENT_AUTHORIZED' ? 'PAYMENT_PENDING'
      : e.state === 'PAYMENT_CANCELLED' ? 'PAYMENT_FAILED_FINAL' : e.state === 'SETTLED' ? 'PAYMENT_CAPTURED' : e.state;
    const inspected = lifecycle.validateLifecycleState({ ...s, payment });
    const bookingState = ({ BOOKING_CONFIRMED: 'CONFIRMED', BOOKING_PENDING: 'confirming',
      BOOKING_FAILED_FINAL: 'confirmation_failed', BOOKING_OUTCOME_UNKNOWN: 'confirmation_unknown' })[s.booking] || s.booking;
    const plan = recovery.plan({ requestId: t.requestId,
      booking: { state: bookingState, providerResultObserved: s.evidence?.booking === true,
        error: { code: 'BOOKING_REJECTED' }, dispatch: 'SENT', outcomeKnown: true },
      payment: { state: ['PAYMENT_CAPTURED', 'PAID', 'SETTLED'].includes(e.state) ? 'paid'
        : ['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'].includes(e.state) ? 'pending'
          : ['PAYMENT_FAILED_FINAL', 'PAYMENT_CANCELLED'].includes(e.state) ? 'failed' : e.state,
        providerResultObserved: s.evidence?.payment === true, error: { code: 'PAYMENT_REJECTED' }, dispatch: 'SENT', outcomeKnown: true } });
    if (plan.reconciliationRequired) return reply('RECONCILIATION_REQUIRED', true, true);
    if (plan.compensation !== 'NONE') return reply('COMPENSATION_REQUIRED', true, false, true);
    if (s.booking === 'BOOKING_DISABLED') return reply('BOOKING_DISABLED');
    if (!inspected.valid || s.payment !== e.state) return reply('BOOKING_PAYMENT_INCONSISTENT', true, true);
    if (e.source === 'SYNTHETIC') return reply('SYNTHETIC_PAYMENT_EVIDENCE');
    if (e.source === 'SANDBOX' || p.environment === 'SANDBOX') return reply('SANDBOX_PAYMENT_EVIDENCE');
    if (p.environment !== 'LIVE') return reply('LIVE_PAYMENT_ENVIRONMENT_REQUIRED');
    if (p.authenticityVerified !== true) return reply('PAYMENT_PROVIDER_AUTHENTICITY_UNVERIFIED', true, true);
    if (p.merchantBindingVerified !== true) return reply('PAYMENT_MERCHANT_BINDING_UNAVAILABLE', true, true);
    if (p.merchantBindingMatch !== true) return reply('PAYMENT_MERCHANT_BINDING_MISMATCH', true, true);
    if (!meta.durableEvidence) return reply('DURABLE_PAYMENT_EVIDENCE_UNAVAILABLE', true, true);
    // AUTHORIZED/CAPTURED/PAID/SETTLED are observations. The selected adapter must define success.
    if (!['PAYMENT_CAPTURED', 'PAID', 'SETTLED'].includes(e.state) || p.successSemanticsVerified !== true)
      return reply('PAYMENT_SUCCESS_SEMANTICS_UNVERIFIED');
    // Deliberate hard stop, not an injectable boolean. A future reviewed implementation must
    // verify per-transaction authenticity, merchant binding and atomic persistence receipts.
    // Caller/env assertions, including every true claim above, cannot mint LIVE_VERIFIED.
    return reply('LIVE_PAYMENT_CAPABILITY_UNAVAILABLE', true, true);
  } catch {
    return reply('PAYMENT_EVIDENCE_INPUT_INVALID');
  }
}
module.exports = { evaluatePaymentEvidence, levels, capabilities };
