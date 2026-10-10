// Offline only: no dotenv, pg, application pool, SQL execution or env mutation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { connection, sourceIdentity, migrationInventory } = require('./dbContinuity.cjs');
const { storageMode } = require('../../config/reconciliationStorage');
const migration = '021_reconciliation_storage.sql';
// Normalize checkout line endings; this is source integrity, not a database ledger hash.
const expectedHash = '5c43e366e44b19dacba086e95c41a1610163cceb31cef1691c7c089e64ca3cb6';
function inventoryCheck() {
  const inventory = migrationInventory();
  const files = inventory.migrations;
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../database/migrations', migration), 'utf8').replace(/\r\n/g, '\n');
  const hash = crypto.createHash('sha256').update(sql).digest('hex');
  return files.length === 22 && files.every((file, i) => file.startsWith(String(i + 1).padStart(3, '0') + '_'))
    && files[20] === migration && files[21] === '022_session_security_state.sql' && hash === expectedHash;
}
function disabledChecks(env) {
  let storageSafe = false;
  try { storageSafe = storageMode(env) === 'disabled'; } catch { /* fixed output */ }
  return [
    ['STORAGE_DISABLED', storageSafe],
    ...['PRODUCTION_SALES_ENABLED', 'REAL_CHARGES_ENABLED', 'REAL_REFUNDS_ENABLED', 'HOTELBEDS_BOOKING_ENABLED', 'HOTELBEDS_LIVE_BOOKING_ENABLED'].map(key => [key, env[key] === undefined || env[key] === 'false']),
    ['PAYMENTS_MODE', env.PAYMENTS_MODE === undefined || env.PAYMENTS_MODE === 'disabled'],
    ['PAYMENTS_PROVIDER', env.PAYMENTS_PROVIDER === undefined || env.PAYMENTS_PROVIDER === 'none'],
  ];
}
function preflight(env = process.env) {
  let inventorySafe = false;
  try { inventorySafe = inventoryCheck(); } catch { /* fixed output */ }
  const checks = [['MIGRATION_021_INTEGRITY', inventorySafe], ['EXECUTION_DISABLED', env.RECONCILIATION_STORAGE_MIGRATION_ENABLED === undefined || env.RECONCILIATION_STORAGE_MIGRATION_ENABLED === 'false'], ...disabledChecks(env)]
    .map(([id, ok]) => ({ id, status: ok ? 'PASS' : 'FAIL' }));
  return { status: checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL', scope: 'OFFLINE_ONLY', storage: checks.every(c => c.status === 'PASS') ? 'DISABLED — SAFE' : 'BLOCKED', migration, checks };
}
function assertExecutionAllowed(env = process.env) {
  const reject = () => { throw Object.assign(new Error('Reconciliation migration blocked'), { code: 'RECONCILIATION_MIGRATION_BLOCKED' }); };
  try {
    if (!inventoryCheck() || env.RECONCILIATION_STORAGE_MIGRATION_ENABLED !== 'true' || !disabledChecks(env).every(([, ok]) => ok)) return reject();
    if (!['staging', 'production'].includes(env.APP_ENV) || env.APP_ENV !== env.EXPECTED_APP_ENV) return reject();
    if (env.RECONCILIATION_MIGRATION_APPROVAL !== 'I_APPROVE_021_FOR_VERIFIED_TARGET' || env.BACKUP_RESTORE_READY_ATTESTED !== 'I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET') return reject();
    const identity = sourceIdentity(connection(env));
    if (!/^[a-f0-9]{64}$/.test(env.RECONCILIATION_EXPECTED_DB_IDENTITY || '') || identity !== env.RECONCILIATION_EXPECTED_DB_IDENTITY) return reject();
  } catch { return reject(); }
}
module.exports = { migration, expectedHash, inventoryCheck, preflight, assertExecutionAllowed };
