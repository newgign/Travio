const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { trustedProxy } = require('../config/trustedProxy');
const { canonicalIp, getClientNetworkIdentity: identity } = require('../middleware/clientNetworkIdentity');
const { createRateLimiter, createLoginAccountLimiter, publicRateLimiter } = require('../middleware/rateLimit');
function request(proxy = 'false', peer = '192.0.2.1', forwarded, body) {
  const app = express(); app.set('trust proxy', trustedProxy({ TRUST_PROXY: proxy }));
  return Object.assign(Object.create(express.request), { app, socket: { remoteAddress: peer },
    headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded }, body });
}
function response() {
  return { statusCode: 200, headers: {}, locals: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function hit(limiter, req) { const res = response(); let passed = false; limiter(req, res, () => { passed = true; }); return { res, passed }; }
beforeEach(t => {
  const forbidden = () => assert.fail('REAL_IO_FORBIDDEN');
  for (const C of [require('pg').Pool, require('pg').Client]) for (const m of ['query', 'connect']) t.mock.method(C.prototype, m, forbidden);
  for (const protocol of ['node:http', 'node:https']) for (const m of ['get', 'request']) t.mock.method(require(protocol), m, forbidden);
  t.mock.method(require('node:net').Socket.prototype, 'connect', forbidden);
  t.mock.method(require('node:child_process'), 'spawnSync', forbidden);
});
for (const value of ['true', '*', '9', '-1', '1.5', '0.0.0.0/0', '::/0', 'garbage']) test(`unsafe proxy config ${value} rejected`, () => {
  assert.throws(() => trustedProxy({ TRUST_PROXY: value }), { code: 'TRUST_PROXY_INVALID' });
});
for (const [value, expected] of [['false', false], ['1', 1], ['loopback', 'loopback'], ['192.0.2.0/24,2001:db8::/32', ['192.0.2.0/24', '2001:db8::/32']]]) test(`explicit proxy mode ${value}`, () => {
  assert.deepEqual(trustedProxy({ TRUST_PROXY: value }), expected);
});
test('production default never trusts forwarding', () => assert.equal(trustedProxy({ NODE_ENV: 'production' }), false));
test('direct spoofed XFF ignored when trust disabled', () => {
  assert.deepEqual(identity(request('false', '192.0.2.1', '198.51.100.1')), { ip: '192.0.2.1', source: 'socket', trustedProxy: false, forwardedChainLength: 0 });
});
test('untrusted peer cannot use an approved range to select identity', () => assert.equal(identity(request('10.0.0.0/8', '192.0.2.1', '198.51.100.1')).ip, '192.0.2.1'));
test('trusted proxy accepts forwarded client', () => {
  const result = identity(request('10.0.0.0/8', '10.0.0.1', '198.51.100.1'));
  assert.equal(result.ip, '198.51.100.1'); assert.equal(result.trustedProxy, true); assert.equal(result.forwardedChainLength, 1);
});
test('range trust stops at first untrusted hop and ignores spoofed leftmost client', () => assert.equal(identity(request('10.0.0.0/8', '10.0.0.1', '203.0.113.1, 192.0.2.9, 10.0.0.2')).ip, '192.0.2.9'));
test('numeric hop count accepts only configured chain boundary', () => {
  assert.equal(identity(request('1', '10.0.0.1', '203.0.113.1, 192.0.2.9')).ip, '192.0.2.9');
  assert.equal(identity(request('2', '10.0.0.1', '203.0.113.1, 192.0.2.9')).ip, '203.0.113.1');
});
test('IPv4-mapped IPv6 shares IPv4 canonical identity', () => {
  assert.equal(canonicalIp('::ffff:192.0.2.1'), '192.0.2.1'); assert.equal(canonicalIp('::ffff:c000:201'), '192.0.2.1');
});
test('IPv6 canonicalizes alternate spellings and case', () => assert.equal(canonicalIp('2001:0DB8:0:0:0:0:0:1'), canonicalIp('2001:db8::1')));
test('malformed or excessive trusted chain falls back safely', () => {
  for (const chain of ['not-an-ip', '198.51.100.1:1234', Array(18).fill('198.51.100.1').join(',')]) assert.equal(identity(request('1', '10.0.0.1', chain)).ip, '10.0.0.1');
});
test('Forwarded and X-Real-IP never select identity', () => {
  const req = request(); req.headers.forwarded = 'for=198.51.100.1'; req.headers['x-real-ip'] = '198.51.100.2';
  assert.equal(identity(req).ip, '192.0.2.1');
});
test('network bucket returns fixed 429 with Retry-After', () => {
  const limit = createRateLimiter({ max: 1 }); const req = request();
  assert.equal(hit(limit, req).passed, true); const { res } = hit(limit, req);
  assert.equal(res.statusCode, 429); assert.ok(res.headers['Retry-After']); assert.equal(res.body.code, 'RATE_LIMITED');
});
test('changing spoofed XFF cannot bypass direct network bucket', () => {
  const limit = createRateLimiter({ max: 1 }); hit(limit, request('false', '192.0.2.1', '198.51.100.1'));
  assert.equal(hit(limit, request('false', '192.0.2.1', '198.51.100.2')).res.statusCode, 429);
});
test('different direct networks retain independent buckets', () => {
  const limit = createRateLimiter({ max: 1 }); hit(limit, request());
  assert.equal(hit(limit, request('false', '192.0.2.2')).passed, true);
});
test('body and query user ids never select network bucket', () => {
  const limit = createRateLimiter({ max: 1 }); hit(limit, request('false', '192.0.2.1', undefined, { userId: 1 }));
  const req = request('false', '192.0.2.1', undefined, { userId: 2 }); req.query = { userId: 2 };
  assert.equal(hit(limit, req).res.statusCode, 429);
});
test('admin receives no unlimited network bypass', () => {
  const limit = createRateLimiter({ max: 1 }); const req = request(); req.user = { id: 1, role: 'admin' };
  hit(limit, req); assert.equal(hit(limit, req).res.statusCode, 429);
});
test('account bucket survives IP rotation and casing changes', () => {
  const limit = createLoginAccountLimiter({ max: 1 }); hit(limit, request('false', '192.0.2.1', undefined, { email: ' User@Example.test ', password: 'fixture' }));
  assert.equal(hit(limit, request('false', '192.0.2.2', undefined, { email: 'user@example.test', password: 'fixture' })).res.statusCode, 429);
});
test('different attempted accounts have independent account buckets', () => {
  const limit = createLoginAccountLimiter({ max: 1 });
  for (const email of ['a@example.test', 'b@example.test']) assert.equal(hit(limit, request('false', '192.0.2.1', undefined, { email, password: 'fixture' })).passed, true);
});
test('account limit response exposes no email IP key or attempt count', () => {
  const limit = createLoginAccountLimiter({ max: 1 }); const req = request('false', '192.0.2.1', undefined, { email: 'private@example.test', password: 'PRIVATE_PASSWORD' });
  hit(limit, req); const { res } = hit(limit, req);
  assert.doesNotMatch(JSON.stringify(res), /private@|192\.0|PRIVATE_PASSWORD|bucket|count/);
  assert.equal(res.headers['RateLimit-Remaining'], undefined); assert.ok(res.headers['Retry-After']);
});
test('unknown attempted account gets same fixed limiter response without lookup', () => {
  const limit = createLoginAccountLimiter({ max: 1 }); const results = [];
  for (const email of ['known@example.test', 'unknown@example.test']) {
    const req = request('false', '192.0.2.1', undefined, { email, password: 'fixture' }); hit(limit, req); results.push(hit(limit, req).res.body);
  }
  assert.deepEqual(results[0], results[1]);
});
test('successful downstream response does not reset attempts', () => {
  const limit = createLoginAccountLimiter({ max: 1 }); const req = request('false', '192.0.2.1', undefined, { email: 'a@example.test', password: 'fixture' });
  const res = response(); limit(req, res, () => res.status(200).json({ success: true }));
  assert.equal(hit(limit, req).res.statusCode, 429);
});
test('account window expiry permits later login attempt', () => {
  let time = 100; const limit = createLoginAccountLimiter({ max: 1, windowMs: 100, now: () => time });
  const req = request('false', '192.0.2.1', undefined, { email: 'a@example.test', password: 'fixture' });
  hit(limit, req); assert.equal(hit(limit, req).res.statusCode, 429); time = 200; assert.equal(hit(limit, req).passed, true);
});
for (const body of [null, [], { email: {} , password: 'fixture' }, { email: 'x'.repeat(255), password: 'fixture' }, { email: 'a@example.test', password: 'x'.repeat(1025) }]) test(`invalid login input rejected before key construction (${JSON.stringify(body).slice(0, 35)})`, () => {
  let keys = 0; const limit = createLoginAccountLimiter({ key: () => { keys++; assert.fail('UNSAFE_KEY'); } });
  assert.equal(hit(limit, request('false', '192.0.2.1', undefined, body)).res.statusCode, 400); assert.equal(keys, 0);
});
test('public default is stricter than broad API default', () => {
  const { apiRateLimiter } = require('../middleware/rateLimit'); assert.ok(publicRateLimiter.describe().max < apiRateLimiter.describe().max);
});
test('public low-volume requests pass; rejected requests never enter upstream handler', () => {
  const limit = createRateLimiter({ name: 'public-test', max: 2 }); let upstream = 0;
  const req = request(); for (let i = 0; i < 3; i++) limit(req, response(), () => upstream++);
  assert.equal(upstream, 2);
});
test('actual expensive public route layers install limiter before controller', () => {
  for (const [module, paths] of [['search', ['/']], ['offers', ['/:provider/:hotelId', '/recheck']], ['checkoutRoutes', ['/review']]]) {
    const router = require('../routes/' + module);
    for (const route of paths) assert.equal(router.stack.find(layer => layer.route?.path === route).route.stack[0].handle, publicRateLimiter);
  }
});
for (const path of ['/health', '/api/health']) test(`${path} mounted before applicable limiters in production bootstrap`, () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../server.js'), 'utf8');
  const health = path === '/health' ? "app.get('/health'" : 'app.use("/api/health"';
  assert.ok(source.indexOf(health) < source.indexOf('app.use("/api", apiRateLimiter)'));
});
test('bounded store fails closed at capacity without evicting live replay buckets', () => {
  const limit = createRateLimiter({ max: 1, maxKeys: 2 }); hit(limit, request()); hit(limit, request('false', '192.0.2.2'));
  assert.equal(hit(limit, request('false', '192.0.2.3')).res.statusCode, 429);
  assert.equal(hit(limit, request()).res.statusCode, 429); assert.equal(limit.describe().maxKeys, 2);
});
test('expired keys free capacity without recurring timers', () => {
  let time = 0; const limit = createRateLimiter({ max: 1, maxKeys: 1, windowMs: 100, now: () => time }); hit(limit, request()); time = 101;
  assert.equal(hit(limit, request('false', '192.0.2.2')).passed, true);
});
test('rate-limited telemetry counts status without raw headers logs or DB event amplification', t => {
  const events = [], logs = []; t.mock.method(require('../services/systemEventService'), 'safeRecordEvent', x => events.push(x));
  t.mock.method(require('../utils/logger'), 'info', (...x) => logs.push(x));
  const req = request('false', '192.0.2.1', 'PRIVATE_FORWARDING'); req.method = 'POST'; req.originalUrl = '/api/auth/login';
  const callbacks = {}, res = response(); res.on = (event, cb) => { callbacks[event] = cb; };
  require('../middleware/requestTelemetry')(req, res, () => {});
  const limit = createRateLimiter({ max: 1 }); hit(limit, req); limit(req, res, () => {}); callbacks.finish();
  assert.deepEqual(logs, []); assert.deepEqual(events, []); assert.doesNotMatch(JSON.stringify(identity(req)), /PRIVATE_FORWARDING/);
});
test('preproduction rejects trust-all without echoing supplied value', async () => {
  const checks = await require('../scripts/preProductionCheck.cjs').configuration({ TRUST_PROXY: 'true' });
  assert.equal(checks.find(c => c.id === 'TRUST_PROXY').status, 'BLOCKED');
});
