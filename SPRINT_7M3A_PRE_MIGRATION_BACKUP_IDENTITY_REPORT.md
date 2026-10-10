# Sprint 7M.3A — Pre-Migration Backup Verification & Staging Identity Guard

CODE / OFFLINE: PASS. Backup verifier blocker: RESOLVED in tested offline scope. Staging identity tooling: READY. Actual staging identity NOT VERIFIED; fresh staging backup NOT CREATED/VERIFIED. 7M.3 staging migration NOT RUN. OWNER ACTION REQUIRED NOW: NO.

2026-10-10, Asia/Qyzylorda. develop; HEAD `817cc55 docs: record Sprint 7M.2 local integration verification`, following `77dcf88` and `80b3b45`. Tracked tree clean at start; known untracked owner files and 7M.3 report preserved. No git add/commit/push/deploy.

## Root cause and implementation

Existing verifier required all current repository objects, including pending 021 tables. Backup expectations now use actual archive migration history: pg_restore --data-only --table=_migrations --file=- extracts the archive's COPY records as bounded text. No extracted SQL is executed. Ledger names sorted by ledger id must exactly match a nonempty prefix of ordered repository migration identifiers; unknown/duplicate/malformed/missing/out-of-order versions fail closed. Positive unique ledger ids and bounded timestamps are validated. Sequence id gaps remain valid because rolled-back PostgreSQL inserts can consume sequence values.

migrationInventory(applied) derives table/sequence/PK/FK/unique/index expectations from precisely that prefix. Default no-argument inventory remains the complete repository inventory for existing release/migration guards. The 020 provider identity unique-constraint replacement is applied only when 020 is in that prefix. Existing magic-byte, file/checksum, strict manifest v1/v2, repository filename inventory, safe-path, archive listing and mandatory schema/data/index/constraint checks retained. Verification adds schema-only extraction to check users session columns, NOT NULL/defaults and positive-version check after 022. Extraction uses existing bounded pg_restore subprocess mechanism without DB credentials or connection options.

| Archive history | Required schema | Result in offline fixture |
| --- | --- | --- |
| All migrations preceding 021 | Only schema from that applied prefix; no 021 tables or 022 fields | PASS |
| Through 021 | Reconciliation tables/data, indexes, keys/constraints; no 022 fields | PASS |
| Through 022 | Reconciliation schema plus session_version integer/default1/NOT NULL/check>=1 and is_active boolean/defaulttrue/NOT NULL | PASS |
| 021 recorded with missing table/index/FK | Reject | PASS detection |
| 022 recorded with missing/nullable/invalid-default column or missing positive check | Reject | PASS detection |
| 022 without 021, duplicate/gap/future/invalid ledger | Reject | PASS detection |
| Known future tables/indexes or session fields with older ledger | Reject drift; never infer applied migration from object presence | PASS detection |

The legacy manifest sourceMigrationLedger='not-read' is retained for format compatibility and is not trusted as backup migration state; verification independently extracts the archive ledger every time and returns appliedMigrations. Manifest repository inventory still checks compatibility, not the live source ledger. No claim that old v1/v2 manifests gain new provenance. Archives with unsupported COPY/schema formatting fail closed rather than guessing. This is a bounded parser for normal pg_restore output, not a general SQL evaluator. Full restored data-block integrity and actual disaster-recovery readiness still require a separate restore drill; dataBlocksRestored remains false.

## Staging diagnostic contract

Future command from repository root, NOT executed remotely here:

```powershell
node backend/scripts/stagingMigrationInventory.cjs --staging-read-only
```

Privately supplied operator environment: NODE_ENV=test, APP_ENV=staging, EXPECTED_APP_ENV=staging, DB_SSL_MODE=verify-full, staging DATABASE_URL and RECONCILIATION_EXPECTED_DB_IDENTITY set to an independently owner-confirmed 64-hex fingerprint. Explicit CLI intent required. Wrong fingerprint, missing expected identity/intent, production/live labels, unsafe money/booking flags or invalid TLS are rejected before constructing a client. NODE_ENV=production is intentionally rejected for this dedicated operator command; it does not change the normal staging backend's production Node mode.

Uses existing sourceIdentity hash of host/port/database. Owner must bind the expected hash independently to the known staging resource: matching a self-chosen hash or staging environment label is not independent staging proof. Output allowlist: environment, sourceIdentitySha256, expectedTargetMatch, migrations {applied,pending,count}. No URL/user/password/hostname/TLS secrets, arbitrary unknown ledger names, raw exceptions or PII. Failure returns fixed safe CLI diagnostic and nonzero status.

Database interaction is BEGIN READ ONLY, SELECT name FROM public._migrations ORDER BY id, COMMIT; failure rolls back. No migrations/schema mutation/startup/provider imports. No local secret env files loaded by the new diagnostic. Its SELECT and lack of write statements are verified with injected fake clients only. Existing 021/022 guards unchanged; diagnostic success or BACKUP_VERIFIED alone never enables migration. Default session enforcement, reconciliation runtime and both migration authorizations remain disabled.

Future flow: independently bind expected staging fingerprint -> read-only target/ledger check -> fresh custom dump through existing dbBackup -> checksum/manifest and archive-ledger/schema verification through dbBackupVerify -> separately establish restore evidence -> separately authorized 7M.3 guarded migration. Commands remain `npm --prefix backend run db:dump` and `node backend/scripts/dbBackupVerify.cjs <archive-path>`. Do not put private values in command-line literals or chat. Backup manifests retain sourceIdentitySha256 for target binding. dbSchemaCheck still checks the full current repository schema and is not a pre-021 restore validator; use migration-aware archive verification plus separately reviewed restored-target checks for an older-prefix recovery drill.

## Tests and boundaries

Focused final: 54/54 PASS (34 new preMigrationBackupIdentity cases plus 20 existing databaseContinuity cases), zero skipped/cancelled. A preliminary combined run passed 53/53 before adding the future-index regression. Existing fake pg_restore runner responses were extended to supply ledger and schema text for the new extraction calls; no security/integrity assertion weakened. Fixtures are explicitly synthetic pg_restore outputs and PGDMP stubs, NOT genuine PostgreSQL archive or restore proof. PRE/POST matrix PASS means offline contract verification, not a real staging backup receipt.

Adjacent affected suites: **105/105 PASS**, one invocation of reconciliationMigrationActivationGuard, reconciliationMigrationDesign, sessionSecuritySchema, preProductionReadiness; zero skipped/cancelled. 7M.2 real integration NOT RUN: no migration runner, SQL, application auth source or default inventory semantics changed; its invocation would execute migrations contrary to this sprint's strict no-migration boundary. Full backend NOT RUN: application runtime unchanged; shared continuity changes covered by affected suites as requested. No Docker/DB needed; temporary unit fixture directories removed.

Release checks: verifier PASS; 6A PASS; 021/022 normal preflights PASS — DISABLED/SAFE; diff-check PASS. Each release check run once. Offline preload reports zero blocked real PostgreSQL attempts during focused and adjacent runs. Remote DB connections 0; real local DB connections 0; migration executions 0; 021/022 executions 0; staging/production DB touched NO; PSP/Hotelbeds calls 0; money operations 0; Render changes 0; enforcement activation NO.

Modified tracked files: backend/scripts/lib/dbContinuity.cjs; backend/tests/databaseContinuity.test.cjs.
Updated existing untracked report: SPRINT_7M3_STAGING_SESSION_SECURITY_ROLLOUT_REPORT.md.
New: backend/scripts/lib/backupMigrationState.cjs; backend/scripts/stagingMigrationInventory.cjs; backend/tests/helpers/backupArchiveFixture.cjs; backend/tests/preMigrationBackupIdentity.test.cjs; SPRINT_7M3A_PRE_MIGRATION_BACKUP_IDENTITY_REPORT.md.
Everything unstaged; no security checklist promotion. Staging acceptance OPEN; commercial production readiness NO.
