// Source-only preflight and explicit disposable-local runner guard. No DB imports.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const migration = '023_durable_commercial_operations.sql';
const localApproval = 'I_APPROVE_NEW_DISPOSABLE_LOCAL_7X_DATABASES';
const stagingApproval = 'I_APPROVE_023_FOR_VERIFIED_STAGING_TARGET';
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
function stagingPath(env) {
  return env.DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED !== undefined
    || (env.APP_ENV === 'staging' && env.NODE_ENV === 'production'
      && ['RECONCILIATION_STORAGE_MIGRATION_ENABLED','SESSION_SECURITY_MIGRATION_ENABLED'].every(k=>env[k]===undefined||env[k]==='false'));
}
function assertStagingConfiguration(env) {
  try {
    const flag=env.DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED;
    if(env.APP_ENV!=='staging'||env.EXPECTED_APP_ENV!=='staging'||env.NODE_ENV!=='production'
      || ![undefined,'false','true'].includes(flag)||env.LOCAL_COMMERCIAL_MIGRATION_APPROVAL!==undefined
      || !inventoryCheck() || !safeFlags({...env,SESSION_STATE_ENFORCEMENT:'disabled'})
      || !['disabled','enabled'].includes(require('../../config/sessionSecurity').enforcementMode(env))
      || ['RECONCILIATION_STORAGE_MIGRATION_ENABLED','SESSION_SECURITY_MIGRATION_ENABLED'].some(k=>env[k]!==undefined&&env[k]!=='false')
      || env.BACKUP_RESTORE_READY_ATTESTED!=='I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET'
      || !/^[a-f0-9]{64}$/.test(env.RECONCILIATION_EXPECTED_DB_IDENTITY||'')
      || env.DURABLE_COMMERCIAL_OPERATIONS_EXPECTED_DB_IDENTITY!==env.RECONCILIATION_EXPECTED_DB_IDENTITY
      || env.NODE_TLS_REJECT_UNAUTHORIZED==='0'
      || (flag==='true'&&env.DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL!==stagingApproval))return fail();
    const continuity=require('./dbContinuity.cjs');
    const target=env.DB_SSL_MODE==='require'?require('../../config/renderInternalTls.cjs').approvedTarget(env):continuity.connection(env);
    if(target.local||!['require','verify-full'].includes(target.sslMode)||/prod|live/i.test(target.host+' '+target.database)
      || continuity.sourceIdentity(target)!==env.RECONCILIATION_EXPECTED_DB_IDENTITY)return fail();
    // Reuse the runtime TLS parser, including CA readability and URL override protection.
    return require('../../config/database').databaseConfig(env);
  }catch{return fail();}
}
function assertStagingPool(pool,config) {
  // Never permit an injected pool to override the identity/TLS contract validated above.
  const options=pool?.options;
  if(!options||options.connectionString!==config.connectionString||!options.ssl
    || options.ssl.rejectUnauthorized!==config.ssl.rejectUnauthorized||options.ssl.ca!==config.ssl.ca
    || ['host','port','database','user','password'].some(k=>options[k]!==undefined))return fail();
}
function assertStagingLedger(names,env,files) {
  const expected=fs.readdirSync(migrationDir).filter(f=>f.endsWith('.sql')).sort();
  if(!inventoryCheck()||!Array.isArray(files)||JSON.stringify(files)!==JSON.stringify(expected)
    || !Array.isArray(names)||![22,23].includes(names.length)
    || names.some((name,i)=>name!==expected[i])||new Set(names).size!==names.length)return fail();
  if(names.length===22&&env.DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED!=='true')return fail();
  return names.length===22;
}
function preflight(env = process.env) {
  if(env.DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED==='true') {
    let allowed=false;try{assertStagingConfiguration(env);allowed=true;}catch{/* fixed diagnostics only */}
    return {status:allowed?'PASS':'FAIL',scope:'OFFLINE_ONLY',migration,executionAllowed:false,
      stagingConfigurationValid:allowed,pendingState:'NOT_QUERIED',checks:[{id:'STAGING_023_AUTHORIZATION',status:allowed?'PASS':'FAIL'}]};
  }
  let intact = false; try { intact = inventoryCheck(); } catch { /* fixed diagnostics */ }
  const checks = [['ORDERED_001_023_INTEGRITY',intact],['COMMERCIAL_FLAGS_DISABLED',safeFlags(env)],
    ['LOCAL_EXECUTION_OPT_IN_ABSENT',env.LOCAL_COMMERCIAL_MIGRATION_APPROVAL === undefined],
    ['MIGRATION_EXECUTION_DISABLED',['RECONCILIATION_STORAGE_MIGRATION_ENABLED','SESSION_SECURITY_MIGRATION_ENABLED','DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED'].every(k => env[k] === undefined || env[k] === 'false')]]
    .map(([id,ok]) => ({id,status:ok?'PASS':'FAIL'}));
  return {status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',scope:'OFFLINE_ONLY',migration,executionAllowed:false,checks};
}
module.exports = {migration,localApproval,stagingApproval,expectedHash,inventoryCheck,localTarget,safeFlags,assertLocalExecutionAllowed,
  stagingPath,assertStagingConfiguration,assertStagingPool,assertStagingLedger,preflight};
