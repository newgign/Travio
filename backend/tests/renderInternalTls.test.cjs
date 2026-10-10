const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const db = require('../scripts/lib/dbContinuity.cjs');
const tls = require('../config/renderInternalTls.cjs');
const { databaseConfig } = require('../config/database');
const { migrate } = require('../scripts/migrate');
const guard = require('../scripts/lib/sessionSecurityMigrationGuard.cjs');
function approved() {
  const env = { ...require('./helpers/reconciliationMigrationEnv.cjs')(), DB_SSL_MODE: 'require',
    RENDER_INTERNAL_TLS_REQUIRE_APPROVAL: tls.approval,
    SESSION_SECURITY_MIGRATION_ENABLED: 'true',
    SESSION_SECURITY_MIGRATION_APPROVAL: 'I_APPROVE_022_WITH_ORDERED_PENDING_MIGRATIONS',
    SESSION_STATE_ENFORCEMENT: 'disabled' };
  env.SESSION_SECURITY_EXPECTED_DB_IDENTITY = env.RECONCILIATION_EXPECTED_DB_IDENTITY;
  return env;
}
beforeEach(t => {
  const fail = () => assert.fail('REAL_IO_FORBIDDEN');
  for (const C of [require('pg').Client, require('pg').Pool]) for (const m of ['query', 'connect']) t.mock.method(C.prototype, m, fail);
  t.mock.method(require('node:net').Socket.prototype, 'connect', fail);
  t.mock.method(require('node:tls'), 'connect', fail);
  t.mock.method(require('node:child_process'), 'spawnSync', fail);
});
for (const [label, patch] of [
  ['missing approval', { RENDER_INTERNAL_TLS_REQUIRE_APPROVAL: undefined }],
  ['malformed approval', { RENDER_INTERNAL_TLS_REQUIRE_APPROVAL: 'true' }],
  ['backup-only approval', { RENDER_INTERNAL_TLS_REQUIRE_APPROVAL: undefined, DB_ALLOW_TLS_REQUIRE: 'I_ACKNOWLEDGE_ENCRYPTED_WITHOUT_CERTIFICATE_IDENTITY_VERIFICATION' }],
  ['missing identity', { RECONCILIATION_EXPECTED_DB_IDENTITY: undefined }],
  ['malformed identity', { RECONCILIATION_EXPECTED_DB_IDENTITY: 'bad' }],
  ['wrong identity', { RECONCILIATION_EXPECTED_DB_IDENTITY: '0'.repeat(64), SESSION_SECURITY_EXPECTED_DB_IDENTITY: '0'.repeat(64) }],
  ['mismatched session identity', { SESSION_SECURITY_EXPECTED_DB_IDENTITY: '1'.repeat(64) }],
  ['production', { APP_ENV: 'production', EXPECTED_APP_ENV: 'production' }],
  ['wrong app env', { APP_ENV: 'test' }],
  ['wrong expected env', { EXPECTED_APP_ENV: 'production' }],
  ['missing backup attestation', { BACKUP_RESTORE_READY_ATTESTED: undefined }],
  ['runtime storage enabled', { RECONCILIATION_STORAGE_MODE: 'postgres' }],
  ['charges enabled', { REAL_CHARGES_ENABLED: 'true' }],
  ['changed target', { DATABASE_URL: 'postgresql://fixture:PRIVATE@other.example/reconciliation_test' }],
  ['loopback', { DATABASE_URL: 'postgresql://fixture:PRIVATE@127.0.0.1/reconciliation_test' }],
  ['URL TLS override', { DATABASE_URL: 'postgresql://fixture:PRIVATE@db.example/reconciliation_test?sslmode=disable' }],
  ['CA ambiguity', { DB_SSL_CA_PATH: 'system' }],
  ['global TLS bypass', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }],
]) test(`${label} blocks runtime and migration before pool or SQL`, async () => {
  const env = { ...approved(), ...patch };
  assert.throws(() => databaseConfig(env), e => e.code === 'RENDER_INTERNAL_TLS_BLOCKED'
    && !/PRIVATE|postgresql|db\.example/.test(e.message));
  let calls = 0;
  await assert.rejects(migrate({ connect() { calls++; throw Error('MOCK_BOUNDARY'); } }, env), { code: 'RECONCILIATION_MIGRATION_BLOCKED' });
  assert.equal(calls, 0);
});
test('exact contract reaches only injected pool boundary, not SQL', async () => {
  let calls = 0;
  await assert.rejects(migrate({ connect() { calls++; throw Error('MOCK_BOUNDARY'); } }, approved()), /MOCK_BOUNDARY/);
  assert.equal(calls, 1);
});
for (const mode of ['disabled', 'enabled']) test(`runtime require permits enforcement ${mode} with migration flags OFF`, () => {
  const env = { ...approved(), RECONCILIATION_STORAGE_MIGRATION_ENABLED: 'false', SESSION_SECURITY_MIGRATION_ENABLED: 'false',
    RECONCILIATION_MIGRATION_APPROVAL: undefined, SESSION_SECURITY_MIGRATION_APPROVAL: undefined, SESSION_STATE_ENFORCEMENT: mode };
  assert.deepEqual(databaseConfig(env).ssl, { rejectUnauthorized: false });
  assert.throws(() => guard.assertExecutionAllowed(env), { code: 'RECONCILIATION_MIGRATION_BLOCKED' });
});
test('enforcement enabled blocks both migration guards before pool or SQL under require and verify-full', async () => {
  const reconciliation = require('../scripts/lib/reconciliationMigrationGuard.cjs');
  for (const mode of ['require', 'verify-full']) {
    const env = { ...approved(), DB_SSL_MODE: mode, SESSION_STATE_ENFORCEMENT: 'enabled' };
    assert.throws(() => reconciliation.assertExecutionAllowed(env), { code: 'RECONCILIATION_MIGRATION_BLOCKED' });
    assert.throws(() => guard.assertExecutionAllowed(env), { code: 'RECONCILIATION_MIGRATION_BLOCKED' });
    let connects = 0, queries = 0;
    const pool = { connect() { connects++; return { query() { queries++; throw Error('SQL_FORBIDDEN'); } }; } };
    await assert.rejects(migrate(pool, env), { code: 'RECONCILIATION_MIGRATION_BLOCKED' });
    assert.equal(connects, 0); assert.equal(queries, 0);
  }
});
test('enabled runtime retains approval and fingerprint checks', () => {
  for (const patch of [{ RENDER_INTERNAL_TLS_REQUIRE_APPROVAL: undefined }, { RENDER_INTERNAL_TLS_REQUIRE_APPROVAL: 'wrong' },
    { RECONCILIATION_EXPECTED_DB_IDENTITY: undefined },
    { RECONCILIATION_EXPECTED_DB_IDENTITY: '0'.repeat(64), SESSION_SECURITY_EXPECTED_DB_IDENTITY: '0'.repeat(64) }]) {
    assert.throws(() => databaseConfig({ ...approved(), SESSION_STATE_ENFORCEMENT: 'enabled', ...patch }), { code: 'RENDER_INTERNAL_TLS_BLOCKED' });
  }
});
test('invalid enforcement remains rejected by session config and migration guard', () => {
  const env = { ...approved(), SESSION_STATE_ENFORCEMENT: 'invalid' };
  assert.throws(() => require('../config/sessionSecurity').enforcementMode(env), { code: 'SESSION_SECURITY_CONFIG_INVALID' });
  assert.throws(() => guard.assertExecutionAllowed(env), { code: 'RECONCILIATION_MIGRATION_BLOCKED' });
});
for (const [key, value] of [
  ['RECONCILIATION_STORAGE_MIGRATION_ENABLED', 'false'], ['SESSION_SECURITY_MIGRATION_ENABLED', 'false'],
  ['RECONCILIATION_MIGRATION_APPROVAL', ''], ['SESSION_SECURITY_MIGRATION_APPROVAL', ''],
]) test(`${key} still required for migration`, async () => {
  let calls = 0;
  await assert.rejects(migrate({ connect() { calls++; throw Error('MOCK_BOUNDARY'); } }, { ...approved(), [key]: value }));
  assert.equal(calls, 0);
});
test('general remote continuity still rejects require even with full internal contract', () => {
  assert.throws(() => db.connection(approved()), { code: 'VERIFIED_TLS_REQUIRED' });
  assert.throws(() => db.connection({ ...approved(), DB_SSL_MODE: 'disable' }), { code: 'VERIFIED_TLS_REQUIRED' });
});
test('verify-full and local disable remain unchanged; source identity remains byte-compatible', () => {
  const env = { ...approved(), DB_SSL_MODE: 'verify-full' };
  assert.equal(db.sourceIdentity(db.connection(env)), env.RECONCILIATION_EXPECTED_DB_IDENTITY);
  assert.deepEqual(databaseConfig(env).ssl, { rejectUnauthorized: true });
  assert.doesNotThrow(() => guard.assertExecutionAllowed(env));
  const local = { DATABASE_URL: 'postgresql://fixture:fixture@localhost/test', DB_SSL_MODE: 'disable' };
  assert.equal(db.connection(local).local, true);
  assert.equal(databaseConfig(local).ssl, false);
});
test('installed pg rejects server TLS refusal without plaintext fallback', () => {
  const path = require('node:path');
  const Connection = require(path.join(path.dirname(require.resolve('pg')), 'connection.js'));
  const stream = new EventEmitter();
  let ended = 0, upgraded = 0;
  stream.setNoDelay = () => {}; stream.connect = () => {}; stream.end = () => ended++;
  const conn = new Connection({ stream, ssl: databaseConfig(approved()).ssl });
  conn.upgradeToSSL = () => upgraded++;
  let error;
  conn.on('error', e => { error = e; });
  conn.connect(5432, 'synthetic.example');
  stream.emit('data', Buffer.from('N'));
  assert.equal(ended, 1); assert.equal(upgraded, 0);
  assert.match(error.message, /does not support SSL/);
});
test('preproduction accepts validated encrypted internal runtime with activation OFF', async () => {
  const { configuration } = require('../scripts/preProductionCheck.cjs');
  const checks = await configuration({ ...approved(), RECONCILIATION_STORAGE_MIGRATION_ENABLED: 'false', SESSION_SECURITY_MIGRATION_ENABLED: 'false' });
  assert.equal(checks.find(c => c.id === 'DATABASE_URL').status, 'PASS');
  assert.equal(checks.find(c => c.id === 'SESSION_SECURITY_ROLLOUT').status, 'PASS');
});
