# Sprint 7M.3B — Staging Identity, Migration Inventory & Fresh Backup Proof

Latest update — 7M.3B.3: local restore PASS (POST-021/PRE-022), disposable resources cleaned. Existing partial finalized through the new tested offline finalizer, final .dump and normal manifest created; final dbBackupVerify BACKUP_VERIFIED. SHA-256 unchanged c35d01b085e575c4014e4f094bfbe406166fe0630afed7d9acb9e70731f917dd. Archive verification, local restore evidence, finalization and final verification all PASS separately. Owner supplied the previously verified source fingerprint; no remote identity recalculation. Normal manifest remains archive-verification semantics; bound restore-proof sidecar records successful local recovery and cleanup. Remote DB connections/backup reruns/migration executions 0. Phase A READY FOR OWNER APPROVAL, not executed. See SPRINT_7M3B3_LOCAL_RESTORE_BACKUP_FINALIZATION_REPORT.md. Older finalization/backup blockers below are historical and superseded by this result.

Latest update — 7M.3B.2: UNIQUE verifier bug RESOLVED. Existing asedeliya-20261010T072810544Z.dump.partial passes existing offline pre-publication archive checks, POST-021/PRE-022, unchanged SHA-256 c35d01b085e575c4014e4f094bfbe406166fe0630afed7d9acb9e70731f917dd. ARCHIVE VERIFIED OFFLINE within archive-only scope; FINALIZATION METHOD REQUIRED. No manifest-based BACKUP_VERIFIED receipt or restore proof yet. No supported standalone offline finalizer found; no rename or backup rerun. No remote connection, 021/022 execution or rollout acceptance. See SPRINT_7M3B2_CONSTRAINT_VERIFIER_FIX_REPORT.md. Earlier NOT CREATED/BLOCKED statements below are historical; the subsequent owner-created partial is now locally inspected.

STAGING PREREQUISITES: FAIL / BLOCKED, not a failed migration. OWNER ACTION REQUIRED — STAGING DATABASE CONNECTION NOT AVAILABLE.

Latest update — Sprint 7M.3B.1: backup target binding READY in offline tested scope. Owner subsequently reports strict verify-full staging identity verified (expectedTargetMatch=true), 001..021 applied, 022 pending; these are owner-supplied facts, not a remote recheck in this hardening sprint. The historical missing-connection result below remains the original 7M.3B run record. Fresh staging backup NOT YET CREATED/VERIFIED; backup execution in 7M.3B.1 NOT RUN. Existing backup-only require exception now independently checks exact staging classification and expected source fingerprint before subprocess/output creation; TLS encryption YES, certificate identity verification NO, configured target binding YES. General staging identity/inventory and restore remain verify-full. Phase A stays BLOCKED UNTIL BACKUP VERIFIED. See SPRINT_7M3B1_BACKUP_TARGET_BINDING_HARDENING_REPORT.md.

## Baseline and evidence

2026-10-10, Asia/Qyzylorda; develop. HEAD `f661c3e docs: record Sprint 7M.3A backup identity foundation`; previous `d52a1ca feat: make backup verification migration aware`, `817cc55 docs: record Sprint 7M.2 local integration verification`. Tracked tree clean at start; 7M.3A committed. Known unrelated untracked owner files preserved.

Checked presence booleans only in the current operator process: DATABASE_URL absent; RECONCILIATION_EXPECTED_DB_IDENTITY absent; APP_ENV/EXPECTED_APP_ENV staging pair not configured; NODE_ENV test operator mode not configured. No URL, credential, username, hostname or secret value printed. No secret files searched/opened, no guessed connection or fallback target. Per section 4, remote work STOPPED. No inventory/backup command executed.

| Required evidence | Result |
| --- | --- |
| Staging identity / fingerprint | BLOCKED / NOT AVAILABLE |
| Expected target matched | NO — not tested, no mismatch inferred |
| Migration inventory read | NOT RUN / BLOCKED |
| Last applied migration | UNKNOWN |
| 021/022 applied or pending | UNKNOWN for both; local history is not staging evidence |
| Schema/ledger consistency | NOT RUN / BLOCKED |
| Fresh staging backup | NOT CREATED / BLOCKED |
| Archive integrity and migration-aware verification | NOT RUN on a real staging artifact |
| Backup filename/timestamp/size/checksum | NOT AVAILABLE |
| Restore procedure | READY as documented procedure only |
| Actual restore readiness | BLOCKED pending verified backup and recovery evidence |
| Local restore verification | NOT RUN |
| 7M.3 phase A migration | BLOCKED |

## Existing tooling audit

Existing exact diagnostic: `node backend/scripts/stagingMigrationInventory.cjs --staging-read-only`. It requires NODE_ENV=test, APP_ENV=EXPECTED_APP_ENV=staging, DB_SSL_MODE=verify-full, privately supplied staging DATABASE_URL and independently confirmed RECONCILIATION_EXPECTED_DB_IDENTITY. Checks before client construction reject missing intent/identity, mismatch, production/live labels and unsafe money/booking flags. Read-only transaction selects the actual _migrations names ordered by id; output is a fixed safe projection. The expected fingerprint must be independently mapped to the known staging resource; merely hashing an unknown URL and using that hash does not establish staging identity.

Existing backup: `npm --prefix backend run db:dump` / `node backend/scripts/dbBackup.cjs`; verify: `node backend/scripts/dbBackupVerify.cjs <archive-path>`. These were inspected, not executed. Verifier derives schema expectations from COPY ledger records in the actual archive; manifest target fingerprint, timestamp, size and SHA-256 are available only after successful creation/verification. Existing runbook DATABASE_CONTINUITY_RUNBOOK.md covers private process configuration and restore to a separately verified empty target via `node backend/scripts/dbRestore.cjs <archive-path> --apply`; never restore over staging. No restore target or artifact exists in this sprint. dbSchemaCheck expects latest full inventory and is not an older-prefix schema validator.

The narrow staging diagnostic proves configured target match and ledger history, not complete live schema consistency. Before future backup, a separately reviewed read-only schema inspection must compare the actual applied-prefix requirements with live objects. No live schema claim is made now. No source changes added to bypass any guard or missing prerequisite.

## Owner next step — private UI preparation only

1. Open Render Dashboard and select the known Asedeliya staging PostgreSQL resource; verify it is the resource used by the staging backend. Do not select production or change service/database settings.
2. In that database's connection information, obtain the external connection details privately for the trusted local operator machine. Do not paste the connection URL, screenshots containing credentials or any secret into chat. Do not change Render Environment or Build Command.
3. Privately load the verified staging connection into the local operator process using the existing secure-input procedure in DATABASE_CONTINUITY_RUNBOOK.md. Separately establish the expected staging fingerprint against the owner-confirmed resource; configure only the local operator environment. Do not self-certify an unknown target or enable migration approval flags.
4. Resume only once private operator configuration is available. Safe evidence to share is configuration-ready confirmation and sanitized target-match/migration summary, never raw connection details. No migration or deployment is part of this prerequisite sprint.

Normal Render Build Command remains `npm --prefix backend ci --omit=dev`; no Render changes made or live settings inspected. Session enforcement, reconciliation runtime, Admin datasource and migration flags remain OFF in inspected repository defaults/offline preflights; actual deployed values NOT VERIFIED. No env values were changed here. Legacy JWT staging behavior unchanged by this sprint; no acceptance performed.

## Checks and exact changes

Verifier PASS; 6A PASS; 021 preflight PASS DISABLED/SAFE; 022 preflight PASS execution/enforcement disabled; diff-check PASS. Each requested check run once. Full backend NOT RUN and backup/identity regressions NOT RUN: no source change, only reports. No migration or backup command was attempted after the missing-connection stop condition.

Remote DB connections 0; DB queries/mutations 0; migration executions 0; 021/022 executions 0; staging schema changed NO; production DB touched NO; real PSP calls 0; Hotelbeds calls 0; money operations 0; Render mutations/deployments 0. No restore, no Docker resources created. No git add/commit/push/reset/clean.

Modified: SPRINT_7M3_STAGING_SESSION_SECURITY_ROLLOUT_REPORT.md.
New: SPRINT_7M3B_STAGING_BACKUP_PREREQUISITES_REPORT.md.
Evidence: .tmp/sprint7m3b-verifier.log, .tmp/sprint7m3b-6a.log, .tmp/sprint7m3b-021-preflight.log, .tmp/sprint7m3b-022-preflight.log. Everything unstaged. Staging acceptance OPEN; commercial production readiness NO.
