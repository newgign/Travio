const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
let child, address, logs = '', stderr = '', exitPromise;
function message(type, action) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(Error('CHILD_MESSAGE_TIMEOUT ' + stderr)); }, 10000);
    const receive = value => { if (value.type === type) { cleanup(); resolve(value); } };
    const exited = code => { cleanup(); reject(Error('CHILD_EXIT ' + code + ' ' + stderr)); };
    function cleanup() { clearTimeout(timer); child.off('message', receive); child.off('exit', exited); }
    child.on('message', receive); child.once('exit', exited); action?.();
  });
}
const stats = () => message('stats', () => child.send('stats'));
before(async () => {
  child = fork(path.resolve(__dirname, 'helpers/startupHealthChild.cjs'), [], { silent: true, execArgv: [], env: { ...process.env,
    NODE_ENV: 'production', PORT: '10000', DOTENV_CONFIG_QUIET: 'true',
    HEALTH_MONITOR_ENABLED: 'false', RELIABILITY_MONITOR_ENABLED: 'false', DB_BACKUP_AUTO_ENABLED: 'false', HOT_DEALS_MONITOR_ENABLED: 'false',
    HOTELBEDS_ENABLED: 'false', HOTELBEDS_BOOKING_ENABLED: 'false', HOTELBEDS_LIVE_BOOKING_ENABLED: 'false',
    PAYMENTS_MODE: 'disabled', PAYMENTS_PROVIDER: 'none', RECONCILIATION_STORAGE_MODE: 'disabled', RECONCILIATION_STORAGE_MIGRATION_ENABLED: 'false',
    HTTP_ACCESS_LOG: 'false', SYSTEM_SLOW_REQUEST_MS: '100',
  } });
  exitPromise = new Promise(resolve => child.once('exit', resolve));
  child.stdout.on('data', value => { logs += value; }); child.stderr.on('data', value => { stderr += value; });
  address = await message('listening');
});
after(async () => {
  if (!child || child.exitCode !== null) return;
  const timer = setTimeout(() => child.kill(), 5000);
  child.send('stop'); await exitPromise; clearTimeout(timer);
});
const request = (route, headers = {}) => fetch('http://127.0.0.1:10000' + route, { headers, signal: AbortSignal.timeout(3000) });
test('actual production server binds env PORT10000 on 0.0.0.0', () => { assert.deepEqual(address.address, { address: '0.0.0.0', family: 'IPv4', port: 10000 }); assert.equal(address.queries, 0); assert.equal(address.connects, 0); });
test('startup log is emitted after actual listening callback', async () => { await new Promise(resolve => setImmediate(resolve)); assert.match(logs, /Server started on port 10000/); });
test('unauthenticated process health promptly returns200 without mock DB call', async () => { const before = await stats(), started = Date.now(); const res = await request('/health'); assert.equal(res.status, 200); assert.deepEqual(await res.json(), { status: 'ok' }); assert.ok(Date.now() - started < 3000); assert.deepEqual(await stats(), before); });
test('health accepts missing auth request ID and unexpected Host', async () => { for (const headers of [{}, { Host: 'internal-probe.invalid', 'x-request-id': 'odd request text' }, { Authorization: 'Bearer invalid' }]) { const res = await request('/health', headers); assert.equal(res.status, 200); await res.text(); } });
test('health bypasses CORS body parsing and DB-backed telemetry but keeps headers', async () => { const before = await stats(); const res = await request('/health', { Origin: 'https://unapproved.invalid', 'x-request-id': 'private@example.invalid' }); assert.equal(res.status, 200); assert.equal(res.headers.get('x-content-type-options'), 'nosniff'); assert.equal(res.headers.get('x-frame-options'), 'DENY'); assert.equal(res.headers.get('x-request-id'), null); await res.text(); assert.deepEqual(await stats(), before); });
test('repeated health probes do not generate dependency calls', async () => { const before = await stats(); for (let i = 0; i < 20; i++) { const res = await request('/health'); assert.equal(res.status, 200); await res.text(); } assert.deepEqual(await stats(), before); });
test('API process live remains unauthenticated', async () => { const res = await request('/api/health/live'); assert.equal(res.status, 200); assert.equal((await res.json()).status, 'ok'); });
test('readiness truthfully fails503 for mocked unavailable DB', async () => { const before = await stats(); const res = await request('/api/health/ready'); assert.equal(res.status, 503); const body = await res.json(); assert.equal(body.database.ok, false); assert.equal(body.status, 'not_ready'); assert.doesNotMatch(JSON.stringify(body), /OFFLINE_DATABASE|stack|SELECT/); assert.ok((await stats()).queries > before.queries); });
test('protected admin API still rejects unauthenticated requests', async () => { const res = await request('/api/admin/reconciliation'); assert.equal(res.status, 401); await res.text(); });
test('health remains200 after readiness failure and incurs zero further DB calls', async () => { const before = await stats(); const res = await request('/health'); assert.equal(res.status, 200); await res.text(); assert.deepEqual(await stats(), before); assert.equal((await stats()).connects, 0); });
