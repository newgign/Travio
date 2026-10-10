const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const guard = require('../scripts/lib/reconciliationMigrationGuard.cjs');
const approvedEnv = require('./helpers/reconciliationMigrationEnv.cjs');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const { storageMode } = require('../config/reconciliationStorage');
const contract = require('../repositories/reconciliationRepository');
const { migrate } = require('../scripts/migrate');

test('default storage disabled', () => assert.equal(storageMode({}), 'disabled'));
test('explicit disabled accepted', () => assert.equal(storageMode({ RECONCILIATION_STORAGE_MODE: 'disabled' }), 'disabled'));
for (const mode of ['postgres', 'invalid', '', 'DISABLED']) test(`mode ${JSON.stringify(mode)} fails closed`, () => assert.throws(() => contract.createRuntimeRepository({ RECONCILIATION_STORAGE_MODE: mode }), { code: 'RECONCILIATION_ACTIVATION_BLOCKED' }));
test('default admin source unavailable', async () => assert.equal((await require('../services/adminReconciliationReadService').createService().list({})).source, 'unavailable'));
test('disabled detail remains 404', async () => assert.rejects(require('../services/adminReconciliationReadService').createService().detail('a'.repeat(64)), { status: 404 }));
test('disabled writes rejected', async () => assert.rejects(contract.createRuntimeRepository({}).upsertCase({}), { code: 'RECONCILIATION_STORAGE_DISABLED' }));
test('runtime factory does not import postgres or migration runner', () => {
  const original = Module._load;
  Module._load = function(name, ...args) { if (/postgresReconciliation|scripts\/migrate|(^pg$)/.test(name)) throw Error('IO_IMPORT'); return original.call(this, name, ...args); };
  try { assert.ok(contract.createRuntimeRepository({})); } finally { Module._load = original; }
});
test('startup command isolated', () => { const scripts = JSON.parse(read('backend/package.json')).scripts; assert.equal(scripts.start, 'node server.js'); for (const key of ['prestart', 'poststart', 'postinstall', 'preinstall', 'install', 'prepare']) assert.equal(scripts[key], undefined); assert.doesNotMatch(read('backend/server.js'), /scripts\/migrate|\.migrate\(/); });
test('Render has no migration deployment hook', () => { for (const file of ['render.yaml', 'render.production.yaml']) assert.doesNotMatch(read(file), /preDeployCommand|scripts\/migrate|npm[^\n]*run migrate/); });
test('migration inventory and checksum valid', () => assert.equal(guard.inventoryCheck(), true));
test('021 remains unique and ordered before approved 022 foundation', () => { const files = fs.readdirSync(path.resolve(__dirname, '../../database/migrations')).filter(f => f.endsWith('.sql')).sort(); assert.equal(files.length, 22); assert.equal(new Set(files.map(f => f.slice(0, 3))).size, 22); assert.equal(files[20], guard.migration); assert.equal(files[21], '022_session_security_state.sql'); });
test('offline safe defaults PASS', () => assert.equal(guard.preflight({}).status, 'PASS'));
test('offline explicit false PASS', () => assert.equal(guard.preflight({ RECONCILIATION_STORAGE_MIGRATION_ENABLED: 'false' }).status, 'PASS'));
for (const flag of ['true', 'FALSE', '1', '']) test(`preflight rejects migration flag ${JSON.stringify(flag)}`, () => assert.equal(guard.preflight({ RECONCILIATION_STORAGE_MIGRATION_ENABLED: flag }).status, 'FAIL'));
test('offline preflight does not mutate env or print secrets', () => { const env = Object.freeze({ DATABASE_URL: 'secret-fixture', JWT_SECRET: 'secret-fixture' }); const result = guard.preflight(env); assert.equal(result.status, 'PASS'); assert.ok(!JSON.stringify(result).includes('secret-fixture')); });
test('sales and payment flags fail preflight', () => { for (const key of ['PRODUCTION_SALES_ENABLED', 'REAL_CHARGES_ENABLED', 'REAL_REFUNDS_ENABLED', 'HOTELBEDS_BOOKING_ENABLED', 'HOTELBEDS_LIVE_BOOKING_ENABLED']) assert.equal(guard.preflight({ [key]: 'true' }).status, 'FAIL'); for (const [key, value] of [['PAYMENTS_MODE', 'real'], ['PAYMENTS_PROVIDER', 'psp']]) assert.equal(guard.preflight({ [key]: value }).status, 'FAIL'); });
test('runner refuses default before pool access', async () => { let connects = 0; await assert.rejects(migrate({ connect() { connects++; throw Error('IO'); } }, {}), { code: 'RECONCILIATION_MIGRATION_BLOCKED' }); assert.equal(connects, 0); });
test('enablement alone is insufficient', () => assert.throws(() => guard.assertExecutionAllowed({ RECONCILIATION_STORAGE_MIGRATION_ENABLED: 'true' }), { code: 'RECONCILIATION_MIGRATION_BLOCKED' }));
test('fully attested mock config passes execution validation without IO', () => assert.doesNotThrow(() => guard.assertExecutionAllowed(approvedEnv())));
test('approval and backup acknowledgement both required', () => { for (const key of ['RECONCILIATION_MIGRATION_APPROVAL', 'BACKUP_RESTORE_READY_ATTESTED']) { const env = approvedEnv(); delete env[key]; assert.throws(() => guard.assertExecutionAllowed(env)); } });
test('target identity mismatch blocked', () => { const env = approvedEnv(); env.DATABASE_URL = env.DATABASE_URL.replace('db.example', 'other.example'); assert.throws(() => guard.assertExecutionAllowed(env)); });
test('environment mismatch and unspecified identity blocked', () => { for (const patch of [{ EXPECTED_APP_ENV: 'production' }, { APP_ENV: 'test', EXPECTED_APP_ENV: 'test' }, { RECONCILIATION_EXPECTED_DB_IDENTITY: '' }]) assert.throws(() => guard.assertExecutionAllowed({ ...approvedEnv(), ...patch })); });
test('unsafe target TLS and malformed URL blocked without disclosure', () => { for (const patch of [{ DB_SSL_MODE: 'disable' }, { DATABASE_URL: 'secret-fixture' }]) { assert.throws(() => guard.assertExecutionAllowed({ ...approvedEnv(), ...patch }), error => error.code === 'RECONCILIATION_MIGRATION_BLOCKED' && !error.message.includes('secret-fixture')); } });
test('release configuration passes disabled and blocks activation', async () => { const { configuration } = require('../scripts/preProductionCheck.cjs'); for (const [env, expected] of [[{}, 'PASS'], [{ RECONCILIATION_STORAGE_MODE: 'postgres' }, 'BLOCKED'], [{ RECONCILIATION_STORAGE_MIGRATION_ENABLED: 'true' }, 'BLOCKED']]) assert.equal((await configuration(env)).find(c => c.id === 'RECONCILIATION_STORAGE').status, expected); });
test('schema is additive and only reconciliation tables', () => { const sql = read('database/migrations/' + guard.migration).replace(/--[^\n]*/g, ''); assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|ALTER|INSERT|UPDATE|DELETE)\b/i); assert.deepEqual([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), ['reconciliation_cases', 'reconciliation_observations']); });
test('schema has no secret card or raw payload fields', () => assert.doesNotMatch(read('database/migrations/' + guard.migration), /\b(card_number|cvv|pan|api_key|secret|raw_webhook|raw_payload|authorization)\b/i));
test('schema has correlation FK and safe constraints', () => { const sql = read('database/migrations/' + guard.migration); for (const token of ['reconciliation_observations_correlation_fk', 'UNIQUE (provider_fingerprint, event_fingerprint)', 'version >= 1', 'amount_minor <= 9007199254740991', 'reconciliation_observations_history_idx']) assert.ok(sql.includes(token)); });
test('zero real IO across preflight, disabled runtime and rejected runner', async () => {
  const original = Module._load; let attempts = 0;
  Module._load = function(name, ...args) { if (name === 'pg' || /(^|\/)db$|paymentGatewayService|hotelbeds.*Service/i.test(name)) { attempts++; throw Error('REAL_IO_FORBIDDEN'); } return original.call(this, name, ...args); };
  try { assert.equal(guard.preflight({}).status, 'PASS'); await contract.createRuntimeRepository({}).listCases(); await assert.rejects(migrate(undefined, {})); assert.equal(attempts, 0); } finally { Module._load = original; }
});
