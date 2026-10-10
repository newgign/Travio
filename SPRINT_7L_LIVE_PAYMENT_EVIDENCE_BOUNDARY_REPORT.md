# Sprint 7L — Live Payment Evidence Boundary & Production Gate

SPRINT 7L — CODE / OFFLINE: PASS in tested scope. LIVE PAYMENT EVIDENCE BOUNDARY: PASS. MOCK/LIVE ISOLATION: PASS.
Existing payment architecture: REUSED + HARDENED.
P0 CONTRACT FOUNDATION: READY in repository/offline scope. P0 COMMERCIAL ACCEPTANCE: OPEN.
Real PSP adapter/authenticity, real merchant evidence and production durable evidence: BLOCKED.
SECURITY CERTIFIED: NO. PCI COMPLIANT: NOT CLAIMED. COMMERCIAL PRODUCTION READY: NO.
PRODUCTION SALES READY: NOT CLAIMED.

## 1. Baseline

2026-10-10, Asia/Qyzylorda. develop; HEAD `5c14156 docs: record Sprint 7K.2 socket diagnostics`.
Required start commands confirmed clean tracked tree and committed 7K.2. Existing unrelated untracked owner files preserved.
Inspected only requested payment/provider/webhook/reconciliation/gateway, lifecycle/recovery, operational signals,
production gate, payment API routes/controller, reconciliation repository contract and relevant reports/tests.
No dependencies, frontend, Render settings, startup socket diagnostics, auth/security policy, migrations or schema changed.
No git add/commit/push/deploy. Everything left unstaged.

## 2. P0 definition

A signed observation or a local status is insufficient to recognize real money. The pure server-only
`evaluatePaymentEvidence` assesses server-owned normalized intent and provider/context/persistence/lifecycle claims.
All results currently have accepted=false, commercialPaymentConfirmed=false, commercialSuccess=false and contractOnly=true.
This intentionally contains no successful branch. No injected callback, environment switch or caller-provided capability
can manufacture acceptance. Structural validation does not establish provenance of any supplied server snapshot.
This contract is not a working real PSP adapter or a substitute for independent commercial acceptance.

## 3. Payment evidence levels

Only NONE, SYNTHETIC, SANDBOX and UNVERIFIED_PROVIDER are implemented/exported. No AUTHENTICATED_PROVIDER or
LIVE_VERIFIED level is producible. A source=PROVIDER claim is still UNVERIFIED_PROVIDER even when all booleans are true.
SYNTHETIC and SANDBOX remain noncommercial. Rejected LIVE-looking claims use LIVE_EVIDENCE_REJECTED classification,
which describes a rejected claim and does not assert live authenticity.

## 4. Provider authenticity

Future minimum requirements: selected provider, LIVE environment, independently verified provider authenticity,
merchant/account binding, transaction reference, unique evidence identity, trusted intent/request correlation,
exact trusted amount/currency, adapter-defined successful money semantics, lifecycle consistency, nonsynthetic origin,
durable idempotent committed evidence, no unresolved reconciliation/compensation/conflict and no unknown outcome.
7B HMAC verifies only the synthetic schema. Its accepted events enter this boundary explicitly as SYNTHETIC.
No vendor signature/header/settlement semantics invented. No real webhook route or PSP client added.

## 5. Merchant/account binding

Generic adapter claims merchantBindingVerified and merchantBindingMatch are required separately from authenticityVerified.
Missing/mismatched binding rejects with fixed codes. Browser merchant identity is not a supported field and fails validation.
These claims are prerequisite diagnostics only, not actual account proof. No merchant account configured or inspected;
current live merchant capability remains false. Real binding must eventually come from a selected verified server adapter.

## 6. Trusted money/correlation

Uses copied 7B trustedIntent requestId, providerPaymentId, positive safe-integer amountMinor and uppercase currency.
No browser money input or coercion. Amount/currency mismatches require manual review and reconciliation, with fixed
PAYMENT_AMOUNT_MISMATCH / PAYMENT_CURRENCY_MISMATCH codes. Provider/payment/request must match selected server correlation;
unique evidence/event identity is mandatory. Arbitrary provider labels are fingerprinted rather than echoed.
Validated server correlation shape alone is not proof that the input originated in trusted storage.

## 7. Durability requirement

In-memory/disabled storage rejects commercial confirmation. Diagnostic durableEvidence=true requires claimed durable mode,
committed receipt, enforced idempotency and exact provider/event/payment/request binding. This boolean reports consistency
of supplied claims only; it does not prove a database transaction or activate storage. Even all matching claims hit the
LIVE_PAYMENT_CAPABILITY_UNAVAILABLE hard stop. Future actual acceptance requires a server-verified atomic evidence/intent
receipt and durable replay uniqueness across crashes/instances, not booleans accepted from HTTP/environment.
Existing inactive reconciliation repository and strict persisted 7C schema are unchanged. Migration 021 is unexecuted.

## 8. Unknown/conflict handling

PAYMENT_OUTCOME_UNKNOWN, PAYMENT_STATE_CONFLICT, unresolved recovery/reconciliation and compensation never confirm money.
No automatic resolution, retry, refund or cancellation. Manual/reconciliation/compensation outputs are recommendations only.
Existing 7C observation ordering, reconciliation status/reason codes and stored case projections remain unchanged.

## 9. Booking/payment consistency

Reuses bookingLifecycle.validateLifecycleState and bookingPaymentRecovery.plan; no parallel lifecycle engine.
Failed booking plus observed capture requires compensation review. Unknown booking requires reconciliation.
Disabled booking cannot complete commercially. AUTHORIZED maps to pending only for existing lifecycle inspection;
CAPTURED/PAID/SETTLED observations do not define provider settlement or successful money semantics.
7B and 7C now derive their existing commercialSuccess field from the boundary without changing persisted case shape.

## 10. Production gate

Existing hard-coded false sales/charge/refund gates retained. New paymentActivation assessment passes safe disabled
configuration and explicitly FAILs partial live requests, selected non-sandbox providers, unsupported payment modes
or PAYMENT_EVIDENCE_VERIFIED=true. activationAllowed is always false. All four code-owned capabilities
(live adapter, authenticity verifier, merchant binding and durable evidence store) are false.
No new environment configuration or live registration mechanism. Other environment claims cannot enable money.
This is a runtime/read-only gate assessment, not a new startup throw or deployment setting change.

## 11. Mock/live isolation and API audit

Current webhook processor remains NODE_ENV=test-only/offline-contract with bounded raw bytes and in-memory dedupe.
No live verifier can be selected. Real 6J intent remains PAYMENTS_DISABLED, PAYMENT_NOT_STARTED and PROVIDER_NOT_CALLED.
Payment API routes retain authentication and no webhook endpoint. No paid:true or captured:true response is introduced.
Legacy sandbox payBooking already persisted status='paid', returned success=true for simulation and could label a local booking
confirmed. This legacy simulation is preserved, explicitly marked contractOnly=true, commercialSuccess=false and
commercialPaymentConfirmed=false in pay/get/create-intent/readiness/prepared-intent responses. No broad API redesign.
Legacy lowercase paid is not real PAID proof. Mock captured cannot become commercial PAID/completion.

## 12. Security/data minimization and operational signals

Exact bounded plain-data inputs; rejects accessors, functions/custom serialization, unsupported fields and invalid scalar types.
Fixed errors only; no raw errors, signatures, webhook/card/PII/secrets, database URLs or payloads in output or logs.
Boundary does not log. Safe metadata contains only provider fingerprint/none, validated requestId, allowlisted paymentState,
amountMatch/currencyMatch, merchantBindingMatch and durableEvidence. Output and nested safeMetadata are frozen.
Existing pure operationalSignals.classify accepts a rejected paymentEvidence decision and derives HIGH signals for money,
correlation/conflict/unknown/missing durability and missing merchant binding; merchant mismatch is CRITICAL.
Only rejected LIVE-looking claims emit the new boundary signals; synthetic evidence is not a production incident by itself.
Signals use existing safe projection/identity contracts. They are diagnostics, never acceptance receipts. No alert delivery.

## 13. Tests

Focused 7L: **42/42 PASS**, initial invocation; final corrected source also passed all 42 in the corrective invocation below. Every case traps DB query/connect, Hotelbeds operations,
payment initiation, refund operations, logger, HTTP/HTTPS/fetch and net/tls connects; forbidden attempts zero.
One API regression uses two fake read-only DB query responses to inspect a legacy sandbox paid response; no actual DB access.
Signed mock test uses actual 7B processor and synthetic HMAC, no HTTP/webhook socket or provider dispatch.
Additional import trap verifies no IO dependencies in the boundary. Caller all-true receipt/binding fixtures are explicitly
hypothetical rejection fixtures, never real merchant/provider/durable evidence.

Adjacent: **307/307 PASS**, one invocation of paymentProviderWebhookFoundation, paymentReconciliationFoundation,
operationalSignalsFoundation, paymentIntentFoundation, bookingLifecycleConsistency, bookingLifecycleReleaseCandidate,
securityHardening, preProductionReadiness and renderStartupHealth. These cases are also included in the aggregates.

Initial aggregate: **1116/1134**, 18 failures (14 known DB-blocked plus 4 unexpected compatibility failures).
Initial 6A FAIL: its existing source contract requires public export `{ state }`; two aggregate 6A tests failed for the same reason.
Two other failures came from readiness importing the evidence boundary despite existing VM tests permitting only the old imports.
Corrected the implementation, not assertions: preserved export `{ state }`, exposed activation assessment inside state(env),
and made disabled/sandbox API labels unconditional false without an unnecessary readiness dependency.
Corrective focused invocation: **180/180 PASS**, paymentEvidenceBoundary (42) plus productionDatabaseProvisioning,
productionFoundation and sprint6aReleaseGate. No existing test or release assertion changed/weakened.
Because the first presumed-final aggregate found regressions, one final aggregate was required after those corrections;
two aggregate invocations total, not a claim that the complete session had only one. Initial logs retained separately.

Final aggregate on corrected frozen runtime/test source: **1120/1134 PASS**, 60 files, 14 failures, cancelled/skipped 0,
exit 1. Known DB-blocked: hotelbedsAccess 1, hotelbedsCatalogPlan 1, hotelbedsContent 3, hotelbedsMultiDestination 1,
hotelbedsPublicSearch 1, hotelbedsStagingTest 6, stagingAcceptance 1. Unexpected failures: **0**.
Real PostgreSQL connect/query and external HTTPS blocked by existing local aggregate preload. Three dedicated real-DB
integration files excluded: hotelbedsCatalog.integration.test.js, priceHistory.integration.test.js,
stagingMigrations.integration.test.js. Full backend PASS is not claimed.

Final-source verifier: **PASS**, 261 backend syntax files, 562 secret-scan files, findings empty.
Final-source 6A: **PASS**. Migration preflight: **PASS**, OFFLINE_ONLY / DISABLED — SAFE, one invocation, migration unexecuted.
Verifier and 6A each had one initial invocation and one final invocation after compatibility corrections; no checks silently discarded.
Final diff-check: **PASS**, one invocation after final documentation. No new backend source changes after corrective tests/final aggregate.
Frontend tests/lint/build NOT RUN, frontend unchanged. 6B NOT RUN while tracked work intentionally dirty.

## 14. Exact files

Modified:

- backend/services/productionGateService.js
- backend/services/paymentWebhookService.js
- backend/services/paymentReconciliation.js
- backend/services/paymentGatewayService.js
- backend/controllers/paymentController.js
- backend/services/operationalSignals.js
- SECURITY_PRODUCTION_GAP_CHECKLIST.md

New:

- backend/services/paymentEvidenceBoundary.js
- backend/tests/paymentEvidenceBoundary.test.cjs
- SPRINT_7L_LIVE_PAYMENT_EVIDENCE_BOUNDARY_REPORT.md

Local verification logs: .tmp/sprint7l-focused.log, .tmp/sprint7l-adjacent.log, .tmp/sprint7l-backend.log,
.tmp/sprint7l-verifier.log, .tmp/sprint7l-6a.log, .tmp/sprint7l-preflight.log.
Additional retained development evidence: .tmp/sprint7l-backend-initial.log, .tmp/sprint7l-6a-initial.log,
.tmp/sprint7l-verifier-initial.log and .tmp/sprint7l-corrective.log.
Existing .tmp/sprint7k2-offline.cjs used only as aggregate safety preload, not changed or wired into application runtime.

## 15. P0 remaining external requirements

Live payment evidence contract, mock/live isolation, merchant binding contract and durable evidence requirement:
READY in repository/offline scope. Real PSP adapter/authentication, real merchant evidence and production durable evidence:
BLOCKED. S-P0-01 retained; P0 COMMERCIAL ACCEPTANCE OPEN, open security counts still P0:1/P1:6/P2:3.
No real PSP selected, merchant binding configured or durable live payment store active. Real payments BLOCKED; sales OFF.
No assertion about privately existing external accounts beyond supplied evidence.

Real PostgreSQL connections/queries/mutations: 0; PSP/webhook calls: 0; Hotelbeds Availability/CheckRate/Booking/Cancellation: 0;
real charge/refund/cancellation: 0; migration executions: 0. Mock executor calls and blocked aggregate DB attempts are not real IO.
Reconciliation storage/Admin datasource DISABLED. DB/schema unchanged. Browser owner recheck NOT REQUIRED (frontend unchanged).

## 16. Future real PSP acceptance procedure

Documented only; none performed:

1. Owner selects PSP and approves merchant account/model/currencies.
2. Obtain sandbox credentials through private configuration.
3. Implement a real server adapter and vendor-required exact bounded raw-byte authentication/replay handling.
4. Independently verify provider environment and merchant/account binding per transaction.
5. Exercise sandbox webhook/status reconciliation, including adversarial wrong-account/money/correlation/unknown cases.
6. Enable separately reviewed durable evidence persistence with atomic receipt/intent binding and provider idempotency.
7. Verify crash/restart/multi-instance replay protection and actual adapter success semantics.
8. Provision controlled production credentials and implement/review the currently unavailable capability path.
9. Perform separately authorized tiny controlled real-money acceptance.
10. Collect refund/cancellation/reconciliation evidence and independent owner/security/provider acceptance.
11. Only then consider P0 commercial acceptance closed and separately review production promotion gates.
