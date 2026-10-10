const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const auth = require('../middleware/authMiddleware');
const controller = require('../controllers/authController');
const requireRole = require('../middleware/requireRole');
const secret = 'synthetic-7m1-session-security-key-32';
const response = () => ({ statusCode: 200, body: null, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } });
const token = (claims = {}, options = {}) => jwt.sign({ id: 1, role: 'admin', sessionVersion: 1, ...claims }, secret, { expiresIn: '1h', ...options });
async function authenticate(value = token(), extra = {}) {
  const req = { get: name => name === 'Authorization' && value ? 'Bearer ' + value : undefined, ...extra }, res = response();
  let next = 0; await auth(req, res, () => { next++; }); return { req, res, next };
}
const login = async (body = {}) => { const res = response(); await controller.login({ body: { email: 'a@example.test', password: 'correct-password', ...body } }, res); return res; };
const passwordChange = async (body = {}) => { const res = response(); await controller.changePassword({ user: { id: 1, role: 'admin', sessionVersion: 1 }, body: { currentPassword: 'correct-password', newPassword: 'new-password-123', ...body } }, res); return res; };
let row, queries, writes, forbidden, lookupError, updateError, race;
beforeEach(t => {
  const keys = ['JWT_SECRET', 'SESSION_STATE_ENFORCEMENT']; const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.JWT_SECRET = secret; process.env.SESSION_STATE_ENFORCEMENT = 'enabled';
  t.after(() => { for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; } });
  row = { id: 1, role: 'admin', session_version: 1, is_active: true, password: 'synthetic-old-hash', email: 'a@example.test', full_name: 'Synthetic' };
  queries = []; writes = forbidden = 0; lookupError = updateError = race = false;
  const fail = () => { forbidden++; assert.fail('REAL_OPERATION_FORBIDDEN'); };
  t.mock.method(pool, 'connect', fail);
  t.mock.method(pool, 'query', async (sql, values) => {
    queries.push({ sql, values });
    if (/^SELECT/.test(sql)) {
      if (lookupError) throw Object.assign(Error('private-marker SELECT SQL stack DATABASE_URL'), { code: '42703' });
      assert.match(sql, /\$1/); assert.equal(values.length, 1);
      const found = row && (/LOWER\(email\)/.test(sql) ? values[0] === row.email : values[0] === row.id);
      return { rows: found ? [{ ...row }] : [] };
    }
    assert.match(sql, /^UPDATE users SET password/);
    if (updateError) throw Error('private-marker UPDATE SQL');
    if (race) return { rows: [] };
    assert.equal(values[1], 1);
    if (/session_version = session_version \+ 1/.test(sql)) {
      assert.match(sql, /AND password = \$3 AND session_version = \$4 AND is_active = TRUE RETURNING id/);
      assert.equal(values[2], row.password); assert.equal(values[3], row.session_version);
      row.session_version++;
    }
    row.password = values[0]; writes++; return { rows: [{ id: 1 }] };
  });
  t.mock.method(bcrypt, 'compare', async (plain, hash) => plain === 'correct-password' && hash === 'synthetic-old-hash'
    || plain === 'new-password-123' && hash === 'synthetic-new-hash');
  t.mock.method(bcrypt, 'hash', async () => 'synthetic-new-hash');
  for (const method of ['info', 'warn', 'error']) t.mock.method(require('../utils/logger'), method, fail);
  for (const method of ['availability', 'checkRates', 'createBooking', 'cancelBooking', 'getBooking', 'listBookings']) t.mock.method(require('../integrations/hotelbeds/client'), method, fail);
  t.mock.method(require('../services/paymentGatewayService'), 'createIntent', fail);
  for (const method of ['requestSandboxRefund', 'completeSandboxRefund']) t.mock.method(require('../controllers/refundController'), method, fail);
  for (const protocol of ['node:http', 'node:https']) for (const method of ['get', 'request']) t.mock.method(require(protocol), method, fail);
  t.mock.method(globalThis, 'fetch', fail); t.mock.method(require('node:net'), 'connect', fail); t.mock.method(require('node:tls'), 'connect', fail);
});
afterEach(() => assert.equal(forbidden, 0));

test('matching active account session accepted with one minimal lookup', async () => {
  const result = await authenticate(); assert.equal(result.next, 1); assert.deepEqual(result.req.user, { id: 1, role: 'admin', sessionVersion: 1 });
  assert.equal(queries.length, 1); assert.match(queries[0].sql, /^SELECT id, role, session_version, is_active FROM users WHERE id = \$1 LIMIT 1$/);
});
test('disabled rollout preserves legacy JWT and performs no account lookup', async () => {
  process.env.SESSION_STATE_ENFORCEMENT = 'disabled'; const legacy = jwt.sign({ id: 1, role: 'admin' }, secret, { expiresIn: '1h' });
  row = null; assert.equal((await authenticate(legacy)).next, 1); assert.equal(queries.length, 0);
});
test('enabled rollout rejects legacy JWT without version', async () => {
  const result = await authenticate(jwt.sign({ id: 1, role: 'admin' }, secret, { expiresIn: '1h' })); assert.equal(result.res.statusCode, 401); assert.equal(result.next, 0);
});
test('expired JWT rejected before any account lookup', async () => { assert.equal((await authenticate(token({}, { expiresIn: -1 }))).res.statusCode, 401); assert.equal(queries.length, 0); });
test('malformed and wrong algorithm tokens rejected before lookup', async () => {
  for (const value of ['invalid', token({}, { algorithm: 'HS384' })]) assert.equal((await authenticate(value)).res.statusCode, 401); assert.equal(queries.length, 0);
});
test('missing bearer rejected without account lookup', async () => { assert.equal((await authenticate(null)).res.statusCode, 401); assert.equal(queries.length, 0); });
test('unknown session-purpose and unexpiring JWT rejected before lookup', async () => {
  for (const value of [token({ type: 'travio_provider_offer' }), jwt.sign({ id: 1, role: 'admin', sessionVersion: 1 }, secret)]) assert.equal((await authenticate(value)).res.statusCode, 401); assert.equal(queries.length, 0);
});
test('nonexistent account denied', async () => { const result = await authenticate(token({ id: 9 })); assert.equal(result.res.statusCode, 401); assert.equal(result.next, 0); });
test('deleted account old valid JWT denied', async () => { const signed = token(); row = null; assert.equal((await authenticate(signed)).res.statusCode, 401); });
test('inactive account old JWT denied', async () => { row.is_active = false; assert.equal((await authenticate()).res.statusCode, 401); });
test('stale session version denied', async () => { row.session_version = 2; assert.equal((await authenticate()).res.statusCode, 401); });
test('version claims cannot use coercion or unsupported range', async () => {
  for (const sessionVersion of ['1', true, 0, -1, 1.5, 2147483648]) assert.equal((await authenticate(token({ sessionVersion }))).res.statusCode, 401);
});
test('current DB role replaces stale signed admin role', async () => { row.role = 'user'; const result = await authenticate(); assert.equal(result.next, 1); assert.equal(result.req.user.role, 'user'); });
test('demoted admin cannot pass actual admin role guard', async () => {
  row.role = 'user'; const result = await authenticate(); let next = false;
  requireRole('admin')(result.req, result.res, () => { next = true; }); assert.equal(result.res.statusCode, 403); assert.equal(next, false);
});
test('current admin passes role guard regardless of old token role', async () => {
  const result = await authenticate(token({ role: 'user' })); let next = false; requireRole('admin')(result.req, result.res, () => { next = true; }); assert.equal(next, true);
});
test('browser role version and user id cannot override account authority', async () => {
  row.role = 'user'; const result = await authenticate(token({ role: 'user' }), { body: { id: 9, role: 'admin', sessionVersion: 99 }, query: { role: 'admin' } });
  assert.deepEqual(result.req.user, { id: 1, role: 'user', sessionVersion: 1 }); assert.deepEqual(queries[0].values, [1]);
});
test('invalid or unmigrated account state fails closed without fallback', async () => {
  for (const extra of [{ session_version: undefined }, { session_version: null }, { is_active: undefined }, { role: 'superadmin' }]) {
    const saved = row; row = { ...saved, ...extra }; const result = await authenticate(); assert.equal(result.res.statusCode, 503); assert.equal(result.next, 0); row = saved;
  }
});
test('account lookup errors return safe 503 and clear preexisting request authority', async () => {
  lookupError = true; const result = await authenticate(token(), { user: { id: 1, role: 'admin' } }); assert.equal(result.next, 0); assert.equal(result.req.user, undefined);
  assert.deepEqual(result.res.body, { code: 'ACCOUNT_SECURITY_STATE_UNAVAILABLE' }); assert.doesNotMatch(JSON.stringify(result.res.body), /private|SQL|stack|DATABASE_URL|synthetic/);
});
test('invalid rollout value fails closed without DB or authority', async () => {
  process.env.SESSION_STATE_ENFORCEMENT = 'true'; const result = await authenticate(); assert.equal(result.res.statusCode, 503); assert.equal(result.next, 0); assert.equal(queries.length, 0);
});
test('enabled login signs current server role and version with expiry', async () => {
  row.role = 'user'; row.session_version = 4; const result = await login({ role: 'admin', sessionVersion: 99 });
  assert.equal(result.statusCode, 200); const claims = jwt.verify(result.body.token, secret, { algorithms: ['HS256'] });
  assert.equal(claims.role, 'user'); assert.equal(claims.sessionVersion, 4); assert.ok(Number.isFinite(claims.exp)); assert.equal(queries.length, 1);
  assert.doesNotMatch(JSON.stringify(result.body), /password|synthetic-old-hash|is_active|session_version/);
});
test('inactive account cannot login or receive a token', async () => { row.is_active = false; const result = await login(); assert.equal(result.statusCode, 401); assert.equal(result.body.token, undefined); });
test('disabled rollout login remains legacy and does not require new columns', async () => {
  process.env.SESSION_STATE_ENFORCEMENT = 'disabled'; delete row.session_version; delete row.is_active;
  const result = await login(); assert.equal(result.statusCode, 200); assert.equal(jwt.verify(result.body.token, secret).sessionVersion, undefined);
});
test('enabled login on missing schema or DB failure is safe and token-free', async () => {
  delete row.session_version; let result = await login(); assert.equal(result.statusCode, 503); assert.equal(result.body.token, undefined);
  lookupError = true; result = await login(); assert.equal(result.statusCode, 503); assert.doesNotMatch(JSON.stringify(result.body), /private-marker|SELECT|stack/);
});
test('successful enabled password update increments version atomically and issues no session', async () => {
  const result = await passwordChange(); assert.equal(result.statusCode, 200); assert.equal(result.body.reauthenticationRequired, true);
  assert.equal(result.body.token, undefined); assert.equal(writes, 1); assert.equal(row.session_version, 2); assert.equal(row.password, 'synthetic-new-hash');
});
test('password change invalidates old JWT including current session', async () => {
  const old = token(); await passwordChange(); const result = await authenticate(old); assert.equal(result.res.statusCode, 401); assert.equal(result.next, 0);
});
test('post-change explicit login issues usable current-version session', async () => {
  await passwordChange(); const result = await login({ password: 'new-password-123' });
  assert.equal(jwt.verify(result.body.token, secret).sessionVersion, 2); assert.equal((await authenticate(result.body.token)).next, 1);
});
test('wrong current password makes no version or password mutation', async () => {
  const result = await passwordChange({ currentPassword: 'wrong' }); assert.equal(result.statusCode, 400); assert.equal(row.session_version, 1); assert.equal(writes, 0);
});
test('failed atomic update or raced state does not report success or increment', async () => {
  updateError = true; let result = await passwordChange(); assert.equal(result.statusCode, 503); assert.equal(writes, 0); assert.equal(row.session_version, 1);
  updateError = false; race = true; result = await passwordChange(); assert.equal(result.statusCode, 401); assert.equal(writes, 0); assert.equal(row.session_version, 1);
});
test('password change with stale request version or inactive row is denied', async () => {
  row.session_version = 2; assert.equal((await passwordChange()).statusCode, 401); row.session_version = 1; row.is_active = false;
  assert.equal((await passwordChange()).statusCode, 401); assert.equal(writes, 0);
});
test('disabled rollout password update remains compatible without new column writes', async () => {
  process.env.SESSION_STATE_ENFORCEMENT = 'disabled'; const result = await passwordChange(); assert.equal(result.statusCode, 200); assert.equal(result.body.reauthenticationRequired, undefined);
  assert.equal(row.session_version, 1); assert.doesNotMatch(queries.at(-1).sql, /session_version|is_active/);
});
test('normal profile updates never act as session revocation marker', async () => {
  row.updated_at = new Date(); assert.equal((await authenticate()).next, 1); assert.equal(row.session_version, 1); assert.equal(writes, 0);
});
test('payment booking storage and migration gates remain disabled with no real IO', () => {
  const gate = require('../services/productionGateService').state({}); assert.equal(gate.realChargesEnabled, false); assert.equal(gate.productionSalesEnabled, false); assert.equal(gate.realRefundsEnabled, false);
  assert.equal(require('../config/reconciliationStorage').storageMode({}), 'disabled'); assert.equal(require('../scripts/lib/sessionSecurityMigrationGuard.cjs').preflight({}).status, 'PASS');
  assert.equal(forbidden, 0); assert.equal(writes, 0);
});
