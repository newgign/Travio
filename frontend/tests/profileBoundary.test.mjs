import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('profile and browser persistence boundaries offline', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, server: { middlewareMode: true, hmr: false } });
  const previous = globalThis.sessionStorage;
  const storage = new Map();
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  try {
    const p = await server.ssrLoadModule('/src/utils/profilePresentation.js');
    const { authStorage } = await server.ssrLoadModule('/src/services/authStorage.js');
    const user = { id: 7, full_name: 'Synthetic 名', email: 'synthetic@example.test', role: 'user', phone: '+7 (000) 123', session_version: 3, password_hash: 'PRIVATE', metadata: { internal: true } };
    await t.test('persisted user has only identity display fields', () => { authStorage.setItem('user', JSON.stringify(user)); assert.deepEqual(Object.keys(JSON.parse(storage.get('user'))), ['id', 'full_name', 'email', 'role']); });
    await t.test('token location unchanged', () => { authStorage.setItem('token', 'synthetic-token'); assert.equal(storage.get('token'), 'synthetic-token'); });
    await t.test('profile drops future internal fields', () => assert.doesNotMatch(JSON.stringify(p.publicProfile(user)), /PRIVATE|session_version|metadata/));
    for (const [name, value] of [['null', null], ['missing', undefined], ['object', {}], ['long', 'x'.repeat(51)], ['control', '+1\n']])
      await t.test(`optional phone ${name} normalizes safely`, () => { const normalized = p.publicProfile({ ...user, phone: value }); assert.equal(normalized.phone, null); assert.equal(p.profileDraft(normalized).phone, ''); });
    await t.test('malformed language falls back safely', () => assert.equal(p.publicProfile({ ...user, preferred_language: {} }).preferred_language, 'ru'));
    await t.test('oversized display name bounded', () => assert.equal(p.publicProfile({ ...user, full_name: 'x'.repeat(256) }).full_name, ''));
    await t.test('invalid required identity fails closed', () => assert.throws(() => p.publicProfile({ ...user, id: {} })));
    await t.test('profile payload only editable fields', () => assert.deepEqual(p.profilePayload({ ...user, preferred_language: 'kk' }), { full_name: user.full_name, phone: user.phone, preferred_language: 'kk' }));
    await t.test('traveler payload drops internal owner fields', () => assert.deepEqual(p.travelerPayload({ first_name: 'Synthetic', user_id: 9, role: 'admin' }), { first_name: 'Synthetic' }));
    await t.test('malformed traveler optional values do not reach rendering', () => assert.deepEqual(p.publicTraveler({ id: 3, first_name: {}, last_name: null, birth_date: {}, label: {} }), { id: 3, first_name: '', last_name: '', label: 'Турист', traveler_type: 'AD', birth_date: null }));
    await t.test('Unicode and international phone accepted for edit', () => assert.deepEqual(p.profileErrors(p.profileDraft(user)), {}));
    await t.test('control characters have fixed UX error', () => assert.equal(typeof p.profileErrors({ ...p.profileDraft(user), phone: '+1\nPRIVATE' }).phone, 'string'));
    await t.test('typed booleans required by client validator', () => assert.ok(p.profileErrors({ ...p.profileDraft(user), email_notifications: 'false' }).email_notifications));
    await t.test('invalid stored user cannot be serialized', () => assert.throws(() => authStorage.setItem('user', JSON.stringify({ id: 7, role: 'admin' }))));
  } finally {
    globalThis.sessionStorage = previous;
    await server.close();
  }
});
