# Sprint 7H — PostgreSQL Reconciliation Repository & Migration Dry-Run Foundation

SPRINT 7H — CODE / OFFLINE: PASS — focused tested scope.
POSTGRES RECONCILIATION REPOSITORY: PASS — mock executor contract only.
MIGRATION DESIGN: PASS — static verification only; not executed or PostgreSQL-parser verified.
Existing DB architecture: REUSED + HARDENED. COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.

## 1. Baseline

2026-10-08, Asia/Qyzylorda. develop; clean tracked tree at start; HEAD `57e4855 docs: record Sprint 7G admin reconciliation API verification`. 7G committed, 7F persistence contract/schema design and 7G read API reused. Unrelated owner untracked files preserved. No frontend edits, deploy, git add/commit/push, dependencies, provisioning or real credentials. 7E/7G browser acceptance remains separately pending.

## 2. Existing DB architecture

Existing pg Pool in backend/db.js, parameterized $n values and explicit executor convention in providerCatalogRepository. No shared application transaction helper found in inspected scope. Adapter follows the existing one-client BEGIN/COMMIT/ROLLBACK/release pattern; introduces no ORM or transaction manager dependency. Explicit injected pool only, no backend/db or pg import and no environment-based selection.

Migration runner sorts numbered .sql files in database/migrations, records filenames in _migrations, takes advisory lock 319003 and wraps each file in a transaction. No down-migration convention. Latest existing migration 020; new migration 021. Existing schemas use JSONB, NOW(), unique indexes. New observation/creation times use TIMESTAMPTZ with canonical UTC output.

## 3. Migration

Created `database/migrations/021_reconciliation_storage.sql`. MIGRATION CREATED: YES. MIGRATION EXECUTED: NO. STAGING DB CHANGED: NO. PRODUCTION DB CHANGED: NO. No runner invocation or SQL dry-run against any database; dry-run foundation means static contract inspection only.

Two tables follow 7F: reconciliation_cases owns stable correlation/fingerprints, latest evaluator alias, optimistic version and observation/creation times; reconciliation_observations owns immutable evaluator result JSONB, snapshot digest and optional typed normalized evidence. No separate speculative evidence/audit table. Case correlation tuple unique; observation identity primary key; provider/event unique; composite FK binds case/request/provider/payment. Positive version, bounded positive safe-integer observed cents, uppercase three-letter currency and complete-or-absent evidence checks. FK does not cascade deletes.

No invented authoritative intent money or lifecycle columns: 7C does not supply them. A small case cache stores category/priority/queue status/manual/compensation flags derived from existing 7D conservative aggregation on every distinct write; it is not a separate business decision. Queue priority/family, status/category and observation-history indexes support implemented filter/order/history paths. No blanket JSONB GIN or speculative time/boolean index.

Additive DDL only; no DROP/TRUNCATE, existing table changes, data rewrite or flag changes. Existing runner will include 021 in a future migration run, so any future deploy that invokes it must receive the required migration approval/preflight first. No claim that direct SQL writes are safe: application validation remains mandatory; JSONB type checks are not a full schema or secret detector.

## 4. PostgreSQL repository

New createPostgresRepository({pool}) factory implements the unchanged four-method 7F contract: getCaseById, findByCorrelation, listCases, upsertCase. No standalone appendEvidence: evidence append is atomic within upsertCase and current contract exposes no independent append permission. No fake successful disabled write, seed, runtime adapter or HTTP mutation.

Reads assemble the existing case record shape with snapshots/evidence arrays; evaluator aliases resolve to the same family. Evidence contains safe fingerprint identities and normalized fields, never original provider identifiers. get/list case+history queries use one repeatable-read read-only transaction to avoid mixed-version results. List page max100, default100, offset bounded 0..9999900; maximum1000 combined observations per read and1000 per case write, overflow fails closed rather than silently truncating evidence. Empty source is available only for explicitly injected adapter; default source stays unavailable.

## 5. Query safety

Identifiers/order expressions chosen only from hardcoded mappings. Priority/category/status and actual boolean manualReviewRequired/compensationRequired validated by existing operations.list; numeric bounds and unknown keys rejected as RECONCILIATION_INVALID_FILTER before IO. Allowlisted sort: priority (default), lastObservedAt descending, caseId (stable family identity); deterministic family tie-break. All values, ids, JSONB result, lock keys, limit/offset use parameters. No caller-supplied SQL fragments.

Not connected to 7G: its current service requests an unfiltered repository list then projects/paginates locally. Before future activation, reconcile repository pagination/filter delegation and frontend first-page completeness; do not simply replace the default and assume a complete active queue.

## 6. Transactions/idempotency

prepareWrite validates and copies strict case/evidence schema before opening a connection. One client: BEGIN, deterministic transaction advisory locks for case/snapshot and optional provider/event key, case FOR UPDATE, global event/snapshot checks, bounded history, version/time checks, case insert or version-guarded update, observation insert, COMMIT; rollback on failure and release. New case version1; distinct trusted observation increments version once. Older observation rejected. No business-state transition, charge/refund/cancel call or automatic retry.

Exact duplicate snapshot/event returns DUPLICATE_CASE / DUPLICATE_EVIDENCE with effectApplied=false before stale-version checks; no version/time/cache/evidence write. Conflicting event digest/family returns RECONCILIATION_EVIDENCE_CONFLICT, preserving canonical evidence. Snapshot alias inconsistent digest/family is invalid. A zero-row compare-and-swap update is version conflict. Known errors mapped to fixed repository codes; raw pg codes/detail/message suppressed. Unexpected uniqueness/serialization/database errors conservatively map STORAGE_UNAVAILABLE; lock design handles ordinary same-adapter duplicates. No speculative classification of arbitrary 23505 constraints.

Commit response loss is STORAGE_UNAVAILABLE and is not proof that the DB rolled back. No write retry in adapter. Future storage-outcome reconciliation must retry identical trusted input/read evidence, never retry a financial operation.

## 7. Concurrency design

CROSS-INSTANCE CONCURRENCY: DESIGNED / NOT PRODUCTION-VERIFIED. Sorted advisory transaction lock identities include absent case rows and global event/evaluator alias keys; row lock, optimistic predicate and unique/composite FK constraints provide intended protection. Hash collisions serialize unrelated requests, not bypass identity checks. Real PostgreSQL behavior, isolation/constraint enforcement, deadlock/crash/restart/commit ambiguity, compatibility and multiple adapter instances remain isolated integration requirements. Mock SQL tests prove orchestration/contract paths only, not SQL execution or durable concurrency. Vendor merchant/account/environment event namespace remains unselected-PSP work.

## 8. Security/data minimization

Unchanged 7F prepareWrite rejects unknown/accessor/custom-serialization fields at envelope/case/diagnostic/manual/evidence boundaries; only safe normalized result and typed evidence inserted. Raw webhook, signature/Authorization/API key/JWT/offer token, card data and traveller PII cannot be persisted through this repository contract. No arbitrary metadata/full provider payload storage. Fingerprints are pseudonymous correlation aids, not encryption or proof of verified evidence provenance. Caller must provide real trusted server evaluator output after future verification.

## 9. Runtime default safety

Default remains reconciliationRepository.repository (disabled). No modification of 7G router/read service, startup, environment config or frontend. PostgreSQL repository runtime active: NO. Admin datasource active: NO. List still source=unavailable/items=[]; detail404. No runtime cases, ingestion, operator mutation or financial operation. DATABASE_URL existence cannot select this adapter. Backend source added: YES; DB/schema actually changed: NO.

## 10. Tests

Final repository focused: **38/38 PASS**. Migration focused: **16/16 PASS**, static only. Preliminary combined run45/50 had five test-setup/assertion failures: mutation regex matched FOR UPDATE, and polluted evidence was passed through evaluator before repository. Corrected mutation-statement anchoring and constructed valid evaluator output before adding forbidden evidence fields. Added consistent read/version-CAS/capacity/connection-failure regressions; final runtime/test source frozen before aggregate run. Existing assertions not weakened.

Each repository focused test traps real pg Pool/Client connect/query, Hotelbeds availability/checkrate/booking/cancel/status/list and booking reconciliation, payment initiation and refund calls; attempts zero. SQL executor/pool completely mocked, transactional connect/release count checked. Migration tests read files only. HTTPS preload blocks accidental external calls. Aggregate lazy pg preload blocks actual connections/queries before use.

7F/7G/7D contracts/source unchanged: no separate adjacent invocation; aggregate includes them. **Full backend: 921/960**, failures39, cancelled/skipped0, node exit1. One aggregate invocation of54 files; three dedicated real-DB integration files excluded (hotelbedsCatalog, priceHistory, stagingMigrations). Known DB-blocked14: hotelbedsAccess1, hotelbedsCatalogPlan1, hotelbedsContent3, hotelbedsMultiDestination1, hotelbedsPublicSearch1, hotelbedsStagingTest6, stagingAcceptance1. Additional/unexpected failures25 came from the new migration exposing fixed20-file source inventory assumptions: databaseContinuity1, preProductionReadiness5, productionDatabaseProvisioning7, productionFoundation5, productionInfrastructure6 plus the failing databaseContinuity parent (Node counts that parent too).

Corrected migration to existing CREATE TABLE/INDEX IF NOT EXISTS syntax; updated strict preflight inventory counts to21 migrations/25 tables/76 indexes. Extended dbContinuity inventory/archive/schema validation for explicitly named composite FK and updated its exact fixtures; missing composite members remain rejected. Targeted affected six-file verification **273/273 PASS**, including16 static migration tests. Then added an incomplete-composite-FK assertion and reran that changed databaseContinuity file: **20/20 PASS**. These overlapping runs are not added together or substituted into full totals. Full backend not rerun, and full PASS on final source is not claimed. Final targeted checks have no unresolved unexpected failure.

Verifier PASS (246 backend syntax files,533 secret-scan files, findings empty);6A PASS;diff-check PASS. Release checks initially ran before aggregate results were inspected, then repeated after the necessary inventory correction to verify final source; each had two invocations. This exception is recorded rather than claiming every check ran once. Frontend full tests/lint/build NOT RUN — frontend unchanged.6B NOT RUN with intentionally dirty work.

## 11. Exact files

Modified existing files:

- backend/scripts/lib/dbContinuity.cjs — inventory recognizes named composite FK; archive/schema checks preserve all owning-correlation columns.
- backend/scripts/preProductionCheck.cjs — strict expected inventory updated for approved new migration.
- backend/tests/databaseContinuity.test.cjs — updated exact inventory fixtures and regression rejecting partial composite FK.

New:

- backend/repositories/postgresReconciliationRepository.js
- database/migrations/021_reconciliation_storage.sql
- backend/tests/postgresReconciliationRepository.test.cjs
- backend/tests/reconciliationMigrationDesign.test.cjs
- SPRINT_7H_POSTGRES_RECONCILIATION_REPOSITORY_REPORT.md

All unstaged. Owner files untouched. Real PostgreSQL connections/queries/mutations:0; real PSP calls:0; Hotelbeds Availability/CheckRate/Booking/Cancellation calls:0; refund/cancellation calls:0. No provisioning/deploy/migration execution.

## 12. Migration activation plan

Not performed now. Later sequence: owner approves durable datasource activation; backup the exact target DB and verify restore readiness; migration preflight/version/namespace/schema review and isolated PostgreSQL transaction/concurrency tests; authorized migration execution; schema/index/FK/constraint verification; explicit repository injection in controlled environment after resolving pagination/filter integration; verify authenticated safe read API; verify Admin UI completeness/unavailable/error/permissions; only later separately wire real trusted reconciliation writes. Retain disabled financial gates throughout datasource acceptance. Do not enable based on DATABASE_URL or use demo records.

OWNER BROWSER RECHECK FOR 7H: NOT REQUIRED. 7E/7G staging browser acceptance remains separately required after their future deploy. No DB action required here.

## 13. Remaining production gaps

SQL/static foundation is not real durable acceptance. Migration unexecuted, adapter inactive, real Postgres syntax/constraints/transaction/index performance/cross-instance behavior unverified. Trusted intent references/financial evidence, account namespace, retention/audit/conflict journal, commit-outcome recovery, datasource pagination integration and owner DB promotion remain future requirements. No commercial P0 package claimed closed. No PSP/payment/refund/cancellation. Real Payments: BLOCKED. COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.
