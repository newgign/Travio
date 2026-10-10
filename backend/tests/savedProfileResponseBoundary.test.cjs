const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const b = require('../utils/profileBoundary');
const pool = require('../db');
const auth = require('../controllers/authController');
const travelers = require('../controllers/travelerProfileController');
const logger = require('../utils/logger');
const reply = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });
const profile = { full_name: '  Synthetic 名  ', phone: '+7 (000) 123-45', preferred_language: 'kk', email_notifications: false, booking_reminders: true };
const traveler = { first_name: 'Synthetic', last_name: '名', birth_date: '2000-02-29' };
const row = { id: 7, full_name: 'Synthetic', email: 'synthetic@example.test', role: 'user', phone: '+7 (000) 123', password: 'PRIVATE', password_hash: 'PRIVATE', session_version: 5, is_active: true, internal_future: 'PRIVATE' };
beforeEach(t => {
  t.mock.method(pool, 'connect', () => assert.fail('DB connection'));
  t.mock.method(pool, 'query', () => assert.fail('Unmocked DB query'));
  for (const method of ['get', 'request']) for (const protocol of ['node:http', 'node:https'])
    t.mock.method(require(protocol), method, () => assert.fail('Network forbidden'));
  for (const method of ['info', 'warn', 'error']) t.mock.method(logger, method, () => assert.fail('Profile request must not log'));
});
test('Unicode name and international formatting preserved', () => { const value = b.profileInput(profile); assert.equal(value.fullName, 'Synthetic 名'); assert.equal(value.phone, profile.phone); assert.equal(value.emailNotifications, false); });
test('optional defaults and blank phone', () => assert.deepEqual(b.profileInput({ full_name: '名', phone: ' ' }), { fullName: '名', phone: null, preferredLanguage: 'ru', emailNotifications: true, bookingReminders: true }));
test('exact Unicode code point bound accepted', () => assert.equal([...b.profileInput({ full_name: '𐀀'.repeat(255) }).fullName].length, 255));
for (const [label, body] of [
  ['null body', null], ['array body', []], ['missing name', {}], ['array name', { full_name: [] }], ['object name', { full_name: {} }],
  ['empty name', { full_name: ' ' }], ['long name', { full_name: '名'.repeat(256) }], ['name control', { full_name: '名\nX' }],
  ['array phone', { ...profile, phone: [] }], ['object phone', { ...profile, phone: {} }], ['long phone', { ...profile, phone: '1'.repeat(51) }],
  ['phone control', { ...profile, phone: '+1\u0000' }], ['unknown language', { ...profile, preferred_language: 'xx' }],
  ['string boolean', { ...profile, email_notifications: 'false' }], ['numeric boolean', { ...profile, booking_reminders: 0 }], ['null boolean', { ...profile, booking_reminders: null }]
]) test(`profile rejects ${label} before SQL/logging`, async () => { const res = reply(); await auth.updateProfile({ user: { id: 7 }, body }, res); assert.equal(res.statusCode, 400); assert.equal(res.body.code, 'PROFILE_INPUT_INVALID'); assert.doesNotMatch(JSON.stringify(res.body), /Synthetic|\+7|SELECT|UPDATE/); });
for (const field of ['role', 'id', 'user_id', 'is_active', 'session_version', 'permissions', 'created_at', 'password_hash', 'metadata'])
  test(`profile ignores protected ${field}`, async t => {
    const calls = [];
    t.mock.method(pool, 'query', async (sql, values) => { calls.push({ sql, values }); return { rows: [sql.includes('COUNT(*)') ? { total: 0 } : row] }; });
    const res = reply(); await auth.updateProfile({ user: { id: 7 }, body: { ...profile, [field]: { unsafe: 'PRIVATE' }, email: 'other@example.test' } }, res);
    assert.equal(res.statusCode, 200); assert.deepEqual(calls[0].values, ['Synthetic 名', profile.phone, 'kk', false, true, 7]);
    assert.match(calls[0].sql, /WHERE id = \$6/); assert.doesNotMatch(calls[0].sql.split('WHERE')[0], /SET role|session_version|is_active|password_hash|permissions/);
    assert.equal(res.body.user.email, row.email); assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE|session_version|is_active/);
  });
test('profile read uses authenticated id and safe stats', async t => { const calls = []; t.mock.method(pool, 'query', async (sql, args) => { calls.push(args); return { rows: [sql.includes('COUNT(*)') ? { total: 0 } : row] }; }); const res = reply(); await auth.profile({ user: { id: 7 }, query: { id: 99 } }, res); assert.deepEqual(calls, [[7], [7]]); assert.equal(res.body.id, 7); });
test('profile update missing account returns 404', async t => { t.mock.method(pool, 'query', async () => ({ rows: [] })); const res = reply(); await auth.updateProfile({ user: { id: 7 }, body: profile }, res); assert.equal(res.statusCode, 404); });
test('public profile exact allowlist excludes future security fields', () => { assert.deepEqual(Object.keys(b.publicUser(row)), ['id', 'full_name', 'email', 'phone', 'role', 'preferred_language', 'email_notifications', 'booking_reminders', 'created_at']); assert.doesNotMatch(JSON.stringify(b.publicUser(row)), /PRIVATE|session_version|is_active/); });
test('malformed stored optional values normalize without object leakage', () => { const out = b.publicUser({ ...row, phone: {}, full_name: 'x'.repeat(256), created_at: {}, preferred_language: {} }); assert.equal(out.phone, null); assert.equal(out.full_name, ''); assert.equal(out.created_at, null); assert.equal(out.preferred_language, 'ru'); });
test('admin serializer intentional columns only', () => { assert.deepEqual(Object.keys(b.adminUser(row)), ['id', 'full_name', 'email', 'phone', 'role']); assert.doesNotMatch(JSON.stringify(b.adminUser(row)), /PRIVATE|session_version|is_active/); });
for (const [label, patch] of [
  ['array first name', { first_name: [] }], ['object last name', { last_name: {} }], ['long first name', { first_name: 'x'.repeat(121) }],
  ['name control', { last_name: 'X\tY' }], ['long label', { label: 'x'.repeat(81) }], ['label object', { label: {} }],
  ['unknown type', { traveler_type: 'INF' }], ['type object', { traveler_type: {} }], ['nonleap date', { birth_date: '1900-02-29' }],
  ['rollover date', { birth_date: '2001-04-31' }], ['ambiguous date', { birth_date: '01/02/2000' }], ['timestamp DOB', { birth_date: '2000-01-01T00:00:00Z' }],
  ['date object', { birth_date: {} }], ['alias conflict', { firstName: 'Different' }]
]) test(`traveler rejects ${label} before SQL/logging`, async () => { const res = reply(); await travelers.createTraveler({ user: { id: 7 }, body: { ...traveler, ...patch } }, res); assert.equal(res.statusCode, 400); assert.equal(res.body.code, 'PROFILE_INPUT_INVALID'); });
test('traveler camel aliases and lowercase supported type', () => assert.deepEqual(b.travelerInput({ firstName: '名', lastName: 'Test', travelerType: 'ch', birthDate: '' }), { label: 'Турист', travelerType: 'CH', firstName: '名', lastName: 'Test', birthDate: null }));
test('traveler create forces authenticated owner and response projection', async t => { const calls = []; t.mock.method(pool, 'query', async (sql, values) => { calls.push({ sql, values }); return { rows: sql.includes('COUNT(*)') ? [{ count: 0 }] : [{ ...row, ...traveler, user_id: 999 }] }; }); const res = reply(); await travelers.createTraveler({ user: { id: 7 }, body: { ...traveler, user_id: 999, role: 'admin', metadata: { unsafe: true } } }, res); assert.equal(res.statusCode, 201); assert.deepEqual(calls[1].values, [7, 'Турист', 'AD', 'Synthetic', '名', '2000-02-29']); assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE|user_id|session_version|is_active/); });
test('traveler update stays owner scoped', async t => { t.mock.method(pool, 'query', async (sql, values) => { assert.match(sql, /WHERE id = \$6 AND user_id = \$7/); assert.deepEqual(values.slice(-2), ['42', 7]); return { rows: [] }; }); const res = reply(); await travelers.updateTraveler({ user: { id: 7 }, params: { id: '42' }, body: traveler }, res); assert.equal(res.statusCode, 404); });
test('traveler delete stays owner scoped', async t => { t.mock.method(pool, 'query', async (sql, values) => { assert.match(sql, /WHERE id = \$1 AND user_id = \$2/); assert.deepEqual(values, ['42', 7]); return { rows: [] }; }); const res = reply(); await travelers.deleteTraveler({ user: { id: 7 }, params: { id: '42' } }, res); assert.equal(res.statusCode, 404); });
test('traveler list strips future internal columns', async t => { t.mock.method(pool, 'query', async (sql, values) => { assert.deepEqual(values, [7]); return { rows: [{ ...row, ...traveler, birth_date: 'not-date' }] }; }); const res = reply(); await travelers.listTravelers({ user: { id: 7 }, query: { user_id: 999 } }, res); assert.equal(res.body[0].birth_date, null); assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE|email|phone|session_version/); });
test('traveler cap retained', async t => { t.mock.method(pool, 'query', async () => ({ rows: [{ count: 12 }] })); const res = reply(); await travelers.createTraveler({ user: { id: 7 }, body: traveler }, res); assert.equal(res.statusCode, 409); });
test('guest profile auth denied', () => { const res = reply(); require('../middleware/authMiddleware')({ get: () => undefined }, res, () => assert.fail('guest')); assert.equal(res.statusCode, 401); });
test('normal user cannot use admin users route', () => { const res = reply(); require('../middleware/requireRole')('admin')({ user: { role: 'user' }, body: { role: 'admin' } }, res, () => assert.fail('escalation')); assert.equal(res.statusCode, 403); });
