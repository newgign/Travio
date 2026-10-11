// Source-only preflight and explicit disposable-local runner guard. No DB imports.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const migration = '023_durable_commercial_operations.sql';
const localApproval = 'I_APPROVE_NEW_DISPOSABLE_LOCAL_7X_DATABASES';
const migrationDir = path.resolve(__dirname, '../../../database/migrations');
const expectedHash = "598363a7bca38ecd18e40afabf042fe1b727aa022a2ccd4387cd71dc2d1f45f5";
const fail = () => { throw Object.assign(new Error('Durable commercial migration blocked'), { code: 'DURABLE_COMMERCIAL_MIGRATION_BLOCKED' }); };
function inventoryCheck() {
  const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();
  const sql = fs.readFileSync(path.join(migrationDir,migration),'utf8').replace(/\r\n/g,'\n');
  return files.length === 23 && files.every((f,i) => f.startsWith(String(i+1).padStart(3,'0')+'_'))
    && files[22] === migration && crypto.createHash('sha256').update(sql).digest('hex') === expectedHash
    && require('./sessionSecurityMigrationGuard.cjs').inventoryCheck();
}
function safeFlags(env) {
  return ['PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED']
    .every(k => env[k] === undefined || env[k] === 'false')
    && (env.PAYMENTS_MODE === undefined || env.PAYMENTS_MODE === 'disabled')
    && (env.PAYMENTS_PROVIDER === undefined || env.PAYMENTS_PROVIDER === 'none')
    && (env.RECONCILIATION_STORAGE_MODE === undefined || env.RECONCILIATION_STORAGE_MODE === 'disabled')
    && (env.SESSION_STATE_ENFORCEMENT === undefined || env.SESSION_STATE_ENFORCEMENT === 'disabled');
}
function localTarget(env) {
  try {
    const target = new URL(env.DATABASE_URL);
    if (!['postgres:','postgresql:'].includes(target.protocol) || !['localhost','127.0.0.1','[::1]'].includes(target.hostname)
      || target.search || target.hash || !/^\/asedeliya_7x_(upgrade|fresh)_[a-f0-9]{12}$/.test(target.pathname)
      || env.DB_SSL_MODE !== 'disable') return fail();
    return { host: target.hostname.replace(/^\[|\]$/g,''), port: Number(target.port || 5432), database: target.pathname.slice(1) };
  } catch { return fail(); }
}
function assertLocalExecutionAllowed(env = process.env, pool) {
  if (env.LOCAL_COMMERCIAL_MIGRATION_APPROVAL !== localApproval || env.NODE_ENV !== 'test'
    || env.APP_ENV !== 'test' || env.EXPECTED_APP_ENV !== 'test' || !safeFlags(env) || !inventoryCheck()) return fail();
  const target = localTarget(env);
  // Explicit injected local pool only; cannot silently load an owner's ambient application pool.
  if (!pool || !pool.options || pool.options.host !== target.host || Number(pool.options.port || 5432) !== target.port
    || pool.options.database !== target.database || pool.options.connectionString || pool.options.ssl) return fail();
  return target;
}
function preflight(env = process.env) {
  let intact = false; try { intact = inventoryCheck(); } catch { /* fixed diagnostics */ }
  const checks = [['ORDERED_001_023_INTEGRITY',intact],['COMMERCIAL_FLAGS_DISABLED',safeFlags(env)],
    ['LOCAL_EXECUTION_OPT_IN_ABSENT',env.LOCAL_COMMERCIAL_MIGRATION_APPROVAL === undefined],
    ['MIGRATION_EXECUTION_DISABLED',['RECONCILIATION_STORAGE_MIGRATION_ENABLED','SESSION_SECURITY_MIGRATION_ENABLED','DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED'].every(k => env[k] === undefined || env[k] === 'false')]]
    .map(([id,ok]) => ({id,status:ok?'PASS':'FAIL'}));
  return {status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',scope:'OFFLINE_ONLY',migration,executionAllowed:false,checks};
}
module.exports = {migration,localApproval,expectedHash,inventoryCheck,localTarget,safeFlags,assertLocalExecutionAllowed,preflight};
