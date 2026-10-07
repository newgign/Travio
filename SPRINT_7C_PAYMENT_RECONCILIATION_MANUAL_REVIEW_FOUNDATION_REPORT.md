# Sprint 7C — Payment Reconciliation & Manual Review Foundation

SPRINT 7C — CODE / OFFLINE: PASS — tested contract scope.
PAYMENT RECONCILIATION FOUNDATION: PASS. MANUAL REVIEW FOUNDATION: PASS.
Existing architecture: REUSED + HARDENED. COMMERCIAL PRODUCTION READY: NO.
PRODUCTION SALES READY: NOT CLAIMED. Full backend PASS is not claimed.

## 1. Baseline

2026-10-07, Asia/Qyzylorda. Branch develop; tracked tree clean at start. HEAD `a83fdf9 docs: record Sprint 7B payment webhook foundation`. 7B contract, webhook processor, tests and report were tracked and committed. Unrelated untracked owner files preserved: README.txt, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, docs/ and two existing anomalous filename entries. No reset/restore/clean, staging, commit, push or deployment.

Preserved disabled defaults and production hard gates: PAYMENTS_MODE=disabled, PAYMENTS_PROVIDER=none, REAL_CHARGES_ENABLED=false, REAL_REFUNDS_ENABLED=false, PRODUCTION_SALES_ENABLED=false. No booking/LIVE/email/infrastructure/config changes. No actual environment credentials inspected or used by the evaluator. No new dependency, route, controller, migration, card input or provider selection.

## 2. Existing reconciliation architecture

Narrowly inspected 7B paymentProviderContract/paymentWebhookService, paymentGatewayService, bookingPaymentRecovery, bookingLifecycle, 7B report/tests and relevant payment/lifecycle contracts. No frontend implementation read or changed.

Recovery policy is centralized in bookingPaymentRecovery: OUTCOME_UNKNOWN derives RECONCILIATION_REQUIRED and disallows attempts; observed booking plus failed payment derives cancellation compensation; observed capture plus failed booking derives refund compensation. Its retry strings are recommendations, not execution. Existing labels without providerResultObserved do not prove success. bookingLifecycle requires evidence and unresolved recovery for partial failures, rejects false success, and requires explicit reconciliation to leave unknown.

7B previously checked money/correlation, event-id digest duplicates, contradictory final states and unknown ordering inside its isolated processor. Rejected events returned fixed codes without retaining their evidence. No dedicated human-review classification/read model existed. The new evaluator distinguishes WAIT_FOR_PROVIDER from manual verification/escalation and compensation review; it retains prior/incoming evidence fingerprints in its returned projection. Full evidence remains caller-owned; nothing is durably stored.

## 3. Reconciliation evaluator

New server-only `paymentReconciliation.evaluate` is pure, synchronous and unwired to runtime HTTP/startup. Inputs: actual server PAYMENT_INTENT_READY/REVIEW_READY intent, trusted provider/payment correlation, internal payment observation, trusted booking state/evidence flag, optional normalized authenticated event, ordered previously accepted evidence and optional unresolved recovery state. Shape validation is not cryptographic proof of provenance. Browser input must never supply these evidence assertions. The evaluator neither authenticates webhook bytes nor queries provider status; callers must use the verified adapter boundary.

Copies/revalidates normalized events against the existing contract; rejects invented states, unknown event fields and invalid money. Previous history is bounded at 1,000 and must match immutable intent money/correlation. Malformed input raises fixed RECONCILIATION_INPUT_INVALID without echoing payloads. Extraneous top-level browser prices/PII are unused and omitted from output.

Outputs status/reasonCode, manualReviewRequired, reconciliationRequired, compensationRequired, recommendedNextAction, observedPaymentState, deterministic caseId and allowlisted diagnostic/manualReview projections. Needed statuses only: NO_ACTION_REQUIRED, AWAITING_PROVIDER_EVIDENCE, RECONCILIATION_REQUIRED, MANUAL_REVIEW_REQUIRED, COMPENSATION_REQUIRED, STATE_CONFLICT. Every result has contractOnly=true, commercialSuccess=false, applicationPaymentState=PAYMENTS_DISABLED, PROVIDER_NOT_CALLED, effectApplied=false and all payment/refund/cancellation attempt flags false.

Shared `paymentProviderContract.observationDecision` extracts the exact 7B observation ordering. Both webhook processor and evaluator reuse it. Existing webhook acceptance/state effects are unchanged; no new lifecycle enum or independent execution state machine.

## 4. Unknown outcome handling

Unknown without evidence, ordinary failed/captured evidence, or duplicate evidence remains unresolved. Only new trusted normalized evidence explicitly marked reconciled can derive another contract observation, subject to money/correlation/history consistency. This marker remains synthetic adapter semantics, not a real PSP receipt or browser authority. A capture label lacking accepted capture evidence is projected as unknown. Booking confirmation without provider evidence is also unknown.

No automatic FAILED/CAPTURED/PAID/REFUNDED/RESOLVED runtime state. No mutation of current payment or booking. Internally consistent hypothetical capture remains commercially unsuccessful and application payments disabled.

## 5. Conflict handling

Captured then failed, failed then captured, cancelled/final contradictions, same id/different normalized content, stale pending after terminal/authorized evidence, inconsistent internal state versus accepted history, or ordinary resolution of unknown inside history fail closed to STATE_CONFLICT/manual escalation. Previous and incoming fingerprints remain separately represented. Invalid event money/currency yields PAYMENT_AMOUNT_MISMATCH/PAYMENT_CURRENCY_MISMATCH before ordering; correlation mismatch yields PAYMENT_CORRELATION_MISMATCH. These never authorize compensation execution or commercial success.

No timestamp precedence invented. Ordered accepted history is trusted caller evidence; vendor sequence/timestamp/replay rules need a selected PSP. A lone prior observation can represent a history suffix; the service does not claim it reconstructs a complete durable ledger.

## 6. Booking/payment cross-checks

Uses recovery.plan and lifecycle.validateLifecycleState on a hypothetical observation projection:

| Trusted observations | Decision / recommendation |
| --- | --- |
| Captured + booking confirmed, no unresolved recovery | NO_ACTION_REQUIRED; commercialSuccess=false |
| Captured + booking failed final | COMPENSATION_REQUIRED / REVIEW_REFUND; refundAttemptAllowed=false |
| Captured + booking unknown | RECONCILIATION_REQUIRED / VERIFY_PROVIDER_STATUS |
| Booking confirmed + payment failed final | COMPENSATION_REQUIRED / REVIEW_CANCELLATION; cancellationAttemptAllowed=false |
| Booking confirmed + payment unknown | RECONCILIATION_REQUIRED / VERIFY_PROVIDER_STATUS |
| Payment unknown + booking unknown | Reconciliation and manual review |
| Unresolved supplied recovery | Reconciliation; no final success |
| Pending/authorized payment with consistent booking | AWAITING_PROVIDER_EVIDENCE / WAIT_FOR_PROVIDER |
| Other lifecycle inconsistency | MANUAL_REVIEW_REQUIRED / REVIEW_BOOKING |

No refund recommendation is based solely on an unproven local capture label. No refund, cancellation, retry, booking or status operation is implemented or invoked. Recommendations describe future operator work only.

## 7. Manual review projection

Projection exists only for decisions requiring manual review. Exact allowlist: caseId, reasonCode, recommendedNextAction, requestId, providerFingerprint, paymentFingerprint, internalPaymentState, providerObservedState, bookingState, eventFingerprint, eventType, previousEvidenceFingerprints, incomingEvidenceFingerprint, amountMatch, currencyMatch. Provider/payment/event labels are SHA-256 fingerprints to avoid echoing secret-like arbitrary identifiers; requestId uses the existing validated 32-hex correlation contract. No timestamps or clock dependency.

No admin dashboard, operator endpoint, action runner, UI or persisted case. Fingerprints aid correlation but cannot reconstruct underlying provider evidence; future authorized operator tooling must source that evidence securely.

## 8. Idempotency/determinism

Canonical copied events and projected stable fields produce deterministic SHA-256 case identity independent of object property insertion order. Identical evidence/recovery/money inputs return identical complete decisions. Case classification is deterministic evaluation, not case creation. Same accepted event digest is DUPLICATE_WEBHOOK_EVENT with no effect; same id/different content is conflict. All evaluations have effectApplied=false. Unknown duplicate cannot act as new reconciliation evidence.

Different evidence sets, ordering or recovery context may produce different fingerprints/case ids. No process/global event storage, DB persistence, cross-instance uniqueness, crash safety or durable operator-case identity claimed. DURABLE RECONCILIATION STORAGE: FUTURE REQUIREMENT.

## 9. Security/data minimization

Service imports only node crypto and existing pure contract/recovery/lifecycle modules. No DB/client/provider/network/logger import, raw-body handling, signature storage or credential handling. Exact event schema rejects raw/card/auth additions. Output contains no raw webhook, signature, webhook secret, API key, Authorization, JWT, DB URL, offer token or traveller PII. Fixed input errors suppress sensitive input. Caller still owns authentication and trusted provenance; this is not production security/PCI acceptance.

Focused cases trap DB query/connect, Hotelbeds Availability/CheckRate/Booking/Cancellation/status/reconciliation, legacy payment initiation, sandbox refunds and logging. Forbidden operation attempts: 0. Existing HTTPS preload blocks external HTTPS; temporary pg preload blocks real Pool/Client queries/connects during regression runs. Temporary harness/log files live in OS TEMP and are not product source.

Real payment provider calls: 0. Real Hotelbeds Availability calls: 0. Real Hotelbeds CheckRate calls: 0. Real Hotelbeds Booking calls: 0. Real Hotelbeds Cancellation calls: 0. Real refund calls: 0. Real cancellation calls: 0. Real DB mutations: 0. No real PSP status lookup or incoming webhook. No automatic reconciliation.

## 10. Tests

Focused final 7C: **38/38 PASS**, one final-source invocation. Preliminary 36/36 passed; added two history regressions and hardened history consistency before freezing source. Final focused tests cover unknown, reconciliation evidence, contradictory/stale evidence, money/correlation, booking disagreement, compensation review, allowlist/no leakage, deterministic ids, duplicates and operation traps. Existing assertions unchanged.

Adjacent: **138/138 PASS**, one invocation of paymentProviderWebhookFoundation (7B), bookingPaymentRecovery (6K), bookingLifecycleConsistency (6M), bookingLifecycleReleaseCandidate (6N), justified by shared ordering and recovery/lifecycle reuse. 6J not separately run; gateway/intent behavior unchanged and included in aggregate.

Full backend: **784/802 PASS, 18 failures**, one aggregate invocation of 51 files, cancelled/skipped zero. Exact limited result; full backend PASS not claimed. Excluded hotelbedsCatalog.integration.test.js; aggregation included two other dedicated integration files beyond the 7B aggregate. Failure breakdown:

- **14 known DB-blocked**: hotelbedsAccess (1), hotelbedsCatalogPlan (1), hotelbedsContent (3), hotelbedsMultiDestination (1), hotelbedsPublicSearch (1), hotelbedsStagingTest (6), stagingAcceptance (1).
- **2 additional DB-blocked integration entry points**: priceHistory.integration.test.js and stagingMigrations.integration.test.js, blocked at query/connect; no real DB access.
- **2 harness-induced import assertions**: productionDatabaseProvisioning and productionInfrastructure require pg absent from require.cache. The initial temporary pg preload imported pg eagerly. Corrected only the temporary preload to patch pg lazily on actual module load; isolated recheck of these two files: **166/166 PASS**. No product/test assertion changed. The aggregate was not rerun and its 18-failure result is retained exactly; no synthesized replacement total claimed.

Release verifier: **PASS**, 235 backend syntax files, 509 secret-scan files, findings empty. Sprint 6A: **PASS**. `git -c core.safecrlf=false diff --check`: **PASS**. Each ran once after final source; only this report's result text was finalized afterward. Frontend tests/build/lint NOT RUN — frontend unchanged. 6B NOT RUN — intentionally uncommitted work. No deploy or browser acceptance.

## 11. Exact files

Modified:

- backend/services/paymentProviderContract.js — shared observation ordering extracted from 7B.
- backend/services/paymentWebhookService.js — reuse identical shared ordering.

New:

- backend/services/paymentReconciliation.js — pure evaluation/manual-review projection.
- backend/tests/paymentReconciliationFoundation.test.cjs — 38 focused offline cases.
- SPRINT_7C_PAYMENT_RECONCILIATION_MANUAL_REVIEW_FOUNDATION_REPORT.md.

Backend source changed: YES. Frontend changed: NO. DB/schema changed: NO. Dependencies/config/gates/routes/controllers unchanged. All work unstaged; unrelated owner files untouched.

## 12. Remaining production gaps

| Capability | After 7C |
| --- | --- |
| Payment reconciliation contract | READY — offline tested scope |
| Manual review projection | READY — pure contract |
| Unknown outcome handling | READY — supplied trusted synthetic evidence |
| Conflict detection | READY — contract ordering/money/correlation/history |
| Durable reconciliation persistence | FUTURE REQUIREMENT |
| Operator UI | FUTURE REQUIREMENT |
| Real PSP status query | BLOCKED — no PSP selected |
| Automatic reconciliation | NOT IMPLEMENTED |
| Real payments | BLOCKED |

No 7A commercial P0 package closed; 10 packages remain. P0-07 gains an offline evaluator component, not durable production execution/reconciliation; P0-04 account and P0-05 real integration remain open. No real PSP selected or merchant signup/account configured by this sprint; no production credentials used. No claims about privately existing accounts outside supplied evidence.

Unknown preserved, conflicts detected, amount/currency mismatch detected, booking/payment inconsistency detected, compensation/refund review safely derived, safe diagnostics and deterministic reconciliation case: YES in tested contract scope. Fake PAID/REFUNDED from this foundation: NO. Automatic reconciliation: NO. COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.

## 13. Future durable reconciliation path

After owner selection of PSP and requirements, engineering must define genuine status/signature/order evidence, immutable correlation and money, durable event/case uniqueness, transaction/crash-safe reconciliation, secure evidence retention, authorized operator access, and explicit audited action decisions. Vendor-specific replay/sequence/key rotation and sandbox validation precede separately authorized production acceptance. Do not treat reconciled=true or these fingerprints as a real receipt or authorization for refunds/retries/cancellation.

No real PSP, real provider status lookup, real payment, real refund, real cancellation, DB persistence, operator UI or automatic reconciliation implemented. Production sales readiness not claimed.

OWNER BROWSER RECHECK: NOT REQUIRED — frontend unchanged. If separately deployed later, owner checks only /health and /api/health/ready, with no Hotelbeds request/payment/webhook/refund/cancellation. No deployment performed.
