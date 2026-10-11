# Sprint 7V — Durable Commercial Orchestration Design & Crash Proof

## Subsequent 7X local schema proof

2026-10-11. [7X](SPRINT_7X_MIGRATION_023_LOCAL_PROOF_REPORT.md) implements023 and proves final local upgrade/fresh/ledger and DB primitive tests41/41. Original7V stop is historical; schema prerequisite now implemented locally, but full durable orchestration/crash proof remains runtime work for7Y. No staging023, new commercial runner, provider acceptance or activation. C0-04 SCHEMA IMPLEMENTED / RUNTIME OPEN, overall PARTIAL; no P0 closure or production guarantee.

## Subsequent 7W design — historical stop preserved

2026-10-11. [Sprint 7W](SPRINT_7W_DURABLE_OPERATION_SCHEMA_DESIGN_REPORT.md) resolves the schema prerequisite **BY DESIGN** with a HYBRID typed operation/attempt/evidence ledger and domain constraints. Proposed 023_durable_commercial_operations.sql is not created or executed. New runtime NOT IMPLEMENTED; no new crash/concurrency proof. 7V remains BLOCKED BY DESIGN historically; C0-04 remains PARTIAL, not closed. Separate schema/runtime authorization and tests are still required before 7V's durable crash proof can be completed. Commercial ordering remains OWNER DECISION REQUIRED; no real operation enabled.

2026-10-11, Asia/Qyzylorda. **BLOCKED — SCHEMA GAP DISCOVERED.** Stopped at the explicit sections 7/29 schema prerequisite, before migration or implementation. No commercial readiness claimed.

## 1. Baseline and current architecture

develop, HEAD `0b66b3b`; tracked status empty at start. Unrelated untracked owner files preserved. Checkout/review and disabled booking/payment intent boundaries are distinct from legacy persisted bookings and sandbox payments. Existing controller execution code is not a production commercial runner.

## 2. Durable entities

`checkoutSessionService` inserts checkout_sessions, reads authoritative offer_snapshot and expiry, and supports transactional FOR UPDATE/markUsed. bookingController inserts bookings and payments in a transaction. These are actual persisted entities, not proof of external effects. refundController persists sandbox refund_requests under booking/payment locks. Provider booking references/status/snapshots are stored on bookings.

Migration 021 defines reconciliation_cases and reconciliation_observations, correlation uniqueness, version and provider/event uniqueness. Its states are MANUAL_REVIEW_REQUIRED, COMPENSATION_REQUIRED, RECONCILIATION_REQUIRED and AWAITING_EVIDENCE. It is an observation schema, not a pre-dispatch operation ledger. Runtime repository remains disabled. Migration 022 changes users session_version/is_active only; it supplies no commercial operation primitive. No older migrations or live schema inspected; absence claims here concern the inspected orchestration contracts and 021/022, not an exhaustive live catalog audit.

## 3. Process-local state

Booking INTENT_READY and PAYMENT_INTENT_READY are response projections, with no intent write. SAFE TO LOSE while disabled; RECONSTRUCTABLE only while the authoritative checkout remains valid. They cannot record dispatched attempts. Webhook processor seen map, serialized promise tail and observation state are process-local: UNSAFE TO LOSE if used for real event replay/payment authority. They remain isolated test-only state. Provider response held between network completion and persistence is UNSAFE TO LOSE for future real execution.

## 4. Side-effect taxonomy and required invariants

| Operation | Preconditions and evidence | Retry and reconciliation requirement |
| --- | --- | --- |
| Supplier booking | Authorized server booking, valid trusted offer/checkout; durable claim and stable supplier client reference; authenticated supplier confirmation | Known not dispatched may retry; possible dispatch requires lookup/reconciliation; committed result reused |
| Charge | Server-owned account/order/money; durable operation and PSP idempotency reference; authenticated merchant-bound evidence | Possible charge is unknown, never a clean retryable failure; reconcile before redispatch |
| Cancellation | Authorized confirmed booking/reference and accepted cancellation terms; durable operation claim; supplier cancellation evidence | Already cancelled reuses result; possible cancellation requires reconciliation, not blind repetition |
| Refund | Authorized original charge/payment, cancellation/penalty policy and bounded refundable amount; durable refund operation; PSP evidence | Replay reuses result; unknown refund reconciled before any new attempt; no new partial-refund functionality proposed |

These are requirements, not new persisted fields or implemented capabilities. External systems and the local DB are not one atomic transaction; true exactly-once delivery is not claimed.

## 5. Idempotency and binding

Future atomic uniqueness must cover server-validated account/resource/operation and bounded non-PII business key, with an immutable payload digest: same key/same payload returns prior state/result; same key/changed payload conflicts. Client random keys alone confer no authority. Persist authoritative money/currency and external correlation before dispatch; do not accept browser replacements. Existing checkout validation/request hash and resource authorization are useful prerequisites, not durable operation deduplication.

## 6. Booking crash windows

providerBookingController.confirmProviderBooking already conditionally UPDATEs bookings to confirming and checks RETURNING before dispatch. This is a real per-booking atomic claim, not a process lock. A second caller loses the claim. However a crash before dispatch and a crash after supplier success can both leave confirming. Retry currently returns HOTELBEDS_CONFIRMATION_BUSY; no restart takeover/reconciliation contract for that stranded claim is demonstrated. confirmation_unknown has an explicit lookup path. A persisted consistent provider reference returns alreadyConfirmed. Do not call this complete B1–B4 restart proof.

## 7. Payment crash windows

prepareCheckoutIntent explicitly creates no row/reference/transaction. P1–P3/P5 durable charge recovery cannot be proved against that response projection. P4 duplicate event handling exists within one test processor, not across restart. paymentEvidenceBoundary durableEvidenceStore=false and no live adapter/verifier/merchant capability; synthetic evidence never becomes LIVE_VERIFIED.

## 8. Cancellation/refund crash windows

cancelProviderBooking checks already-cancelled, then simulates terms, calls cancel and only afterward UPDATEs bookings. No pre-dispatch cancellation claim is present in this path. Concurrent requests can both pass the initial check; a success followed by process death leaves no committed cancellation result. This is an inspected future-execution gap, not evidence of real duplicate calls in staging. Sandbox refund request/completion use transactions, locks and repeat-result responses; they do not dispatch PSP refunds and cannot establish external refund recovery.

## 9. Ambiguous outcomes and errors

bookingPaymentRecovery distinguishes NOT_SENT from SENT/UNKNOWN; possible dispatch without known outcome becomes OUTCOME_UNKNOWN. This pure policy is PARTIAL implementation evidence, not durable recovery execution. FAILED means known failure; RETRYABLE requires proof of safe retry; CONFLICT requires review; already completed reuses committed evidence. No raw provider errors should become retry authority.

## 10. Reconciliation role

Existing payment/reconciliation contracts can classify awaiting evidence, unknown/review and compensation requirements with request/provider/payment fingerprints. 021 uniqueness protects observation identity in its adapter, not dispatch ownership. Fingerprints alone are not recoverable vendor lookup credentials/references. Future operation correlation must support authorized investigation without exposing raw payloads. No provider lookup performed here.

## 11. Multi-instance limitations and classification

| Capability | Result |
| --- | --- |
| Booking durable intent | PARTIAL — persisted booking/claim; no complete operation/restart contract |
| Booking idempotency | PARTIAL — atomic per-booking confirmation claim and repeat result |
| Payment durable intent | OPEN |
| Payment idempotency | PARTIAL — local sandbox keys, no real charge ledger |
| Webhook/evidence replay | PARTIAL — memory processor plus inactive durable observation schema |
| Cancellation idempotency | PARTIAL — terminal check, no atomic dispatch claim |
| Refund idempotency | PARTIAL — transactional sandbox only |
| Ambiguous outcome handling | PARTIAL — policy and booking lookup path |
| Crash recovery contract | PARTIAL |
| Cross-process durability | PARTIAL — booking claim/021 uniqueness, incomplete commercial operations |

No process map or mock store is promoted as distributed commercial protection. P0 COMMERCIAL ORCHESTRATION remains PARTIAL; C0-04 is not closed.

## 12. Synthetic crash proof

New booking/payment durable crash proof NOT POSSIBLE against the current incomplete operation contract within this stopped sprint. Concurrent duplicate proof NOT RUN; existing source-level atomic booking claim is not a newly executed concurrency test. No new test file or fabricated mock durability. Existing historical tests are not reported as this sprint's results.

## 13. Schema gap — STOP

Required invariant: before any future external booking/charge/cancellation/refund dispatch, atomically create or claim one durable logical operation scoped to authorized account/resource/type/key, bind immutable request semantics, and preserve attempt/possible-dispatch state plus result/evidence correlation across process death. Competing processes must not dispatch independently; conflicting payload reuse must fail; possible external success must survive as unknown until reconciled.

The inspected payment contract has no persisted operation at all. Cancellation has no durable atomic pre-dispatch claim. 021 is restricted to observation cases/payment events and lacks the operation ownership/account/resource/type/attempt contract; 022 is account security. Reusing those tables as a generic runner would invent unsupported semantics. Persisted booking status alone does not establish all four operation invariants. A separately authorized schema-design sprint is required to choose reviewed constraints/state primitives, verify older schema compatibility and migration/rollback strategy. No new columns/table names asserted, no migration created or executed. This stop is the user's explicit requirement, not an additional approval policy.

## 14. Owner decisions

Commercial ordering: OWNER DECISION REQUIRED. PAYMENT→BOOKING, BOOKING→PAYMENT and AUTHORIZE→BOOK→CAPTURE require selected vendor/account capabilities and compensation policy. Local sandbox labels and cancellation-before-refund readiness do not select a live booking/payment model. Preserve current offer/checkout expiry: an expired retry must not silently become a new operation; future result lookup must distinguish replay from new dispatch authorization.

## 15. Exact changes

Modified SECURITY_PRODUCTION_GAP_CHECKLIST.md and SPRINT_7S_PRODUCTION_READINESS_REAUDIT_REPORT.md. New SPRINT_7V_DURABLE_COMMERCIAL_ORCHESTRATION_REPORT.md. Runtime/frontend/dependencies/schema/config unchanged. Everything unstaged; owner files untouched.

## 16. Validation

Focused/adjacent/full backend and frontend NOT RUN: stopped before implementation under the schema rule. Verifier PASS (299 backend syntax files, 635 secret-scan files, findings empty); 6A PASS; 021 preflight PASS (DISABLED — SAFE); 022 preflight PASS (executionAllowed=false, enforcementActive=false in offline default configuration, not an observation of staging). Each invoked once. Final diff-check result is reported in the task response. Known DB-blocked count not measured this sprint; unexpected test failures not measured because suites were not run. No DB/provider calls authorized. No migration, deployment, Render change, email, real booking/cancellation/refund/charge. Remote DB connections, Hotelbeds calls, PSP calls and money operations: 0.

## 17. Next step

Separately authorize commercial operation schema and restart/reconciliation design, retaining existing booking claim and sandbox contracts where appropriate. Require durable uniqueness, payload conflict, concurrent-process claim, crash-before/after-dispatch and evidence replay tests before future adapter integration. Do not enable any commercial flag. Real external acceptance NOT RUN; REAL BOOKING READY NO; REAL PAYMENT READY NO; COMMERCIAL PRODUCTION READY NO.
