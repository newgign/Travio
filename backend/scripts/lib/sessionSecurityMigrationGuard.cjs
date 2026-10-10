// Offline guards only. No dotenv, pg, DB connection or migration execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const reconciliation = require('./reconciliationMigrationGuard.cjs');
const { enforcementMode } = require('../../config/sessionSecurity');
const migration = '022_session_security_state.sql';
const expectedHash = 'fca5715f9fca7b23efb4b55e7775d6a4b65221871b0c4472443bfc3d9611086d';
function inventoryCheck() {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../database/migrations', migration), 'utf8').replace(/\r\n/g, '\n');
  return reconciliation.inventoryCheck() && crypto.createHash('sha256').update(sql).digest('hex') === expectedHash;
}
function rolloutDisabled(env) {
  try { return enforcementMode(env) === 'disabled'; } catch { return false; }
}
function preflight(env = process.env) {
  let intact = false;
  try { intact = inventoryCheck(); } catch { /* fixed result only */ }
  const checks = [
    { id: 'ORDERED_021_022_INTEGRITY', status: intact ? 'PASS' : 'FAIL' },
    { id: 'EXECUTION_DISABLED', status: env.SESSION_SECURITY_MIGRATION_ENABLED === undefined || env.SESSION_SECURITY_MIGRATION_ENABLED === 'false' ? 'PASS' : 'FAIL' },
    { id: 'ENFORCEMENT_DISABLED', status: rolloutDisabled(env) ? 'PASS' : 'FAIL' },
    { id: 'RECONCILIATION_PREFLIGHT', status: reconciliation.preflight(env).status },
  ];
  return { status: checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL', scope: 'OFFLINE_ONLY', migration,
    executionAllowed: false, enforcementActive: false, checks };
}
function assertExecutionAllowed(env = process.env) {
  // General runner applies the entire pending set. Existing 021 approvals remain mandatory.
  reconciliation.assertExecutionAllowed(env);
  const reject = () => { throw Object.assign(new Error('Session security migration blocked'), { code: 'SESSION_SECURITY_MIGRATION_BLOCKED' }); };
  try {
    if (!inventoryCheck() || !rolloutDisabled(env) || env.SESSION_SECURITY_MIGRATION_ENABLED !== 'true'
      || env.SESSION_SECURITY_MIGRATION_APPROVAL !== 'I_APPROVE_022_WITH_ORDERED_PENDING_MIGRATIONS'
      || env.SESSION_SECURITY_EXPECTED_DB_IDENTITY !== env.RECONCILIATION_EXPECTED_DB_IDENTITY) return reject();
  } catch { return reject(); }
}
module.exports = { migration, expectedHash, inventoryCheck, preflight, assertExecutionAllowed };
