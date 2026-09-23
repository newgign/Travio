// Operator snapshot contract. No runtime module imports this schema.
module.exports = {
  inheritedSafetyContract: 'preProductionEnvSchema.cjs; APP_ENV is replaced by the explicit 4A target contract',
  REQUIRED_IDENTITY: {
    APP_ENV: 'Exact staging or production; NODE_ENV must remain production.',
    EXPECTED_APP_ENV: 'Independently reviewed deployment target; must equal APP_ENV.',
    RELEASE_SHA: 'Full lowercase 40-hex revision from the reviewed backend build/deployment snapshot.',
    EXPECTED_RELEASE_SHA: 'Independently reviewed full revision; must equal backend and frontend receipt revisions.',
    STAGING_API_URL: 'Explicit public HTTPS /api target, never inferred from hostname labels.',
    PRODUCTION_API_URL: 'Explicit public HTTPS /api target with a distinct hostname.',
    STAGING_WEB_ORIGIN: 'Explicit public HTTPS frontend origin.',
    PRODUCTION_WEB_ORIGIN: 'Explicit public HTTPS frontend origin with a distinct hostname.',
  },
  REQUIRED_OPERATOR_ATTESTATIONS: {
    RELEASE_REVISION_ATTESTED: 'Exact I_VERIFIED_SOURCE_AND_BACKEND_REVISION; compare actual checkout/build/backend revision, not just two copied strings.',
    PRODUCTION_DATABASE_TARGET_ATTESTED: 'Production only: exact I_VERIFIED_SEPARATE_DURABLE_PRODUCTION_DATABASE; distinct from staging, lifecycle/ownership reviewed. No raw identity stored.',
    ROLLBACK_READY_ATTESTED: 'Exact I_VERIFIED_ROLLBACK_AND_DATA_RECOVERY_PLAN; includes compatibility/write boundary and recovery decision.',
    BACKUP_RESTORE_READY_ATTESTED: 'Production only: exact I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET; fresh protected backup and compatible isolated restore evidence.',
  },
  REQUIRED_ROLLBACK: {
    PREVIOUS_RELEASE_SHA: 'Full lowercase 40-hex known-good revision, different from candidate; reviewed compatible recovery landing revision for first deployment.',
  },
  buildReceipt: 'frontend/dist/release.json generated explicitly after build by createFoundationRelease.cjs; environment, revision, API hash and asset digest only.',
  limitations: 'Offline assertions only. No DNS, DB, git or Render lookup; owner acceptance remains required. No sales activation.',
};
