# Sprint 7M.3 — Controlled Staging Session Security Migration Rollout

## Final staging acceptance — 2026-10-10

SPRINT 7M.3: **STAGING ACCEPTANCE PARTIAL**. Authoritative owner evidence: 001–022 applied, including 022; verified backup exists and local restore proof PASS; normal Build Command restored; migration flags OFF; DB_SSL_MODE=require with Render internal TLS contract active; SESSION_STATE_ENFORCEMENT=enabled; backend LIVE; /health PASS; /api/health/ready PASS with database.ok=true. Owner manually logged out, then logged in successfully; fresh login PASS, /admin PASS. Reconciliation page read-only, datasource/runtime disabled; production sales/payments/Hotelbeds Booking disabled.

**LEGACY JWT OWNER E2E: NOT CONFIRMED.** Manual logout preceded fresh login, so this sequence does not demonstrate automatic rejection of a pre-enforcement JWT. Password-change, role-demotion and account-disable staging E2E: NOT RUN. Existing local PostgreSQL integration separately proved legacy JWT rejection, stale password-session rejection, demoted admin denial, inactive account denial and deleted account denial. Local evidence is not staging owner evidence.

P1 SESSION REVOCATION: **STAGING RUNTIME READY / OWNER LEGACY-JWT E2E NOT CONFIRMED**. P1 remains open; COMMERCIAL PRODUCTION READY: NO. See SPRINT_7M3_STAGING_ACCEPTANCE_FINAL_REPORT.md for evidence boundaries and checks. This finalization changes documentation only: no DB connection, migration, runtime change, Render change or deploy. All sections below are historical preparation/procedure records; their pending-022, OFF-enforcement and next-deploy statements are superseded by the owner evidence above.

## Historical rollout record

Latest update — 7M.3D: owner confirms staging migrations 001–022 APPLIED, verified backup/local restore, and healthy internal require runtime before Phase B. Phase B startup blocker traced to session OFF requirement incorrectly placed in shared TLS helper. CODE/OFFLINE fix decouples normal TLS from session enforcement; runtime allows disabled/enabled under the same explicit target-bound TLS contract. Both migration guards still require enforcement OFF before pool/SQL. No remote validation, migration, Render change, deployment or session activation in this task. Phase B acceptance PENDING. NEXT OWNER PHASE: NORMAL DEPLOY WITH ENFORCEMENT DISABLED, THEN ENABLE ENFORCEMENT using normal Build Command with migration flags OFF. See SPRINT_7M3D_RUNTIME_TLS_SESSION_ENFORCEMENT_DECOUPLING_REPORT.md. This supersedes earlier 7M.3C enforcement restriction and historical pending-022 statements below.

Latest update — 7M.3C: Render INTERNAL target confirmed by owner. Narrow operator-attested, fingerprint-bound require TLS contract READY in offline code; general continuity verify-full unchanged. NEXT OWNER PHASE: NORMAL TLS REQUIRE DEPLOY — NOT MIGRATION. First deploy patch with migrations OFF, then configure require/internal approval and validate normal backend health/readiness before any migration deploy. Both identity values must bind the actual internal URL; an external fingerprint cannot automatically substitute. Backup/restore evidence remains verified. Runtime TLS acceptance and 022 migration NOT RUN here. Enforcement/reconciliation runtime/Admin datasource remain OFF. See SPRINT_7M3C_RENDER_INTERNAL_TLS_MIGRATION_GUARD_REPORT.md for exact contract, sequence and rollback. require supplies encryption without certificate identity verification; private network is an owner infrastructure assumption. Future Phase B needs separate review because the internal TLS contract currently requires enforcement OFF.

Latest update — 7M.3B.3: ARCHIVE VERIFY PASS; LOCAL RESTORE PROOF PASS; FINALIZATION PASS; FINAL BACKUP VERIFY PASS. Existing partial published to .dump with compatible manifest and hash-bound local restore evidence, no backup rerun or remote connection. Restored state POST-021/PRE-022; 022 absent. Phase A READY FOR OWNER APPROVAL, still NOT EXECUTED; owner must confirm current staging target/config/history and backup applicability at the later rollout time. No staging deploy/acceptance or enforcement activation. See SPRINT_7M3B3_LOCAL_RESTORE_BACKUP_FINALIZATION_REPORT.md. Earlier blockers below describe historical runs.

Latest update — 7M.3B.2: verifier name-prediction defect RESOLVED. Existing owner-created local partial passes all configured pre-publication archive checks with actual ledger POST-021/PRE-022; ARCHIVE VERIFIED OFFLINE, FINALIZATION METHOD REQUIRED. No standalone resume/finalization entrypoint exists; archive remains .partial with no new manifest/finalization receipt. Fresh backup rerun NO; remote DB connection NO; 022 migration NOT RUN. Ready for next prerequisite (supported finalization and recovery evidence), not migration approval or staging acceptance. See SPRINT_7M3B2_CONSTRAINT_VERIFIER_FIX_REPORT.md. Older status statements below describe earlier runs.

PRE-ROLLOUT: BLOCKED (FAIL prerequisites). CODE/OFFLINE: PASS in inspected/tested scope. STAGING MIGRATION: NOT RUN. STAGING DEPLOY: NOT RUN. OWNER ACCEPTANCE: NOT RUN. Sprint 7M.3 PASS is not claimed.

Latest update — Sprint 7M.3B.1: backup target binding READY; backup execution NOT RUN; fresh staging backup NOT YET CREATED/VERIFIED. Owner reports previously verified staging identity and ledger 001..021 applied/022 pending. No remote recheck performed here. Backup-only require now checks expected configured staging fingerprint before subprocess/output creation while retaining explicit acknowledgement; this is not certificate identity verification. General verify-full invariant preserved. Phase A BLOCKED UNTIL BACKUP VERIFIED; no staging acceptance promotion. Older BLOCKED inventory statements below describe earlier runs, not a contradiction of subsequent owner-supplied evidence.

Sprint 7M.3B update (2026-10-10, HEAD f661c3e): STAGING TARGET IDENTITY BLOCKED; MIGRATION INVENTORY BLOCKED; FRESH BACKUP BLOCKED. Current local operator process has no DATABASE_URL, no RECONCILIATION_EXPECTED_DB_IDENTITY and no explicit staging operator configuration. Stopped before any remote connection or backup as required. OWNER ACTION REQUIRED — STAGING DATABASE CONNECTION NOT AVAILABLE. No claim about 021/022 applied/pending state, schema consistency or live enforcement settings. Migration executions 0. See SPRINT_7M3B_STAGING_BACKUP_PREREQUISITES_REPORT.md.

## Baseline and stop condition

2026-10-10, Asia/Qyzylorda. develop; tracked tree CLEAN before and after preparation (new report untracked). Pre-rollout HEAD `817cc55 docs: record Sprint 7M.2 local integration verification`; previous commits `77dcf88 test: verify session security migrations on isolated postgres`, `80b3b45 docs: record Sprint 7M.1 session security rollout design`. 7M.2 committed. Unrelated untracked owner files preserved.

STAGING TARGET IDENTITY NOT PROVEN. No independently owner-confirmed staging fingerprint or current staging ledger supplied. Existing sourceIdentity tooling hashes host/port/database; it does not prove that a connection belongs to staging merely because APP_ENV says staging. No remote connection attempted or credential files inspected. Migration inventory before/after: UNKNOWN, not inferred from local tests. 021 pending: NOT VERIFIED. 022 pending: NOT VERIFIED.

STAGING BACKUP REQUIRED. No fresh target-bound backup supplied/created. Update from Sprint 7M.3A: backup verifier code blocker RESOLVED in offline scope. The verifier now derives expectations from the archive's actual ordered _migrations COPY data, retaining checksum/manifest/object checks and rejecting partial/future schema. Staging identity tooling READY: backend/scripts/stagingMigrationInventory.cjs provides explicit staging intent, expected fingerprint matching before connection and read-only ledger inspection. Actual staging identity remains NOT VERIFIED and actual fresh staging backup remains BLOCKED. See SPRINT_7M3A_PRE_MIGRATION_BACKUP_IDENTITY_REPORT.md. No 7M.3 migration/deploy acceptance follows from this code fix.

Existing restore runbook: DATABASE_CONTINUITY_RUNBOOK.md. Existing custom dump, checksum/manifest and empty-target restore scripts available; no new backup system. Manifest sourceMigrationLedger='not-read' and dataBlocksRestored=false: checksum/archive listing is not actual restore proof. A fresh matching archive and restore evidence must precede BACKUP_RESTORE_READY_ATTESTED. dbSchemaCheck currently expects all 22 migrations and does not independently check the new users column defaults/NOT NULL, so it cannot substitute for explicit phase-A column checks.

## Exact controls from code

| Control | Required phase-A/operator value |
| --- | --- |
| APP_ENV / EXPECTED_APP_ENV | staging / staging; labels require independent identity evidence |
| DATABASE_URL | Owner privately supplies verified staging connection, never chat/report |
| DB_SSL_MODE | verify-full for remote migration/inventory |
| RECONCILIATION_STORAGE_MIGRATION_ENABLED | true only for approved one-time migration process; false normally |
| RECONCILIATION_MIGRATION_APPROVAL | I_APPROVE_021_FOR_VERIFIED_TARGET |
| RECONCILIATION_EXPECTED_DB_IDENTITY | independently confirmed 64-hex staging sourceIdentity |
| BACKUP_RESTORE_READY_ATTESTED | I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET, only after actual evidence |
| SESSION_SECURITY_MIGRATION_ENABLED | true only for approved one-time migration process; false normally |
| SESSION_SECURITY_MIGRATION_APPROVAL | I_APPROVE_022_WITH_ORDERED_PENDING_MIGRATIONS |
| SESSION_SECURITY_EXPECTED_DB_IDENTITY | exact same verified staging fingerprint |
| SESSION_STATE_ENFORCEMENT | disabled throughout phase A; enabled only after phase-A acceptance |
| RECONCILIATION_STORAGE_MODE | disabled; other values rejected |
| Admin reconciliation datasource | No separate env selector. Runtime repository always disabled; list/detail source unavailable. Do not inject/select postgres adapter. |
| PRODUCTION_SALES_ENABLED | false |
| REAL_CHARGES_ENABLED / REAL_REFUNDS_ENABLED | false / false |
| PAYMENTS_MODE / PAYMENTS_PROVIDER | disabled / none |
| HOTELBEDS_BOOKING_ENABLED / HOTELBEDS_LIVE_BOOKING_ENABLED | false / false |
| HOTELBEDS_ENABLED / HOTELBEDS_ENV / HOTELBEDS_READ_ONLY | false / test / true in checked-in Render config |

LOCAL_SESSION_INTEGRATION_APPROVAL must be absent in staging/operator migration environment; its loopback/test-only approval is not a staging mechanism. No actual Render environment audited or altered. Current repository/default session enforcement OFF, reconciliation runtime OFF, Admin datasource OFF, sales/payments/booking OFF. Actual deployed values: NOT VERIFIED.

## Render and supported method

Checked-in render.yaml already has `buildCommand: npm --prefix backend ci --omit=dev`, `startCommand: npm --prefix backend start`, health path `/health`, no migration in build. It does NOT contain the old migration build command. Owner-reported live build matches this value, but live settings/deployed revision have not been independently inspected. Root package.json absent; backend/package.json provides migrate -> node scripts/migrate.js.

Preferred method A: owner-controlled operator process on a trusted machine, using existing `npm --prefix backend run migrate`, verified staging connection and exact guard variables above. Runner applies every pending SQL file in sorted order, not only 022; 021 commits before 022, each in its own transaction. Stop for any inventory drift or unexpected earlier pending migration. Runner guards do not query live migration history or verify backup artifact contents automatically: evidence review remains a mandatory separate precondition. No mechanism B established. Temporary Render build migration C is not needed while method A can be prepared; no build changes or Render Shell instructions proposed. Do not deploy or change settings yet.

## OWNER ACTION REQUIRED — current next steps

1. In Render Dashboard select the known staging PostgreSQL resource and its linked staging backend, not production. Privately compare backend connection target with that resource. Confirm correct service/revision and Settings Build Command `npm --prefix backend ci --omit=dev`, Start Command `npm --prefix backend start`. Do not change commands or deploy.
2. In the staging backend Environment UI verify SESSION_STATE_ENFORCEMENT=disabled (missing defaults disabled), RECONCILIATION_STORAGE_MODE=disabled, both migration *_ENABLED flags false, and all money/booking controls in the table remain off. Do not click activation/deploy as part of this preparation. Report safe statuses only; actual values have not been verified here.
3. On a trusted owner operator machine, privately load staging DATABASE_URL into the process (not command-line literals, chat or tracked files), APP_ENV=staging, EXPECTED_APP_ENV=staging and DB_SSL_MODE=verify-full. Use existing tools to compute only the candidate identity:

   ```powershell
   node -e "const d=require('./backend/scripts/lib/dbContinuity.cjs'); console.log(JSON.stringify({sourceIdentitySha256:d.sourceIdentity(d.connection(process.env))}));"
   ```

   This is offline and emits no URL/host/user/password. Owner must independently attest that this fingerprint corresponds to the Render staging resource; a self-generated hash alone is not proof. Do not set approval flags yet.
4. Only after identity confirmation, read the actual staging migration ledger using existing tooling with output projected to migration names/counts (no PII/database name):

   ```powershell
   node -e "const d=require('./backend/scripts/lib/dbContinuity.cjs'); d.cli(async log=>{const c=d.connection(process.env); if(process.env.APP_ENV!=='staging'||process.env.EXPECTED_APP_ENV!=='staging'||d.sourceIdentity(c)!==process.env.RECONCILIATION_EXPECTED_DB_IDENTITY) throw new d.ContinuityError('STAGING_IDENTITY_BLOCKED'); const s=await d.inspect(); log({migrationNames:s.migrationRows,pending:s.expected.migrations.filter(n=>!s.migrationRows.includes(n)),unknownCount:s.migrationRows.filter(n=>!s.expected.migrations.includes(n)).length});}).then(code=>{process.exitCode=code;});"
   ```

   Privately set RECONCILIATION_EXPECTED_DB_IDENTITY only to the independently verified fingerprint first. This is read-only database inspection, not migration. Stop on unknown versions, non-prefix history, missing ledger or pending migrations other than the explicitly reviewed 021/022. Share only sanitized inventory/fingerprint confirmation, never connection details.
5. STOP at actual backup prerequisite. Sprint 7M.3A resolves the pre-021 verifier mismatch in code, but no staging backup exists as evidence yet. Future owner-controlled commands remain `npm --prefix backend run db:dump` and `node backend/scripts/dbBackupVerify.cjs <archive-path>`. The narrow inventory command is now `node backend/scripts/stagingMigrationInventory.cjs --staging-read-only`, with operator NODE_ENV=test, APP_ENV=EXPECTED_APP_ENV=staging, DB_SSL_MODE=verify-full and privately supplied staging URL plus independently confirmed RECONCILIATION_EXPECTED_DB_IDENTITY. Establish fresh matching checksum/manifest and restore evidence before permitting migration. No owner action is requested as part of offline 7M.3A.

No owner action above authorizes bypassing the backup block. Wait for identity, inventory and backup evidence before advancing phase A.

## Conditional phase A and phase B — not executed

After all prerequisites pass, privately scope approval flags from the table to the one-time operator process. Keep SESSION_STATE_ENFORCEMENT=disabled, RECONCILIATION_STORAGE_MODE=disabled and money/booking disabled. Run `npm --prefix backend run migrate` once against verified staging. Stop on failure; no blind retry. Remove temporary approvals and set both migration-enabled flags false immediately afterward. Never leave them enabled in normal Render deployment.

Deploy compatible backend only under subsequent owner control, normal build/start unchanged. Verify `/health` 200 and `/api/health/ready` ready/database.ok=true. Read ledger again: 021 and 022 recorded. Use safe read-only schema queries to verify users.session_version/is_active types, NOT NULL, defaults 1/true and positive version constraint; compare pre/post aggregate user count and invalid-version/inactive counts without PII. Confirm any pre-existing columns/drift rather than silently accepting IF NOT EXISTS. No user data loss claimed until these checks pass. Reconciliation runtime and Admin datasource stay disabled regardless of schema existence.

Only after phase-A acceptance, owner sets exact `SESSION_STATE_ENFORCEMENT=enabled` in the staging backend Render Environment and performs one backend deploy without migration. Both migration flags remain false; build remains `npm --prefix backend ci --omit=dev`; Start Command unchanged. Recheck health/readiness. Pre-enforcement legacy JWT should get 401; fresh login and `/api/auth/profile` should work; fresh admin retains allowed Admin access, normal user is denied Admin access. Admin reconciliation stays read-only/unavailable, never an activated database datasource. JWT claim is named sessionVersion in code; DB column is session_version. Do not print either JWT value.

Password revocation staging E2E: NOT RUN — no safe disposable staging account established. Role demotion/account disable staging E2E: NOT RUN. Do not change important owner password, demote/disable sole admin, or create fake users to force PASS. Local 7M.2 evidence remains valid. Old-session denial/fresh-login/admin/read-only acceptance all NOT RUN here.

## Rollback before rollout

On migration failure stop and inspect the exact committed ledger: 021 may remain committed if 022 failed. On deploy failure keep enforcement disabled and investigate runtime separately; preserve additive schema. On enforcement-wide auth failure owner disables SESSION_STATE_ENFORCEMENT and redeploys a known-compatible backend, preserving schema. This availability rollback restores legacy/stale JWT acceptance and must be treated as a security limitation, not a security fix. Never DROP/TRUNCATE or auto-restore the current DB. Backup restore is last-resort recovery to a separately verified empty target through DATABASE_CONTINUITY_RUNBOOK.md.

## Verification and exact changes

Focused 7M.1: 48/48 PASS, one invocation. Focused 7M.2: 18/18 PASS, one actual disposable local PostgreSQL/HTTP invocation, automatic own-container/volume cleanup confirmed. No remote DB connection. Verifier PASS; 6A PASS; 021 preflight PASS (disabled/safe); 022 preflight PASS (execution/enforcement disabled); diff-check PASS. Full backend NOT RUN: only report changed, runtime source unchanged. No frontend tests/build needed.

Only new file: SPRINT_7M3_STAGING_SESSION_SECURITY_ROLLOUT_REPORT.md. No modified tracked files. SECURITY_PRODUCTION_GAP_CHECKLIST.md deliberately unchanged: staging acceptance has not occurred. No git add/commit/push, Render settings change, remote migration/deploy, production action, PSP/Hotelbeds call. Remote DB connections 0. Local integration DB mutations only in its disposable container. P1 remains LOCAL INTEGRATION READY / staging acceptance OPEN; COMMERCIAL PRODUCTION READY NO.

Evidence: .tmp/sprint7m3-focused.log, .tmp/sprint7m3-integration.log, .tmp/sprint7m3-verifier.log, .tmp/sprint7m3-6a.log, .tmp/sprint7m3-021-preflight.log, .tmp/sprint7m3-022-preflight.log. All new work unstaged.
