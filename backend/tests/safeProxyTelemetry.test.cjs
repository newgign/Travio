const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const telemetry = require('../middleware/requestTelemetry');
const { trustedProxy } = require('../config/trustedProxy');
const { getClientNetworkIdentity } = require('../middleware/clientNetworkIdentity');
const logger = require('../utils/logger');
function request(mode = 'false', peer = '192.0.2.10', xff) {
  const app = express(); app.set('trust proxy', trustedProxy({ TRUST_PROXY: mode }));
  const headers = { 'x-request-id': '12345678-1234-4123-8123-123456789abc' };
  if (xff !== undefined) headers['x-forwarded-for'] = xff;
  return Object.assign(Object.create(express.request), { app, socket: { remoteAddress: peer }, headers,
    method: 'GET', originalUrl: '/api/health/live' });
}
function run(req, { status = 200, rateLimited = false } = {}) {
  const callbacks = {}, res = { statusCode: status, locals: { rateLimited }, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, on(k, fn) { callbacks[k] = fn; } };
  let next = 0; telemetry(req, res, () => next++); callbacks.finish(); callbacks.close();
  assert.equal(next, 1); return res;
}
let logs, events;
beforeEach(t => {
  const previous = process.env.HTTP_ACCESS_LOG;
  t.after(() => { if (previous === undefined) delete process.env.HTTP_ACCESS_LOG; else process.env.HTTP_ACCESS_LOG = previous; });
  process.env.HTTP_ACCESS_LOG = 'true'; logs = []; events = [];
  t.mock.method(logger, 'info', (...args) => logs.push(args));
  t.mock.method(require('../services/systemEventService'), 'safeRecordEvent', e => events.push(e));
  const forbidden = () => assert.fail('REAL_IO_FORBIDDEN');
  for (const C of [require('pg').Pool, require('pg').Client]) for (const m of ['connect', 'query']) t.mock.method(C.prototype, m, forbidden);
  for (const p of ['node:http', 'node:https']) for (const m of ['request', 'get']) t.mock.method(require(p), m, forbidden);
  t.mock.method(require('node:net').Socket.prototype, 'connect', forbidden);
  t.mock.method(require('node:child_process'), 'spawnSync', forbidden);
});
test('direct request emits only the four safe classifications', () => {
  const req = request(); run(req);
  const meta = telemetry.proxyMetadata(req);
  assert.deepEqual(meta, { networkIdentitySource: 'direct', trustedProxy: false, forwardedChainLength: 0, socketPeerMatchesCanonical: true });
  assert.deepEqual(Object.keys(meta).sort(), ['forwardedChainLength', 'networkIdentitySource', 'socketPeerMatchesCanonical', 'trustedProxy']);
  assert.equal(logs[0][1].networkIdentitySource, 'direct');
});
test('trusted forwarded request emits forwarded classification and false peer match', () => {
  run(request('10.0.0.0/8', '10.0.0.1', '198.51.100.2'));
  assert.equal(logs[0][1].networkIdentitySource, 'forwarded'); assert.equal(logs[0][1].trustedProxy, true);
  assert.equal(logs[0][1].socketPeerMatchesCanonical, false); assert.equal(logs[0][1].forwardedChainLength, 1);
});
test('numeric configuration without forwarded input does not claim proxy use', () => {
  const meta = telemetry.proxyMetadata(request('1'));
  assert.equal(meta.trustedProxy, false); assert.equal(meta.networkIdentitySource, 'direct');
});
test('untrusted immediate peer ignores fake forwarding', () => {
  const meta = telemetry.proxyMetadata(request('10.0.0.0/8', '192.0.2.10', '198.51.100.2'));
  assert.equal(meta.trustedProxy, false); assert.equal(meta.socketPeerMatchesCanonical, true);
});
test('multi-hop count is accepted chain length, not raw leftmost chain size', () => {
  const meta = telemetry.proxyMetadata(request('2', '10.0.0.1', '203.0.113.2, 198.51.100.2, 10.0.0.2'));
  assert.equal(meta.forwardedChainLength, 2); assert.equal(typeof meta.forwardedChainLength, 'number');
});
for (const [label, peer, client] of [
  ['IPv4', '10.0.0.1', '198.51.100.2'],
  ['IPv6', '2001:db8::1', '2001:db8::2'],
  ['mapped IPv6', '::ffff:192.0.2.10', '::ffff:198.51.100.2'],
]) test(`${label} client and socket addresses never appear in access log or event metadata`, () => {
  run(request('1', peer, client), { status: 400 });
  const output = JSON.stringify({ logs, events });
  assert.ok(!output.includes(peer)); assert.ok(!output.includes(client));
  assert.doesNotMatch(output, /198\.51\.100\.2|192\.0\.2\.10/);
});
for (const [header, value] of [
  ['x-forwarded-for', 'PRIVATE_XFF'], ['x-real-ip', 'PRIVATE_REAL_IP'], ['forwarded', 'for=PRIVATE_FORWARDED'],
  ['host', 'private-host.example'], ['authorization', 'Bearer PRIVATE_TOKEN'], ['cookie', 'session=PRIVATE_COOKIE'],
]) test(`${header} content excluded from all telemetry projections`, () => {
  const req = request('1'); req.headers[header] = value; run(req, { status: 400 });
  assert.ok(!JSON.stringify({ logs, events }).includes(value));
});
test('peer comparison is boolean and canonicalizes mapped IPv6', () => {
  const meta = telemetry.proxyMetadata(request('1', '::ffff:192.0.2.10', '192.0.2.10'));
  assert.equal(meta.socketPeerMatchesCanonical, true); assert.equal(typeof meta.socketPeerMatchesCanonical, 'boolean');
});
test('malformed forwarding uses existing conservative helper interpretation', () => {
  const req = request('1', '192.0.2.10', 'not-an-ip'); run(req);
  assert.equal(logs[0][1].networkIdentitySource, 'direct'); assert.equal(logs[0][1].forwardedChainLength, 0);
});
test('overlong forwarding cannot produce unbounded count or array in metadata', () => {
  const meta = telemetry.proxyMetadata(request('8', '192.0.2.10', Array(20).fill('198.51.100.2').join(',')));
  assert.equal(meta.forwardedChainLength, 0); assert.ok(Object.values(meta).every(v => !Array.isArray(v)));
});
test('missing peer gives unknown rather than two absent addresses matching', () => {
  const req = request(); delete req.socket;
  assert.deepEqual(telemetry.proxyMetadata(req), { networkIdentitySource: 'unknown', trustedProxy: false, forwardedChainLength: 0, socketPeerMatchesCanonical: false });
});
test('observation getter failure gives unknown and still reaches next', () => {
  const req = request(); Object.defineProperty(req, 'socket', { get() { throw Error('PRIVATE_OBSERVATION_ERROR'); } });
  run(req); assert.equal(logs[0][1].networkIdentitySource, 'unknown');
  assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_OBSERVATION_ERROR/);
});
test('access logger failure cannot escape response finish handler', t => {
  t.mock.method(logger, 'info', () => { throw Error('PRIVATE_LOG_ERROR'); }); assert.doesNotThrow(() => run(request()));
});
test('telemetry does not modify canonical limiter identity or req.user authority', () => {
  const req = request('1', '192.0.2.10', '198.51.100.2'); req.user = { id: 7, role: 'user' };
  const before = getClientNetworkIdentity(req), user = req.user; run(req);
  assert.deepEqual(getClientNetworkIdentity(req), before); assert.equal(req.user, user);
});
test('requestId header correlation remains unchanged', () => {
  const res = run(request()); assert.equal(res.headers['x-request-id'], logs[0][1].requestId);
  assert.equal(logs[0][1].requestId, '12345678-1234-4123-8123-123456789abc');
});
test('access log disabled means no added logging or diagnostic response', t => {
  process.env.HTTP_ACCESS_LOG = 'false'; const res = run(request()); assert.deepEqual(logs, []);
  assert.equal(res.headers.networkIdentitySource, undefined); assert.deepEqual(events, []);
});
test('rate-limited telemetry keeps existing no-log/no-event behavior', () => {
  run(request(), { status: 429, rateLimited: true }); assert.deepEqual(logs, []); assert.deepEqual(events, []);
});
test('existing API liveness handler works without DB provider or auth calls', () => {
  const route = require('../routes/health').stack.find(x => x.route?.path === '/live').route;
  let payload; route.stack[0].handle({ requestId: 'synthetic' }, { json(body) { payload = body; } });
  assert.equal(payload.status, 'ok'); assert.equal(payload.requestId, 'synthetic'); assert.equal(payload.database, undefined);
});
test('process health remains outside telemetry; trust-all remains blocked', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../server.js'), 'utf8');
  assert.ok(source.indexOf("app.get('/health'") < source.indexOf('app.use(requestTelemetry)'));
  assert.throws(() => trustedProxy({ TRUST_PROXY: 'true' }), { code: 'TRUST_PROXY_INVALID' });
});
