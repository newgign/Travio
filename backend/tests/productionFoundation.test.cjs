const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
let networkCalls = 0;
const forbidden = () => { networkCalls++; throw Error('NETWORK_FORBIDDEN'); };
for (const mod of ['node:http', 'node:https']) require(mod).get = require(mod).request = forbidden;
require('node:net').Socket.prototype.connect = require('node:tls').connect = global.fetch = forbidden;
require('node:child_process').spawnSync = require('node:child_process').execFileSync = forbidden;
const { check, deploymentChecks } = require('../scripts/productionFoundationCheck.cjs');
const { create } = require('../scripts/createFoundationRelease.cjs');
const build = require('../scripts/lib/foundationBuild.cjs');
const legacy = require('../scripts/preProductionCheck.cjs');
const contract = require('../scripts/preProductionEnvSchema.cjs');
const root = path.resolve(__dirname, '../..');
function baseline(environment = 'production') {
  return { ...contract.MUST_EQUAL, ...Object.fromEntries(contract.MUST_BE_FALSE.map(key => [key, 'false'])),
    APP_ENV: environment, EXPECTED_APP_ENV: environment,
    DATABASE_URL: 'postgresql://fixture_user:fixture_password@database.example/foundation',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'), OFFER_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
    CORS_ORIGINS: `https://${environment}-web.example`, VITE_API_URL: `https://${environment}-api.example/api`,
    STAGING_API_URL: 'https://staging-api.example/api', PRODUCTION_API_URL: 'https://production-api.example/api',
    STAGING_WEB_ORIGIN: 'https://staging-web.example', PRODUCTION_WEB_ORIGIN: 'https://production-web.example',
    HEALTH_MONITOR_ENABLED: 'false', RELIABILITY_MONITOR_ENABLED: 'false', HOTELBEDS_ENABLED: 'false',
    RELEASE_SHA: 'a'.repeat(40), EXPECTED_RELEASE_SHA: 'a'.repeat(40), PREVIOUS_RELEASE_SHA: 'b'.repeat(40),
    RELEASE_REVISION_ATTESTED: 'I_VERIFIED_SOURCE_AND_BACKEND_REVISION',
    PRODUCTION_DATABASE_TARGET_ATTESTED: 'I_VERIFIED_SEPARATE_DURABLE_PRODUCTION_DATABASE',
    ROLLBACK_READY_ATTESTED: 'I_VERIFIED_ROLLBACK_AND_DATA_RECOVERY_PLAN',
    BACKUP_RESTORE_READY_ATTESTED: 'I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET' };
}
function fixture(t, env, suffix = '') {
  const tempRoot = path.join(root, '.tmp'); fs.mkdirSync(tempRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tempRoot, '4a-'));
  t.after(() => { // Delete only this test's verified generated directory.
    assert.equal(path.dirname(path.resolve(dir)), tempRoot);
    assert.ok(path.basename(dir).startsWith('4a-'));
    fs.rmSync(dir, { recursive: true });
  });
  fs.writeFileSync(path.join(dir, 'index.html'), '<script src="/assets-hash.js"></script>');
  fs.writeFileSync(path.join(dir, 'assets-hash.js'), `const API=${JSON.stringify(env.VITE_API_URL)};${suffix}`);
  create(env, dir); return dir;
}
for (const environment of ['staging', 'production']) test(`${environment} foundation passes with immutable safe gates`, async t => {
  const env = baseline(environment), before = JSON.stringify(env), dir = fixture(t, env);
  const result = await check(env, { buildDir: dir });
  assert.equal(result.status, 'FOUNDATION_PASS', JSON.stringify(result));
  assert.equal(result.acceptance, 'NOT_RUN'); assert.equal(result.databaseState, 'NOT_QUERIED');
  assert.ok(result.states.includes('OWNER_ACCEPTANCE_REQUIRED'));
  assert.equal(JSON.stringify(env), before);
});
for (const [key, value] of [
  ['HOTELBEDS_BOOKING_ENABLED', 'true'], ['HOTELBEDS_LIVE_BOOKING_ENABLED', 'true'], ['PAYMENTS_MODE', 'sandbox'],
  ['PAYMENTS_PROVIDER', 'external'], ['PRODUCTION_SALES_ENABLED', 'true'], ['REAL_CHARGES_ENABLED', 'true'],
  ['REAL_REFUNDS_ENABLED', 'true'], ['HOTELBEDS_ENV', 'live'], ['HOTELBEDS_READ_ONLY', 'false'],
  ['HOT_DEALS_MONITOR_ENABLED', 'true'], ['HOTELBEDS_CONTENT_SYNC_ENABLED', 'true'], ['EMAIL_ENABLED', 'true'],
]) test(`${key} unsafe blocks`, async t => {
  const env = baseline(), dir = fixture(t, env);
  const result = await check({ ...env, [key]: value }, { buildDir: dir });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.checks.find(item => item.id === key).status, 'BLOCKED');
});
for (const [key, state] of [
  ['PRODUCTION_DATABASE_TARGET_ATTESTED', 'DATABASE_TARGET_NOT_ATTESTED'],
  ['RELEASE_SHA', 'REVISION_NOT_ATTESTED'], ['EXPECTED_RELEASE_SHA', 'REVISION_NOT_ATTESTED'],
  ['RELEASE_REVISION_ATTESTED', 'REVISION_NOT_ATTESTED'], ['PREVIOUS_RELEASE_SHA', 'ROLLBACK_NOT_READY'],
  ['ROLLBACK_READY_ATTESTED', 'ROLLBACK_NOT_READY'], ['BACKUP_RESTORE_READY_ATTESTED', 'ROLLBACK_NOT_READY'],
]) test(`missing ${key} blocks`, async t => {
  const env = baseline(), dir = fixture(t, env);
  const result = await check({ ...env, [key]: undefined }, { buildDir: dir });
  assert.equal(result.status, 'BLOCKED'); assert.ok(result.states.includes(state));
});
test('strict DB/JWT/CORS/API validation and environment matching remain active', async t => {
  const env = baseline(), dir = fixture(t, env);
  for (const patch of [{ DATABASE_URL: 'invalid' }, { DATABASE_URL: undefined }, { DB_SSL_MODE: 'disable' }, { DB_SSL_MODE: 'require' },
    { JWT_SECRET: 'weak' }, { JWT_SECRET: undefined }, { OFFER_TOKEN_SECRET: 'weak' }, { CORS_ORIGINS: '*' },
    { VITE_API_URL: 'http://localhost:5000/api' }, { APP_ENV: 'development' }, { EXPECTED_APP_ENV: 'staging' },
    { NODE_ENV: 'development' }, { PRODUCTION_API_URL: env.STAGING_API_URL }, { PRODUCTION_WEB_ORIGIN: env.STAGING_WEB_ORIGIN }]) {
    assert.equal((await check({ ...env, ...patch }, { buildDir: dir })).status, 'BLOCKED');
  }
});
test('attested internal DB still requires distinct production target and recovery evidence', async t => {
  const env = { ...baseline(), DB_SSL_MODE: 'disable', PREPROD_RENDER_INTERNAL_DB_ATTESTATION: 'I_VERIFIED_DATABASE_URL_MATCHES_RENDER_INTERNAL_URL' };
  const dir = fixture(t, env);
  assert.equal((await check(env, { buildDir: dir })).status, 'FOUNDATION_PASS');
  assert.equal((await check({ ...env, PRODUCTION_DATABASE_TARGET_ATTESTED: 'true' }, { buildDir: dir })).status, 'BLOCKED');
});
test('staging bundle and CORS cannot be used as production even with new metadata', async t => {
  const env = baseline(), staging = baseline('staging'), dir = fixture(t, staging);
  assert.equal((await check(env, { buildDir: dir })).status, 'BLOCKED');
  assert.equal((await check({ ...env, CORS_ORIGINS: env.STAGING_WEB_ORIGIN }, { buildDir: fixture(t, env) })).status, 'BLOCKED');
  const mixed = fixture(t, env, `const OTHER=${JSON.stringify(env.STAGING_API_URL)};`);
  assert.ok((await check(env, { buildDir: mixed })).states.includes('BUILD_TARGET_MISMATCH'));
});
test('missing receipt, stale assets, wrong revision and sourcemaps block', async t => {
  const env = baseline();
  for (const mutate of [
    dir => fs.unlinkSync(path.join(dir, 'release.json')),
    dir => fs.appendFileSync(path.join(dir, 'assets-hash.js'), ';changed=true;'),
    dir => fs.writeFileSync(path.join(dir, 'index.js.map'), '{}'),
    dir => { const file = path.join(dir, 'release.json'), value = JSON.parse(fs.readFileSync(file)); value.revision = 'c'.repeat(40); fs.writeFileSync(file, JSON.stringify(value)); },
  ]) {
    const dir = fixture(t, env); mutate(dir);
    assert.equal((await check(env, { buildDir: dir })).status, 'BLOCKED');
  }
});
test('receipt generator refuses overwrite, wrong API, and public backup artifacts', t => {
  const env = baseline(), dir = fixture(t, env);
  assert.throws(() => create(env, dir));
  assert.throws(() => build.receipt({ ...env, VITE_API_URL: env.STAGING_API_URL }, build.inspect(dir)));
  fs.writeFileSync(path.join(dir, 'private.dump'), 'synthetic-file-only');
  assert.throws(() => build.inspect(dir), /PUBLIC_ARTIFACT/);
});
test('known secrets and server markers in artifact block without printing values', async t => {
  const env = { ...baseline(), HOTELBEDS_API_KEY: crypto.randomBytes(20).toString('hex') };
  for (const value of [env.JWT_SECRET, env.OFFER_TOKEN_SECRET, env.DATABASE_URL, env.HOTELBEDS_API_KEY, 'JWT_SECRET']) {
    const dir = fixture(t, env, `const leak=${JSON.stringify(value)};`);
    const result = await check(env, { buildDir: dir });
    assert.equal(result.status, 'BLOCKED');
    const output = JSON.stringify(result);
    for (const secret of [env.JWT_SECRET, env.OFFER_TOKEN_SECRET, env.DATABASE_URL, env.HOTELBEDS_API_KEY, 'database.example', 'fixture_password', 'fixture_user', env.VITE_API_URL]) assert.ok(!output.includes(secret));
  }
});
test('large chunk is a warning, not foundation failure', async t => {
  const env = baseline(), dir = fixture(t, env, ' '.repeat(500001));
  const result = await check(env, { buildDir: dir });
  assert.equal(result.status, 'FOUNDATION_PASS'); assert.equal(result.summary.warn, 1);
});
test('migration and production blueprint are isolated from startup and auto deployment', () => {
  for (const result of deploymentChecks()) assert.equal(result.status, 'PASS', result.id);
  const read = fs.readFileSync;
  try {
    fs.readFileSync = (file, ...args) => {
      const text = read(file, ...args);
      if (!String(file).endsWith('render.production.yaml')) return text;
      const value = JSON.parse(text); value.services[0].envVars.find(item => item.key === 'PRODUCTION_SALES_ENABLED').value = 'true';
      return JSON.stringify(value);
    };
    assert.equal(deploymentChecks()[0].status, 'BLOCKED');
  } finally { fs.readFileSync = read; }
});
test('3Z behavior remains staging-only and TEST disclosure remains required', async t => {
  assert.equal((await legacy.check(baseline('production'))).status, 'BLOCKED');
  assert.equal((await legacy.check(baseline('staging'))).status, 'PASS');
  const env = { ...baseline(), HOTELBEDS_STAGING_TEST_ENABLED: 'true' }, dir = fixture(t, env);
  assert.equal((await check(env, { buildDir: dir })).status, 'BLOCKED');
  const disclosed = { ...env, VITE_HOTELBEDS_STAGING_TEST_ENABLED: 'true' };
  assert.equal((await check(disclosed, { buildDir: dir })).status, 'BLOCKED');
  assert.equal((await check(disclosed, { buildDir: fixture(t, disclosed) })).status, 'FOUNDATION_PASS');
});
test('runtime gate, provider, payment and 3Y policy retain behavior without runtime imports', () => {
  const gate = require('../services/productionGateService').state();
  assert.equal(gate.productionSalesEnabled, false); assert.equal(gate.realChargesEnabled, false); assert.equal(gate.realRefundsEnabled, false);
  const config = require('../config/hotelbeds').buildConfig(baseline());
  assert.equal(config.environment, 'test'); assert.equal(config.readOnly, true); assert.equal(config.bookingEnabled, false);
  // Execute payment readiness with DB/event modules stubbed; no DB singleton is loaded.
  const ctx = { module: { exports: {} }, process: { env: baseline() }, require(name) {
    if (name === 'crypto') return crypto;
    if (name.endsWith('productionGateService')) return { state: () => gate };
    if (name === '../db' || name === './bookingEventService') return {};
    throw Error('UNEXPECTED_IMPORT');
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'backend/services/paymentGatewayService.js'), 'utf8'), ctx);
  assert.equal(ctx.module.exports.readiness().mode, 'disabled');
  assert.equal(ctx.module.exports.readiness().realChargesEnabled, false);
  for (const file of ['backend/config/database.js', 'backend/scripts/lib/dbContinuity.cjs', 'backend/server.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!/productionFoundation|PRODUCTION_DATABASE_TARGET_ATTESTED|ROLLBACK_READY_ATTESTED/.test(text));
  }
});
test('entire foundation suite makes no external network or child calls', () => assert.equal(networkCalls, 0));
