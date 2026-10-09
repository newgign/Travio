# Sprint 7I — Reconciliation Migration Activation Guard & Dry-Run Gate

SPRINT 7I — CODE / OFFLINE: PASS (offline scope).
MIGRATION ACTIVATION GUARD: PASS.
NORMAL BACKEND DEPLOY WITH MIGRATION 021 PRESENT: SAFE with respect to accidental reconciliation migration/activation. Applying schema REQUIRES EXPLICIT MIGRATION STEP.

## 1. Baseline

2026-10-09, Asia/Qyzylorda. Branch develop; HEAD `1eb218c docs: record Sprint 7H postgres reconciliation verification`. Tracked tree clean before work. Sprint 7H committed. Existing unrelated untracked owner files preserved. No dependencies, frontend work, Render access, deployment, git add/commit/push or real database operations.

7H baseline preserved: 021 created but unexecuted; PostgreSQL repository ready only as a mock SQL contract; runtime adapter, Admin datasource and reconciliation writes inactive. No schema/data change.

## 2. Actual migration execution path

Staging and production Blueprint backend build: `npm --prefix backend ci --omit=dev`. Backend package has no install/postinstall/prepare migration hooks. Start: `npm --prefix backend start` → backend package `node server.js` → dotenv/config, shared `db.js` pg Pool construction, route/service imports → Express listen → health/backup/reliability/Hotelbeds monitor start calls. None calls the migration runner or executes reconciliation DDL. Blueprints have no preDeployCommand; backend package has no prestart/poststart. No database initialization/bootstrap helper applying DDL was found in inspected runtime paths.

Pool construction and ordinary health/monitor SQL are distinct from schema migration. Normal backend may use its existing database for health/application work; this sprint did not start it against a real DB. Migration status service only reads `_migrations`; it does not apply pending files. Readiness may report 021 pending until separately approved execution; no status is forged to hide it.

Explicit execution before 7I: `npm --prefix backend run migrate` → `node scripts/migrate.js` → migrate() → shared pool.connect() → session advisory lock 319003 → create `_migrations` if absent → enumerate/sort all .sql files → check filename ledger → BEGIN → execute each pending file → ledger insert → COMMIT; on file failure ROLLBACK; finally unlock/release/end. 021 would have been included without a feature-specific approval gate.

After 7I, migrate() first calls assertExecutionAllowed(env), before even importing/constructing the default pool. Failure rejects the entire command before connect/lock/ledger/SQL. Approved operation preserves the existing ordered runner and transactions. No skip, renumber, fake ledger entry or direct per-file executor was added. Explicitly injected pools remain a trusted test/operator seam; configuration attestation cannot validate the identity of an arbitrary caller-supplied executor.

## 3. Current deploy/startup risk

Classification: **B. MIGRATIONS RUN ONLY THROUGH EXPLICIT COMMAND** (before and after). Automatic migration execution: NO. No C/D release blocker discovered in checked repository commands. Actual externally configured dashboard commands were not inspected because Render access was forbidden; conclusion covers the checked-in startup/deployment paths.

Ordinary backend deployment with 021 present: SAFE for this activation question. Explicit migration command now intentionally fails closed by default, including when 021 might already be applied: no DB connection is made to discover ledger state. Operators must reopen the approved gate for the whole migration batch. Future 022/inventory growth needs an intentional reviewed guard/inventory update, not a bypass.

## 4. Activation policy

New narrowly scoped `RECONCILIATION_STORAGE_MIGRATION_ENABLED` defaults OFF; only exact `true` enables execution consideration. Execution additionally requires intact ordered source inventory/hash, disabled storage and financial/booking gates, APP_ENV staging/production matching existing EXPECTED_APP_ENV, `RECONCILIATION_MIGRATION_APPROVAL=I_APPROVE_021_FOR_VERIFIED_TARGET`, existing `BACKUP_RESTORE_READY_ATTESTED=I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET`, and a matching `RECONCILIATION_EXPECTED_DB_IDENTITY` fingerprint. Missing, malformed or mismatching requirements reject with a fixed safe code. These are operator attestations, not proof of backup completion or cryptographic owner approval.

Schema migration, repository selection, Admin datasource and writes are independent. Execution does not set any mode, inject any repository, enable Admin reads or permit writes. No future activation step was performed.

## 5. Storage mode/default behavior

`RECONCILIATION_STORAGE_MODE` defaults `disabled`. The runtime repository factory validates it and constructs only the existing disabled repository. Any other value, including postgres, empty or incorrectly cased values, fails closed with RECONCILIATION_ACTIVATION_BLOCKED. postgres is deliberately not operational yet: 7H identifies unresolved read API pagination/filter integration. Later separately approved code must implement a read-only selection path. There is no automatic pg adapter construction from DATABASE_URL or the migration flag.

7G still returns source=unavailable, empty items and detail404; writes reject RECONCILIATION_STORAGE_DISABLED. Existing explicitly injected adapters for offline contract tests are unaffected.

## 6. Target DB identity safeguards

Reuses dbContinuity.connection() strict URL/TLS parsing and sourceIdentity() SHA256 of host/port/database (existing loopback normalization), plus EXPECTED_APP_ENV and backup attestation conventions. The expected fingerprint must come from independently verified target inventory/backup evidence, never be auto-derived as approval from the currently supplied URL. Staging and production must have separately verified target identities; environment name agreement alone cannot prove physical separation. Neither URL, credentials, host/database labels nor parsing errors are printed. No real identity query now. A future operator must verify actual server identity and backup evidence in the authorized window before execution; DNS/proxy identity cannot be proven offline.

## 7. Migration preflight

`node backend/scripts/reconciliationMigrationPreflight.cjs`: static/config only, no dotenv or application pool imports, connection, SQL, subprocess, env/file mutation. Recognizes 021, checks contiguous unique inventory and pinned LF-normalized source SHA256 `5c43e366e44b19dacba086e95c41a1610163cceb31cef1691c7c089e64ca3cb6`, requires execution OFF, storage disabled and safe sales/payment/refund/booking settings. Unknown execution values and active storage fail. Unset financial flags use existing disabled defaults; main preproduction validator continues requiring explicit deployment values. Safe output: PASS / DISABLED — SAFE. Unsupported CLI arguments fail. Enabled execution intentionally fails this OFF-state preflight even when fully attested; execution authorization is a separate validation path.

CLI final-source invocation once: PASS. Earlier development call exercised the exported preflight function; tests also exercise it. No claim of actual schema/ledger verification.

## 8. Release guard

preProductionCheck.configuration() adds RECONCILIATION_STORAGE: PASS, code DISABLED — SAFE for safe defaults. Non-disabled mode, enabled/invalid migration flag, unsafe payment/sales/booking configuration or source-integrity failure blocks release configuration. Production foundation already reuses this configuration validator, so both staging and production inherit the guard. A deployment does not fail simply because reconciliation is disabled. Existing general release/sales restrictions remain unchanged.

## 9. Migration inventory

PASS: 21 ordered migrations 001–021, no duplicate versions or gaps; 25 inventoried tables and 76 explicitly inventoried indexes. Existing dbContinuity inventory/named composite FK support retained. No ledger hash convention exists; new pinned source hash is an offline integrity gate, not a claim of an applied database checksum.

021 unchanged: additive two reconciliation tables and four indexes; no DROP/TRUNCATE/ALTER or booking/payment DML; composite ownership FK, family/event uniqueness, positive versions, bounded safe-integer observed cents and currency checks retained. No card/secrets/raw webhook columns. JSONB object checks are not full payload validation; the repository contract remains required. Static tests do not prove PostgreSQL syntax/constraint/concurrency behavior.

## 10. Failure/rollback strategy

Runner supports per-file BEGIN/COMMIT/ROLLBACK, including the matching filename ledger insert. Failure before a confirmed commit rolls that file back if the connection remains usable. Earlier committed migrations are not undone; session-level ledger creation is outside each file transaction. Partial/manual application or lost connection/commit acknowledgement requires operator inspection of exact schema and ledger; do not infer rollback or retry blindly. Advisory lock serializes cooperating runners, not arbitrary external DDL.

If 021 succeeds but activation fails, keep datasource disabled and preserve schema. If future read activation causes an issue, disable the feature through its approved configuration/release procedure; do not delete schema. No automatic down migration or DROP was introduced.

## 11. Tests

Final focused invocation once, nine files: **351/351 PASS**, including **34/34 Sprint 7I**, **317/317 relevant regression** across PostgreSQL repository, migration design, database continuity, preproduction readiness, production foundation, production infrastructure, production provisioning and staging deployment. Test runner aggregate totals are authoritative.

One full backend invocation after final runtime/scripts/tests source: **980/994 PASS**, failures14, cancelled/skipped0, exit1; 55 files. Three dedicated real-DB `.integration.test.js` files excluded: hotelbedsCatalog, priceHistory, stagingMigrations. Known DB-blocked14: hotelbedsAccess1, hotelbedsCatalogPlan1, hotelbedsContent3, hotelbedsMultiDestination1, hotelbedsPublicSearch1, hotelbedsStagingTest6, stagingAcceptance1. Unexpected failures0. No rerun to improve totals.

Aggregate safety preload traps pg Pool/Client connect/query before real IO and blocks HTTPS. DB-dependent tests hit OFFLINE_POSTGRES_FORBIDDEN; mock SQL/pools and local HTTP test harnesses are allowed. New tests additionally trap forbidden imports and count zero default-path IO attempts. This is offline validation, not integration acceptance.

Final-source verifier once: PASS, 251 backend syntax files,539 secret scan files, findings empty. 6A once: PASS. Migration preflight CLI once: PASS. Source diff-check: PASS. 6B NOT RUN while intentionally dirty. Frontend full tests/lint/build NOT RUN; frontend unchanged.

Real PostgreSQL connections0; queries0; mutations0; migration executions0; PSP0; Hotelbeds Availability0/CheckRate0/Booking0/Cancellation0; real refunds0/cancellations0. Mock executor calls are not real operations.

## 12. Exact files

Modified:

- backend/repositories/reconciliationRepository.js
- backend/scripts/migrate.js
- backend/scripts/preProductionCheck.cjs
- backend/tests/stagingDeployment.test.js

New:

- backend/config/reconciliationStorage.js
- backend/scripts/lib/reconciliationMigrationGuard.cjs
- backend/scripts/reconciliationMigrationPreflight.cjs
- backend/tests/helpers/reconciliationMigrationEnv.cjs
- backend/tests/reconciliationMigrationActivationGuard.test.cjs
- SPRINT_7I_RECONCILIATION_MIGRATION_ACTIVATION_GUARD_REPORT.md

Generated local evidence (unstaged): .tmp/sprint7i-focused.log, .tmp/sprint7i-backend.log, .tmp/sprint7i-verifier.log, .tmp/sprint7i-6a.log, .tmp/sprint7i-preflight.log; aggregate safety preload .tmp/sprint7i-offline.cjs. Owner files untouched. Everything left unstaged.

## 13. Safe future activation procedure

Not performed:

1. Obtain explicit owner approval for the exact target and ordered pending migration batch.
2. Verify target environment, host/port/database identity, separation from the other environment, independently expected fingerprint and actual server identity.
3. Create and verify backup and restore readiness for that target; preserve evidence.
4. Run OFF-state offline preflight, review pending ledger/schema separately under authorization, and complete isolated real PostgreSQL integration/concurrency testing.
5. In an operator-only execution window set the explicit migration gate, target fingerprint, environment matching and required approval/backup attestations; keep storage and financial/booking gates disabled.
6. Explicitly invoke the existing migration command. Never add it to startup/predeploy/install hooks.
7. Verify committed ledger, tables, FK/indexes/constraints and schema compatibility on the verified target.
8. Set migration execution back OFF and rerun the safe OFF-state preflight.
9. In a separately reviewed implementation resolve 7H read pagination/filter integration and introduce approved read-only postgres selection. Current code intentionally refuses postgres mode.
10. Verify authenticated Admin read API, unavailable/error/permission behavior, queue completeness and browser acceptance.
11. Enable trusted reconciliation writes only in a later separately approved sprint; financial operations need their own readiness/approval.

## 14. Remaining production gaps

Real PostgreSQL migration/constraints/transactions/concurrency/recovery and performance unverified. No durable datasource, ingestion, write or financial activation. Future adapter must enforce read-only behavior and resolve Admin list completeness; backups and DB identities need actual owner evidence. Manual SQL/external dashboard configuration lies outside this guard. Guard attestations cannot substitute for operational verification.

Migration activation default OFF; storage default DISABLED; PostgreSQL repository runtime active NO; Admin datasource active NO; reconciliation writes active NO; target DB identity guard designed YES. DB/schema actually changed NO; frontend changed NO. OWNER BROWSER RECHECK FOR 7I NOT REQUIRED; 7E/7G browser acceptance PENDING. Real Payments BLOCKED. COMMERCIAL PRODUCTION READY NO. PRODUCTION SALES READY NOT CLAIMED.
