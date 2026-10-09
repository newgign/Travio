// Synthetic identity/attestations for mock runner tests only. Never a real target.
const { connection, sourceIdentity } = require('../../scripts/lib/dbContinuity.cjs');
module.exports = function approvedEnv() {
  const env = { DATABASE_URL: 'postgresql://fixture:fixture@db.example/reconciliation_test', APP_ENV: 'staging', EXPECTED_APP_ENV: 'staging',
    RECONCILIATION_STORAGE_MIGRATION_ENABLED: 'true', RECONCILIATION_MIGRATION_APPROVAL: 'I_APPROVE_021_FOR_VERIFIED_TARGET',
    BACKUP_RESTORE_READY_ATTESTED: 'I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET' };
  env.RECONCILIATION_EXPECTED_DB_IDENTITY = sourceIdentity(connection(env));
  return env;
};
