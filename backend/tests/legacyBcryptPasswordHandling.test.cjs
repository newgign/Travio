const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const auth = require('../controllers/authController');
const realHash = bcrypt.hashSync.bind(bcrypt), realCompare = bcrypt.compareSync.bind(bcrypt);
const reply = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
let row, calls, signed, hashed, logs, match, race;
beforeEach(t => {
  const prior = process.env.SESSION_STATE_ENFORCEMENT;
  const priorSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
  process.env.SESSION_STATE_ENFORCEMENT = 'enabled';
  t.after(() => { if (prior === undefined) delete process.env.SESSION_STATE_ENFORCEMENT; else process.env.SESSION_STATE_ENFORCEMENT = prior; });
  t.after(() => { if (priorSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = priorSecret; });
  row = { id: 1, role: 'user', session_version: 2, is_active: true, password: 'SYNTHETIC_HASH', email: 'synthetic@example.test', full_name: 'Synthetic' };
  calls = []; signed = hashed = 0; logs = []; match = true; race = false;
  t.mock.method(pool, 'query', async (sql, values) => { calls.push({ sql, values });
    if (/^SELECT id FROM/.test(sql)) return { rows: [] };
    if (/^SELECT/.test(sql)) return { rows: row ? [row] : [] };
    return { rows: race ? [] : [row] };
  });
  t.mock.method(bcrypt, 'compare', async () => match);
  t.mock.method(bcrypt, 'hash', async (_, cost) => { assert.equal(cost, 12); hashed++; return 'SYNTHETIC_NEW_HASH'; });
  t.mock.method(jwt, 'sign', () => { signed++; return 'SYNTHETIC_SESSION'; });
  t.mock.method(require('../utils/logger'), 'error', (...args) => logs.push(args));
  const forbidden = () => assert.fail('REAL_IO_FORBIDDEN');
  for (const C of [require('pg').Pool, require('pg').Client]) for (const name of ['connect', 'query']) t.mock.method(C.prototype, name, forbidden);
  for (const p of ['node:http', 'node:https']) for (const name of ['get', 'request']) t.mock.method(require(p), name, forbidden);
  t.mock.method(require('node:net').Socket.prototype, 'connect', forbidden);
});
async function login(password) { const res = reply(); await auth.login({ body: { email: 'synthetic@example.test', password } }, res); return res; }
async function register(password) { const res = reply(); await auth.register({ body: { full_name: 'Synthetic', email: 'synthetic@example.test', password } }, res); return res; }
async function change(currentPassword, newPassword) { const res = reply(); await auth.changePassword({ user: { id: 1, sessionVersion: 2 }, body: { currentPassword, newPassword } }, res); return res; }
for (const n of [71,72,73]) test(`installed bcrypt ASCII boundary ${n}`, () => assert.equal(bcrypt.truncates('a'.repeat(n)), n > 72));
for (const [label, value, expected] of [['36 two-byte', 'é'.repeat(36), false], ['37 two-byte', 'é'.repeat(37), true], ['24 three-byte', '界'.repeat(24), false], ['19 four-byte', '😀'.repeat(19), true]])
  test(`installed UTF8 ${label}`, () => assert.equal(bcrypt.truncates(value), expected));
test('same first72 ASCII bytes different suffix compare equivalently', () => { const prefix = 'a'.repeat(72), hash = realHash(prefix + 'x', 4); assert.equal(realCompare(prefix + 'y', hash), true); assert.equal(realCompare(prefix, hash), true); });
test('multibyte common first72 bytes different suffix compare equivalently', () => { const prefix = 'é'.repeat(36), hash = realHash(prefix + 'x', 4); assert.equal(realCompare(prefix + 'y', hash), true); });
test('hash format has no original-length marker', () => { const salt = bcrypt.genSaltSync(4), prefix = 'a'.repeat(72); const a = realHash(prefix, salt), b = realHash(prefix + 'suffix', salt); assert.equal(a, b); assert.equal(a.length, 60); assert.equal(bcrypt.getRounds(a), 4); });
for (const [label, value, status] of [['71', 'a'.repeat(71),201], ['72','a'.repeat(72),201], ['73','a'.repeat(73),400], ['unicode72','é'.repeat(36),201], ['unicode74','é'.repeat(37),400], ['minimum7','abcdefg',400]])
  test(`registration ${label}`, async () => { const res = await register(value); assert.equal(res.statusCode, status); assert.equal(hashed, status === 201 ? 1 : 0); if (status === 400) assert.equal(calls.length, 0); assert.ok(!JSON.stringify(res.body).includes(value)); });
for (const n of [71,72]) test(`compliant login ${n} unchanged`, async () => { assert.equal((await login('a'.repeat(n))).statusCode, 200); assert.equal(signed, 1); assert.equal(hashed, 0); });
for (const value of ['a'.repeat(73), 'é'.repeat(37), 'a'.repeat(1024)])
  test(`successful long login category ${Buffer.byteLength(value)}`, async () => { const res = await login(value); assert.equal(res.statusCode, 409); assert.equal(res.body.code, 'PASSWORD_UPDATE_REQUIRED'); assert.equal(typeof res.body.passwordUpdateToken, 'string'); assert.equal(res.body.token, undefined); assert.equal(signed, 1); assert.equal(hashed, 0); assert.equal(calls.length, 1); assert.deepEqual(logs, []); });
test('long wrong password has no remediation signal', async () => { match = false; const res = await login('a'.repeat(73)); assert.equal(res.statusCode, 401); assert.equal(res.body.code, undefined); assert.equal(signed, 0); });
test('unknown and wrong accounts retain equivalent responses', async () => { match = false; const wrong = await login('a'.repeat(73)); row = null; const unknown = await login('a'.repeat(73)); assert.deepEqual(unknown.body, wrong.body); assert.equal(unknown.statusCode, wrong.statusCode); });
test('inactive account never receives remediation signal', async () => { row.is_active = false; const res = await login('a'.repeat(73)); assert.equal(res.statusCode,401); assert.equal(res.body.code,undefined); });
test('oversized login fails bounded validation before query', async () => { assert.equal((await login('a'.repeat(1025))).statusCode,400); assert.equal(calls.length,0); });
for (const value of [null, true, [], {}]) test(`typed login ${JSON.stringify(value)} rejected`, async () => { assert.equal((await login(value)).statusCode,400); assert.equal(calls.length,0); });
for (const [label, value, status] of [['72','a'.repeat(72),200], ['73','a'.repeat(73),400], ['unicode72','é'.repeat(36),200], ['unicode74','é'.repeat(37),400]])
  test(`legacy current password replacement ${label}`, async () => { const res = await change('a'.repeat(80),value); assert.equal(res.statusCode,status); if(status === 200) { assert.equal(res.body.reauthenticationRequired,true); assert.match(calls[1].sql,/session_version = session_version \+ 1/); assert.match(calls[1].sql,/is_active = TRUE/); } else assert.equal(calls.length,0); });
test('wrong long current password cannot replace hash', async () => { match=false; assert.equal((await change('a'.repeat(80),'new-password')).statusCode,400); assert.equal(hashed,0); assert.equal(calls.length,1); });
test('stale session cannot replace legacy password', async () => { row.session_version=3; assert.equal((await change('a'.repeat(80),'new-password')).statusCode,401); assert.equal(hashed,0); });
test('atomic update race fails without reporting replacement', async () => { race=true; assert.equal((await change('a'.repeat(80),'new-password')).statusCode,401); });
test('new and current same compliant password behavior unchanged', async () => { assert.equal((await change('same-password','same-password')).statusCode,200); });
test('long current with same72 prefix replacement remains explicit user action', async () => { assert.equal((await change('a'.repeat(80),'a'.repeat(72))).statusCode,200); assert.equal(hashed,1); });
test('fixed remediation body contains no credential/hash/account metadata', async () => { const res=await login('PRIVATE'.repeat(12)); assert.deepEqual(Object.keys(res.body),['code','passwordUpdateToken']); assert.doesNotMatch(JSON.stringify({body:res.body,logs}),/PRIVATE|SYNTHETIC_HASH|synthetic@example|byte|length/); });
