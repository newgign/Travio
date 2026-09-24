# Sprint 4C.1 — Production PostgreSQL Provisioning & Identity Verification

Execution date: 2026-09-25, Asia/Qyzylorda. Scope A only: CODE / OFFLINE PREPARATION. Scope B (owner-manual Render provisioning) was not executed. No production creation, identity, distinctness or empty-state evidence was supplied by the owner in this run.

## 1. Initial git state

First commands ran strictly in order: `git status --short`, `git branch --show-current`, `git log -1 --oneline`, `git diff --stat`, `git diff`. Branch develop, tracked tree clean, both diffs empty. Actual HEAD: **176c2e8 feat: add production infrastructure provisioning readiness**. The request named 17c26e3; the observed local hash differs. No history rewrite, checkout or network lookup was used to reconcile it; implementation followed the actual committed 4B files. Remote push status was not independently queried.

Preserved unrelated untracked paths: README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md and the pre-existing oddly named file whose name contains “record final staging release candidate acceptance”. No partial 4C.1 helper/checker/snapshot/test/report was found. No applicable AGENTS.md was found in the workspace/ancestor checks. No unrelated paths or older reports were edited.

## 2. Inherited baseline and tool audit

Reused 4B manifest, infrastructure plan checker and canonical attestation schema; audited 4A foundation checker/schema, release writer/build helper, production template and existing runbooks. Historical 4B offline PLAN PASS and historical staging acceptance are not production resource evidence. Existing release/build/runtime/provider/payment behavior was not rewritten.

Audited 3Y dbInventory/dbSchemaCheck/dbBackup/dbBackupVerify/dbRestore and dbContinuity. dbInventory uses a read-only transaction but includes the actual database name in output and focuses on public application inventory. dbSchemaCheck expects the fully migrated schema; it is not an empty-database validator. Restore includes execution and production guards and must not be repurposed to inspect this target. Therefore this sprint leaves all 3Y semantics unchanged and documents a separate future owner catalog-inspection procedure without invoking it.

## 3. Production DB state model

Defined NOT_PROVISIONED -> PROVISIONED_UNVERIFIED -> PROVISIONED_DISTINCTNESS_VERIFIED -> TARGET_ATTESTED -> READ_ONLY_INSPECTION_PENDING. Highest 4C.1 PASS is READ_ONLY_INSPECTION_PENDING. All state evidence is explicitly OWNER_REPORTED_NOT_REMOTE_VERIFICATION.

READY_FOR_MIGRATION_AUTHORIZATION, MIGRATION_AUTHORIZED and MIGRATED are documented future states, never emitted as successful 4C.1 advancement. migrationAuthorized=true or migrationRun=true blocks as BLOCKED_OUT_OF_SCOPE, including both true. Malformed/inconsistent metadata blocks as INVALID_SNAPSHOT. A target-attested snapshot never proves catalog emptiness or grants permission to connect.

## 4. Identity model

Planned production logical label comes from unchanged 4B metadata: asedeliya-production-db. The owner explicitly supplied staging logical label asedeliya-staging-db in the current task; it is not inferred from hostname or a newly queried resource. The new snapshot pins those reviewed logical labels. Actual selected resources/ownership and raw DB identity remain private owner evidence. A differing intended label requires a reviewed contract update, not a resource rename to bypass validation.

Canonical names and fixed phrases imported directly from 4B: STAGING_DATABASE_IDENTITY_ATTESTED, PRODUCTION_DATABASE_IDENTITY_ATTESTED, DATABASES_CONFIRMED_DISTINCT, PRODUCTION_DATABASE_TARGET_ATTESTED. No replacement env attestations or raw resource-ID field. No real URL, hostname, database name parsed from a URL, username, password, token or Render resource ID is stored in the new snapshot/report. Test URLs are synthetic fixtures only.

## 5. Distinctness verification design

Owner locally supplies STAGING_DATABASE_URL and PRODUCTION_DATABASE_URL to the comparison helper via temporary environment, using the same connection type for both. The helper parses only; it never performs DNS, socket, SQL, Render or provider work.

HOST_EQUAL, PORT_EQUAL, DATABASE_EQUAL and USER_EQUAL are independent booleans. SAME_DATABASE_IDENTITY uses normalized host + effective port + decoded database and deliberately ignores username/password so alternate credentials cannot falsely establish distinct databases. Omitted port equals PostgreSQL default 5432; normalized DNS case/trailing dot and IP spelling are compared consistently; database/user case is preserved. Bad scheme, whitespace/control, encoding, port, query/fragment, unsupported multi-host/identifier form or missing identity blocks. Validation is a bounded syntax contract, not a complete libpq URL grammar or a hostname environment heuristic.

DATABASES_DISTINCT=true means distinct parsed candidates only. Internal and External URLs, DNS aliases, proxies, ports or routing can point to the same actual DB. Owner must privately confirm distinct intended resources in the provider inventory; comparing one resource's two endpoint forms is not valid distinctness evidence. No ownership/reachability/physical isolation is inferred offline.

## 6. Compare helper

New `backend/scripts/compareDatabaseTargets.cjs`: dependency-free local parse/compare, no dotenv, filesystem, DB client or network. Outputs fixed status/code/scope plus eight booleans: STAGING_URL_VALID, PRODUCTION_URL_VALID, HOST_EQUAL, PORT_EQUAL, DATABASE_EQUAL, USER_EQUAL, SAME_DATABASE_IDENTITY, DATABASES_DISTINCT. It never echoes supplied values or parse exceptions. Invalid inputs make distinctness false. Valid different candidates exit 0 with explicit owner-attestation-required reason; invalid/collision/unsupported args exit 1. No URL arguments are accepted.

Runbook includes masked PowerShell prompts rather than pasted secret literals, and finally cleanup of both temporary URL env entries. Owner keeps URLs in a private store and uses a non-transcribed local shell. Environment/plaintext still exists transiently in process memory; this does not promise protection from privileged local processes. No real URL was requested or processed in this run.

## 7. Snapshot contract and checker integration

New `PRODUCTION_DATABASE_OWNER_SNAPSHOT.example.json` defaults to productionDatabaseCreated=false, comparison=null, all four canonical attestations=null, migrationAuthorized=false and migrationRun=false. It is a schema example, not evidence that provisioning happened.

New companion `backend/scripts/productionDatabaseProvisioningCheck.cjs` imports the existing 4B attestation values and calls the unchanged infrastructure checker in plan-only mode. No change to 4B default, --plan or --migration-readiness semantics. This pre-migration resource stage intentionally does not replace 4A/4B build/revision/backup/migration gates or require a deployed backend for DB creation.

Strict snapshot validation rejects unknown keys, raw values, wrong labels/version/environment, nonboolean flags, invalid phrases and inconsistent comparison booleans. CLI reads a bounded regular metadata file (16 KiB maximum; UTF-8 BOM accepted), refusing symlink ancestors and echoing no path/error contents. --contract exposes fixed metadata only. No-argument mode uses the false/null example; --snapshot selects an owner's private metadata file. No env autoload/write/export.

Fixed reason codes distinguish DATABASE_NOT_PROVISIONED, DATABASE_PROVISIONED_NOT_ATTESTED, DATABASE_IDENTITY_COLLISION, DATABASE_DISTINCTNESS_CONFIRMED, DATABASE_TARGET_ATTESTED, DATABASE_MIGRATION_NOT_AUTHORIZED and DATABASE_MIGRATION_NOT_RUN. Supplied false migration flags are owner evidence, not remote verification. Output always retains databaseState=NOT_QUERIED, emptyDatabase=NOT_VERIFIED and readOnlyInspection=NOT_RUN. No runtime startup consumes this metadata.

## 8. Owner provisioning runbook

New PRODUCTION_DATABASE_PROVISIONING_RUNBOOK.md provides seven phases: before create, manual creation, private Internal/External URL collection, same-type URL comparison, canonical attestations/private safe snapshot, future separately authorized read-only inspection, STOP.

Owner later creates exactly one new separate PostgreSQL resource after verifying account/workspace, staging identity, desired production name, plan/durability/lifecycle, region/version/network and costs. An already existing resource with the same label causes STOP for identity/history review, not duplicate creation or assumed emptiness. No staging relink, Blueprint import, clone/restore/import, env change, backend connection or deployment. Current provider UI/pricing/network behavior was not queried by Codex.

## 9. TLS/SSL policy

Application runtime database.js remains unchanged: URL default verify-full, rejectUnauthorized=true, optional CA file, disable supported, require rejected and SSL query overrides rejected. Existing 3Z.1 operator attestation for a privately verified Internal URL is preflight-only; it neither switches runtime TLS nor automatically authorizes the same policy for a future resource. Do not reuse a staging exception without fresh target review.

Owner future External administration requires verified TLS/hostname identity; 3Y inventory also requires verify-full for non-loopback targets. Certificate compatibility and trust are not proven offline. Missing trust/permission evidence means STOP, with no silent downgrade or global TLS bypass. 3Y's historical attested pg_dump source-only require exception is not an inventory/runtime/inspection exception. No TLS settings, CA file, env value or certificate was modified. Compare helper is TLS-neutral and does not discard query options silently.

## 10. Empty/unmigrated requirement

Desired post-owner-creation state: PROVISIONED BUT UNMIGRATED / NOT INITIALIZED, with emptiness still UNVERIFIED until later inspection. No fake empty check is performed offline. Runbook prepares bounded catalog SQL in BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, local statement/lock timeouts and final ROLLBACK. It inspects current-schema boolean, non-system/non-public schema counts, tables/all relations, migration-ledger object count, non-extension routines/types, extensions, event triggers, foreign servers, publications/subscriptions and large objects. It returns no raw DB connection identity.

Any unexpected object, nonzero/unknown count, incomplete permissions or provider-baseline difference triggers private review/STOP, not deletion/reset or a forced PASS. Catalog visibility and extension/provider baseline limit the assertion; it is not forensic proof of all possible state. This SQL was source-reviewed only, not executed against any DB. 3Y schema diagnostics remain unchanged and no app data is read.

## 11. Migration prohibition

4C.1 stops no later than READ_ONLY_INSPECTION_PENDING; no migration readiness/authorization is granted. Future inspection itself requires separate owner authorization. No migration/restore/seed/DDL/DML/application startup against either staging or future production. No DATABASE_URL change, backend link or staging modification. No backup/restore/dump reads, pg_dump/pg_restore or remote DB connection. Only explicitly allowed existing local temporary regression schema operations are excluded from the real-DB-mutation count below.

## 12. Focused tests

Initial focused run passed 80/80. Final syntax review added invalid DNS-label and unsupported multi-host comparison cases; final focused suite PASS 84/84, exit 0. Tests cover all requested missing/invalid/collision/attestation/migration cases, full synthetic pre-migration PASS, safe default BLOCKED, equivalent endpoint spellings, changed credentials, distinct candidates and alias limitation, malformed/oversized/secret-bearing snapshots, safe CLI output, BOM/symlink handling, canonical 4B reuse, protected runtime/provider/payment behavior, read-only SQL boundary and no startup wiring.

New suite uses offlineNetwork preload and failing HTTP/HTTPS/TCP/TLS/fetch/DNS/subprocess guards, rejects pg/app DB imports, and traps filesystem writes during checker execution. Forbidden attempts=0; no DB singleton/driver loaded. Synthetic snapshot files use uniquely named local .tmp/4c1-* directories, resolved path guards and cleanup. No real URL, resource ID, provider credential or remote DB evidence is involved. Synthetic PASS is not an owner assertion about actual resources.

## 13. Regressions

Required focused commands executed with `node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit`:

| File / command | Result |
| --- | --- |
| backend/tests/productionDatabaseProvisioning.test.cjs | PASS 84/84 |
| backend/tests/productionInfrastructure.test.cjs | PASS 82/82 |
| backend/tests/productionFoundation.test.cjs | PASS 32/32 |
| backend/tests/preProductionReadiness.test.cjs | PASS 39/39 |
| backend/tests/databaseContinuity.test.cjs | PASS 20/20 |
| node backend/scripts/sprint3mRegression.cjs | PASS 101/101, 12 suites, exit 0 |
| node backend/scripts/sprint3mVerify.cjs | PASS 205 syntax files / 415 secret-scan files / findings=[], exit 0 |
| git -c core.safecrlf=false diff --check | PASS |

Before backend regression, a read-only local configuration check mirrored dotenv precedence without outputting values: localOnly=true, databaseUrlAbsent=true, overridesAbsent=true (PGSERVICE/PGHOSTADDR/PGOPTIONS/PGSERVICEFILE/NODE_OPTIONS). Existing runner is unchanged, with local host guard and unique sprint3m_reg_* schemas, fixture DDL/data and finally cleanup. No application/public/staging/production schema writes are authorized or performed by this regression.

Exactly one backend regression run completed, with all 101 tests in 12 suites passing and exit 0. Existing finally cleanup/pool shutdown completed. LOCAL TEST DB MUTATIONS: TEMPORARY SCHEMAS ONLY — PASS / CLEANED BY EXISTING REGRESSION CONTRACT. No independent application-row audit or additional DB connection was performed. Verifier inspected all six new files, with no syntax/known-secret findings. Both PowerShell blocks in the new runbook were parsed by the local PowerShell language parser: 2 blocks, 0 parse errors, 0 scripts executed. New-file whitespace/final-newline inspection: 6 files, findings=[]. Final report-only edits do not alter implementation or scan inventory.

An actual CLI run against the tracked default example returned BLOCKED / NOT_PROVISIONED, exit 1; snapshot and inherited plan checks passed, missing provisioning/identity/comparison/target blocked, both migration prohibition checks passed. This is expected incomplete owner evidence, not a code failure. Frontend full suite/build not repeated because frontend source is unchanged.

## 14. Exact changed files

Six new files only:

1. backend/scripts/compareDatabaseTargets.cjs
2. backend/scripts/productionDatabaseProvisioningCheck.cjs
3. backend/tests/productionDatabaseProvisioning.test.cjs
4. PRODUCTION_DATABASE_OWNER_SNAPSHOT.example.json
5. PRODUCTION_DATABASE_PROVISIONING_RUNBOOK.md
6. SPRINT_4C1_PRODUCTION_DATABASE_PROVISIONING_REPORT.md

Existing tracked edits: none. No new dependency, lockfile edit, generic duplicate manifest, alternate release receipt or replacement 4B attestation schema. Existing manifest/4B checker/schema, 4A/3Z/3Y tools/tests/runbooks, older reports, backend package/startup and both render templates unchanged. Unrelated paths untouched.

Frontend changed: NO. Backend runtime changed: NO. DB runtime behavior changed: NO. productionGate changed: NO. Hotelbeds changed: NO. Payments changed: NO. render.yaml changed: NO. render.production.yaml changed: NO.

## 15. Owner manual actions — handoff only

Follow the new runbook in a separately authorized owner session. Verify account/resource metadata and staging; create one new production DB without linking it; privately collect both connection URLs; compare like-for-like staging/production URLs locally; independently verify intended resources and distinctness; set only fixed canonical attestations in a private safe metadata snapshot; run the companion gate and STOP at inspection pending. Do not paste URLs or actual resource identity into chat/git/report.

Do not execute the prepared catalog inspection, migration, backup/restore, backend connection or deployment as an automatic next step. A later inspection must be explicitly authorized; migration remains NOT AUTHORIZED and NOT RUN. No owner-manual action is claimed executed in this report.

## 16. Blockers

No implementation blocker identified after focused validation. Actual production DB creation, identity and distinctness remain OWNER ACTION REQUIRED / NOT YET ATTESTED. No real empty-state, TLS compatibility or remote ownership evidence. The safe snapshot correctly blocks until the owner has completed the separate manual phase; no fabricated successful snapshot was written for actual use. Commit-hash discrepancy is documented from local evidence; remote history/push was not checked.

## 17. Limitations, final audit and status

URL comparisons and copied booleans do not prove separate remote resources. Attestations are unsigned owner assertions; false or stale input cannot be remotely verified offline. Helpers do not compare Internal and External endpoint ownership. No DNS/Render query, browser automation, CLI provisioning, resource/env/plan change, remote DB/psql, provider/payment/email call, backup/restore/migration, git add/commit/push or deploy. Source/catalog procedure review is bounded and no formal provider configuration/security audit is claimed.

Final audit order: `git status --short`, `git diff --stat`, `git diff`, `git -c core.safecrlf=false diff --check`. Tracked diff remains empty; six new 4C.1 files plus the four original unrelated paths are untracked. Diff check PASS. The new untracked files were separately reviewed and checked for whitespace because ordinary git diff excludes them. Working tree remains for owner review; no staging/commit/push. Codex stops after scope A.

CODE / OFFLINE: PASS.
OWNER PROVISIONING PROCEDURE: READY.
REMOTE PRODUCTION DATABASE: NOT CREATED BY CODEX.
PRODUCTION DATABASE: OWNER ACTION REQUIRED.
PRODUCTION DATABASE IDENTITY: NOT YET ATTESTED.
DATABASE DISTINCTNESS: NOT YET ATTESTED.
PRODUCTION MIGRATION: NOT AUTHORIZED.
PRODUCTION MIGRATION: NOT RUN.
PRODUCTION BACKEND CONNECTION: NOT CONFIGURED.
HOTELBEDS LIVE: NOT ENABLED.
SALES: DISABLED.
PAYMENTS: DISABLED.
REMOTE RESOURCES CREATED BY CODEX: 0.
EXTERNAL CALLS: 0.
REAL DB MUTATIONS: 0.
LOCAL TEST DB MUTATIONS: TEMPORARY SCHEMAS ONLY — PASS / CLEANED BY EXISTING REGRESSION CONTRACT.
