# Sprint 7M.3B.1 — Backup Target Binding Hardening

CODE / OFFLINE: PASS. BACKUP TARGET BINDING: READY / PASS. Backup-only require path HARDENED. General staging identity verify-full invariant PRESERVED.

2026-10-10, Asia/Qyzylorda; develop; HEAD `e372000 docs: record Sprint 7M.3B staging prerequisite blocker`, previous f661c3e/d52a1ca. Tracked tree clean at start, known unrelated untracked owner files preserved. Owner reports strict staging identity previously verified and migrations 001..021 applied/022 pending; no remote check in this sprint.

## Change and semantics

Only the existing DB_SSL_MODE=require branch of backup() changed. After existing exact acknowledgement and strict connection parsing, before even pg_dump --version, directory/file/partial creation or any DB operation, require: non-local connection; APP_ENV=staging; EXPECTED_APP_ENV=staging; RECONCILIATION_EXPECTED_DB_IDENTITY valid lowercase 64-hex; sourceIdentity(conn) exactly matches it. Uses existing helper, no duplicated fingerprint algorithm. Rejection code SOURCE_TLS_REQUIRE_BLOCKED. Existing DB_ALLOW_TLS_REQUIRE=I_ACKNOWLEDGE_ENCRYPTED_WITHOUT_CERTIFICATE_IDENTITY_VERIFICATION remains mandatory. No defaults/flags enabled.

TLS encryption: YES. Certificate identity verification in backup require path: NO. Configured target binding to previously independently verified source fingerprint: YES. Binding is not equivalent to TLS certificate verification and does not independently establish a target as staging. Owner must retain the independently confirmed fingerprint; self-generating an expected fingerprint from an unverified connection is insufficient provenance.

DB_SSL_CA_PATH is not required in require mode. Provided CA is not silently ignored: existing PGSSLROOTCERT forwarding retained and tested. General verify-full CA behavior unchanged. Staging identity/inventory, general remote continuity and restore still reject require. Verify-full backup behavior unchanged, including no new mandatory binding flag on that separate existing path. No migration guard or application runtime source changed.

## Tests

One final affected-suite invocation: **69/69 PASS**, zero skipped/cancelled. Focused new backupTargetBinding: **15/15 PASS**. Adjacent databaseContinuity + preMigrationBackupIdentity: **54/54 PASS**. No preliminary failed runs. Existing require-mode successful fixture gains staging classification and matching synthetic fingerprint; existing security assertions retained.

Ten negative cases cover missing/wrong acknowledgement, missing/wrong staging classification, wrong expected environment, missing/malformed/wrong fingerprint, changed target and local target. Each proves nonzero safe result, subprocess count 0, output directory absent, output file/partial counts 0 and no credential leakage. Positive cases reach only injected mocked pg_dump, verify manifest sourceIdentitySha256 matches expected fingerprint, check require/no-CA and provided-CA forwarding. Additional cases preserve general connection/restore rejection, staging inventory rejection before client construction, verify-full acceptance and unchanged verify-full backup behavior.

All artifacts synthetic PGDMP stubs/pg_restore text in owned temporary unit directories, deleted after tests. They are not genuine backup/restore evidence. HTTP/TCP/fetch/pg methods and real subprocess entrypoint trapped; injected executor writes fixture bytes only. Offline preload reports blocked PostgreSQL attempts 0. Real pg_dump executions 0; real backup executions 0; DB connections/queries 0; migration executions 0; network operations 0; PSP/Hotelbeds calls 0. No application startup or provider calls.

Full backend NOT RUN: application runtime unchanged; operator-only branch covered by affected suites once. No 7M.2 integration execution because it would execute SQL migrations outside this offline sprint. Release checks each run once: verifier PASS; 6A PASS; 021 preflight PASS DISABLED/SAFE; 022 preflight PASS execution/enforcement disabled; diff-check PASS.

## Exact files and remaining prerequisite

Modified:
- backend/scripts/lib/dbContinuity.cjs
- backend/tests/databaseContinuity.test.cjs
- SPRINT_7M3B_STAGING_BACKUP_PREREQUISITES_REPORT.md
- SPRINT_7M3_STAGING_SESSION_SECURITY_ROLLOUT_REPORT.md

New:
- backend/tests/backupTargetBinding.test.cjs
- SPRINT_7M3B1_BACKUP_TARGET_BINDING_HARDENING_REPORT.md

Fresh staging backup NOT RUN / NOT YET CREATED. 7M.3 Phase A migration BLOCKED UNTIL BACKUP VERIFIED; staging acceptance OPEN. Staging/production DB touched NO. No env files, Render settings/build command, dependencies, deployment or enforcement activation. No git add/commit/push/reset/clean. All work unstaged, unrelated owner files preserved.

Evidence: .tmp/sprint7m3b1-focused.log, .tmp/sprint7m3b1-verifier.log, .tmp/sprint7m3b1-6a.log, .tmp/sprint7m3b1-021-preflight.log, .tmp/sprint7m3b1-022-preflight.log.
