# Sprint 7F — Durable Reconciliation Storage Design & Persistence Contract

SPRINT 7F — CODE / OFFLINE: PASS — focused contract scope.
DURABLE RECONCILIATION STORAGE CONTRACT: PASS. PERSISTENCE SCHEMA DESIGN: PASS.
Existing data architecture: REUSED + HARDENED — existing repository location/executor conventions and 7C/7D projections.
Actual durable PostgreSQL persistence: NOT IMPLEMENTED. COMMERCIAL PRODUCTION READY: NO.

## 1. Baseline

2026-10-07, Asia/Qyzylorda. develop, tracked tree clean at start; HEAD `4c11af9 docs: record Sprint 7E admin reconciliation UI verification`. 7E committed. Unrelated untracked README.txt, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, docs/ and two anomalous filename entries preserved. No reset/restore/clean or git add/commit/push/deploy.

7C evaluator/7D safe operations read model ready offline. 7E read-only Admin foundation code/offline ready, but real datasource NOT CONNECTED. 7E owner browser acceptance remains PENDING — no new acceptance evidence supplied; this does not block offline 7F. No production DB provisioned/activated for this work. Existing payment mode/provider disabled/none, charge/refund/sales hard gates, disabled booking and Hotelbeds LIVE off preserved. No account/credential/provider lookup, real incoming webhook, production infrastructure or payment operation.

## 2. Existing DB/data-access architecture

Read narrowly: paymentReconciliation, reconciliationOperationsReadModel, paymentWebhookService, recovery/lifecycle semantics and prior reports/tests; frontend reconciliation service/store only for read-envelope compatibility. Existing providerCatalogRepository uses pg pool, parameterized SQL and explicit executor for transactional clients. Existing services/controllers are not universally repository-isolated. New seam goes under backend/repositories; no ORM/framework/dependency introduced.

Migration naming uses numbered descriptive SQL filenames; migrate runner sorts and tracks _migrations.name, holds an advisory lock and wraps each file in client BEGIN/COMMIT/ROLLBACK. Inspected repository/util paths did not provide a shared application transaction helper. Existing created_at/updated_at/NOW(), JSONB, ON CONFLICT and unique/partial indexes provide reusable conventions. Existing incidents use active status/partial uniqueness and later resolved states; those resolution semantics must not be copied into payment persistence. No general reconciliation soft-delete or admin case repository exists in inspected scope; admin read controllers currently query pool directly.

No existing DB module/environment imported by the contract. DB-related sources were read as text only; focused regression traps replace operations before use.

## 3. Persistence contract

New backend/repositories/reconciliationRepository.js exposes the disabled singleton/default factory, interface assertion and shared input validation/preparation. Async-compatible methods: upsertCase, getCaseById, findByCorrelation, listCases. No appendEvidence method: one atomic upsert envelope carries evaluation snapshot plus optional exact normalized event, preventing independently successful partial writes.

Write shape: `{ result, evidence, observedAt, expectedVersion }`. result is the actual server-owned 7C output; evidence is the corresponding verified 7B normalized event or absent when no incoming event exists. observedAt is explicit trusted UTC server evaluation time; expectedVersion is a nonnegative integer, zero for creation. The contract does not authenticate provenance; no browser may author these assertions. Unknown/accessor/custom-serialized fields are rejected, not silently retained.

Codes distinguish RECONCILIATION_STORAGE_DISABLED, RECONCILIATION_STORAGE_UNAVAILABLE, RECONCILIATION_CASE_NOT_FOUND, RECONCILIATION_CASE_VERSION_CONFLICT, RECONCILIATION_DUPLICATE_EVIDENCE, RECONCILIATION_EVIDENCE_CONFLICT, RECONCILIATION_INVALID_CASE and RECONCILIATION_INVALID_EVIDENCE. Duplicate event-free evaluation uses RECONCILIATION_DUPLICATE_CASE. Fixed errors never expose raw DB/provider/input values.

## 4. Case model

Stable caseFamilyId reuses 7D correlation hash; latestCaseId and every stored snapshot preserve exact 7C identities. Record includes safe request/provider/payment fingerprints, version, first/last observation and created/updated timestamps, validated snapshots and normalized evidence. New snapshots update version/time deterministically; duplicates do not.

Repository stores trusted observations, not category/priority/business decisions. Existing 7D classifies them on read. All operation/success flags remain disabled; no-action observations are rejected as incident writes and cannot mark an existing case resolved. No PAID/REFUNDED/CANCELLED/RESOLVED result accepted. New trusted observations remain part of the conservative unresolved history; latestCaseId is not final queue authority.

## 5. Evidence model

Validate normalized 7B schema (event/provider/payment/request ids, finite type/state, positive exact cents, currency, reconciled flag). Persist only event/provider/payment fingerprints, requestId, eventType, normalizedState, observed event amountMinor/currency, reconciled and canonical evidenceDigest/time. Original arbitrary provider labels/references are not persisted. Fingerprints must bind the exact supplied event to the evaluation's incoming/event hashes and owning correlation. Cross-correlation candidate attachments fail closed.

Amount/currency are observed event money, never a substitute for immutable intent money. Money mismatch decisions may be recorded as unresolved observations without rewriting prices. Current case contract has no trusted intent amount/lifecycleStatus output; these are not invented. Optional safe metadata is limited to existing typed fields; arbitrary metadata blobs are rejected.

RAW WEBHOOK STORAGE: NOT REQUIRED / PROHIBITED BY CURRENT CONTRACT. No PAN, CVV/CVC, track data, PIN, card details, secrets, signatures, Authorization, API key, JWT, DB URL, offer token, full payload or traveller PII. Current card-free architecture preserved.

## 6. Disabled/default implementation

Default singleton is frozen and disconnected. Writes always throw RECONCILIATION_STORAGE_DISABLED, without logging, serializing or pretending success. Reads return unavailable record:null or records:[]; no fake persistence/cases. No runtime/env selection of test adapter, no pg import and no startup/API wiring.

In-memory implementation lives only in backend/tests/helpers; requires NODE_ENV=test at construction. It reports storage=TEST_ONLY, durable=false. Available/unavailable fixtures implement the same async interface; separate instances/restarts share nothing. Test capacity fails closed rather than silently evicting history/replay protection. No memory implementation is exported as production persistence.

## 7. Idempotency/upsert semantics

Same correlation gives one stable family. Same snapshot/event retry returns duplicate/no effect, without version/time/evidence change. Same event id with conflicting digest/correlation returns RECONCILIATION_EVIDENCE_CONFLICT with STATE_CONFLICT and preserves original case/evidence. Same snapshot identity with contradictory safe contents is invalid. New event requires exact version and nondecreasing trusted server observation time. All validation and conflict checks occur before the local commit.

The fixture does not retain a rejected-event/conflict journal or automatically rewrite a conflict case. Duplicate webhook with a different reevaluation remains no-effect; an event-free trusted reevaluation may be supplied separately. Durable rejected-candidate/correlation-mismatch recording and real evidence sourcing require a future reviewed extension; no P0 closure claimed. Tests verify no partial write on conflict/version failure.

## 8. Concurrency design

Future PostgreSQL adapter: unique correlation, global observation identity and namespaced provider event keys, one client transaction for case plus observation/evidence, version-guarded update/row lock, immutable digest checks and fixed error mapping. Unknown commit outcomes require storage reconciliation, not charge/refund retry. Selected PSP account/environment event namespaces remain to be defined.

Local synchronous Map commit demonstrates test-fixture semantics only. CROSS-INSTANCE CONCURRENCY SAFETY: FUTURE DB REQUIREMENT. No DB transaction, distributed lock, durable replay guarantee, row lock or production race acceptance implemented. See schema design for the full prospective plan.

## 9. Security/data minimization

Strict property allowlists at write/result/diagnostic/manual-review/evidence boundaries reject suspicious keys. Dense fingerprint arrays reject getters, holes and custom serialization. Core event fields are scalar-validated; normalized fingerprints replace arbitrary labels. Copies before storage/return prevent caller mutation. No log/DB/network/provider/admin operation import in runtime repository contract. Shape validation does not prove signature or actual server provenance.

Every focused case traps DB query/connect, Hotelbeds Availability/CheckRate/Booking/Cancellation/status/reconciliation, legacy payment initiation, sandbox refunds, admin audit/action and logger calls. Attempts zero. Offline HTTPS and temporary lazy pg preload prevent real transport/query/connect during regressions. Preload/logs are OS TEMP harness artifacts, not runtime source.

Real PostgreSQL queries: 0. Real DB mutations: 0. Real PSP calls: 0. Hotelbeds Availability/CheckRate/Booking/Cancellation calls: 0 each. Refund calls: 0. Cancellation calls: 0. Operator action executions: 0. No real payment, incoming webhook or production DB access.

## 10. Read-model integration

Repository returns trusted records only to a future server consumer. Extract snapshots.map(snapshot => snapshot.result), then invoke existing 7D list/detail projections; records/version/timestamps/storage internals never flow directly to UI. Focused tests exercise real 7D list/detail on stored synthetic snapshots, preserving category/priority/status and safe normalized timeline.

Disabled read source is compatible with future conversion to 7E `{ source:'unavailable', items:[] }`. Frontend service/store unchanged and still show “Источник данных сверки пока не подключён.” No datasource activation or read HTTP route. Future GET list/detail must enforce backend admin authentication/permissions.

## 11. Proposed schema/index design

RECONCILIATION_PERSISTENCE_SCHEMA_DESIGN.md proposes two entities: stable case plus normalized observation/evidence (each observation preserves 7C caseId/result, optionally provider event). Primary/unique keys cover correlation, evaluation identity and namespaced provider event identity; case history index supports reads. No speculative priority/status/category/manual-review indexes until actual DB filter/pagination patterns justify a derived queue cache.

No migration/SQL file created, table/schema altered or DB queried. Production retention: OWNER / LEGAL / OPERATIONS DECISION REQUIRED. No automatic archive/delete; replay uniqueness must survive future retention policy. OPERATOR AUDIT TRAIL: FUTURE REQUIREMENT. No audit/action history rows or mutation endpoints.

## 12. Tests

Focused final 7F: **38/38 PASS**, one source-final invocation; no preliminary failed run. Covers disabled/interface/unavailable/not-found, stable identities, exact duplicates, conflicting evidence, version/time atomicity, safe normalized serialization, card/auth/PII/accessor/custom-serialization rejection, 7D read integration, immutable copies, no fake success/resolution and operation traps. No existing assertion modified.

Adjacent: **NOT RUN separately** — shared 7C/7D/lifecycle modules unchanged. Focused integration invokes them; full aggregate includes their suites.

Full backend: **862/876 PASS, 14 known DB-blocked, 0 unexpected failures**, cancelled/skipped zero, exit 1. One final-source aggregate includes 51 files, concurrency=1, force-exit and offline HTTPS/lazy pg blocks. Excludes dedicated real-PostgreSQL hotelbedsCatalog.integration.test.js, priceHistory.integration.test.js and stagingMigrations.integration.test.js. Known DB-blocked suites: hotelbedsAccess (1), hotelbedsCatalogPlan (1), hotelbedsContent (3), hotelbedsMultiDestination (1), hotelbedsPublicSearch (1), hotelbedsStagingTest (6), stagingAcceptance (1): 14 total. Full backend PASS not claimed.

Frontend full/lint/build: **NOT RUN** — frontend/config unchanged. Historical 7E aggregate/bundle fix is not a new 7F frontend result. Verifier: **PASS**, 240 backend syntax files, 523 secret-scan files, findings empty. Sprint 6A: **PASS**. `git -c core.safecrlf=false diff --check`: **PASS**. Each release check ran once after final source; only report result text was finalized afterward. New untracked source included in syntax/secret checks; tracked diff and index empty. 6B NOT RUN with intentionally uncommitted work. No deployment/browser acceptance.

## 13. Exact files

Modified existing files: **NONE**.

New:

- backend/repositories/reconciliationRepository.js.
- backend/tests/helpers/inMemoryReconciliationRepository.cjs.
- backend/tests/reconciliationPersistenceContract.test.cjs.
- RECONCILIATION_PERSISTENCE_SCHEMA_DESIGN.md.
- SPRINT_7F_DURABLE_RECONCILIATION_STORAGE_CONTRACT_REPORT.md.

Backend source added: YES. Frontend changed: NO. DB/schema changed: NO. No dependency/config/migration/gate/route/controller changes. All work untracked/unstaged; unrelated owner files untouched. No git add/commit/push/deploy.

## 14. Remaining production gaps

| Capability | After 7F |
| --- | --- |
| Persistence interface | READY — offline contract |
| Disabled safe repository | READY |
| Test repository | READY — isolated synthetic only |
| Schema design | READY — plan only |
| Normalized evidence model | READY — supplied trusted offline schema |
| Durable PostgreSQL implementation | FUTURE REQUIREMENT |
| Migration | NOT CREATED |
| Cross-instance concurrency | FUTURE DB REQUIREMENT |
| Operator audit trail | FUTURE REQUIREMENT |
| Retention policy | OWNER/LEGAL/OPS ACTION |
| Admin datasource activation | BLOCKED until durable repository/API exists |
| Real PSP status lookup | BLOCKED |
| Real payments | BLOCKED |

Deterministic case identity retained, duplicate/conflicting evidence protected: YES in tested fixture scope. Raw webhook/secrets/card data/traveller PII persistable: NO under current allowlisted contract. Actual durable storage not delivered; no commercial P0 work package closed. No real reconciliation cases, operator mutation or automatic reconciliation/compensation. COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.

## 15. Future migration/activation path

Separate owner approval/provisioning must precede migration creation/DB activation. Review selected provider namespace and trusted intent/evidence extension, conflict/commit-outcome handling, retention and operator audit decisions; then implement the adapter under existing parameterized client/executor conventions. Prove isolated PostgreSQL transactions, uniqueness, concurrency, crash/restart and safe serialization before activating authenticated GET read endpoints and the existing UI datasource. Never enable payment/refund/cancel execution because test memory persistence passes.

No real DB persistence, migration, production DB, real reconciliation case, operator mutation, PSP, payment/refund/cancellation implemented. Persistence is contract/design only. Production sales readiness not claimed.

OWNER BROWSER RECHECK FOR 7F: **NOT REQUIRED**. 7E owner browser acceptance remains separately **PENDING** absent owner evidence. No Hotelbeds/PSP/payment/webhook/DB request or deployment performed here.
