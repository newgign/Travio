const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const contract = require('../config/mandatoryConfig');
const secret = () => crypto.randomBytes(32).toString('hex');
function baseline() { return { APP_ENV: 'staging', NODE_ENV: 'test', JWT_SECRET: secret(), OFFER_TOKEN_SECRET: secret(),
  DATABASE_URL: 'postgresql://synthetic:synthetic@database.invalid/staging', DB_SSL_MODE: 'verify-full',
  PAYMENTS_MODE: 'disabled', PAYMENTS_PROVIDER: 'none' }; }
beforeEach(t => {
  const fail = () => assert.fail('REAL_IO_FORBIDDEN');
  for (const C of [require('pg').Pool, require('pg').Client]) for (const m of ['query', 'connect']) t.mock.method(C.prototype, m, fail);
  for (const p of ['node:http', 'node:https']) for (const m of ['get', 'request']) t.mock.method(require(p), m, fail);
  t.mock.method(require('node:net').Socket.prototype, 'connect', fail);
  t.mock.method(require('node:tls'), 'connect', fail);
  t.mock.method(global, 'fetch', fail);
});
function blocked(patch, name) { const result = contract.validate({ ...baseline(), ...patch }); assert.ok(result.some(c => c.name === name)); return result; }
for (const key of ['JWT_SECRET', 'OFFER_TOKEN_SECRET']) for (const [label, value] of [
  ['missing', undefined], ['empty', ''], ['whitespace', '   '], ['short', 'short'], ['repeated', 'x'.repeat(64)],
  ['placeholder', 'generate_a_long_random_secret_for_production'], ['test literal', 'test-only_synthetic_static_placeholder_123456789'],
]) test(`${key} ${label} blocked`, () => blocked({ [key]: value }, key));
test('independent strong synthetic signing keys pass', () => assert.deepEqual(contract.validate(baseline()), []));
test('same signing keys blocked', () => { const s = secret(); assert.ok(blocked({ JWT_SECRET: s, OFFER_TOKEN_SECRET: s }, 'OFFER_TOKEN_SECRET').some(c => c.code === 'SECRET_REUSE_NOT_ALLOWED')); });
test('ordinary dictionary substring does not reject random material', () => assert.equal(contract.strongSecret('aB7z9Q4passwordX6rT3uI8oP2kL5nM1cV0'), true));
for (const value of [undefined, '', 'malformed', 'https://synthetic:synthetic@database.invalid/db', 'postgresql:///db'])
  test(`database malformed category ${String(value).slice(0, 8)} blocked`, () => blocked({ DATABASE_URL: value }, 'DATABASE_URL'));
test('generic remote TLS disable blocked', () => blocked({ DB_SSL_MODE: 'disable' }, 'DATABASE_URL'));
test('generic require without explicit Render contract blocked', () => blocked({ DB_SSL_MODE: 'require' }, 'DATABASE_URL'));
test('global TLS verification bypass blocked', () => blocked({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 'DATABASE_URL'));
test('connection-string TLS override blocked', () => blocked({ DATABASE_URL: baseline().DATABASE_URL + '?sslmode=require' }, 'DATABASE_URL'));
test('disabled Hotelbeds needs no credentials', () => assert.deepEqual(contract.validate({ ...baseline(), HOTELBEDS_ENABLED: 'false' }), []));
test('enabled Hotelbeds missing credentials blocked', () => blocked({ HOTELBEDS_ENABLED: 'true' }, 'HOTELBEDS_ENABLED'));
test('enabled Hotelbeds missing mTLS blocked', () => blocked({ HOTELBEDS_ENABLED: 'true', HOTELBEDS_API_KEY: secret(), HOTELBEDS_API_SECRET: secret() }, 'HOTELBEDS_ENABLED'));
test('disabled payments need no PSP credentials', () => assert.deepEqual(contract.validate(baseline()), []));
for (const patch of [{ PAYMENTS_MODE: 'live' }, { PAYMENTS_PROVIDER: 'real' }, { REAL_CHARGES_ENABLED: 'true' }])
  test(`live payment capability ${Object.keys(patch)[0]} blocked without operation`, () => blocked(patch, 'PAYMENTS_MODE'));
test('browser server secret name blocked without echoing name/value', () => blocked({ VITE_JWT_SECRET: secret() }, 'VITE_ENV'));
test('approved VITE public configuration is not a private secret', () => assert.deepEqual(contract.validate({ ...baseline(), VITE_API_URL: 'https://api.invalid/api' }), []));
for (const patch of [{ NODE_ENV: 'development' }, { NODE_ENV: 'test' }])
  test(`${patch.NODE_ENV} alone remains compatible`, () => assert.deepEqual(contract.validate(patch), []));
for (const patch of [{ NODE_ENV: 'production' }, { APP_ENV: 'staging', NODE_ENV: 'test' }, { EXPECTED_APP_ENV: 'staging', NODE_ENV: 'test' }])
  test(`strict authority ${Object.keys(patch)[0]} cannot downgrade`, () => assert.ok(contract.validate(patch).length > 0));
test('session enforcement enabled accepted independently of TLS verify-full', () => assert.deepEqual(contract.validate({ ...baseline(), SESSION_STATE_ENFORCEMENT: 'enabled' }), []));
test('invalid session setting blocked', () => blocked({ SESSION_STATE_ENFORCEMENT: 'bad' }, 'SESSION_STATE_ENFORCEMENT'));
test('migration flags cannot remain enabled at normal startup', () => blocked({ SESSION_SECURITY_MIGRATION_ENABLED: 'true' }, 'SESSION_SECURITY_MIGRATION_ENABLED'));
test('diagnostics contain only allowlisted names and fixed codes', () => {
  const env = baseline(); env.OFFER_TOKEN_SECRET = env.JWT_SECRET; env.DATABASE_URL = 'postgresql://private-user:private-password@private-host/private-db?sslmode=disable';
  const output = JSON.stringify(contract.validate(env));
  for (const value of [env.JWT_SECRET, env.DATABASE_URL, 'private-user', 'private-password', 'private-host', 'private-db']) assert.ok(!output.includes(value));
  assert.throws(() => contract.assertValid(env), e => e.code === 'MANDATORY_CONFIG_BLOCKED' && !e.stack.includes(env.JWT_SECRET));
});
test('actual startup blocks before DB, route or provider imports', () => {
  const source = fs.readFileSync(require('node:path').resolve(__dirname, '../server.js'), 'utf8');
  const imports = [], output = [];
  assert.throws(() => vm.runInNewContext(source, { require(name) {
    imports.push(name); if (name === 'dotenv') return { config() {} };
    if (name === './config/mandatoryConfig') return { assertValid() { contract.assertValid({ APP_ENV: 'staging' }); } };
    if (['express', 'cors'].includes(name)) return {};
    assert.fail('CLIENT_IMPORT_BEFORE_CONFIG');
  }, console: { error(x) { output.push(x); } }, process: { exit() { throw Error('STOP'); } } }), /STOP/);
  assert.ok(!imports.includes('./db')); assert.equal(JSON.parse(output[0]).code, 'MANDATORY_CONFIG_BLOCKED');
});
test('explicit Render internal TLS contract remains valid with session enforcement enabled', () => {
  const tls = require('../config/renderInternalTls.cjs');
  const approved = require('./helpers/reconciliationMigrationEnv.cjs')();
  const env = { ...baseline(), ...approved, DB_SSL_MODE: 'require', RENDER_INTERNAL_TLS_REQUIRE_APPROVAL: tls.approval,
    SESSION_SECURITY_EXPECTED_DB_IDENTITY: approved.RECONCILIATION_EXPECTED_DB_IDENTITY,
    RECONCILIATION_STORAGE_MIGRATION_ENABLED: 'false', SESSION_SECURITY_MIGRATION_ENABLED: 'false', SESSION_STATE_ENFORCEMENT: 'enabled' };
  assert.deepEqual(contract.validate(env), []);
  assert.ok(contract.validate({ ...env, RENDER_INTERNAL_TLS_REQUIRE_APPROVAL: undefined }).length);
});
test('disabled email requires no delivery secret', () => assert.deepEqual(contract.validate({ ...baseline(), EMAIL_ENABLED: 'false', EMAIL_PROVIDER: 'resend' }), []));
test('enabled Resend requires key and sender without sending', () => blocked({ EMAIL_ENABLED: 'true', EMAIL_PROVIDER: 'resend' }, 'RESEND_API_KEY'));
test('production offer service cannot use JWT fallback', t => {
  const previous = { ...process.env };
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); });
  process.env.APP_ENV = 'staging'; process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = secret(); delete process.env.OFFER_TOKEN_SECRET;
  assert.throws(() => require('../services/offerTokenService').getSecret(), { code: 'OFFER_TOKEN_CONFIG_BLOCKED' });
});
test('preproduction shares mandatory secret rejection', async () => {
  const checks = await require('../scripts/preProductionCheck.cjs').configuration({ ...baseline(), OFFER_TOKEN_SECRET: undefined });
  assert.equal(checks.find(c => c.id === 'MANDATORY_RUNTIME_CONFIG').status, 'BLOCKED');
});
