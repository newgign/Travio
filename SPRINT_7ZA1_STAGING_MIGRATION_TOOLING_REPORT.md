# Sprint 7Z-A.1 — Staging Migration 023 Tooling Enablement

2026-10-11. Baseline: sprint-7za-tooling, HEAD/base7a683ca, tracked tree clean; fae6af3 is not an ancestor. Unrelated untracked owner files preserved, including an unused synthetic helper; no tracked7Y runtime present or imported.

Original blocker documented before implementation: migrate() invokes assertLocalExecutionAllowed() before constructing/connecting its pool even after legacy021/022 approval. That guard permits only NODE_ENV/APP_ENV/EXPECTED_APP_ENV=test, loopback, exact disposable7X database prefix, DB_SSL_MODE=disable and a matching explicitly injected pool. No CLI staging authorization exists. DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED is only checked disabled by offline preflight; old flags cannot authorize023. Denial precedes any DB mutation/connection. Existing local path must remain unchanged.

**PASS — migration tooling and local/mock proof only.** Original staging blocker RESOLVED in this uncommitted tooling source, not in remote7a683ca. Staging023 NOT EXECUTED. Production migration remains blocked. No7Y runtime imported/restored/cherry-picked.

## 1. Exact change and execution separation

Two tooling source files changed: durableCommercialOperationsMigrationGuard.cjs and migrate.js. Existing disposable7X branch/approval/strict target/pool checks unchanged. Legacy021/022 guard rejection paths retained for callers that do not select the new staging contract. No application controller/service/repository, startup, shared runtime config, package/dependency or SQL file changed. Root package.json is absent; backend/package.json owns the migrate/start scripts.

New staging path requires APP_ENV=staging, EXPECTED_APP_ENV=staging, NODE_ENV=production; valid pinned001–023 source inventory; disabled commercial/payment/reconciliation runtime; old021/022 flags absent/false; valid existing session mode; no mixed local approval; owner backup/restore attestation; exact target fingerprint binding and accepted TLS. No authorization inferred from filename, Render context or DATABASE_URL presence.

Pending023 additionally requires both:

```text
DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED=true
DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL=I_APPROVE_023_FOR_VERIFIED_STAGING_TARGET
```

Target binding variable: **DURABLE_COMMERCIAL_OPERATIONS_EXPECTED_DB_IDENTITY**, privately equal to the already verified RECONCILIATION_EXPECTED_DB_IDENTITY for the actual migration connection. Do not reuse an external-URL fingerprint for an internal-URL target without verification. No credential/hash values requested or printed.

Default absent/false flag cannot execute pending023. To support safe up-to-date reruns, a correctly bound staging config may connect and read ledger with the flag false; it is not execution authorization. If023 is already applied, it skips everything without SQL mutation and without requiring the temporary023 approval. Missing/malformed target config still fails before connect. Production is denied even with explicit023 flag, including up-to-date requests. No wildcard bypass/fallback.

## 2. TLS and configuration

Reuse config/database.js plus existing dbContinuity connection parsing/sourceIdentity. verify-full remains verified TLS with existing trust/CA readability requirements. DB_SSL_MODE=require is accepted **only** through renderInternalTls.approvedTarget(): explicit existing Render approval, staging environment, matching existing reconciliation/session identities and backup attestation, CA_PATH absent, no URL options/fragment/local target, disabled commercial/storage flags. Generic rejectUnauthorized=false is not introduced elsewhere. NODE_TLS_REJECT_UNAUTHORIZED=0 rejects.

The new migration guard rejects loopback as staging, production/live-labelled host/database and mismatching new/old fingerprints. Injected executor pools must carry exactly the validated connectionString and TLS configuration with no host/port/database/user/password override. Normal CLI constructs its pool directly from validated config/env, without loading the ambient dotenv application singleton. No real staging target was contacted to test this: mock configuration/executor tests and the existing explicit local path supply separate proofs.

SESSION_STATE_ENFORCEMENT may retain enabled or disabled during this additive023 migration. There is no requirement to disable accepted session enforcement merely to bypass old021/022 guards; those migration flags stay false. Existing runtime TLS/session configuration is unchanged. mandatoryConfig/preProductionCheck/preProductionEnvSchema were inspected; no shared-runtime change required. The dedicated offline023 preflight validates the new enabled staging configuration separately rather than claiming source-only checks prove DB state.

## 3. Exact ledger / transaction model

The same normal migration runner remains authority. After safe target/TLS validation, connect and acquire existing session advisory lock319003. For staging only, SELECT name FROM public._migrations ORDER BY name runs before any CREATE/ALTER/INSERT/BEGIN. It must match exactly the source001–022 prefix, or exactly001–023 for a safe rerun. Missing ledger/missing022/holes/duplicates/unknown names/unexpected024 reject before migration SQL. Source files are checked again under the lock against pinned ordered inventory.

Staging does not create/repair a missing ledger and does not insert manual baseline rows. Exactly pending023 then flows through the original BEGIN → SQL file → ledger INSERT → COMMIT; SQL failure ROLLBACK. Advisory unlock/release/pool end retained. Already-applied names are skipped using existing runner behavior. No separate executor, raw SQL workflow, through:22 staging skip or migration024. Local path still creates fresh ledger and applies001–023 normally. New staging history validation is stronger than the old local SELECT-per-file behavior.

CLI failures retain nonzero exit1; fixed safe codes suppress raw exception message/stack/arbitrary error.code. SQLSTATE errors map to MIGRATION_SQL_FAILED; unknown errors to MIGRATION_FAILED. Guard codes remain specific. No stderr suppression or ||true.

## 4. Operator env table

Values below are owner requirements, not a live Render inspection. Keep accepted private credentials and fingerprints private.

| Variable | Normal staging | Temporary migration | Restore | Why |
| --- | --- | --- | --- | --- |
| DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED | false/absent | true | false | One controlled023 execution opt-in |
| DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL | absent | I_APPROVE_023_FOR_VERIFIED_STAGING_TARGET | remove | Explicit owner acknowledgement |
| DURABLE_COMMERCIAL_OPERATIONS_EXPECTED_DB_IDENTITY | establish privately from verified migration target | same verified RECONCILIATION_EXPECTED_DB_IDENTITY | retain bound value for future safe status reruns | Exact target identity, not an execution flag |
| APP_ENV / EXPECTED_APP_ENV | staging / staging | unchanged | unchanged | Staging only |
| NODE_ENV | production | unchanged | production | Existing deployed runtime mode |
| RECONCILIATION_STORAGE_MIGRATION_ENABLED | false | false | false |021 not re-authorized |
| SESSION_SECURITY_MIGRATION_ENABLED | false | false | false |022 not re-authorized |
| SESSION_STATE_ENFORCEMENT | current accepted enabled/disabled | unchanged | unchanged | No session downgrade |
| RECONCILIATION_STORAGE_MODE | disabled | disabled | disabled | No reconciliation runtime activation |
| DB_SSL_MODE | existing accepted require or verify-full | unchanged | unchanged | No TLS downgrade |
| RENDER_INTERNAL_TLS_REQUIRE_APPROVAL, when require | I_APPROVE_RENDER_INTERNAL_TLS_REQUIRE_FOR_VERIFIED_STAGING_TARGET | unchanged | unchanged | Existing Render-only TLS contract |
| DB_SSL_CA_PATH, when require | absent | absent | absent | Existing require contract |
| BACKUP_RESTORE_READY_ATTESTED | I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET | unchanged after owner reconfirms evidence | unchanged | Existing target-specific attestation |
| RECONCILIATION_EXPECTED_DB_IDENTITY / SESSION_SECURITY_EXPECTED_DB_IDENTITY | privately verified matching target bindings | unchanged | unchanged | Existing Render target contract |
| PRODUCTION_SALES_ENABLED / REAL_CHARGES_ENABLED / REAL_REFUNDS_ENABLED | false / false / false | unchanged | unchanged | Money remains OFF |
| HOTELBEDS_BOOKING_ENABLED / HOTELBEDS_LIVE_BOOKING_ENABLED | false / false | unchanged | unchanged | Booking remains OFF |
| PAYMENTS_MODE / PAYMENTS_PROVIDER | disabled / none | unchanged | unchanged | PSP remains OFF |
| LOCAL_COMMERCIAL_MIGRATION_APPROVAL | absent | absent | absent | Never use disposable-local opt-in on Render |

Identity binding/backup/restore are operator attestations, not certificate verification or fresh backup execution by this sprint. No expiry/freshness check of an actual backup artifact was added. Owner must reconfirm suitable evidence before rollout.

## 5. Exact commands and revision boundary

From repository root, normal migration command:

```sh
npm --prefix backend run migrate
```

backend/package.json maps this to node scripts/migrate.js. npm runs inside backend; __dirname resolves repository database/migrations. Keep repository root layout in Render.

**Approved conditional temporary Build Command for the future tooling revision:**

```sh
npm --prefix backend ci --omit=dev && npm --prefix backend run migrate
```

It is NOT approved on unchanged7a683ca, and this task does not run it.&& propagates failed install/migration to failed build. Normal Build Command to restore:

```sh
npm --prefix backend ci --omit=dev
```

Unchanged Start Command:

```sh
npm --prefix backend start
```

There is no tooling revision hash yet: source/docs are unstaged and uncommitted. Do not invent one or deploy7a683ca expecting this fix. New tooling commit must be based on7a683ca without7Y ancestry; owner must record its exact hash after separate commit/push authorization. Existing services remain manually configured; no Blueprint, Shell, new service or frontend deploy needed.

## 6. Future owner rollout sequence — not executed

1. Review only tooling/test/docs diff on sprint-7za-tooling; verify023 identical to7X, no024 and no tracked7Y runtime. Preserve unrelated untracked files; do not use git add .
2. In a separately authorized owner step, commit/publish **only** this tooling revision from the7X line to origin/develop. Do not merge/cherry-pick/push local7Y commit fae6af3. Record the new exact remote revision; current7a683ca lacks this change.
3. Verify remote tree excludes7Y runtime and Render's selected code revision is the approved tooling commit. If automatic normal deployment occurs, confirm its unchanged Build/Start settings and health before migration. Do not assume checked-in render.yaml manages the manual service.
4. Privately reconfirm staging target,001–022 ledger, matching backup/restore proof and existing secure TLS/target bindings. Keep commercial/reconciliation/Admin runtime OFF. Set the new target identity binding without printing it.
5. Prepare the temporary023 flag/approval and temporary Build Command above as one controlled configuration change. Avoid an unintended intermediate deploy; verify saved values before initiating the existing backend service's manual deploy of the exact approved commit.
6. Capture safe migration log evidence. Expect021 and022 already applied, then `→ applying 023_durable_commercial_operations.sql`, `✓ 023_durable_commercial_operations.sql applied`, `✓ Travio database is up to date`; successful exit0. Applied marker follows SQL+ledger COMMIT. Any other newly applied migration is STOP.
7. Restore normal Build Command, set023 flag=false and remove temporary023 approval. Keep target binding and accepted TLS/session config. No old021/022 flag was enabled.
8. The successful migration build normally continues to the unchanged Start Command. No redundant migration build is needed. If restoring settings causes/requires a normal deploy/restart, first confirm approved tooling revision, normal Build Command and migration flag=false.
9. Owner acceptance: backend LIVE; /health200; /api/health/ready ready/database.ok=true; normal login/admin/search PASS. No booking/payment/cancellation/refund or limiter exhaustion; no frontend redeploy.
10. Record exact applied ledger evidence and separately scoped catalog acceptance in7Z-B. Offline preflight is not DB acceptance. Keep7Y unpushed/undeployed until separately authorized after schema acceptance.

STOP on guard/TLS/identity/checksum/ledger failure, unexpected pending baseline, SQL error or ambiguous commit. Do not blindly retry, edit ledger/023, run partial SQL or drop schema. If023 commit proven but startup fails: SCHEMA SUCCEEDED / APPLICATION FAILED; rollback application code with SCHEMA PRESERVED. No backfill/historical adoption; future adoption DATA AUDIT REQUIRED.

## 7. Tests and local proof

Final focused **47/47 PASS**. Covers default/malformed flags, staging approval, production refusal, disabled commercial gates, old flags off, target/TLS binding, pool overrides, missing/duplicate/unexpected ledger,023 checksum mismatch, one transaction/ledger insert, rollback/unlock/cleanup, enabled/disabled up-to-date reruns, safe preflight/errors and CLI exit1. Fake executor only; no remote hostname connection. Initial focused46/46 before adding checksum regression; final47/47 retained in final combined run.

Adjacent final **217/217 PASS**: durableCommercialOperationsMigration, reconciliationMigrationDesign, reconciliationMigrationActivationGuard, sessionSecuritySchema, renderInternalTls, stagingDeployment, databaseContinuity, preProductionReadiness. Final combined **264/264 PASS**. First adjacent216/217 failed only a source-format assertion requiring original filter syntax; restored that exact formatting without weakening tests or changing behavior, then final combined passed.

Local migration regression **41/41 PASS** via existing durableCommercialOperationsMigration.local.cjs. Created a new dedicated `.tmp/sprint7za1-pg-20261011` cluster on127.0.0.1:55437 using synthetic role and fresh uniquely named7X upgrade/fresh DBs required by the preserved local guard. No owner DB reused or staging config impersonated. Normal runner proves022→023 upgrade,001→023 fresh, ledger/reapply/catalog integrity and DB constraints/concurrency. Every SQL row synthetic. Cluster stopped after proof; databases retained. Final source-only formatting restoration does not alter this local behavior; final mock/adjacent tests cover final source. No separate real staging-path integration claim.

Focused rerun after strengthening the restored-environment assertion also **47/47 PASS**, explicitly removing temporary approval when flag=false/absent. No implementation change followed the final combined run. Full backend NOT RUN: migration tooling only; no shared business-runtime change. Frontend NOT RUN: unchanged. Release checks once: verifier **PASS** (305 syntax files,652 secret-scan files,findings empty);6A **PASS**;021/022/023 preflights **PASS**, execution disabled under offline defaults;final diff-check **PASS**. No release check connects to PostgreSQL. Local evidence: .tmp/sprint7za1-focused-restored-env.log, regression-final.log, local.log and release logs. Existing offline preload blocks actual pg/HTTPS in focused/adjacent runs; local proof explicitly isolates loopback and blocks HTTP/HTTPS/fetch.

## 8. Exact files and readiness

Modified tooling: backend/scripts/migrate.js; backend/scripts/lib/durableCommercialOperationsMigrationGuard.cjs.

New test: backend/tests/durableCommercialOperationsStagingMigration.test.cjs.

Modified available docs: SECURITY_PRODUCTION_GAP_CHECKLIST.md; SPRINT_7X_MIGRATION_023_LOCAL_PROOF_REPORT.md. New report: SPRINT_7ZA1_STAGING_MIGRATION_TOOLING_REPORT.md. Earlier7Z plan and7Y report are absent on this branch; neither was restored/fabricated. This report supplies the updated owner runbook. No unrelated untracked files touched.

023 source unchanged;024 NONE. Runtime commercial code changed NO; tracked7Y runtime present NO. The unused untracked helper left by prior work remains preserved/excluded, not part of this tooling revision. No staging/remote DB connection or remote migration; staging mutations0; Hotelbeds0; PSP0; booking/payment/refund/cancellation/money0; Render/deploy/git add/commit/push0. Everything unstaged.

Original blocker RESOLVED IN LOCAL TOOLING SOURCE / REMOTE PUBLICATION AND STAGING ACCEPTANCE OPEN. P0 commercial orchestration remains PARTIAL overall; no commercial-production readiness or P0 closure. Default pending migration blocked; explicit staging authorization conditionally allowed; production blocked; real money remains blocked.
