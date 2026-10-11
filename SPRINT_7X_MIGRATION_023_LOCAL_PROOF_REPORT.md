# Sprint 7X — Migration 023 Implementation & Local Proof

2026-10-11, Asia/Qyzylorda. **PASS — schema source and local synthetic proof. P0 COMMERCIAL ORCHESTRATION: SCHEMA IMPLEMENTED / RUNTIME OPEN.** No staging/production migration or external acceptance. PCI/commercial readiness not claimed.

## 1. Baseline and scope

develop, HEAD `f70895f docs: design durable commercial operation schema`. Tracked status returned no output; 7W committed. Highest migration 022 at start. Unrelated untracked owner files preserved. No design replacement: 7W HYBRID four-operation model retained. No application booking/payment/cancellation/refund execution changed. Migration loader/tooling changed narrowly, so one full backend aggregate was run.

## 2. Migration source and transaction

Created `database/migrations/023_durable_commercial_operations.sql`. Normalized-LF SHA-256: `598363a7bca38ecd18e40afabf042fe1b727aa022a2ccd4387cd71dc2d1f45f5`; pinned by new guard. Static test compares all 001–022 source against committed 7W: unchanged. No destructive DDL/DML/backfill, card/secret/raw payload columns or feature activation. Strict CREATE/ADD deliberately rejects incompatible existing objects rather than hiding them with IF NOT EXISTS.

Normal runner takes session advisory lock 319003 before ledger inspection, checks `_migrations.name` UNIQUE, and applies each migration SQL plus ledger INSERT inside BEGIN/COMMIT; failure ROLLBACK. Finally advisory unlock/release/pool end. 023 has PL/pgSQL blocks but no outer transaction wrapper. Raw SQL re-execution is not the idempotency contract; normal ledger reapply skips 023.

## 3. Exact additive objects

Tables: commercial_operations; commercial_operation_attempts; commercial_operation_evidence; commercial_operation_reconciliation_attempts; commercial_operation_reconciliation_cases. Column names/types follow 7W, including result_evidence_id, evidence source_kind and verification_receipt_id. bookings.checkout_token is nullable VARCHAR(80), FK to existing checkout_sessions; old rows remain NULL. Domain composite candidate keys added to bookings(id,user_id), payments(id,booking_id), refund_requests(id,payment_id,booking_id).

Functions: commercial_operation_update_guard, commercial_operation_child_guard, commercial_operation_result_guard. Triggers: commercial_operation_update_guard (initial-state/update/retention), commercial_evidence_guard (no UPDATE/DELETE), commercial_attempt_guard (identity/final outcome immutable), commercial_operation_result_guard (deferred terminal result integrity).

## 4. Constraints and indexes

Each new table has its PK; operation account/resource/type/key scope UNIQUE(user_id,booking_id,operation_type,idempotency_key). Attempt PK(operation_id,attempt_no), claim_token UNIQUE; evidence PK plus UNIQUE(evidence_id,operation_id) and UNIQUE(adapter_id,adapter_account_scope,execution_environment,event_identity_digest); reconciliation UNIQUE(operation_id,sequence_no); bridge PK(operation_id,case_family_id).

Named domain/correlation constraints: commercial_booking_checkout_fk, commercial_booking_owner_unique, commercial_payment_booking_unique, commercial_refund_payment_booking_unique, commercial_operation_owner_fk, commercial_operation_payment_fk, commercial_operation_refund_fk, commercial_operation_scope_unique, commercial_operation_resource_shape, commercial_operation_money, commercial_operation_claim_shape, commercial_operation_completion_shape, commercial_operation_time_order, commercial_operation_result_fk, commercial_operation_result_shape, commercial_reconciliation_receipt_fk. Additional inline FKs bind account/booking/payment/refund, attempts/evidence/reconciliation to operation and bridge to 021. New FKs use NO ACTION; evidence cannot cascade away with a domain delete.

CHECKs enforce four operation types, execution environment, legal ledger/attempt/evidence/reconciliation states, positive versions/context, nonnegative attempts, exact positive money <=9007199254740991 and uppercase currency with NULL-pair/type restrictions, identifier/digest bounds, claim/completion field pairs and timestamp ordering. Synthetic evidence cannot be LIVE_VERIFIED; reserved live evidence shape requires live environment, non-server source and receipt identity. These are shape rules, not cryptographic authenticity or live authorization.

Exact new indexes (17):

- commercial_booking_checkout_unique
- commercial_operation_booking_unique
- commercial_operation_charge_unique
- commercial_operation_cancellation_unique
- commercial_operation_full_refund_unique
- commercial_operation_external_unique
- commercial_operation_recovery_idx
- commercial_operation_account_idx
- commercial_operation_payment_idx
- commercial_operation_refund_idx
- commercial_operation_attempt_active_unique
- commercial_operation_attempt_recovery_idx
- commercial_operation_evidence_history_idx
- commercial_operation_result_idx
- commercial_operation_reconciliation_active_unique
- commercial_operation_reconciliation_evidence_idx
- commercial_operation_reconciliation_case_idx

External reference uniqueness is restricted to supplier booking and charge, scoped to adapter/account/environment/type. Cancellation/refund may share a parent reference; no invented universal reference uniqueness. Overall bounded continuity inventory: 30 tables including ledger, 93 explicit indexes, 32 FKs, 19 serial sequences, 23 migrations. Parser extended to strict CREATE/INDEX, UUID/TEXT FKs, additive candidate keys/FKs. This remains a bounded object inventory, not complete verification of every trigger/function/constraint body in a future backup. 023 archive restore acceptance is not claimed here; eventual remote rollout needs matching backup/restore evidence.

## 5. State/claim and ambiguity boundaries

Initial insert must be REQUESTED/version1/attempt0. Update trigger enforces 7W transition graph, immutable owner/resource/context/money/adapter/key, exact version increment, attempt progression and claim identity on dispatch authorization. Terminal mutation blocked; unchanged terminal replay allowed. Deferred result guard requires same-operation evidence, outcome, adapter/account/environment, money/currency/reference consistency; success requires current dispatched attempt and non-server evidence. Existing domain enums are untouched.

Schema supports conditional atomic claim; later 7Y supplies repository transaction/token ownership, trusted context/expiry/policy, attempt/evidence multi-row atomic writes and adapter provenance. A local DB guard cannot prove network quiescence or no external effect. OUTCOME_UNKNOWN is durable and never treated as ordinary timeout failure. No runtime retries, recovery worker, vendor lookup or live receipt writer implemented. The accepted 7W post-authorization paused-worker/no-effect ambiguity remains a runtime prerequisite; lease expiry/negative lookup alone never authorizes redispatch.

## 6. Local-only execution guard and preflight

New `durableCommercialOperationsMigrationGuard.cjs` and `durableCommercialOperationsMigrationPreflight.cjs` pin checksum, exact ordered inventory and disabled commercial/migration defaults without DB import. Old 021 inventory advanced to exactly 23 named files, retaining original hash/approval behavior; 022 integrity remains intact. Preproduction source inventory updated to 23/30/93.

Normal runner rejects old 021/022 remote approvals before connecting for the new batch. 023 remote execution is unavailable; no staging approval path created. Disposable-local path requires NODE_ENV/APP_ENV/EXPECTED_APP_ENV=test, explicit LOCAL_COMMERCIAL_MIGRATION_APPROVAL=I_APPROVE_NEW_DISPOSABLE_LOCAL_7X_DATABASES, disabled commercial/enforcement/storage flags, DB_SSL_MODE=disable, strict loopback URL without query/fragment, exact new-db prefix asedeliya_7x_upgrade_ or asedeliya_7x_fresh_ plus 12 hex characters, and an injected pool matching host/port/database with no overriding connectionString/TLS. Loopback accepted: localhost,127.0.0.1,::1. Tool does not load owner's application pool in this path.

Runner's optional through=22 boundary exists solely behind that local approval and pool check for upgrade fixtures; default invocation still processes the full ordered set. No remote skip policy. Static tests prove old approvals/wrong target/config cannot reach connect. Current existing staging runtime does not call this manual runner and is unchanged.

## 7. Local environment and disposable handling

PostgreSQL 18 tools available. Created a dedicated cluster `.tmp/sprint7x-pg-20261011`, restricted to 127.0.0.1:55437. initdb created a new cluster; sandbox pg_ctl startup failed to create its restricted token, then approved escalation started it. No ambient DATABASE_URL, env file, credentials or owner DB used/read. Local maintenance connection to that newly created cluster created only new Sprint 7X databases. DB names checked before every runner target is constructed. No pre-existing DB was reset/dropped.

Three local test invocations created these pairs (development 32 cases, expanded 41 cases, final catalog-comparison 41 cases):

- asedeliya_7x_upgrade_606ef7d934a5 / asedeliya_7x_fresh_606ef7d934a5
- asedeliya_7x_upgrade_1cee1a8b7f98 / asedeliya_7x_fresh_1cee1a8b7f98
- asedeliya_7x_upgrade_9e3580d88a0c / asedeliya_7x_fresh_9e3580d88a0c

All retained in this dedicated cluster; no DROP DATABASE. Per-run local manifests in `.tmp/sprint7x-local-databases*.json`. Final pg_ctl fast stop required approved escalation because sandbox could not signal the elevated process; result server stopped. No service installation or owner-cluster change. Local fixture rows only, no real PII.

## 8. Upgrade/fresh/ledger proof

Upgrade DB: same guarded normal runner applied 001–022 first and verified ledger count22, then applied 023. Fresh DB: normal runner applied 001–023. Reapply on upgrade: all files already applied, database up to date, 023 ledger entry exactly once, total23. Final comparison confirms fresh/upgrade columns, constraints, index definitions and trigger definitions match. New five tables exist and ledger rows are empty before fixtures: no automatic historical adoption. Existing tables remain queryable with synthetic domain fixtures.

## 9. DB invariant and concurrency proof

Final local tests 41/41 PASS: all four valid intents; duplicate logical operation despite changed key rejected; same key/different legitimate resource allowed; invalid type/state/initial dispatch/count/money/currency/null key/resource rejected; wrong account/payment FK rejected. Two independent connections concurrently insert one logical intent: exactly one survives, loser23505. Concurrent conditional claim: exactly one winner. CLAIMED→DISPATCHING→OUTCOME_UNKNOWN survives new connection read. Immutable money and domain-delete retention enforced.

Evidence same id/different payload and wrong-operation replay blocked; synthetic live-level forgery rejected; evidence UPDATE/DELETE rejected. Deferred terminal-result guard rejects mismatched money/wrong-operation receipt and rolls back state; consistent synthetic success persists, unchanged replay works, terminal reversal blocked. Completed attempt outcome immutable. One unfinished reconciliation claim enforced. Bridge correlates synthetic operation to 021. These are actual PostgreSQL constraint/primitive tests, not full external crash orchestration or multiprocess runtime acceptance.

## 10. Tests and exact aggregate limitation

New focused static/guard tests **54/54 PASS**. Adjacent invocation **191/191 PASS**, combined245/245, covering 021/022 design/activation, DB continuity/backup prefixes, preproduction and Render TLS. Initial development combined run239/245: five preproduction source assertions still expected22/25/76, one Render mock expected old approvals to reach pool. Updated source inventory and strengthened mock to assert new batch blocked before connection. No old migration or TLS invariant weakened.

One full backend aggregate: **1756/1771 PASS**, failures15, cancelled/skipped0. Four dedicated real-DB integration files excluded. **14 known DB-blocked** in the established seven suites; the additional failure was stagingDeployment's mock runner using old remote approvals, now correctly rejected before advisory lock. Fixture changed to explicit disposable-local pool/approval while retaining lock/unlock/release/end assertions; targeted runner regression6/6 PASS. Final continuity audit also covered TEXT bridge FK parsing; final continuity/backup/runner regression **60/60 PASS**. These final targeted runs resolve the extra test failure; **unexpected unresolved0**. The aggregate was not rerun under the one-run limit and predates that final test-fixture/parser correction; full backend PASS or final all-suite totals are not claimed.

Local final **41/41 PASS**, separate from aggregate. No frontend tests/build/lint: frontend unchanged. Offline aggregate preload blocked real pg connections/queries and HTTPS; local proof alone used its dedicated loopback DB. Evidence `.tmp/sprint7x-focused-final.log`, `.tmp/sprint7x-backend.log`, `.tmp/sprint7x-runner-regression.log`, `.tmp/sprint7x-final-continuity.log`, `.tmp/sprint7x-local-final-catalog.log`.

## 11. Backfill, rollback and ordering

Backfill NONE; historical adoption DATA AUDIT REQUIRED. No operation/charge evidence inferred from legacy statuses. Code rollback retains additive schema/evidence; no destructive down migration. With empty ledger, existing application does not require new rows. Once future operations exist, NO ACTION restricts domain/account deletion; rollout must gate old commercial writers and review delete/context-edit behavior. Commercial ordering OWNER DECISION REQUIRED; core remains order-independent. Authorization/capture extension not invented. Retention OWNER / LEGAL POLICY REQUIRED; no purge.

## 12. Exact files

Modified tooling:

- backend/scripts/migrate.js
- backend/scripts/lib/reconciliationMigrationGuard.cjs
- backend/scripts/lib/dbContinuity.cjs
- backend/scripts/preProductionCheck.cjs

Modified regression fixtures:

- backend/tests/databaseContinuity.test.cjs
- backend/tests/reconciliationMigrationActivationGuard.test.cjs
- backend/tests/sessionSecuritySchema.test.cjs
- backend/tests/renderInternalTls.test.cjs
- backend/tests/stagingDeployment.test.js

New source/tests:

- database/migrations/023_durable_commercial_operations.sql
- backend/scripts/lib/durableCommercialOperationsMigrationGuard.cjs
- backend/scripts/durableCommercialOperationsMigrationPreflight.cjs
- backend/tests/durableCommercialOperationsMigration.test.cjs
- backend/tests/durableCommercialOperationsMigration.local.cjs

Modified documentation: SECURITY_PRODUCTION_GAP_CHECKLIST.md; SPRINT_7S_PRODUCTION_READINESS_REAUDIT_REPORT.md; SPRINT_7V_DURABLE_COMMERCIAL_ORCHESTRATION_REPORT.md; SPRINT_7W_DURABLE_OPERATION_SCHEMA_DESIGN_REPORT.md. New report: SPRINT_7X_MIGRATION_023_LOCAL_PROOF_REPORT.md. No package/dependency/frontend/business-runtime/Render/env changes. Unrelated owner files untouched; everything unstaged.

## 13. Release checks and safety

Verifier PASS (303 backend syntax files, 645 secret-scan files, findings empty); 6A PASS; 021/022/023 preflights PASS, execution disabled in offline default configuration. These checks each ran once. No claim about live staging environment follows from offline preflight; staging session enforcement remains outside this task. Final diff-check result is recorded in the task response. Remote DB connections0; staging DB mutations0; migrations executed remotely0; local disposable migrations only. Hotelbeds Availability/CheckRate/Booking/Cancellation0; PSP/real booking/refund/cancellation/money/email0. Commercial flags untouched/OFF; no deploy or Render change. Local PostgreSQL activity is explicit synthetic schema/fixture proof, not a claim of zero local DB writes.

## 14. Remaining P0 and next step

Migration source READY; static validation PASS; local upgrade/fresh/ledger PASS; scoped DB idempotency PROVEN; atomic claim/ambiguity/reconciliation schema support READY; rollback READY. 021 extended additively by 023, not edited. Staging migration023 NOT RUN. C0-04 remains PARTIAL overall, counts P0 4/P1 8/P2 5/OWNER7/EXTERNAL2 unchanged.

Next: **Sprint 7Y — Durable Commercial Orchestration Runtime & Synthetic Crash Proof**, separately authorized. Implement repository transactions/claims/fencing/idempotent replay/unknown handling and restart/concurrent-process synthetic crash proof. No real external calls. REAL BOOKING READY NO; REAL PAYMENT READY NO; COMMERCIAL PRODUCTION READY NO.
