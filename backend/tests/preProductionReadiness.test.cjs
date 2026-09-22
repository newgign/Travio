const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
// Fail closed even if a future preflight accidentally imports a networked dependency.
let networkCalls = 0;
const forbidden = () => { networkCalls++; throw new Error('NETWORK_FORBIDDEN'); };
require('node:http').request = require('node:http').get = forbidden;
require('node:https').request = require('node:https').get = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:tls').connect = global.fetch = forbidden;
require('node:child_process').spawnSync = require('node:child_process').execFileSync = forbidden;
const { check, sourceChecks } = require('../scripts/preProductionCheck.cjs');
const contract = require('../scripts/preProductionEnvSchema.cjs');
function baseline() {
  return { ...contract.MUST_EQUAL, ...Object.fromEntries(contract.MUST_BE_FALSE.map(key => [key, 'false'])),
    DATABASE_URL: 'postgresql://fixture:fixture@database.example/staging',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'), CORS_ORIGINS: 'https://web.example',
    VITE_API_URL: 'https://api.example/api/', HOTELBEDS_ENABLED: 'false',
    HEALTH_MONITOR_ENABLED: 'false', RELIABILITY_MONITOR_ENABLED: 'false' };
}
async function blocked(patch, id) {
  const result = await check({ ...baseline(), ...patch });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.checks.find(c => c.id === id)?.status, 'BLOCKED');
}
test('safe baseline and HTTPS API pass without any network or child execution', async () => {
  const result = await check(baseline());
  assert.equal(result.status, 'PASS', JSON.stringify(result));
  assert.equal(result.databaseState, 'NOT_QUERIED');
  assert.equal(networkCalls, 0);
});
for (const key of contract.MUST_BE_FALSE) test(`${key} enabled blocks release`, () => blocked({ [key]: 'true' }, key));
for (const [key, value] of [['NODE_ENV', 'development'], ['ACTIVE_PROVIDER', 'mock'], ['HOTELBEDS_ENV', 'live'], ['HOTELBEDS_READ_ONLY', 'false'], ['PAYMENTS_MODE', 'sandbox'], ['PAYMENTS_PROVIDER', 'external']]) {
  test(`${key} rejects unsafe mode`, () => blocked({ [key]: value }, key));
}
test('missing and weak JWT secrets block, including long placeholders/repetition', async () => {
  for (const value of [undefined, '', 'short', 'x'.repeat(64), 'generate_a_long_random_secret_for_production']) await blocked({ JWT_SECRET: value }, 'JWT_SECRET');
});
test('offer signing follows runtime fallback; explicit weak secret blocks', async () => {
  assert.equal((await check(baseline())).status, 'PASS');
  await blocked({ OFFER_TOKEN_SECRET: 'short' }, 'OFFER_TOKEN_SECRET');
  await blocked({ JWT_SECRET: undefined, OFFER_TOKEN_SECRET: undefined }, 'OFFER_TOKEN_SECRET');
  const result = await check({ ...baseline(), OFFER_SECRET: crypto.randomBytes(32).toString('hex') });
  assert.equal(result.status, 'WARN');
});
test('CORS rejects wildcard, paths, credentials, invalid schemes and local origins', async () => {
  for (const origin of ['*', 'https://web.example/path', 'https://u:p@web.example', 'ftp://web.example', 'http://localhost:5173', 'https://127.0.0.1', 'https://[::1]']) await blocked({ CORS_ORIGINS: origin }, 'CORS_ORIGINS');
});
test('missing frontend build environment is explicitly CONFIG_NOT_PROVIDED', async () => {
  const result = await check({ ...baseline(), VITE_API_URL: undefined });
  assert.equal(result.checks.find(c => c.id === 'VITE_API_URL').code, 'CONFIG_NOT_PROVIDED');
});
test('frontend API rejects localhost, private address, credentials, query and wrong path', async () => {
  for (const url of ['https://localhost/api', 'https://127.1/api', 'http://api.example/api', 'https://10.1.1.1/api', 'https://api.example', 'https://api.example/api?token=secret', 'https://u:p@api.example/api']) await blocked({ VITE_API_URL: url }, 'VITE_API_URL');
});
test('database config needs URL and verified TLS; backup-only require is rejected', async () => {
  for (const patch of [{ DATABASE_URL: undefined }, { DATABASE_URL: 'invalid' }, { DB_SSL_MODE: 'require' }, { DB_SSL_MODE: 'disable' }, { DATABASE_URL: 'postgresql://fixture:fixture@db.example/staging?sslmode=disable' }]) await blocked(patch, 'DATABASE_URL');
});
test('provider configuration, TEST disclosure, credentials and retry contract', async () => {
  await blocked({ HOTELBEDS_ENABLED: 'true' }, 'HOTELBEDS_CREDENTIALS');
  await blocked({ HOTELBEDS_BASE_URL: 'https://wrong.example' }, 'HOTELBEDS_CONFIG');
  await blocked({ HOTELBEDS_READ_RETRIES: '4' }, 'HOTELBEDS_READ_RETRIES');
  await blocked({ HOTELBEDS_STAGING_TEST_ENABLED: 'true' }, 'TEST_BUILD_DISCLOSURE');
  assert.equal((await check({ ...baseline(), HOTELBEDS_STAGING_TEST_ENABLED: 'true', VITE_HOTELBEDS_STAGING_TEST_ENABLED: 'true' })).status, 'PASS');
});
test('secrets, URL, user/host, provider credentials never enter output even on failure', async () => {
  const env = { ...baseline(), HOTELBEDS_API_KEY: crypto.randomBytes(20).toString('hex'), HOTELBEDS_API_SECRET: crypto.randomBytes(20).toString('hex'), OFFER_TOKEN_SECRET: crypto.randomBytes(32).toString('hex') };
  for (const patch of [{}, { CORS_ORIGINS: env.DATABASE_URL, VITE_API_URL: env.HOTELBEDS_API_SECRET }]) {
    const output = JSON.stringify(await check({ ...env, ...patch }));
    for (const key of ['DATABASE_URL', 'JWT_SECRET', 'HOTELBEDS_API_KEY', 'HOTELBEDS_API_SECRET', 'OFFER_TOKEN_SECRET']) assert.ok(!output.includes(env[key]));
    assert.ok(!output.includes('database.example'));
  }
  await blocked({ VITE_JWT_SECRET: 'never-public' }, 'FRONTEND_ENV_BOUNDARY');
});
test('background jobs, TLS bypass and disabled limits block', async () => {
  for (const key of ['EMAIL_ENABLED', 'DB_BACKUP_AUTO_ENABLED', 'HEALTH_MONITOR_ENABLED', 'RELIABILITY_MONITOR_ENABLED']) await blocked({ [key]: 'true' }, key);
  await blocked({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 'TLS_VERIFICATION');
  await blocked({ RATE_LIMIT_ENABLED: 'false' }, 'RATE_LIMIT_ENABLED');
  await blocked({ REQUEST_BODY_LIMIT: '100mb' }, 'REQUEST_BODY_LIMIT');
});
test('backup routes/static directory isolation, migration inventory and safe startup are source assertions', () => {
  const checks = sourceChecks();
  for (const id of ['BACKUP_HTTP_ISOLATION', 'BACKUP_GIT_IGNORE', 'PUBLIC_ARTIFACT_ISOLATION', 'MIGRATION_INVENTORY', 'STARTUP', 'PRODUCTION_GATE', 'SHUTDOWN_CONTRACT']) assert.equal(checks.find(c => c.id === id).status, 'PASS', id);
});
test('source gate rejects simulated static exposure, destructive startup and duplicate migrations', () => {
  const read = fs.readFileSync, list = fs.readdirSync;
  try {
    fs.readFileSync = (file, ...args) => {
      const body = read(file, ...args);
      return String(file).endsWith('server.js') ? body + '\napp.use(express.static("backend/backups"));\nDROP DATABASE app;' : body;
    };
    let checks = sourceChecks();
    assert.equal(checks.find(c => c.id === 'BACKUP_HTTP_ISOLATION').status, 'BLOCKED');
    assert.equal(checks.find(c => c.id === 'STARTUP').status, 'BLOCKED');
    fs.readFileSync = (file, ...args) => String(file).endsWith('001_duplicate.sql') ? '-- synthetic duplicate prefix' : read(file, ...args);
    fs.readdirSync = (dir, ...args) => {
      const files = list(dir, ...args);
      return String(dir).replaceAll('\\', '/').endsWith('database/migrations') ? [...files, '001_duplicate.sql'] : files;
    };
    checks = sourceChecks();
    assert.equal(checks.find(c => c.id === 'MIGRATION_INVENTORY').status, 'BLOCKED');
  } finally { fs.readFileSync = read; fs.readdirSync = list; }
});
test('build gate detects wrong embedded API, maps and synthetic leaked secret without reading dumps', async () => {
  const read = fs.readFileSync, list = fs.readdirSync, stat = fs.statSync, exists = fs.existsSync;
  const secret = crypto.randomBytes(32).toString('hex');
  const dist = file => String(file).replaceAll('\\', '/').includes('frontend/dist');
  let dirty = false;
  try {
    fs.existsSync = file => dist(file) || exists(file);
    fs.readdirSync = (dir, ...args) => dist(dir) ? ['index.html', 'index-hash.js', ...(dirty ? ['index.js.map'] : [])].map(name => ({ name, isSymbolicLink: () => false, isDirectory: () => false })) : list(dir, ...args);
    fs.readFileSync = (file, ...args) => dist(file) ? (dirty ? secret + ' http://localhost:5000/api' : 'https://api.example/api') : read(file, ...args);
    fs.statSync = (file, ...args) => dist(file) ? { size: 500001 } : stat(file, ...args);
    let result = await check({ ...baseline(), JWT_SECRET: secret }, { includeSource: false, includeBuild: true });
    assert.equal(result.status, 'WARN');
    dirty = true;
    result = await check({ ...baseline(), JWT_SECRET: secret }, { includeSource: false, includeBuild: true });
    for (const id of ['BUILD_API_EMBEDDED', 'BUILD_NO_SOURCEMAPS', 'BUILD_NO_SECRETS']) assert.equal(result.checks.find(c => c.id === id).status, 'BLOCKED');
    assert.ok(!JSON.stringify(result).includes(secret));
  } finally { fs.readFileSync = read; fs.readdirSync = list; fs.statSync = stat; fs.existsSync = exists; }
});
test('logger redacts nested metadata, configured secrets, URLs, authorization and raw Error details', () => {
  const logger = require('../utils/logger');
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  try {
    const err = Object.assign(new Error('private-row-value'), { detail: 'password-hash-value', config: { headers: { Authorization: 'private-auth' } } });
    const output = logger.format('error', `failure ${process.env.JWT_SECRET} postgresql://user:password@host/db Bearer private-bearer`, { nested: { password: 'private-password', Authorization: 'private-auth', databaseUrl: 'private-db' }, error: err });
    for (const value of [process.env.JWT_SECRET, 'private-', 'postgresql://', 'user:password']) assert.ok(!output.includes(value));
  } finally { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
});
test('ordinary production errors hide raw message/stack/code and query from logs', () => {
  const logger = require('../utils/logger'), logs = [];
  const original = logger.error, previous = process.env.NODE_ENV;
  logger.error = (...args) => logs.push(logger.format('error', ...args)); process.env.NODE_ENV = 'production';
  try {
    let body, status;
    require('../middleware/errorHandler')(Object.assign(new Error('private-error'), { code: 'private-code' }),
      { method: 'GET', originalUrl: '/api?token=private-query' }, { status(s) { status = s; return this; }, json(b) { body = b; } }, () => {});
    assert.equal(status, 500); assert.equal(body.code, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify({ body, logs }).includes('private-'));
  } finally { logger.error = original; if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
test('health output is bounded and secret-free on DB failure', async () => {
  let body, status;
  await require('../routes/stagingHealth').healthHandler({ query: async q => { assert.equal(q.query_timeout, 3000); throw new Error('private-db-password'); } })({}, { status(s) { status = s; return this; }, json(b) { body = b; } });
  assert.equal(status, 503); assert.ok(!JSON.stringify(body).includes('private-'));
});
test('controllers use safe production internal messages and codes, preserving validation errors', () => {
  const api = require('../utils/apiResponse');
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const error = Object.assign(new Error('private-sql-url'), { code: 'private-code' });
    assert.equal(api.publicMessage(error, 'Safe fallback'), 'Safe fallback');
    assert.equal(api.publicCode(error), 'INTERNAL_ERROR');
    assert.equal(api.publicMessage({ status: 400, message: 'Validation' }, 'Fallback'), 'Validation');
    for (const file of ['search', 'booking', 'payment', 'refund', 'travelerProfile', 'notification', 'voucher']) {
      const body = fs.readFileSync(path.join(__dirname, `../controllers/${file}Controller.js`), 'utf8');
      assert.ok(body.includes('.publicMessage('), file);
      assert.ok(!/message:\s*error\.message\s*\|\|/.test(body), file);
    }
    const logger = require('../utils/logger');
    const pem = ['-----BEGIN PRIVATE KEY-----', 'synthetic-only', '-----END PRIVATE KEY-----'].join('\n');
    assert.ok(!logger.format('error', pem, { nested: { privateKey: 'private-key-data' } }).includes('synthetic-only'));
    assert.ok(!logger.format('error', 'failure', { nested: { privateKey: 'private-key-data' } }).includes('private-key-data'));
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
test('actual search controller suppresses internal failures without changing typed validation status', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const status of [undefined, 400, 503]) {
      const failure = Object.assign(new Error(status === 400 ? 'Invalid dates' : 'private-sql-connection'), { status, code: status === 503 ? 'HOTELBEDS_UNAVAILABLE' : 'private-error-code' });
      const context = { module: { exports: {} }, require(name) {
        if (name.endsWith('/searchService')) return { search: async () => { throw failure; } };
        if (name.endsWith('/logger')) return { error() {} };
        if (name.endsWith('/apiResponse')) return require('../utils/apiResponse');
        throw new Error('UNEXPECTED_IMPORT');
      } };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/searchController.js'), 'utf8'), context);
      let body, responseStatus;
      await context.module.exports.search({ query: {} }, { status(value) { responseStatus = value; return this; }, json(value) { body = value; } });
      assert.equal(responseStatus, status || 500);
      if (status === 400) assert.equal(body.message, 'Invalid dates');
      else assert.ok(!JSON.stringify(body).includes('private-'));
      if (status === 503) assert.equal(body.code, 'HOTELBEDS_UNAVAILABLE');
    }
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
test('existing shutdown stops jobs, closes HTTP before pool, remains idempotent and has forced deadline', async () => {
  const events = [], handlers = {}, timers = [];
  let closeCallback;
  const server = { on() {}, close(cb) { events.push('http-close'); closeCallback = cb; }, closeIdleConnections() { events.push('idle-close'); } };
  const app = { set() {}, disable() {}, use() {}, get() {}, listen() { return server; } };
  const express = () => app; express.json = () => () => {};
  const pool = { end: async () => events.push('pool-end') };
  const context = { module: { exports: {} }, process: { env: {}, on: (name, fn) => { handlers[name] = fn; }, exit: code => events.push(`exit-${code}`) },
    setTimeout: fn => { timers.push(fn); return { unref() {} }; }, clearTimeout: () => events.push('timer-cleared'),
    require(name) {
      if (name === 'express') return express;
      if (name === 'cors') return () => () => {};
      if (name === 'dotenv') return { config() {} };
      if (name === './db') return pool;
      if (name.endsWith('/logger')) return { info() {}, error() {} };
      if (name.endsWith('/cors')) return { allowedOrigins: () => [] };
      if (name.endsWith('/lifecycleService')) return { beginShutdown: () => events.push('draining') };
      if (/MonitorService|SchedulerService/.test(name)) return { start() {}, stop: () => events.push('job-stop') };
      if (name.endsWith('/stagingHealth')) return { healthHandler: () => () => {} };
      return () => {};
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), context);
  handlers.SIGTERM(); const first = context.module.exports.shutdown('SIGINT');
  assert.equal(first, context.module.exports.shutdown('SIGTERM'));
  assert.equal(events.filter(e => e === 'http-close').length, 1);
  assert.equal(events.filter(e => e === 'job-stop').length, 4);
  assert.ok(!events.includes('pool-end'));
  await closeCallback(); await first;
  assert.ok(events.indexOf('http-close') < events.indexOf('pool-end'));
  assert.ok(events.includes('timer-cleared')); assert.ok(events.includes('exit-0'));
  timers[0](); assert.ok(events.includes('exit-1'));
});
test('entire suite used no external network or subprocess', () => assert.equal(networkCalls, 0));
