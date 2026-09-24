const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
let forbiddenAttempts = 0;
const forbidden = () => { forbiddenAttempts++; throw Error('EXTERNAL_OR_WRITE_FORBIDDEN'); };
for (const name of ['node:http', 'node:https']) require(name).request = require(name).get = forbidden;
require('node:net').Socket.prototype.connect = require('node:tls').connect = global.fetch = forbidden;
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) {
  require('node:dns')[name] = forbidden; require('node:dns').promises[name] = forbidden;
}
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) require('node:child_process')[name] = forbidden;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'pg' || /(?:^|[/\\])db(?:\.js)?$/.test(name)) return forbidden();
  return originalLoad.call(this, name, ...args);
};
const helper = require('../scripts/compareDatabaseTargets.cjs');
const checker = require('../scripts/productionDatabaseProvisioningCheck.cjs');
const inherited = require('../scripts/productionInfrastructureEnvSchema.cjs');
const infrastructure = require('../scripts/productionInfrastructureCheck.cjs');
const foundation = require('../scripts/productionFoundationCheck.cjs');
const preproduction = require('../scripts/preProductionCheck.cjs');
const root = path.resolve(__dirname, '../..');
const example = () => JSON.parse(fs.readFileSync(path.join(root, 'PRODUCTION_DATABASE_OWNER_SNAPSHOT.example.json'), 'utf8'));
const urls = () => ({
  STAGING_DATABASE_URL: 'postgresql://fixture_user:fixture_pass@stage-fixture.example:5432/fixture_db',
  PRODUCTION_DATABASE_URL: 'postgresql://fixture_owner:fixture_secret@new-fixture.example:5432/new_fixture_db',
});
const full = () => ({ ...example(), productionDatabaseCreated: true,
  comparison: helper.compare(urls()).comparison, attestations: { ...checker.attestations } });
const blocked = (result, code) => {
  assert.equal(result.status, 'BLOCKED');
  if (code) assert.ok(result.checks.some(item => item.status === 'BLOCKED' && item.code === code), code);
};
async function capture(work) {
  const original = console.log, exitCode = process.exitCode, output = [];
  try {
    console.log = value => output.push(String(value)); await work();
    return { output: output.join('\n'), exitCode: process.exitCode };
  } finally { console.log = original; process.exitCode = exitCode; }
}
function fixture(t, value) {
  const tempRoot = path.join(root, '.tmp'); fs.mkdirSync(tempRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tempRoot, '4c1-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), tempRoot); assert.ok(path.basename(dir).startsWith('4c1-'));
    fs.rmSync(dir, { recursive: true });
  });
  const file = path.join(dir, 'snapshot.json'); fs.writeFileSync(file, JSON.stringify(value)); return file;
}
test('no production DB: safe example blocks NOT_PROVISIONED and claims no emptiness', async () => {
  const result = await checker.check(example()); blocked(result, 'DATABASE_NOT_PROVISIONED');
  assert.equal(result.state, 'NOT_PROVISIONED'); assert.equal(result.emptyDatabase, 'NOT_VERIFIED');
  assert.equal(result.databaseState, 'NOT_QUERIED');
});
test('provisioned without identity remains PROVISIONED_UNVERIFIED', async () => {
  const result = await checker.check({ ...example(), productionDatabaseCreated: true });
  blocked(result, 'DATABASE_PROVISIONED_NOT_ATTESTED'); assert.equal(result.state, 'PROVISIONED_UNVERIFIED');
});
for (const name of Object.keys(checker.attestations)) test(`missing canonical ${name} blocks`, async () => {
  const snapshot = full(); snapshot.attestations[name] = null;
  const result = await checker.check(snapshot); blocked(result);
  if (name === 'PRODUCTION_DATABASE_TARGET_ATTESTED') assert.equal(result.state, 'PROVISIONED_DISTINCTNESS_VERIFIED');
});
test('same DB identity blocks even with all owner attestations', async () => {
  const env = urls(); env.PRODUCTION_DATABASE_URL = env.STAGING_DATABASE_URL;
  const result = await checker.check({ ...full(), comparison: helper.compare(env).comparison });
  blocked(result, 'DATABASE_IDENTITY_COLLISION'); assert.equal(result.state, 'PROVISIONED_UNVERIFIED');
});
test('full safe canonical attestations PASS only at inspection pending', async () => {
  const value = full(), before = JSON.stringify(value), result = await checker.check(value);
  assert.equal(result.status, 'PASS', JSON.stringify(result)); assert.equal(result.state, 'READ_ONLY_INSPECTION_PENDING');
  assert.deepEqual(result.reachedStates, ['PROVISIONED_UNVERIFIED', 'PROVISIONED_DISTINCTNESS_VERIFIED', 'TARGET_ATTESTED', 'READ_ONLY_INSPECTION_PENDING']);
  assert.equal(result.readOnlyInspection, 'NOT_RUN'); assert.equal(result.migrationExecution, 'NOT_RUN_BY_TOOL');
  assert.equal(result.evidence, 'OWNER_REPORTED_NOT_REMOTE_VERIFICATION');
  assert.equal(JSON.stringify(value), before); assert.deepEqual(result, await checker.check(value));
});
for (const key of ['migrationAuthorized', 'migrationRun']) test(`${key}=false is expected and PASS`, async () => {
  const snapshot = full(); assert.equal(snapshot[key], false); assert.equal((await checker.check(snapshot)).status, 'PASS');
});
for (const [authorization, run] of [[false, true], [true, false], [true, true]]) test(`migration authorization=${authorization} run=${run} blocks 4C.1`, async () => {
  const result = await checker.check({ ...full(), migrationAuthorized: authorization, migrationRun: run });
  blocked(result); assert.equal(result.state, 'BLOCKED_OUT_OF_SCOPE');
  assert.ok(!result.reachedStates.includes('MIGRATION_AUTHORIZED')); assert.ok(!result.reachedStates.includes('MIGRATED'));
});
test('no comparison and invalid comparison transcripts block', async () => {
  blocked(await checker.check({ ...full(), comparison: null }), 'DATABASE_COMPARISON_NOT_VALID');
  blocked(await checker.check({ ...full(), comparison: helper.compare({}).comparison }), 'DATABASE_COMPARISON_NOT_VALID');
});
for (const [name, mutate] of [
  ['wrong version', s => { s.schemaVersion = 2; }], ['wrong environment', s => { s.environment = 'staging'; }],
  ['production logical collision', s => { s.logicalDatabase = 'asedeliya-staging-db'; }],
  ['staging logical collision', s => { s.logicalStagingDatabase = 'asedeliya-production-db'; }],
  ['raw resource ID', s => { s.resourceId = 'synthetic-resource-id'; }],
  ['URL field', s => { s.DATABASE_URL = urls().PRODUCTION_DATABASE_URL; }],
  ['raw hostname', s => { s.logicalDatabase = 'new-fixture.example'; }],
  ['raw username', s => { s.attestations.PRODUCTION_DATABASE_IDENTITY_ATTESTED = 'fixture_owner'; }],
  ['boolean attestation', s => { s.attestations.DATABASES_CONFIRMED_DISTINCT = true; }],
  ['missing migration boundary', s => { delete s.migrationAuthorized; }],
  ['truthy created', s => { s.productionDatabaseCreated = 'true'; }],
  ['extra migration authorization', s => { s.attestations.PRODUCTION_MIGRATION_AUTHORIZATION = inherited.attestations.PRODUCTION_MIGRATION_AUTHORIZATION; }],
  ['inconsistent comparison', s => { s.comparison.SAME_DATABASE_IDENTITY = true; }],
  ['invalid URL but distinct transcript', s => { s.comparison.STAGING_URL_VALID = false; }],
  ['extra comparison secret', s => { s.comparison.password = 'fixture_secret'; }],
]) test(`snapshot rejects ${name}`, async () => {
  const snapshot = full(); mutate(snapshot); const result = await checker.check(snapshot);
  blocked(result, 'DATABASE_SNAPSHOT_INVALID');
  for (const raw of ['synthetic-resource-id', 'new-fixture.example', 'fixture_owner', 'fixture_secret', urls().PRODUCTION_DATABASE_URL]) assert.ok(!JSON.stringify(result).includes(raw));
});
test('null/array/primitive snapshots fail closed', async () => {
  for (const value of [null, [], 'synthetic-secret', 1, true, {}]) blocked(await checker.check(value), 'DATABASE_SNAPSHOT_INVALID');
});
for (const key of ['STAGING_DATABASE_URL', 'PRODUCTION_DATABASE_URL']) test(`malformed ${key} blocks without distinctness claim`, () => {
  const result = helper.compare({ ...urls(), [key]: 'not-a-url' });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.comparison.DATABASES_DISTINCT, false);
});
test('identical URLs report identity collision', () => {
  const env = urls(); env.PRODUCTION_DATABASE_URL = env.STAGING_DATABASE_URL;
  const result = helper.compare(env); assert.equal(result.status, 'BLOCKED'); assert.equal(result.comparison.SAME_DATABASE_IDENTITY, true);
  assert.equal(result.comparison.DATABASES_DISTINCT, false);
});
test('distinct URL candidates pass but remote ownership remains unverified', () => {
  const result = helper.compare(urls()); assert.equal(result.status, 'PASS');
  assert.equal(result.comparison.SAME_DATABASE_IDENTITY, false); assert.equal(result.comparison.DATABASES_DISTINCT, true);
  assert.equal(result.remoteOwnership, 'NOT_VERIFIED'); assert.equal(result.databaseState, 'NOT_QUERIED');
});
for (const [name, staging, production, userEqual] of [
  ['new password', 'postgresql://same:old@host.example/db', 'postgresql://same:new@host.example/db', true],
  ['new user', 'postgresql://first:p@host.example/db', 'postgresql://second:p@host.example/db', false],
  ['default port/protocol/case/trailing dot', 'postgres://same:p@HOST.EXAMPLE./db', 'postgresql://same:p@host.example:5432/db', true],
  ['percent encoding', 'postgresql://%75ser:p@host.example/%64b', 'postgresql://user:p@host.example/db', true],
  ['IPv6 normalization', 'postgresql://u:p@[2001:0db8:0:0:0:0:0:1]/db', 'postgresql://u:p@[2001:db8::1]:5432/db', true],
]) test(`same DB despite ${name} blocks`, () => {
  const result = helper.compare({ STAGING_DATABASE_URL: staging, PRODUCTION_DATABASE_URL: production });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.comparison.SAME_DATABASE_IDENTITY, true);
  assert.equal(result.comparison.USER_EQUAL, userEqual);
});
for (const [name, production, expected] of [
  ['different database', 'postgresql://u:p@host.example/other', 'DATABASE_EQUAL'],
  ['database case preserved', 'postgresql://u:p@host.example/DB', 'DATABASE_EQUAL'],
  ['different port', 'postgresql://u:p@host.example:5433/db', 'PORT_EQUAL'],
  ['different host/possible alias', 'postgresql://u:p@alias.example/db', 'HOST_EQUAL'],
]) test(`${name} is a distinct candidate only`, () => {
  const result = helper.compare({ STAGING_DATABASE_URL: 'postgresql://u:p@host.example/db', PRODUCTION_DATABASE_URL: production });
  assert.equal(result.status, 'PASS'); assert.equal(result.comparison[expected], false); assert.equal(result.remoteOwnership, 'NOT_VERIFIED');
});
for (const [name, value] of [
  ['missing', undefined], ['empty', ''], ['HTTP', 'https://u:p@host.example/db'],
  ['missing user', 'postgresql://host.example/db'], ['missing database', 'postgresql://u:p@host.example/'],
  ['query identity override', 'postgresql://u:p@host.example/db?host=other.example'],
  ['TLS query', 'postgresql://u:p@host.example/db?sslmode=disable'], ['empty query', 'postgresql://u:p@host.example/db?'],
  ['fragment', 'postgresql://u:p@host.example/db#x'], ['empty fragment', 'postgresql://u:p@host.example/db#'],
  ['surrounding spaces', ' postgresql://u:p@host.example/db '], ['control', 'postgresql://u:p@host.example/d\nb'],
  ['encoded control', 'postgresql://u:%00@host.example/db'], ['bad percent encoding', 'postgresql://u:%GG@host.example/db'],
  ['extra database path', 'postgresql://u:p@host.example/db/other'], ['encoded slash', 'postgresql://u:p@host.example/db%2Fother'],
  ['zero port', 'postgresql://u:p@host.example:0/db'], ['out of range port', 'postgresql://u:p@host.example:65536/db'],
  ['empty DNS label', 'postgresql://u:p@host..example/db'], ['invalid DNS label', 'postgresql://u:p@-host.example/db'],
  ['multiple hosts', 'postgresql://u:p@first.example,second.example/db'], ['dot hostname', 'postgresql://u:p@../db'],
  ['oversized URL', 'x'.repeat(8193)],
]) test(`compare rejects ${name}`, () => {
  const result = helper.compare({ ...urls(), PRODUCTION_DATABASE_URL: value });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.comparison.PRODUCTION_URL_VALID, false);
  assert.equal(result.comparison.DATABASES_DISTINCT, false);
});
for (const [label, raw] of [
  ['URL', urls().PRODUCTION_DATABASE_URL], ['hostname', 'new-fixture.example'], ['database name', 'new_fixture_db'],
  ['username', 'fixture_owner'], ['password', 'fixture_secret'],
]) test(`compare CLI never prints ${label}`, async () => {
  const result = await capture(() => helper.main([], urls())); assert.equal(result.exitCode, 0); assert.ok(!result.output.includes(raw));
});
test('helper CLI rejects URL arguments without echo', async () => {
  const result = await capture(() => helper.main([urls().PRODUCTION_DATABASE_URL], urls()));
  assert.equal(result.exitCode, 1); assert.ok(!result.output.includes('new-fixture.example'));
});
test('checker CLI safe example blocks, synthetic full metadata passes', async t => {
  const initial = await capture(() => checker.main([])); assert.equal(initial.exitCode, 1);
  assert.equal(JSON.parse(initial.output).state, 'NOT_PROVISIONED');
  const file = fixture(t, full()), result = await capture(() => checker.main(['--snapshot', file]));
  assert.equal(result.exitCode, 0); assert.equal(JSON.parse(result.output).state, 'READ_ONLY_INSPECTION_PENDING');
  assert.ok(!result.output.includes(file));
});
test('checker accepts UTF-8 BOM but rejects malformed/oversized/missing file and arguments safely', async t => {
  const file = fixture(t, full());
  fs.writeFileSync(file, '\uFEFF' + JSON.stringify(full()));
  assert.equal((await capture(() => checker.main(['--snapshot', file]))).exitCode, 0);
  for (const text of ['{malformed-private-value', ' '.repeat(16385)]) {
    fs.writeFileSync(file, text); const result = await capture(() => checker.main(['--snapshot', file]));
    assert.equal(result.exitCode, 1); assert.ok(!result.output.includes('private-value')); assert.ok(!result.output.includes(file));
  }
  for (const args of [['--snapshot', file + '.missing'], ['--snapshot'], ['--migrate'], ['--snapshot', file, '--apply']]) {
    const result = await capture(() => checker.main(args)); assert.equal(result.exitCode, 1); assert.ok(!result.output.includes(file));
  }
});
test('checker rejects symlink-like snapshot paths before reading', async t => {
  const file = fixture(t, full()), stat = fs.lstatSync;
  try {
    fs.lstatSync = target => path.resolve(target) === path.resolve(file) ? { isSymbolicLink: () => true } : stat(target);
    assert.equal((await capture(() => checker.main(['--snapshot', file]))).exitCode, 1);
  } finally { fs.lstatSync = stat; }
});
test('companion reuses exact four 4B phrases without new env synonyms', async () => {
  for (const [key, value] of Object.entries(checker.attestations)) assert.equal(value, inherited.attestations[key]);
  const result = await capture(() => checker.main(['--contract']));
  const contract = JSON.parse(result.output); assert.equal(contract.maximumState, 'READ_ONLY_INSPECTION_PENDING');
  assert.equal(contract.migrationAuthorized, false); assert.equal(contract.migrationRun, false);
});
test('4B plan stays PASS but full 4B/4A/3Z gates cannot be replaced by 4C.1 metadata', async () => {
  assert.equal((await infrastructure.check({}, { planOnly: true })).status, 'PASS');
  assert.equal((await infrastructure.check({})).status, 'BLOCKED');
  assert.equal((await infrastructure.check({}, { migrationReadiness: true })).status, 'BLOCKED');
  assert.equal((await foundation.check({})).status, 'BLOCKED');
  assert.equal((await preproduction.check({ APP_ENV: 'production' })).status, 'BLOCKED');
});
test('3Y remote verified TLS and production restore guard remain unchanged', () => {
  const continuity = require('../scripts/lib/dbContinuity.cjs');
  assert.throws(() => continuity.connection({ DATABASE_URL: urls().PRODUCTION_DATABASE_URL, DB_SSL_MODE: 'disable' }), /VERIFIED_TLS_REQUIRED/);
  assert.throws(() => continuity.restoreGuard({ RESTORE_DATABASE_URL: urls().PRODUCTION_DATABASE_URL,
    APP_ENV: 'production', RESTORE_CONFIRM_DATABASE: 'new_fixture_db', RESTORE_ALLOW_REMOTE: 'I_ACKNOWLEDGE_NEW_EMPTY_TARGET' }, true), /PRODUCTION_RESTORE_BLOCKED/);
});
test('DB runtime, hard productionGate and Hotelbeds remain safe and ignore attestations', () => {
  const env = { DATABASE_URL: urls().PRODUCTION_DATABASE_URL, ...checker.attestations };
  const db = require('../config/database');
  assert.deepEqual(db.databaseConfig(env), db.databaseConfig({ DATABASE_URL: env.DATABASE_URL }));
  assert.throws(() => db.databaseConfig({ ...env, DB_SSL_MODE: 'require' }));
  const gate = require('../services/productionGateService').state();
  assert.equal(gate.productionSalesEnabled, false); assert.equal(gate.realChargesEnabled, false); assert.equal(gate.realRefundsEnabled, false);
  const provider = require('../config/hotelbeds').buildConfig({ HOTELBEDS_ENV: 'test', HOTELBEDS_READ_ONLY: 'true', ...checker.attestations });
  assert.equal(provider.environment, 'test'); assert.equal(provider.readOnly, true); assert.equal(provider.bookingEnabled, false);
});
test('payment readiness remains disabled with DB/event dependencies stubbed', () => {
  const ctx = { module: { exports: {} }, process: { env: { PAYMENTS_MODE: 'disabled', PAYMENTS_PROVIDER: 'none' } }, require(name) {
    if (name === 'crypto') return require('node:crypto');
    if (name.endsWith('productionGateService')) return require('../services/productionGateService');
    if (name === '../db' || name === './bookingEventService') return {};
    throw Error('UNEXPECTED_IMPORT');
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'backend/services/paymentGatewayService.js'), 'utf8'), ctx);
  assert.equal(ctx.module.exports.readiness().mode, 'disabled'); assert.equal(ctx.module.exports.readiness().realChargesEnabled, false);
});
test('no startup migration or new runtime wiring; new modules imported by tools only', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'backend/package.json'), 'utf8'));
  assert.equal(pkg.scripts.start, 'node server.js'); assert.ok(!pkg.scripts.prestart && !pkg.scripts.poststart);
  for (const name of ['backend/server.js', 'backend/config/database.js', 'backend/services/productionGateService.js',
    'backend/scripts/productionInfrastructureCheck.cjs', 'backend/scripts/productionFoundationCheck.cjs',
    'backend/scripts/preProductionCheck.cjs', 'backend/scripts/lib/dbContinuity.cjs']) {
    assert.ok(!/compareDatabaseTargets|productionDatabaseProvisioning|PRODUCTION_DATABASE_OWNER_SNAPSHOT/.test(fs.readFileSync(path.join(root, name), 'utf8')));
  }
});
test('future inspection procedure is read-only catalog SQL, never migration SQL', () => {
  const text = fs.readFileSync(path.join(root, 'PRODUCTION_DATABASE_PROVISIONING_RUNBOOK.md'), 'utf8');
  const sql = text.match(/```sql\n([\s\S]*?)```/)[1];
  assert.ok(sql.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  assert.ok(sql.includes('ROLLBACK;')); assert.ok(sql.includes('pg_catalog.pg_namespace')); assert.ok(sql.includes('pg_catalog.pg_class'));
  assert.ok(sql.includes('migration_ledger_object_count')); assert.ok(sql.includes('non_extension_routine_count'));
  assert.ok(!/\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|COPY|GRANT|REVOKE|nextval)\b/i.test(sql));
});
test('snapshot and helper neither write nor connect or spawn', async () => {
  const snapshot = full(), originals = {};
  try {
    for (const name of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'unlinkSync', 'rmSync']) { originals[name] = fs[name]; fs[name] = forbidden; }
    assert.equal(helper.compare(urls()).status, 'PASS'); assert.equal((await checker.check(snapshot)).status, 'PASS');
    assert.ok(!Object.keys(require.cache).some(file => /backend[/\\]db\.js$|[/\\]pg[/\\]lib[/\\]index\.js$/.test(file)));
  } finally { Object.assign(fs, originals); }
});
test('no external calls, DB imports, network, DNS, subprocess or checker writes', () => assert.equal(forbiddenAttempts, 0));
