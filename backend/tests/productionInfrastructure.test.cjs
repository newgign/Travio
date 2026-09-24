const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let externalAttempts = 0;
const forbidden = () => { externalAttempts++; throw Error('EXTERNAL_CALL_FORBIDDEN'); };
for (const name of ['node:http', 'node:https']) require(name).request = require(name).get = forbidden;
require('node:net').Socket.prototype.connect = require('node:tls').connect = global.fetch = forbidden;
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) {
  require('node:dns')[name] = forbidden;
  require('node:dns').promises[name] = forbidden;
}
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) require('node:child_process')[name] = forbidden;
const { check, main } = require('../scripts/productionInfrastructureCheck.cjs');
const contract = require('../scripts/productionInfrastructureEnvSchema.cjs');
const legacy = require('../scripts/preProductionEnvSchema.cjs');
const foundation = require('../scripts/productionFoundationCheck.cjs');
const preproduction = require('../scripts/preProductionCheck.cjs');
const { create } = require('../scripts/createFoundationRelease.cjs');
const root = path.resolve(__dirname, '../..');
const manifest = () => JSON.parse(fs.readFileSync(path.join(root, 'production.infrastructure.json'), 'utf8'));
function baseline() {
  return { ...legacy.MUST_EQUAL, ...Object.fromEntries(legacy.MUST_BE_FALSE.map(key => [key, 'false'])),
    APP_ENV: 'production', EXPECTED_APP_ENV: 'production',
    DATABASE_URL: 'postgresql://synthetic_user:synthetic_password@database.example/infrastructure',
    JWT_SECRET: 'fixture-A9b8C7d6E5f4G3h2I1j0K!LmN@OpQ#Rs',
    OFFER_TOKEN_SECRET: 'fixture-Z9y8X7w6V5u4T3s2R1q0P!OnM@LkJ#Ih',
    CORS_ORIGINS: 'https://production-web.example', VITE_API_URL: 'https://production-api.example/api',
    STAGING_API_URL: 'https://staging-api.example/api', PRODUCTION_API_URL: 'https://production-api.example/api',
    STAGING_WEB_ORIGIN: 'https://staging-web.example', PRODUCTION_WEB_ORIGIN: 'https://production-web.example',
    HOTELBEDS_ENABLED: 'false', HOTELBEDS_STAGING_TEST_ENABLED: 'false', VITE_HOTELBEDS_STAGING_TEST_ENABLED: 'false',
    EMAIL_ENABLED: 'false', DB_BACKUP_AUTO_ENABLED: 'false', HEALTH_MONITOR_ENABLED: 'false', RELIABILITY_MONITOR_ENABLED: 'false',
    RELEASE_SHA: 'a'.repeat(40), EXPECTED_RELEASE_SHA: 'a'.repeat(40), PREVIOUS_RELEASE_SHA: 'b'.repeat(40),
    RELEASE_REVISION_ATTESTED: 'I_VERIFIED_SOURCE_AND_BACKEND_REVISION',
    ROLLBACK_READY_ATTESTED: 'I_VERIFIED_ROLLBACK_AND_DATA_RECOVERY_PLAN',
    BACKUP_RESTORE_READY_ATTESTED: 'I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET',
    STAGING_DATABASE_LOGICAL_NAME: 'owner-recorded-staging-db', PRODUCTION_DATABASE_LOGICAL_NAME: 'asedeliya-production-db',
    ...contract.attestations };
}
function fixture(t, env = baseline(), suffix = '') {
  const tempRoot = path.join(root, '.tmp'); fs.mkdirSync(tempRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tempRoot, '4b-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), tempRoot);
    assert.ok(path.basename(dir).startsWith('4b-'));
    fs.rmSync(dir, { recursive: true });
  });
  fs.writeFileSync(path.join(dir, 'index.html'), '<script src="/asset.js"></script>');
  fs.writeFileSync(path.join(dir, 'asset.js'), `const API=${JSON.stringify(env.VITE_API_URL)};${suffix}`);
  create(env, dir); return dir;
}
const blocked = (result, id) => {
  assert.equal(result.status, 'BLOCKED');
  if (id) assert.equal(result.checks.find(item => item.id === id)?.status, 'BLOCKED', id);
};
test('valid dry-run plan passes without snapshot and never claims remote acceptance', async () => {
  const result = await check({}, { planOnly: true });
  assert.equal(result.status, 'PASS', JSON.stringify(result));
  assert.equal(result.scope, 'OFFLINE_PLAN_ONLY');
  assert.equal(result.databaseState, 'NOT_QUERIED'); assert.equal(result.acceptance, 'NOT_RUN');
  assert.equal(result.migrationReadiness, 'NOT_EVALUATED'); assert.equal(result.migration, 'NOT_RUN');
});
test('complete synthetic snapshot and migration-readiness pass without executing anything', async t => {
  const env = baseline(), buildDir = fixture(t, env), before = JSON.stringify(env);
  const result = await check(env, { buildDir, migrationReadiness: true });
  assert.equal(result.status, 'PASS', JSON.stringify(result));
  assert.equal(result.migrationExecution, 'NOT_AUTHORIZED_BY_THIS_TOOL');
  assert.equal(JSON.stringify(env), before);
  assert.equal(result.ownerProvisioning, 'OWNER_PROVISIONING_REQUIRED');
  assert.deepEqual(result, await check(env, { buildDir, migrationReadiness: true }));
});
for (const section of ['backend', 'frontend', 'database']) test(`missing ${section} blocks`, async () => {
  const value = manifest(); delete value.resources[section];
  blocked(await check({}, { planOnly: true, manifest: value }), 'RESOURCE_MANIFEST');
});
for (const [name, mutate] of [
  ['environment', m => { m.environment = 'staging'; }],
  ['schema version', m => { m.schemaVersion = 2; }],
  ['branch mismatch', m => { m.resources.frontend.branch = 'develop'; }],
  ['health path', m => { m.resources.backend.healthPath = '/wrong'; }],
  ['readiness path', m => { m.resources.backend.readinessPath = '/wrong'; }],
  ['DB target requirement', m => { m.resources.database.targetAttestationRequired = false; }],
  ['backup requirement', m => { m.resources.database.backupRequiredBeforeMigration = false; }],
  ['source maps', m => { m.resources.frontend.sourceMapsAllowed = true; }],
  ['API requirement', m => { m.resources.frontend.apiTargetRequired = false; }],
  ['SPA fallback', m => { m.resources.frontend.spaFallbackRequired = false; }],
  ['release policy', m => { m.release.mismatchPolicy = 'WARN'; }],
  ['receipt schema version', m => { m.release.schemaVersion = 2; }],
  ['out-of-order provisioning', m => { m.provisioningOrder.reverse(); }],
  ['removed gate', m => { delete m.provisioningOrder[10].requiredGate; }],
  ['arbitrary metadata', m => { m.notes = 'synthetic-token-must-not-be-stored'; }],
  ['secret embedded under env names', m => { m.resources.backend.requiredSecretNames.push('synthetic-token-must-not-be-stored'); }],
  ['secret value', m => { m.resources.backend.JWT_SECRET = 'synthetic-token-must-not-be-stored'; }],
  ['credential URL', m => { m.resources.database.DATABASE_URL = baseline().DATABASE_URL; }],
]) test(`manifest rejects ${name}`, async () => {
  const value = manifest(); mutate(value);
  const result = await check({}, { manifest: value, planOnly: true }); blocked(result, 'RESOURCE_MANIFEST');
  assert.ok(!JSON.stringify(result).includes('synthetic-token-must-not-be-stored'));
});
for (const section of ['backend', 'frontend', 'database']) test(`known staging ${section} identity reused blocks`, async () => {
  const value = manifest(), env = baseline();
  value.resources[section].logicalName = section === 'database' ? env.STAGING_DATABASE_LOGICAL_NAME : value.stagingMetadata[section];
  blocked(await check(env, { manifest: value, planOnly: true }), 'RESOURCE_SEPARATION');
});
for (const [key, id] of [
  ['PRODUCTION_DATABASE_TARGET_ATTESTED', 'DATABASE_TARGET'], ['PRODUCTION_DATABASE_IDENTITY_ATTESTED', 'DATABASE_TARGET'],
  ['STAGING_DATABASE_IDENTITY_ATTESTED', 'DATABASE_DISTINCTNESS'], ['DATABASES_CONFIRMED_DISTINCT', 'DATABASE_DISTINCTNESS'],
  ['STAGING_DATABASE_LOGICAL_NAME', 'DATABASE_DISTINCTNESS'], ['PRODUCTION_DATABASE_LOGICAL_NAME', 'DATABASE_DISTINCTNESS'],
  ['RELEASE_SHA', 'RELEASE_IDENTITY'], ['EXPECTED_RELEASE_SHA', 'RELEASE_IDENTITY'], ['RELEASE_REVISION_ATTESTED', 'RELEASE_IDENTITY'],
  ['PRODUCTION_BACKUP_VERIFIED', 'BACKUP_PREREQUISITE'], ['PRODUCTION_SCHEMA_LEDGER_REVIEWED', 'SCHEMA_LEDGER'],
  ['PRODUCTION_MIGRATION_AUTHORIZATION', 'MIGRATION_AUTHORIZATION'],
]) test(`missing ${key} blocks`, async t => {
  const env = baseline(), buildDir = fixture(t, env); delete env[key];
  blocked(await check(env, { buildDir, migrationReadiness: true }), id);
});
for (const [key, value, id] of [
  ['APP_ENV', 'staging', 'ENVIRONMENT'], ['EXPECTED_APP_ENV', 'staging', 'ENVIRONMENT'],
  ['STAGING_DATABASE_LOGICAL_NAME', 'asedeliya-production-db', 'DATABASE_DISTINCTNESS'],
  ['DATABASES_CONFIRMED_DISTINCT', 'true', 'DATABASE_DISTINCTNESS'],
  ['VITE_API_URL', 'https://localhost/api', 'API_TARGET'],
  ['VITE_API_URL', 'https://10.0.0.1/api', 'API_TARGET'],
  ['VITE_API_URL', 'https://[::1]/api', 'API_TARGET'],
  ['VITE_API_URL', 'https://staging-api.example/api', 'API_TARGET'],
  ['PRODUCTION_API_URL', 'https://staging-api.example/api', 'API_TARGET'],
  ['PRODUCTION_API_URL', undefined, 'API_TARGET'], ['VITE_API_URL', 'http://public.example/api', 'API_TARGET'],
  ['CORS_ORIGINS', '*', 'FRONTEND_TARGET'], ['PRODUCTION_WEB_ORIGIN', undefined, 'FRONTEND_TARGET'],
  ['CORS_ORIGINS', 'https://user:password@production-web.example', 'FRONTEND_TARGET'],
  ['CORS_ORIGINS', 'https://production-web.example/path', 'FRONTEND_TARGET'],
  ['CORS_ORIGINS', 'https://production-web.example?x=1', 'FRONTEND_TARGET'],
  ['CORS_ORIGINS', 'https://production-web.example#x', 'FRONTEND_TARGET'],
  ['HOTELBEDS_ENV', 'live', 'HOTELBEDS'], ['HOTELBEDS_READ_ONLY', 'false', 'HOTELBEDS'],
  ['HOTELBEDS_BOOKING_ENABLED', 'true', 'SALES'], ['HOTELBEDS_LIVE_BOOKING_ENABLED', 'true', 'SALES'],
  ['PRODUCTION_SALES_ENABLED', 'true', 'SALES'], ['REAL_CHARGES_ENABLED', 'true', 'SALES'], ['REAL_REFUNDS_ENABLED', 'true', 'SALES'],
  ['PAYMENTS_MODE', 'sandbox', 'PAYMENTS'], ['PAYMENTS_PROVIDER', 'external', 'PAYMENTS'],
  ['HOT_DEALS_MONITOR_ENABLED', 'true', 'BACKGROUND_JOBS'], ['HOTELBEDS_CONTENT_SYNC_ENABLED', 'true', 'BACKGROUND_JOBS'],
  ['EMAIL_ENABLED', 'true', 'BACKGROUND_JOBS'], ['DB_BACKUP_AUTO_ENABLED', 'true', 'BACKGROUND_JOBS'],
]) test(`unsafe snapshot ${key} ${value} blocks`, async t => {
  const env = baseline(), buildDir = fixture(t, env); env[key] = value;
  blocked(await check(env, { buildDir }), id);
});
test('missing operator snapshot fails closed while valid plan alone passes', async () => blocked(await check({})));
test('private/mapped/link-local and public IP literals are excluded by narrow production DNS-name policy', async t => {
  const env = baseline(), buildDir = fixture(t, env);
  for (const host of ['192.168.1.2', '172.16.0.1', '169.254.1.1', '[febf::1]', '[::ffff:a00:1]', '100.64.0.1', '8.8.8.8']) {
    const url = `https://${host}/api`;
    blocked(await check({ ...env, PRODUCTION_API_URL: url, VITE_API_URL: url }, { buildDir }), 'API_TARGET');
  }
});
test('migration assertions cannot be omitted or substituted by generic recovery evidence', async t => {
  const env = baseline(), buildDir = fixture(t, env);
  delete env.PRODUCTION_BACKUP_VERIFIED; delete env.PRODUCTION_MIGRATION_AUTHORIZATION;
  assert.equal((await check(env, { buildDir })).status, 'PASS');
  blocked(await check(env, { buildDir, migrationReadiness: true }), 'BACKUP_PREREQUISITE');
});
test('backend/frontend release mismatch blocks', async t => {
  const env = baseline(), buildDir = fixture(t, { ...env, RELEASE_SHA: 'c'.repeat(40) });
  blocked(await check(env, { buildDir }), 'RELEASE_IDENTITY');
});
test('stale assets, missing receipt, receipt environment/version and sourcemaps block', async t => {
  const env = baseline();
  for (const mutate of [
    dir => fs.appendFileSync(path.join(dir, 'asset.js'), 'changed'),
    dir => fs.unlinkSync(path.join(dir, 'release.json')),
    dir => fs.writeFileSync(path.join(dir, 'asset.js.map'), '{}'),
    ...[{ environment: 'staging' }, { version: 2 }].map(patch => dir => {
      const file = path.join(dir, 'release.json'); fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file)), ...patch }));
    }),
  ]) { const buildDir = fixture(t, env); mutate(buildDir); blocked(await check(env, { buildDir }), 'FOUNDATION'); }
});
test('TEST-enabled provider requires visible-disclosure build intent', async t => {
  const env = { ...baseline(), HOTELBEDS_ENABLED: 'true', HOTELBEDS_API_KEY: 'synthetic-test-api-key', HOTELBEDS_API_SECRET: 'synthetic-test-api-secret' };
  blocked(await check(env, { buildDir: fixture(t, env) }), 'TEST_DISCLOSURE');
  env.HOTELBEDS_STAGING_TEST_ENABLED = env.VITE_HOTELBEDS_STAGING_TEST_ENABLED = 'true';
  assert.equal((await check(env, { buildDir: fixture(t, env) })).status, 'PASS');
});
test('output contains neither DATABASE_URL identifier nor URLs, revisions, identities, errors or secrets', async t => {
  const env = baseline(), buildDir = fixture(t, env, `const LEAK=${JSON.stringify(env.JWT_SECRET)};`);
  const result = await check(env, { buildDir }); blocked(result, 'FOUNDATION');
  const output = JSON.stringify(result);
  for (const value of ['DATABASE_URL', env.DATABASE_URL, env.JWT_SECRET, env.OFFER_TOKEN_SECRET, env.RELEASE_SHA,
    env.VITE_API_URL, env.STAGING_DATABASE_LOGICAL_NAME, 'synthetic_password', 'synthetic_user', 'database.example']) assert.ok(!output.includes(value));
});
test('4A semantics preserved; 3Z remains staging-only', async t => {
  const env = baseline(), buildDir = fixture(t, env);
  assert.equal((await foundation.check(env, { buildDir })).status, 'FOUNDATION_PASS');
  blocked(await preproduction.check(env));
  assert.equal((await preproduction.check({ ...env, APP_ENV: 'staging' })).status, 'PASS');
});
test('DB runtime configuration and productionGate ignore 4B operator assertions', () => {
  const env = baseline(), database = require('../config/database');
  const without = { ...env }; for (const key of Object.keys(contract.attestations)) delete without[key];
  assert.deepEqual(database.databaseConfig(env), database.databaseConfig(without));
  assert.throws(() => database.databaseConfig({ ...env, DB_SSL_MODE: 'require' }));
  const gate = require('../services/productionGateService').state();
  assert.equal(gate.productionSalesEnabled, false); assert.equal(gate.realChargesEnabled, false); assert.equal(gate.realRefundsEnabled, false);
});
test('3Y, 3Z, 4A and runtime do not consume new 4B assertions/helpers', () => {
  for (const file of ['backend/config/database.js', 'backend/server.js', 'backend/services/productionGateService.js',
    'backend/services/paymentGatewayService.js', 'backend/config/hotelbeds.js', 'backend/scripts/lib/dbContinuity.cjs',
    'backend/scripts/dbBackup.cjs', 'backend/scripts/dbRestore.cjs', 'backend/scripts/preProductionCheck.cjs',
    'backend/scripts/productionFoundationCheck.cjs']) {
    assert.ok(!/productionInfrastructure|PRODUCTION_MIGRATION_AUTHORIZATION|DATABASES_CONFIRMED_DISTINCT/.test(fs.readFileSync(path.join(root, file), 'utf8')), file);
  }
});
test('source/template negative fixtures fail closed without writing repository files', async () => {
  const read = fs.readFileSync;
  for (const [suffix, transform, id] of [
    ['backend/package.json', body => { const p = JSON.parse(body); p.scripts.prestart = 'node scripts/migrate.js'; return JSON.stringify(p); }, 'SOURCE_SAFETY'],
    ['backend/server.js', body => body + '\nrequire("./scripts/dbBackup.cjs");', 'SOURCE_SAFETY'],
    ['render.production.yaml', body => { const p = JSON.parse(body); p.services[0].preDeployCommand = 'node backend/scripts/migrate.js'; return JSON.stringify(p); }, 'PRODUCTION_TEMPLATE'],
    ['render.production.yaml', body => { const p = JSON.parse(body); p.services[0].autoDeployTrigger = 'commit'; return JSON.stringify(p); }, 'PRODUCTION_TEMPLATE'],
    ['render.yaml', body => body.replace('asedeliya-staging-api', 'changed-staging-api'), 'STAGING_METADATA'],
    ['PRODUCTION_FOUNDATION_RUNBOOK.md', () => '', 'ROLLBACK_RUNBOOK'],
  ]) {
    try {
      fs.readFileSync = (file, ...args) => { const body = read(file, ...args); return String(file).replaceAll('\\', '/').endsWith(suffix) ? transform(body) : body; };
      blocked(await check({}, { planOnly: true }), id);
    } finally { fs.readFileSync = read; }
  }
});
test('CLI unsupported arguments and incompatible modes block without echoing input', async () => {
  const original = console.log, previous = process.exitCode, output = [];
  try {
    console.log = value => output.push(value);
    await main(['--arbitrary-secret-value']); assert.equal(process.exitCode, 1);
    assert.ok(!output.join('').includes('arbitrary-secret-value'));
    blocked(await check({}, { planOnly: true, migrationReadiness: true }));
  } finally { console.log = original; process.exitCode = previous; }
});
test('checker writes no files and imports no DB singleton while checking', async t => {
  const env = baseline(), buildDir = fixture(t, env), originals = {};
  try {
    for (const name of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'unlinkSync', 'rmSync']) { originals[name] = fs[name]; fs[name] = forbidden; }
    assert.equal((await check(env, { buildDir })).status, 'PASS');
    assert.ok(!Object.keys(require.cache).some(file => /backend[\\/]db\.js$|[\\/]pg[\\/]lib[\\/]index\.js$/.test(file)));
  } finally { Object.assign(fs, originals); }
});
test('no external network, DNS, child process or checker write attempt', () => assert.equal(externalAttempts, 0));
