// Explicit opt-in only. Creates and removes only its own disposable Docker container.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { connection, sourceIdentity } = require('../scripts/lib/dbContinuity.cjs');
const guard = require('../scripts/lib/sessionSecurityMigrationGuard.cjs');
const { migrate } = require('../scripts/migrate');

test('disposable local PostgreSQL session security proof', { skip: process.env.RUN_LOCAL_SESSION_INTEGRATION !== '1', timeout: 120000 }, async t => {
  const name = 'asedeliya_session_security_test_' + crypto.randomBytes(6).toString('hex');
  const database = 'asedeliya_session_security_test';
  const password = crypto.randomBytes(24).toString('hex');
  const secret = crypto.randomBytes(32).toString('hex');
  const docker = args => {
    try { return execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000,
      env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
    catch { throw new Error('LOCAL_DOCKER_OPERATION_FAILED'); }
  };
  let created = false, pool, httpServer;
  const savedEnv = { ...process.env };
  const dbPath = require.resolve('../db');
  const savedDb = require.cache[dbPath];
  try {
    docker(['run', '--detach', '--pull=never', '--name', name, '--label', 'asedeliya.sprint=7m2',
      '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB=' + database, 'postgres:16']);
    created = true;
    const binding = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', name]))['5432/tcp'];
    assert.equal(binding.length, 1); assert.equal(binding[0].HostIp, '127.0.0.1');
    const port = Number(binding[0].HostPort);
    assert.ok(Number.isInteger(port) && port > 0);
    // No inherited DB URL, dotenv or application startup. Target constructed only from our container binding.
    const env = { NODE_ENV: 'test', APP_ENV: 'test', EXPECTED_APP_ENV: 'test', DB_SSL_MODE: 'disable',
      DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`,
      LOCAL_SESSION_INTEGRATION_APPROVAL: 'I_APPROVE_DISPOSABLE_LOCAL_021_022',
      RECONCILIATION_STORAGE_MIGRATION_ENABLED: 'true', SESSION_SECURITY_MIGRATION_ENABLED: 'true',
      SESSION_SECURITY_MIGRATION_APPROVAL: 'I_APPROVE_022_WITH_ORDERED_PENDING_MIGRATIONS' };
    const target = connection(env); assert.equal(target.local, true);
    env.RECONCILIATION_EXPECTED_DB_IDENTITY = env.SESSION_SECURITY_EXPECTED_DB_IDENTITY = sourceIdentity(target);
    pool = new Pool({ host: target.host, port, database, user: 'postgres', password, ssl: false,
      connectionTimeoutMillis: 3000, statement_timeout: 10000 });
    // Bounded readiness wait for the disposable DB, never application retry logic.
    for (let attempt = 0; ; attempt++) {
      try { if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', database]).includes('accepting connections')) break; }
      catch { if (attempt >= 20) throw new Error('LOCAL_POSTGRES_NOT_READY'); }
      if (attempt >= 20) throw new Error('LOCAL_POSTGRES_NOT_READY');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    // Block every outbound Node socket except the proven loopback PostgreSQL binding.
    const socket = require('node:net').Socket.prototype;
    const originalConnect = socket.connect;
    const allowedPorts = new Set([port]);
    let remoteAttempts = 0;
    t.mock.method(socket, 'connect', function (...args) {
      const options = Array.isArray(args[0]) ? args[0][0]
        : typeof args[0] === 'number' ? { port: args[0], host: args[1] } : args[0];
      if (!options || typeof options !== 'object' || options.host !== '127.0.0.1' || !allowedPorts.has(Number(options.port))) {
        remoteAttempts++; throw new Error('NONLOCAL_SOCKET_FORBIDDEN');
      }
      return originalConnect.apply(this, args);
    });
    const runner = hook => migrate({ connect: async () => {
      const client = await pool.connect();
      return { query: async (sql, values) => { if (hook) await hook(sql, values, client); return client.query(sql, values); }, release: () => client.release() };
    }, end: async () => {} }, env);
    await t.test('local approval rejects remote hosts, wrong database, mode and identity before connecting', () => {
      assert.equal(guard.inventoryCheck(), true); guard.assertExecutionAllowed(env);
      for (const overrides of [{ NODE_ENV: 'production' }, { APP_ENV: 'staging' },
        { DATABASE_URL: 'postgresql://test:test@remote.invalid/asedeliya_session_security_test' },
        { DATABASE_URL: `postgresql://postgres:test@127.0.0.1:${port}/unrelated` },
        { RECONCILIATION_EXPECTED_DB_IDENTITY: '0'.repeat(64) }, { LOCAL_SESSION_INTEGRATION_APPROVAL: undefined }]) {
        assert.throws(() => guard.assertExecutionAllowed({ ...env, ...overrides }));
      }
    });
    await t.test('actual runner builds normal 001 through 020 baseline', async () => {
      await assert.rejects(runner((sql, values) => {
        if (sql === 'SELECT 1 FROM _migrations WHERE name = $1' && values[0].startsWith('021_')) throw Error('BASELINE_BOUNDARY');
      }), /BASELINE_BOUNDARY/);
      assert.equal(Number((await pool.query('SELECT count(*) FROM _migrations')).rows[0].count), 20);
      assert.equal((await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='session_version'")).rows.length, 0);
    });
    const oldPassword = 'synthetic-local-password-123';
    const newPassword = 'synthetic-new-password-456';
    const hash = await bcrypt.hash(oldPassword, 12);
    const user = (await pool.query('INSERT INTO users (full_name,email,password,role) VALUES ($1,$2,$3,$4) RETURNING id',
      ['Local Integration', 'session@example.test', hash, 'admin'])).rows[0];
    await t.test('runner transaction rolls back actual 022 SQL on injected ledger failure', async () => {
      await assert.rejects(runner((sql, values) => {
        if (sql === 'INSERT INTO _migrations (name) VALUES ($1)' && values[0].startsWith('022_')) throw Error('INJECTED_LEDGER_FAILURE');
      }), /INJECTED_LEDGER_FAILURE/);
      assert.equal((await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name IN ('session_version','is_active')")).rows.length, 0);
      assert.equal((await pool.query("SELECT name FROM _migrations WHERE name LIKE '022_%'")).rows.length, 0);
    });
    await t.test('021 then 022 committed in runner ledger and reconciliation schema exists', async () => {
      await runner();
      const names = (await pool.query('SELECT name FROM _migrations ORDER BY id')).rows.map(row => row.name);
      assert.equal(names.length, 22); assert.match(names[20], /^021_/); assert.match(names[21], /^022_/);
      const tables = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('reconciliation_cases','reconciliation_observations')")).rows;
      assert.equal(tables.length, 2);
      const indexes = (await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('reconciliation_observations_history_idx','reconciliation_cases_queue_idx','reconciliation_cases_status_idx','reconciliation_cases_category_idx')")).rows;
      assert.equal(indexes.length, 4);
      const fk = (await pool.query("SELECT convalidated FROM pg_constraint WHERE conname='reconciliation_observations_correlation_fk' AND contype='f'")).rows;
      assert.equal(fk.length, 1); assert.equal(fk[0].convalidated, true);
    });
    await t.test('existing user backfilled without data loss; NOT NULL defaults and positive constraint enforced', async () => {
      const row = (await pool.query('SELECT * FROM users WHERE id=$1', [user.id])).rows[0];
      assert.equal(row.session_version, 1); assert.equal(row.is_active, true); assert.equal(row.password, hash); assert.equal(row.full_name, 'Local Integration');
      const cols = (await pool.query("SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_name='users' AND column_name IN ('session_version','is_active')")).rows;
      assert.equal(cols.length, 2); assert.ok(cols.every(c => c.is_nullable === 'NO'));
      assert.match(cols.find(c => c.column_name === 'session_version').column_default, /^1$/);
      assert.equal(cols.find(c => c.column_name === 'is_active').column_default, 'true');
      const fresh = (await pool.query('INSERT INTO users (full_name,email,password) VALUES ($1,$2,$3) RETURNING session_version,is_active',
        ['Local Defaults', 'defaults@example.test', hash])).rows[0];
      assert.deepEqual(fresh, { session_version: 1, is_active: true });
      for (const [column, value] of [['session_version', 0], ['session_version', null], ['is_active', null]])
        await assert.rejects(pool.query(`UPDATE users SET ${column}=$1 WHERE id=$2`, [value, user.id]), e => ['23502', '23514'].includes(e.code));
    });
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
    process.env.JWT_SECRET = secret; process.env.SESSION_STATE_ENFORCEMENT = 'enabled'; process.env.NODE_ENV = 'production';
    const auth = require('../middleware/authMiddleware');
    const requireRole = require('../middleware/requireRole');
    const app = require('express')();
    app.use(require('express').json());
    app.use('/api/auth', require('../routes/auth'));
    app.get('/local-test/admin', auth, requireRole('admin'), (req, res) => res.json({ allowed: true }));
    httpServer = require('node:http').createServer(app);
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const httpPort = httpServer.address().port; allowedPorts.add(httpPort);
    const httpRequest = (method, path, token, body) => new Promise((resolve, reject) => {
      const request = require('node:http').request({ host: '127.0.0.1', port: httpPort, path, method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, agent: false }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
        res.on('end', () => { try { resolve({ statusCode: res.statusCode, body: JSON.parse(text) }); } catch { reject(Error('LOCAL_HTTP_RESPONSE_INVALID')); } });
      });
      request.setTimeout(3000, () => request.destroy(Error('LOCAL_HTTP_TIMEOUT')));
      request.on('error', reject); request.end(body ? JSON.stringify(body) : undefined);
    });
    const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
    const login = passwordValue => httpRequest('POST', '/api/auth/login', null, { email: 'session@example.test', password: passwordValue });
    const protectedRequest = async (token, admin = false) => {
      const req = { get: () => 'Bearer ' + token }, res = response(); let allowed = false;
      await auth(req, res, () => { if (admin) requireRole('admin')(req, res, () => { allowed = true; }); else allowed = true; });
      return { req, res, allowed };
    };
    let tokenA, tokenB;
    await t.test('active login signs current database version and role', async () => {
      const res = await login(oldPassword); assert.equal(res.statusCode, 200); tokenA = res.body.token;
      const claims = jwt.verify(tokenA, secret); assert.equal(claims.sessionVersion, 1); assert.equal(claims.role, 'admin');
    });
    await t.test('current session passes actual auth and admin middleware with real lookup', async () => {
      assert.equal((await protectedRequest(tokenA, true)).allowed, true);
      assert.equal((await httpRequest('GET', '/api/auth/profile', tokenA)).statusCode, 200);
      assert.equal((await httpRequest('GET', '/local-test/admin', tokenA)).statusCode, 200);
    });
    const change = async currentPassword => {
      const checked = await protectedRequest(tokenA); assert.equal(checked.allowed, true);
      return httpRequest('PUT', '/api/auth/password', tokenA, { currentPassword, newPassword });
    };
    await t.test('failed password change does not increment version', async () => {
      assert.equal((await change('incorrect-password')).statusCode, 400);
      assert.equal((await pool.query('SELECT session_version FROM users WHERE id=$1', [user.id])).rows[0].session_version, 1);
    });
    await t.test('password change atomically bumps version and rejects old JWT', async () => {
      assert.equal((await change(oldPassword)).statusCode, 200);
      const row = (await pool.query('SELECT session_version,password FROM users WHERE id=$1', [user.id])).rows[0];
      assert.equal(row.session_version, 2); assert.equal(await bcrypt.compare(newPassword, row.password), true);
      assert.equal((await protectedRequest(tokenA)).res.statusCode, 401);
      assert.equal((await httpRequest('GET', '/api/auth/profile', tokenA)).statusCode, 401);
    });
    await t.test('new password login produces accepted current session', async () => {
      const res = await login(newPassword); assert.equal(res.statusCode, 200); tokenB = res.body.token;
      assert.equal(jwt.verify(tokenB, secret).sessionVersion, 2); assert.equal((await protectedRequest(tokenB)).allowed, true);
      assert.equal((await httpRequest('GET', '/api/auth/profile', tokenB)).statusCode, 200);
    });
    await t.test('controlled local demotion denies old admin JWT using current role', async () => {
      await pool.query("UPDATE users SET role='user' WHERE id=$1", [user.id]);
      const result = await protectedRequest(tokenB, true); assert.equal(result.allowed, false); assert.equal(result.res.statusCode, 403);
      assert.equal((await httpRequest('GET', '/local-test/admin', tokenB)).statusCode, 403);
    });
    await t.test('inactive account denies existing JWT and new login', async () => {
      await pool.query('UPDATE users SET is_active=false WHERE id=$1', [user.id]);
      assert.equal((await protectedRequest(tokenB)).res.statusCode, 401); assert.equal((await login(newPassword)).statusCode, 401);
      await pool.query('UPDATE users SET is_active=true WHERE id=$1', [user.id]);
    });
    await t.test('legacy JWT rejected enabled; disabled preserves documented compatibility', async () => {
      const legacy = jwt.sign({ id: user.id, role: 'user' }, secret, { expiresIn: '1h' });
      assert.equal((await protectedRequest(legacy)).res.statusCode, 401);
      process.env.SESSION_STATE_ENFORCEMENT = 'disabled';
      try { assert.equal((await protectedRequest(legacy)).allowed, true); }
      finally { process.env.SESSION_STATE_ENFORCEMENT = 'enabled'; }
    });
    await t.test('real database lookup failure fails closed without SQL, stack or credentials', async () => {
      await pool.query('ALTER TABLE users RENAME TO users_lookup_unavailable');
      try {
        const result = await protectedRequest(tokenB); assert.equal(result.allowed, false); assert.equal(result.res.statusCode, 503);
        assert.deepEqual(result.res.body, { code: 'ACCOUNT_SECURITY_STATE_UNAVAILABLE' });
        const httpResult = await httpRequest('GET', '/api/auth/profile', tokenB);
        assert.equal(httpResult.statusCode, 503); assert.deepEqual(httpResult.body, { code: 'ACCOUNT_SECURITY_STATE_UNAVAILABLE' });
      } finally { await pool.query('ALTER TABLE users_lookup_unavailable RENAME TO users'); }
    });
    await t.test('deleted account old JWT denied', async () => {
      await pool.query('DELETE FROM users WHERE id=$1', [user.id]);
      assert.equal((await protectedRequest(tokenB)).res.statusCode, 401);
    });
    await t.test('runner rerun skips all applied migrations without changing ledger', async () => {
      const before = (await pool.query('SELECT * FROM _migrations ORDER BY id')).rows;
      await runner(); assert.deepEqual((await pool.query('SELECT * FROM _migrations ORDER BY id')).rows, before);
    });
    await t.test('reconciliation remains disabled and no remote sockets attempted', () => {
      assert.equal(require('../config/reconciliationStorage').storageMode({}), 'disabled');
      assert.equal(remoteAttempts, 0);
    });
    console.log('LOCAL_SESSION_PROOF: loopback only; remote DB=0; external Node sockets=0; 021->022; rollback verified');
  } finally {
    if (httpServer) await new Promise(resolve => httpServer.close(resolve));
    if (pool) await pool.end();
    if (savedDb) require.cache[dbPath] = savedDb; else delete require.cache[dbPath];
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    if (created) {
      docker(['rm', '--force', '--volumes', name]);
      assert.equal(docker(['ps', '--all', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}']), '');
      console.log('LOCAL_SESSION_CLEANUP: own container and anonymous volume removed; no matching container remains');
    }
  }
});
