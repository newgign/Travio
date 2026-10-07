const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
require('./offlineNetwork.cjs');
Object.assign(process.env, { NODE_ENV: 'test', PAYMENTS_MODE: 'disabled', PAYMENTS_PROVIDER: 'none',
  REAL_CHARGES_ENABLED: 'false', REAL_REFUNDS_ENABLED: 'false', PRODUCTION_SALES_ENABLED: 'false',
  HOTELBEDS_ENV: 'test', HOTELBEDS_BOOKING_ENABLED: 'false', HOTELBEDS_LIVE_BOOKING_ENABLED: 'false' });
const gateway = require('../services/paymentGatewayService');
const contract = require('../services/paymentProviderContract');
const { createMockProvider } = require('./helpers/mockPaymentProvider.cjs');
const secret = 'synthetic-7b-webhook-secret-for-contract-tests';
const intent = () => ({ state: 'PAYMENT_INTENT_READY', reviewState: 'REVIEW_READY', requestId: 'a'.repeat(32), amount: 110.25, currency: 'EUR' });
const event = extra => ({ eventId: 'synthetic_event_1', provider: 'synthetic_mock', paymentId: 'synthetic_payment_1',
  requestId: 'a'.repeat(32), type: 'payment.pending', amount: '110.25', currency: 'EUR', ...extra });
let mock, processor, forbiddenCalls;
const create = options => gateway.createWebhookProcessor({ adapter: mock, intent: intent(), providerPaymentId: 'synthetic_payment_1', ...options });
const send = (value, target = processor) => { const raw = Buffer.from(JSON.stringify(value)); return target.process(raw, mock.sign(raw)); };
const advance = async () => { assert.equal((await send(event())).code, 'WEBHOOK_EVENT_ACCEPTED'); };
beforeEach(t => {
  forbiddenCalls = 0; mock = createMockProvider(secret); processor = create();
  const forbidden = () => { forbiddenCalls++; assert.fail('No real provider, DB, log or refund operation'); };
  const pool = require('../db'); t.mock.method(pool, 'query', forbidden); t.mock.method(pool, 'connect', forbidden);
  for (const name of ['availability', 'checkRates', 'createBooking', 'cancelBooking', 'getBooking', 'listBookings']) t.mock.method(require('../integrations/hotelbeds/client'), name, forbidden);
  for (const name of ['confirm', 'cancel', 'simulateCancellation', 'reconcile']) t.mock.method(require('../services/hotelbedsBookingService'), name, forbidden);
  t.mock.method(gateway, 'createIntent', forbidden);
  for (const name of ['requestSandboxRefund', 'completeSandboxRefund']) t.mock.method(require('../controllers/refundController'), name, forbidden);
  for (const name of ['info', 'warn', 'error']) t.mock.method(require('../utils/logger'), name, forbidden);
});
afterEach(() => assert.equal(forbiddenCalls, 0));

test('provider contract exposes only useful authenticity/normalization capabilities', () => {
  const value = contract.adapterContract(mock); assert.equal(value.name, 'synthetic_mock');
  assert.equal(typeof value.verifyWebhook, 'function'); assert.equal(typeof value.normalizeWebhookEvent, 'function');
  assert.equal(value.createPaymentIntent, undefined); assert.equal(value.refund, undefined);
});
test('default none provider stays disabled and cannot process signed events', async () => {
  assert.equal((await send(event(), gateway.createWebhookProcessor())).code, 'PAYMENTS_DISABLED');
  assert.equal(gateway.readiness().provider, 'none'); assert.equal(gateway.readiness().mode, 'disabled'); assert.equal(gateway.readiness().realChargesEnabled, false);
});
test('invalid adapter interface fails closed', () => {
  for (const adapter of [{}, { ...mock, mode: 'live' }, { ...mock, verifyWebhook: null }]) assert.throws(() => create({ adapter }), { code: 'PAYMENT_PROVIDER_CONTRACT_INVALID' });
});
test('mock processing cannot be instantiated in production even with requested flags', () => {
  const previous = process.env.NODE_ENV;
  try { process.env.NODE_ENV = 'production'; assert.throws(() => create(), { code: 'PAYMENTS_DISABLED' }); }
  finally { process.env.NODE_ENV = previous; }
});
test('valid synthetic signature authenticates exact raw bytes', async () => {
  const raw = Buffer.from(JSON.stringify(event())); assert.equal(mock.verifyWebhook(raw, mock.sign(raw)), true);
  assert.equal((await processor.process(raw, mock.sign(raw))).normalizedState, 'PAYMENT_PENDING');
});
test('invalid signature is rejected before normalization', async t => {
  t.mock.method(mock, 'normalizeWebhookEvent', () => assert.fail('Invalid signature must stop before parse')); const p = create();
  assert.equal((await p.process(Buffer.from(JSON.stringify(event())), 'f'.repeat(64))).code, 'INVALID_WEBHOOK_SIGNATURE');
});
test('missing signature rejected', async () => assert.equal((await processor.process(Buffer.from(JSON.stringify(event())))).code, 'INVALID_WEBHOOK_SIGNATURE'));
test('mutated raw bytes cannot reuse original signature', async () => {
  const raw = Buffer.from(JSON.stringify(event())), signature = mock.sign(raw); raw[0] = 32;
  assert.equal((await processor.process(raw, signature)).code, 'INVALID_WEBHOOK_SIGNATURE');
});
test('parsed object, empty and oversized raw payload fail safely', async () => {
  for (const raw of [event(), '', Buffer.alloc(0), Buffer.alloc(65537)]) assert.equal((await processor.process(raw, 'ignored')).code, 'MALFORMED_WEBHOOK');
});
test('authenticated malformed JSON rejected without raw exception', async () => {
  const raw = Buffer.from('{private-secret'); const result = await processor.process(raw, mock.sign(raw));
  assert.equal(result.code, 'MALFORMED_WEBHOOK'); assert.doesNotMatch(JSON.stringify(result), /private-secret|stack|SyntaxError/);
});
test('event id mandatory', async () => assert.equal((await send(event({ eventId: '' }))).code, 'MALFORMED_WEBHOOK'));
test('provider payment and request correlation mandatory', async () => {
  for (const extra of [{ provider: 'other' }, { paymentId: 'synthetic_other' }, { requestId: 'b'.repeat(32) }]) assert.equal((await send(event(extra))).code, 'PAYMENT_CORRELATION_MISMATCH');
});
test('unsupported event rejected with stable code', async () => assert.equal((await send(event({ type: 'payment.invented' }))).code, 'UNSUPPORTED_WEBHOOK_EVENT'));
test('authenticated unknown fields including card/raw data are rejected', async () => {
  for (const extra of [{ card: 'synthetic-card' }, { Authorization: 'private' }, { raw: 'private' }]) assert.equal((await send(event(extra))).code, 'MALFORMED_WEBHOOK');
});
test('pending event normalized with trusted money', async () => {
  const result = await send(event()); assert.equal(result.normalizedState, 'PAYMENT_PENDING'); assert.equal(result.amountMinor, 11025); assert.equal(result.currency, 'EUR');
});
test('authorization is normalized without capture or application payment success', async () => {
  await advance(); const result = await send(event({ eventId: 'synthetic_auth', type: 'payment.authorized' }));
  assert.equal(result.normalizedState, 'PAYMENT_AUTHORIZED'); assert.equal(result.commercialSuccess, false); assert.equal(result.applicationPaymentState, 'PAYMENTS_DISABLED');
});
test('captured contract result requires validated event following pending', async () => {
  await advance(); const result = await send(event({ eventId: 'synthetic_capture', type: 'payment.captured' }));
  assert.equal(result.normalizedState, 'PAYMENT_CAPTURED'); assert.equal(result.effectApplied, true); assert.equal(result.providerState, 'PROVIDER_NOT_CALLED');
});
test('failed event normalized with compensation obligation not success', async () => {
  const result = await send(event({ type: 'payment.failed' })); assert.equal(result.normalizedState, 'PAYMENT_FAILED_FINAL'); assert.equal(result.compensation, 'CANCELLATION_REQUIRED'); assert.equal(result.commercialSuccess, false);
});
test('cancelled event remains contract terminal without refund operation', async () => {
  const result = await send(event({ type: 'payment.cancelled' })); assert.equal(result.normalizedState, 'PAYMENT_CANCELLED'); assert.equal(result.commercialSuccess, false);
});
test('unknown outcome normalized and requires reconciliation', async () => {
  const result = await send(event({ type: 'payment.unknown' })); assert.equal(result.code, 'PAYMENT_OUTCOME_UNKNOWN'); assert.equal(result.reconciliationRequired, true);
});
test('duplicate event id causes no second effect', async () => {
  await advance(); const result = await send(event()); assert.equal(result.code, 'DUPLICATE_WEBHOOK_EVENT'); assert.equal(result.effectApplied, undefined);
});
test('concurrent duplicate capture produces exactly one effect', async () => {
  await advance(); const capture = event({ eventId: 'synthetic_capture', type: 'payment.captured' });
  const results = await Promise.all([send(capture), send(capture), send(capture)]);
  assert.equal(results.filter(value => value.effectApplied).length, 1); assert.equal(results.filter(value => value.code === 'DUPLICATE_WEBHOOK_EVENT').length, 2);
});
test('repeated capture under another event id does not duplicate transition effect', async () => {
  await advance(); await send(event({ eventId: 'synthetic_capture', type: 'payment.captured' }));
  assert.equal((await send(event({ eventId: 'synthetic_capture_repeat', type: 'payment.captured' }))).effectApplied, false);
});
test('capture cannot jump directly from not started without pending evidence', async () => {
  assert.equal((await send(event({ type: 'payment.captured' }))).code, 'PAYMENT_STATE_CONFLICT'); await advance();
});
test('same event id with conflicting signed data rejected', async () => {
  await advance(); assert.equal((await send(event({ type: 'payment.failed' }))).code, 'PAYMENT_STATE_CONFLICT');
});
test('amount mismatch cannot transition then valid trusted event still works', async () => {
  assert.equal((await send(event({ amount: '1.00' }))).code, 'PAYMENT_AMOUNT_MISMATCH'); await advance();
});
test('currency mismatch cannot become successful payment', async () => assert.equal((await send(event({ currency: 'USD' }))).code, 'PAYMENT_CURRENCY_MISMATCH'));
test('malformed or fractional-cent amount rejected', async () => {
  for (const amount of [false, null, '110.251', -1, {}, 'NaN']) assert.equal((await send(event({ amount }))).code, 'MALFORMED_WEBHOOK');
});
test('trusted intent copied immutably and browser ready assertions insufficient', async () => {
  const value = intent(), p = create({ intent: value }); value.amount = 1; value.currency = 'USD'; assert.equal((await send(event(), p)).amountMinor, 11025);
  assert.throws(() => create({ intent: { ...intent(), state: 'PAID' } }), { code: 'PAYMENT_PREREQUISITE_MISSING' });
});
test('stale pending cannot downgrade final failed state', async () => {
  await send(event({ type: 'payment.failed' })); assert.equal((await send(event({ eventId: 'synthetic_stale' }))).code, 'PAYMENT_STATE_CONFLICT');
});
test('captured then failed is conflict, never silently reverses capture', async () => {
  await advance(); await send(event({ eventId: 'synthetic_capture', type: 'payment.captured' }));
  assert.equal((await send(event({ eventId: 'synthetic_failure', type: 'payment.failed' }))).code, 'PAYMENT_STATE_CONFLICT');
});
test('unknown cannot be resolved by ordinary signed pending or captured event', async () => {
  await send(event({ type: 'payment.unknown' }));
  for (const type of ['payment.pending', 'payment.captured']) assert.equal((await send(event({ eventId: 'synthetic_next', type }))).code, 'PAYMENT_OUTCOME_UNKNOWN');
  const resolved = await send(event({ eventId: 'synthetic_resolution', type: 'payment.captured', reconciled: true }));
  assert.equal(resolved.normalizedState, 'PAYMENT_CAPTURED'); assert.equal(resolved.reconciliationRequired, false);
});
test('secrets and adapter exceptions never enter response or logs', async t => {
  t.mock.method(mock, 'verifyWebhook', () => { throw Error(`${secret} Authorization DB_URL jwt-secret`); });
  const result = await send(event(), create()); assert.equal(result.code, 'INVALID_WEBHOOK_SIGNATURE'); assert.doesNotMatch(JSON.stringify(result), /synthetic-7b|Authorization|DB_URL|jwt-secret|stack/);
});
test('no HTTP webhook route, no fake runtime paid state, and safety gate unchanged', async () => {
  const routes = require('../routes/paymentRoutes').stack.filter(layer => layer.route).map(layer => layer.route.path);
  assert.ok(routes.every(value => !value.includes('webhook'))); await advance(); await send(event({ eventId: 'synthetic_capture', type: 'payment.captured' }));
  const state = require('../services/productionGateService').state(); assert.equal(state.realChargesEnabled, false); assert.equal(state.realRefundsEnabled, false); assert.equal(state.productionSalesEnabled, false);
  assert.equal(gateway.readiness().provider, 'none'); assert.equal(gateway.readiness().mode, 'disabled'); assert.equal(forbiddenCalls, 0);
});
