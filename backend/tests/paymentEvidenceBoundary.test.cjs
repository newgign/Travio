const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const boundary = require('../services/paymentEvidenceBoundary');
const gate = require('../services/productionGateService');
const activation = env => gate.state(env).paymentActivation;
const signals = require('../services/operationalSignals');
const requestId = 'a'.repeat(32);
// Hypothetical caller claims only. This is NOT a real provider, merchant or durable receipt.
const fixture = () => ({
  trustedIntent: { requestId, providerPaymentId: 'contract_payment', amountMinor: 11025, currency: 'EUR' },
  providerEvidence: { provider: 'contract_candidate', eventId: 'contract_event', paymentId: 'contract_payment',
    requestId, amountMinor: 11025, currency: 'EUR', state: 'PAYMENT_CAPTURED', source: 'PROVIDER' },
  providerContext: { selectedProvider: 'contract_candidate', environment: 'LIVE', authenticityVerified: true,
    merchantBindingVerified: true, merchantBindingMatch: true, successSemanticsVerified: true },
  persistenceContext: { mode: 'durable', durablyCommitted: true, idempotencyEnforced: true,
    provider: 'contract_candidate', eventId: 'contract_event', paymentId: 'contract_payment', requestId },
  lifecycleContext: { checkRate: 'CONFIRMED', travelers: 'VALID', review: 'REVIEW_READY', booking: 'BOOKING_CONFIRMED',
    payment: 'PAYMENT_CAPTURED', evidence: { booking: true, payment: true }, recovery: 'RECOVERY_NOT_REQUIRED', compensation: 'NONE' },
});
const run = changes => { const input = fixture(); for (const [key, value] of Object.entries(changes || {})) input[key] = value === null ? null : { ...input[key], ...value }; return boundary.evaluatePaymentEvidence(input); };
const denied = (result, reason) => {
  assert.equal(result.accepted, false); assert.equal(result.commercialPaymentConfirmed, false);
  assert.equal(result.commercialSuccess, false); assert.equal(result.contractOnly, true);
  assert.notEqual(result.evidenceLevel, 'LIVE_VERIFIED'); assert.notEqual(result.evidenceLevel, 'AUTHENTICATED_PROVIDER');
  if (reason) assert.equal(result.reasonCode, reason);
  return result;
};
const derived = result => signals.classify({ requestId, paymentEvidence: result });
let forbiddenCalls;
beforeEach(t => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test';
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; });
  forbiddenCalls = 0;
  const forbidden = () => { forbiddenCalls++; assert.fail('REAL_IO_OR_OPERATION_FORBIDDEN'); };
  for (const method of ['query', 'connect']) t.mock.method(require('../db'), method, forbidden);
  for (const method of ['availability', 'checkRates', 'createBooking', 'cancelBooking', 'getBooking', 'listBookings'])
    t.mock.method(require('../integrations/hotelbeds/client'), method, forbidden);
  for (const method of ['confirm', 'cancel', 'reconcile', 'simulateCancellation'])
    t.mock.method(require('../services/hotelbedsBookingService'), method, forbidden);
  t.mock.method(require('../services/paymentGatewayService'), 'createIntent', forbidden);
  for (const method of ['requestSandboxRefund', 'completeSandboxRefund']) t.mock.method(require('../controllers/refundController'), method, forbidden);
  for (const method of ['info', 'warn', 'error']) t.mock.method(require('../utils/logger'), method, forbidden);
  for (const protocol of ['node:http', 'node:https']) for (const method of ['get', 'request']) t.mock.method(require(protocol), method, forbidden);
  t.mock.method(globalThis, 'fetch', forbidden);
  t.mock.method(require('node:net'), 'connect', forbidden);
  t.mock.method(require('node:tls'), 'connect', forbidden);
});
afterEach(() => assert.equal(forbiddenCalls, 0));

test('missing evidence cannot confirm payment', () => denied(run({ providerEvidence: null }), 'PAYMENT_EVIDENCE_MISSING'));
test('malformed server intent is rejected before evaluation', () => {
  for (const amountMinor of [true, 1.5, -1, 0, Number.MAX_SAFE_INTEGER + 1]) denied(run({ trustedIntent: { amountMinor } }), 'PAYMENT_EVIDENCE_INPUT_INVALID');
});
test('synthetic pending is never commercial', () => denied(run({ providerEvidence: { source: 'SYNTHETIC', state: 'PAYMENT_PENDING' }, lifecycleContext: { payment: 'PAYMENT_PENDING' } }), 'SYNTHETIC_PAYMENT_EVIDENCE'));
test('synthetic authorized is never captured or commercial', () => denied(run({ providerEvidence: { source: 'SYNTHETIC', state: 'PAYMENT_AUTHORIZED' }, lifecycleContext: { payment: 'PAYMENT_AUTHORIZED' } }), 'SYNTHETIC_PAYMENT_EVIDENCE'));
test('synthetic captured is contract only even with all live claims', () => assert.equal(denied(run({ providerEvidence: { source: 'SYNTHETIC' } }), 'SYNTHETIC_PAYMENT_EVIDENCE').evidenceLevel, 'SYNTHETIC'));
test('actual signed mock capture cannot cross live boundary', async () => {
  const mock = require('./helpers/mockPaymentProvider.cjs').createMockProvider('synthetic-7l-secret');
  const processor = require('../services/paymentGatewayService').createWebhookProcessor({ adapter: mock,
    intent: { state: 'PAYMENT_INTENT_READY', reviewState: 'REVIEW_READY', requestId, amount: '110.25', currency: 'EUR' }, providerPaymentId: 'contract_payment' });
  for (const [eventId, type] of [['pending', 'payment.pending'], ['capture', 'payment.captured']]) {
    const raw = Buffer.from(JSON.stringify({ eventId, type, provider: mock.name, paymentId: 'contract_payment', requestId, amount: '110.25', currency: 'EUR' }));
    assert.equal(mock.verifyWebhook(raw, mock.sign(raw)), true);
    const result = await processor.process(raw, mock.sign(raw));
    assert.equal(result.code, 'WEBHOOK_EVENT_ACCEPTED'); assert.equal(result.contractOnly, true); assert.equal(result.commercialSuccess, false);
    assert.doesNotMatch(JSON.stringify(result), /LIVE_VERIFIED|AUTHENTICATED_PROVIDER|"PAID"|synthetic-7l-secret/);
  }
});
test('unverified provider authenticity is rejected', () => denied(run({ providerContext: { authenticityVerified: false } }), 'PAYMENT_PROVIDER_AUTHENTICITY_UNVERIFIED'));
test('missing selected or observed provider fails closed', () => {
  denied(run({ providerContext: { selectedProvider: 'none' } }), 'PAYMENT_PROVIDER_UNAVAILABLE');
  denied(run({ providerEvidence: { provider: '' } }), 'PAYMENT_PROVIDER_UNAVAILABLE');
});
test('sandbox evidence cannot be promoted by live claims', () => assert.equal(denied(run({ providerEvidence: { source: 'SANDBOX' } }), 'SANDBOX_PAYMENT_EVIDENCE').evidenceLevel, 'SANDBOX'));
test('sandbox environment cannot confirm provider claims', () => denied(run({ providerContext: { environment: 'SANDBOX' } }), 'SANDBOX_PAYMENT_EVIDENCE'));
test('signature claim without merchant verification is insufficient', () => {
  const result = denied(run({ providerContext: { merchantBindingVerified: false } }), 'PAYMENT_MERCHANT_BINDING_UNAVAILABLE');
  assert.equal(derived(result).find(s => s.signalCode === result.reasonCode).severity, 'HIGH');
});
test('merchant mismatch is rejected and derives CRITICAL signal', () => {
  const result = denied(run({ providerContext: { merchantBindingMatch: false } }), 'PAYMENT_MERCHANT_BINDING_MISMATCH');
  const signal = derived(result).find(s => s.signalCode === result.reasonCode);
  assert.equal(signal.severity, 'CRITICAL'); assert.equal(signals.toLogProjection(signal).reasonCode, result.reasonCode);
});
test('browser merchant identity is not a supported evidence claim', () => denied(run({ providerContext: { browserMerchantId: 'private-marker' } }), 'PAYMENT_EVIDENCE_INPUT_INVALID'));
test('amount mismatch requires review and HIGH signal', () => {
  const result = denied(run({ providerEvidence: { amountMinor: 1 } }), 'PAYMENT_AMOUNT_MISMATCH');
  assert.equal(result.manualReviewRequired, true); assert.equal(result.safeMetadata.amountMatch, false);
  assert.equal(derived(result).find(s => s.signalCode === result.reasonCode).severity, 'HIGH');
});
test('currency mismatch requires review and HIGH signal', () => {
  const result = denied(run({ providerEvidence: { currency: 'USD' } }), 'PAYMENT_CURRENCY_MISMATCH');
  assert.equal(result.manualReviewRequired, true); assert.equal(result.safeMetadata.currencyMatch, false);
  assert.equal(derived(result).find(s => s.signalCode === result.reasonCode).severity, 'HIGH');
});
test('exact trusted minor units are used for evaluation', () => assert.equal(denied(run()).safeMetadata.amountMatch, true));
test('trusted uppercase currency is used without coercion', () => {
  assert.equal(denied(run()).safeMetadata.currencyMatch, true);
  denied(run({ providerEvidence: { currency: 'eur' } }), 'PAYMENT_EVIDENCE_INPUT_INVALID');
});
test('missing transaction reference cannot be confirmed', () => denied(run({ providerEvidence: { paymentId: '' } }), 'PAYMENT_CORRELATION_MISMATCH'));
test('missing intent correlation cannot be confirmed', () => denied(run({ providerEvidence: { requestId: '' } }), 'PAYMENT_CORRELATION_MISMATCH'));
test('provider payment and request correlation mismatches are rejected', () => {
  for (const extra of [{ provider: 'other' }, { paymentId: 'other' }, { requestId: 'b'.repeat(32) }]) denied(run({ providerEvidence: extra }), 'PAYMENT_CORRELATION_MISMATCH');
});
test('in-memory-only persistence is insufficient', () => denied(run({ persistenceContext: { mode: 'memory' } }), 'DURABLE_PAYMENT_EVIDENCE_UNAVAILABLE'));
test('disabled storage derives HIGH missing durable evidence signal', () => {
  const result = denied(run({ persistenceContext: { mode: 'disabled' } }), 'DURABLE_PAYMENT_EVIDENCE_UNAVAILABLE');
  const signal = derived(result).find(s => s.signalCode === result.reasonCode);
  assert.equal(signal.severity, 'HIGH'); assert.equal(signals.toLogProjection(signal).reasonCode, result.reasonCode);
});
test('unique evidence identity is required', () => denied(run({ providerEvidence: { eventId: '' } }), 'PAYMENT_EVIDENCE_IDENTITY_MISSING'));
test('durable assertions require matching committed identity and idempotency', () => {
  for (const extra of [{ durablyCommitted: false }, { idempotencyEnforced: false }, { eventId: 'other' }, { provider: 'other' }, { paymentId: 'other' }, { requestId: 'b'.repeat(32) }])
    denied(run({ persistenceContext: extra }), 'DURABLE_PAYMENT_EVIDENCE_UNAVAILABLE');
});
test('unknown outcome remains unresolved and derives HIGH signal', () => {
  const result = denied(run({ providerEvidence: { state: 'PAYMENT_OUTCOME_UNKNOWN' } }), 'PAYMENT_OUTCOME_UNKNOWN');
  assert.equal(result.reconciliationRequired, true); assert.equal(derived(result).find(s => s.signalCode === result.reasonCode).severity, 'HIGH');
});
test('state conflict cannot become success', () => {
  const result = denied(run({ lifecycleContext: { conflict: true } }), 'PAYMENT_STATE_CONFLICT');
  assert.equal(derived(result).find(s => s.signalCode === result.reasonCode).severity, 'HIGH');
});
test('reconciliation required cannot be cleared by valid-looking claims', () => denied(run({ lifecycleContext: { recovery: 'RECONCILIATION_REQUIRED' } }), 'RECONCILIATION_REQUIRED'));
test('compensation required cannot be cleared automatically', () => assert.equal(denied(run({ lifecycleContext: { recovery: 'COMPENSATION_REQUIRED' } }), 'COMPENSATION_REQUIRED').compensationRequired, true));
test('failed booking plus observed capture requires compensation review', () => {
  const result = denied(run({ lifecycleContext: { booking: 'BOOKING_FAILED_FINAL', evidence: { booking: false, payment: true } } }), 'COMPENSATION_REQUIRED');
  assert.equal(result.manualReviewRequired, true); assert.equal(result.compensationRequired, true);
});
test('unknown booking requires reconciliation', () => assert.equal(denied(run({ lifecycleContext: { booking: 'BOOKING_OUTCOME_UNKNOWN' } }), 'BOOKING_OUTCOME_UNKNOWN').reconciliationRequired, true));
test('current disabled booking cannot complete commercially', () => {
  const result = denied(run({ providerEvidence: { state: 'PAYMENTS_DISABLED' }, lifecycleContext: { booking: 'BOOKING_DISABLED', payment: 'PAYMENTS_DISABLED', evidence: {} } }), 'BOOKING_DISABLED');
  assert.equal(result.commercialPaymentConfirmed, false);
});
test('current disabled activation config passes safely', () => assert.deepEqual(activation({}), { status: 'PASS', activationAllowed: false, reasonCode: 'PAYMENTS_DISABLED_SAFE', liveEvidenceCapability: false }));
test('every partial live activation fails closed', () => {
  for (const env of [{ REAL_CHARGES_ENABLED: 'true' }, { PRODUCTION_SALES_ENABLED: 'true' }, { REAL_REFUNDS_ENABLED: 'true' }, { PAYMENTS_MODE: 'live' }, { PAYMENTS_PROVIDER: 'contract_candidate' }])
    assert.equal(activation(env).status, 'FAIL');
});
test('env-only flags cannot manufacture capabilities or evidence', () => {
  const keys = ['PAYMENT_EVIDENCE_VERIFIED', 'REAL_CHARGES_ENABLED', 'PRODUCTION_SALES_ENABLED'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try { for (const key of keys) process.env[key] = 'true'; denied(run(), 'LIVE_PAYMENT_CAPABILITY_UNAVAILABLE');
    const result = gate.state(); assert.equal(result.paymentActivation.status, 'FAIL'); assert.equal(result.realChargesEnabled, false); assert.equal(result.productionSalesEnabled, false);
  } finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});
test('mock provider can never satisfy live activation gate', () => {
  for (const PAYMENTS_MODE of ['disabled', 'sandbox', 'live']) {
    const result = activation({ PAYMENTS_PROVIDER: 'synthetic_mock', PAYMENTS_MODE });
    assert.equal(result.status, 'FAIL'); assert.equal(result.activationAllowed, false); assert.equal(result.liveEvidenceCapability, false);
  }
});
test('all valid-looking caller claims still cannot mint LIVE_VERIFIED', () => {
  const result = denied(run(), 'LIVE_PAYMENT_CAPABILITY_UNAVAILABLE');
  assert.equal(result.evidenceLevel, 'UNVERIFIED_PROVIDER'); assert.equal(result.safeMetadata.durableEvidence, true);
  assert.ok(Object.values(boundary.capabilities).every(v => v === false)); assert.ok(Object.isFrozen(boundary.capabilities));
});
test('authorization alone is not successful money state', () => denied(run({ providerEvidence: { state: 'PAYMENT_AUTHORIZED' }, lifecycleContext: { payment: 'PAYMENT_AUTHORIZED' } }), 'PAYMENT_SUCCESS_SEMANTICS_UNVERIFIED'));
test('captured paid and settled require adapter semantics and never imply live success', () => {
  for (const state of ['PAYMENT_CAPTURED', 'PAID', 'SETTLED']) denied(run({ providerEvidence: { state }, lifecycleContext: { payment: state }, providerContext: { successSemanticsVerified: false } }), 'PAYMENT_SUCCESS_SEMANTICS_UNVERIFIED');
});
test('strict safe projection omits secrets raw card and traveller data', () => {
  const result = denied(run({ providerEvidence: { provider: 'private_marker' }, providerContext: { selectedProvider: 'private_marker' } }));
  assert.doesNotMatch(JSON.stringify(result), /private_marker/);
  assert.deepEqual(Object.keys(result.safeMetadata).sort(), ['provider', 'requestId', 'paymentState', 'amountMatch', 'currencyMatch', 'merchantBindingMatch', 'durableEvidence'].sort());
  for (const key of ['rawWebhook', 'signature', 'webhookSecret', 'apiKey', 'Authorization', 'JWT', 'DATABASE_URL', 'offerToken', 'PAN', 'CVV', 'traveller']) {
    const input = fixture(); input.providerEvidence[key] = 'private-marker';
    assert.doesNotMatch(JSON.stringify(denied(boundary.evaluatePaymentEvidence(input), 'PAYMENT_EVIDENCE_INPUT_INVALID')), /private-marker/);
  }
});
test('getters custom serialization malformed contexts and mutation fail safely', () => {
  let accessed = 0; const input = fixture(); const before = JSON.stringify(input);
  const result = denied(boundary.evaluatePaymentEvidence(input)); assert.equal(JSON.stringify(input), before);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.safeMetadata));
  const bad = fixture(); Object.defineProperty(bad.providerEvidence, 'provider', { get() { accessed++; return 'private'; } });
  denied(boundary.evaluatePaymentEvidence(bad), 'PAYMENT_EVIDENCE_INPUT_INVALID');
  const custom = fixture(); custom.providerEvidence.toJSON = () => { accessed++; return 'private'; };
  denied(boundary.evaluatePaymentEvidence(custom), 'PAYMENT_EVIDENCE_INPUT_INVALID'); assert.equal(accessed, 0);
  for (const change of [{ lifecycleContext: { payment: 'other' } }, { providerContext: { authenticityVerified: 'true' } }, { persistenceContext: { durablyCommitted: 'true' } }]) denied(run(change));
});
test('boundary imports no IO and performs no operations across rejection paths', () => {
  const original = Module._load;
  Module._load = function(name, ...args) { if (/^(pg|https?|node:https?|axios)$|\/db$|hotelbeds|paymentGateway|logger|refundController|reconciliationRepository/i.test(name)) assert.fail('IO_IMPORT_FORBIDDEN'); return original.call(this, name, ...args); };
  try { delete require.cache[require.resolve('../services/paymentEvidenceBoundary')]; const pure = require('../services/paymentEvidenceBoundary'); denied(pure.evaluatePaymentEvidence(fixture())); }
  finally { Module._load = original; }
});
test('payment APIs explicitly label legacy sandbox paid as noncommercial without writes', async t => {
  const gateway = require('../services/paymentGatewayService'); assert.equal(gateway.readiness().commercialPaymentConfirmed, false);
  let reads = 0;
  t.mock.method(require('../db'), 'query', async () => { reads++; return { rows: reads === 1 ? [{ id: 9, user_id: 7 }] : [{ status: 'paid', gateway_provider: 'sandbox' }] }; });
  let body; const res = { json(value) { body = value; return this; }, status() { return this; } };
  await require('../controllers/paymentController').getPayment({ params: { id: 9 }, user: { id: 7, role: 'user' } }, res);
  assert.equal(reads, 2); assert.equal(body.status, 'paid'); assert.equal(body.contractOnly, true);
  assert.equal(body.commercialSuccess, false); assert.equal(body.commercialPaymentConfirmed, false);
  assert.equal(body.paid, undefined); assert.equal(body.captured, undefined);
});
