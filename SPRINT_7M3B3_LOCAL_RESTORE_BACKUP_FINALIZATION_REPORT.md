# Sprint 7M.3B.3 — Local Restore Proof & Offline Backup Finalization

OFFLINE / LOCAL: PASS. ARCHIVE VERIFY PASS. LOCAL RESTORE PROOF PASS. FINALIZATION PASS. FINAL BACKUP VERIFY PASS. 7M.3 Phase A READY FOR OWNER APPROVAL; no migration approval or execution performed here.

## Baseline and archive

develop; HEAD 96b5ae1 docs: record Sprint 7M.3B.2 archive verification fix, previous 4be455c/ee59602. Tracked tree clean at start; 7M.3B.2 committed. Existing unrelated untracked owner files preserved. No git add/commit/push/reset/clean/deploy.

Input: backend/backups/postgres/asedeliya-20261010T072810544Z.dump.partial, 1019958 bytes. Original/offline-proof/final SHA-256 equal: c35d01b085e575c4014e4f094bfbe406166fe0630afed7d9acb9e70731f917dd. No archive byte mutation or pg_dump rerun. Owner supplied previously independently verified source fingerprint b04cecdc7a19b4a6714127da609381378c12066d8b28c6dfb0b470193201181f; current process had no source connection/fingerprint. No remote connection used to derive or verify it. Source TLS mode require preserved from the supplied backup workflow; pg_dump version 18.4 derived from archive header; creation timestamp derived from original archive basename.

## Local restore evidence

New dbBackupLocalRestoreProof.cjs re-verifies archive before restore, creates uniquely named PostgreSQL 18 container/database/network, validates actual Docker published binding is only 127.0.0.1, constructs only that local target (never inherited DATABASE_URL), verifies empty target, then invokes existing pg_restore via cleaned libpq environment. Restore uses --exit-on-error --single-transaction --no-owner --no-acl --no-tablespaces. No remote host or application startup. Restore SQL/data execution is authorized recovery into a disposable DB, not running repository migrations.

Existing local Docker had only PostgreSQL 16 image; official postgres:18 downloaded with approval for pg_dump 18 compatibility. Application dependencies unchanged. Preliminary Docker --internal network did not provide the required loopback binding; script failed closed before DB connection/restore and removed created resources. Final dedicated ordinary Docker network plus strict actual loopback binding passed. Registry image download is not a remote DB connection. No external provider/network operation requested by the restored application; application never started.

Actual restore PASS; pg_restore read all data blocks and completed transaction. Existing continuity readState/validate used on local restored DB with expected inventory explicitly set to validated archive prefix, not latest 022. All required tables, PK/FK/UNIQUE constraints, explicit indexes, sequence/default/state checks PASS. Ledger exists, ordered 001..021, last 021_reconciliation_storage.sql, 022 absent. Both reconciliation tables and required 021 schema present; users exists; session_version/is_active absent. State POST-021/PRE-022 consistent. Safe per-table aggregate counts collected through existing bounded exact-count tooling; empty business tables are permitted, no rows/PII printed. TABLE DATA entries verified before restore and actual data restoration completed.

Script removes only its own container with anonymous volumes and own network in finally. Proof written only after restore/schema/count/hash checks and successful cleanup. Final independent Docker label/network audit empty. Docker image retained as reusable local tool; temporary container/database/network/volumes removed. No user Docker resources modified.

Proof artifact: original partial basename plus .restore-proof.json, retained under backend/backups/postgres; final .dump.restore-proof.json hard link preserves same evidence. Proof records archive SHA/size, applied migrations, completion time, requiredSchema/localTarget/PASS, aggregate dataCounts and cleanup=true. No source secrets or row data. It is owner-local evidence, not cryptographically signed independent attestation.

## Offline finalizer

New dbBackupFinalize.cjs accepts explicit partial path plus restore-proof path. Validates exact timestamped .dump.partial filename, safe paths/existence, strict bounded proof format, hash/size, successful local proof/cleanup, ordered expected POST-021 prefix/count metadata and owner-provided historical source identity/TLS metadata. Runs current archive verification again, verifies proof migration consistency, derives pg_dump version from archive metadata, rechecks archive hash before publication. No connection/pg_dump/migration path.

Compatible normal manifest v2/3Y.2 retained; no incompatible fields added. Status BACKUP_VERIFIED / verification checksum-and-archive-list / dataBlocksRestored=false retains original manifest semantics. The separate checksum-bound restore-proof artifact and finalizer result localRestoreProof=true establish that this particular workflow ALSO has a successful local restore. Normal dbBackupVerify alone still means archive/manifest verification, not a new restore. Do not conflate these statuses.

Manifest fsynced in an exclusively created temporary file; manifest and audit evidence linked without overwrite; final archive hard-linked last for atomic publication with metadata already available. Current full verification performed on final path before removing original partial. Failure rolls back only invocation-created links/metadata and preserves partial; unrelated preexisting pending metadata not deleted. Cross-file publication is not a filesystem transaction; crash can leave metadata or both links and is fail-closed on rerun, never silently overwritten. No manual Move-Item rename.

Finalizer executed against existing partial after tests and restore proof PASS. Final .dump CREATED; manifest PASS; BACKUP_VERIFIED YES. Then exact node backend/scripts/dbBackupVerify.cjs backend/backups/postgres/asedeliya-20261010T072810544Z.dump PASS. Result size 1019958, expectedTables25/expectedIndexes76, valid 001..021, no 022 requirement. No recreation needed/performed. Final backup and evidence retained, ignored by git. Historical timestamp/provenance preserved rather than relabeling it as a new backup.

## Tests, checks and files

One final affected-suite invocation: 103/103 PASS, skipped/cancelled0. Focused backupFinalize 14/14 PASS; adjacent databaseContinuity/preMigrationBackupIdentity/backupTargetBinding/backupUniqueConstraint 89/89 PASS. Missing file/suffix, failed archive verification, invalid migration/proof status/hash/cleanup, existing destination, missing source metadata, atomic linking, preserved bytes/SHA, compatible manifest, final verification, rollback and preexisting pending metadata covered. All backup/restore-tool calls in unit tests mocked; real DB methods blocked. Real restore integration separately PASS via operator script above. 7M.2 helpers unchanged, integration not rerun; no repository migration execution.

Full backend NOT RUN: application runtime and shared migration code unchanged; affected operator suites passed. Release checks once: verifier PASS;6A PASS;021 preflight PASS DISABLED/SAFE;022 preflight PASS execution/enforcement disabled;diff-check PASS. No frontend changes/tests/build.

Modified: SPRINT_7M3B_STAGING_BACKUP_PREREQUISITES_REPORT.md; SPRINT_7M3_STAGING_SESSION_SECURITY_ROLLOUT_REPORT.md.
New: backend/scripts/dbBackupLocalRestoreProof.cjs; backend/scripts/dbBackupFinalize.cjs; backend/tests/backupFinalize.test.cjs; SPRINT_7M3B3_LOCAL_RESTORE_BACKUP_FINALIZATION_REPORT.md.
Local ignored artifacts: final archive/manifest, original proof and final proof hard link, .tmp/sprint7m3b3-tests.log, restore.log, finalize.log, final-verify.log, verifier.log,6a.log,021-preflight.log,022-preflight.log.

Remote DB connections0;pg_dump reruns0;backup reruns0;repository migration executions0;021/022 migration executions0;staging schema changedNO;production touchedNO;Render changes0;session enforcement activationNO;PSP/Hotelbeds/money operations0;restore PII printedNO. Local restore DDL/data writes occurred only in the created disposable DB. Everything unstaged.

Staging target and ledger evidence remains the previously owner-supplied proof; not rechecked remotely here. Before actual Phase A approval, owner checks current staging identity/config/history and that this backup covers the intended recovery window; no claim of current live-state verification or staging acceptance.
