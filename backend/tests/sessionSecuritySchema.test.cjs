const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const guard = require('../scripts/lib/sessionSecurityMigrationGuard.cjs');
const config = require('../config/sessionSecurity');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const sql = read('database/migrations/' + guard.migration).replace(/--[^\n]*/g, '');
const approved = () => { const env = require('./helpers/reconciliationMigrationEnv.cjs')();
  return { ...env, SESSION_SECURITY_MIGRATION_ENABLED: 'true', SESSION_SECURITY_MIGRATION_APPROVAL: 'I_APPROVE_022_WITH_ORDERED_PENDING_MIGRATIONS',
    SESSION_SECURITY_EXPECTED_DB_IDENTITY: env.RECONCILIATION_EXPECTED_DB_IDENTITY }; };

test('022 follows intact 021 in complete ordered inventory', () => {
  const files = fs.readdirSync(path.resolve(__dirname, '../../database/migrations')).filter(f => f.endsWith('.sql')).sort();
  assert.equal(files.length, 22); assert.equal(files[20], '021_reconciliation_storage.sql'); assert.equal(files[21], guard.migration);
  assert.equal(guard.inventoryCheck(), true);
});
test('version is a positive non-null integer with safe initial default', () => assert.match(sql, /session_version INTEGER NOT NULL DEFAULT 1 CHECK \(session_version >= 1\)/));
test('active state is non-null boolean default true for existing users', () => assert.match(sql, /is_active BOOLEAN NOT NULL DEFAULT TRUE/));
test('migration is additive only and contains no destructive DML or SQL', () => {
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|UPDATE|INSERT|DELETE|RENAME|ALTER\s+COLUMN)\b/i);
  assert.equal((sql.match(/ADD COLUMN IF NOT EXISTS/g) || []).length, 2);
});
test('migration touches users only with no new table or unrelated state', () => {
  assert.deepEqual([...sql.matchAll(/ALTER TABLE (\w+)/g)].map(m => m[1]), ['users', 'users']);
  assert.doesNotMatch(sql, /CREATE TABLE|reconciliation|bookings|payments|updated_at/i);
});
test('schema adds no credential payload or personal-data columns', () => assert.doesNotMatch(sql, /password|secret|jwt|authorization|raw|card|email|phone|passport/i));
test('runner owns transaction and migration is idempotent additive SQL', () => {
  assert.doesNotMatch(sql, /\b(BEGIN|COMMIT)\b/); assert.match(read('backend/scripts/migrate.js'), /query\("BEGIN"\)/);
  assert.match(read('backend/scripts/migrate.js'), /\.sort\(\)/);
  assert.doesNotMatch(read('backend/scripts/migrate.js'), /process\.argv/);
});
test('enforcement defaults disabled; invalid values fail closed', () => {
  assert.equal(config.enforcementMode({}), 'disabled'); assert.equal(config.enforcementMode({ SESSION_STATE_ENFORCEMENT: 'enabled' }), 'enabled');
  for (const mode of ['', 'true', 'ENABLED', 'garbage']) assert.throws(() => config.enforcementMode({ SESSION_STATE_ENFORCEMENT: mode }), { code: 'SESSION_SECURITY_CONFIG_INVALID' });
});
test('offline guard imports no DB network or operation dependencies', () => {
  const original = Module._load; let calls = 0;
  Module._load = function(name, ...args) { if (/^(pg|http|https|node:http|node:https|axios)$|(^|\/)db$|hotelbeds|paymentGateway/i.test(name)) { calls++; throw Error('IO_FORBIDDEN'); } return original.call(this, name, ...args); };
  try { assert.equal(guard.preflight({}).status, 'PASS'); assert.equal(calls, 0); } finally { Module._load = original; }
});
test('both migration preflights pass current safe defaults without executing', () => {
  assert.equal(guard.preflight({}).status, 'PASS'); assert.equal(require('../scripts/lib/reconciliationMigrationGuard.cjs').preflight({}).status, 'PASS');
  assert.equal(guard.preflight({}).executionAllowed, false);
});
test('static preflight rejects execution or enforcement activation and hides secrets', () => {
  for (const env of [{ SESSION_SECURITY_MIGRATION_ENABLED: 'true' }, { SESSION_STATE_ENFORCEMENT: 'enabled' }, { SESSION_STATE_ENFORCEMENT: 'invalid' }]) assert.equal(guard.preflight(env).status, 'FAIL');
  assert.doesNotMatch(JSON.stringify(guard.preflight({ DATABASE_URL: 'private-marker', JWT_SECRET: 'private-marker' })), /private-marker/);
});
test('021 authorization alone cannot execute newly added 022 or access pool', async () => {
  let connects = 0;
  await assert.rejects(require('../scripts/migrate').migrate({ connect() { connects++; throw Error('IO_FORBIDDEN'); } }, require('./helpers/reconciliationMigrationEnv.cjs')()), { code: 'SESSION_SECURITY_MIGRATION_BLOCKED' });
  assert.equal(connects, 0);
});
test('default runner refuses whole pending set before DB construction', async () => {
  let connects = 0; await assert.rejects(require('../scripts/migrate').migrate({ connect() { connects++; throw Error('IO_FORBIDDEN'); } }, {}), { code: 'RECONCILIATION_MIGRATION_BLOCKED' }); assert.equal(connects, 0);
});
test('complete synthetic approvals validate guard only without migration execution', () => assert.doesNotThrow(() => guard.assertExecutionAllowed(approved())));
test('022 needs explicit approval matching target and disabled enforcement in addition to 021', () => {
  for (const extra of [{ SESSION_SECURITY_MIGRATION_ENABLED: 'false' }, { SESSION_SECURITY_MIGRATION_APPROVAL: '' }, { SESSION_SECURITY_EXPECTED_DB_IDENTITY: 'b'.repeat(64) }, { SESSION_STATE_ENFORCEMENT: 'enabled' }, { RECONCILIATION_MIGRATION_APPROVAL: '' }]) assert.throws(() => guard.assertExecutionAllowed({ ...approved(), ...extra }));
});
test('normal startup and Render deploy never execute or enable migration/enforcement', () => {
  const pkg = JSON.parse(read('backend/package.json')); assert.equal(pkg.scripts.start, 'node server.js');
  assert.equal(pkg.scripts.prestart, undefined); assert.equal(pkg.scripts.poststart, undefined);
  assert.doesNotMatch(read('backend/server.js'), /scripts\/migrate|\.migrate\(/);
  for (const file of ['render.yaml', 'render.production.yaml']) assert.doesNotMatch(read(file), /preDeployCommand|npm[^\n]*run migrate|SESSION_STATE_ENFORCEMENT:\s*enabled/);
});
