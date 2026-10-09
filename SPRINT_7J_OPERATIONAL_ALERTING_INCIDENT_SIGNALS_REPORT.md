# Sprint 7J — Operational Alerting & Incident Signals Foundation

SPRINT 7J — CODE / OFFLINE: PASS. OPERATIONAL SIGNALS FOUNDATION: PASS. ALERT SAFETY BOUNDARY: PASS.
Existing observability architecture: REUSED. New pure signal/projection and disabled delivery boundaries; no second logger or active monitoring system.

## 1. Baseline

2026-10-09, Asia/Qyzylorda. develop, HEAD `a17d0e8 docs: record Sprint 7I migration activation guard`; tracked tree clean at start; Sprint 7I committed. Unrelated untracked owner files preserved. Existing 7C reconciliation,7D operations projection,6K recovery and6M lifecycle policies reused. No dependency additions, frontend edits, deployment, Render access, git add/commit/push.

Migration021 present but unexecuted; migration gate OFF; reconciliation storage DISABLED; PostgreSQL runtime repository and Admin reconciliation datasource inactive. Real payments/booking BLOCKED; Hotelbeds LIVE OFF. Existing safe boundaries unchanged.

## 2. Existing observability architecture

| Area | Existing support and limitations |
| --- | --- |
| Structured logs | backend/utils/logger.js supports JSON via LOG_FORMAT, fixed levels, timestamp/service/release; reused as future destination, unchanged. |
| Correlation | requestTelemetry accepts bounded x-request-id or generates UUID; returns header and records request metrics/events. Reconciliation/recovery separately require trusted 32-hex intent requestId. New signal requires that server-owned identity, never blindly forwards a client request header. |
| Error classification | errorHandler classifies HTTP errors; bookingPaymentRecovery classifies dispatch/outcome-aware retryability; 7C/7D supply fixed review/mismatch/conflict reasons. |
| Health/readiness | /health bounded SELECT1; /api/health/live process status; /api/health/ready DB availability plus not shutting down. Intentional commercial/storage disablement does not fail these routes. No health changes. |
| Provider diagnostics | existing reliability provider components and Admin TEST access/catalog diagnostic routes expose separate provider readiness. Existing checks were read only as source, not invoked. |
| Incidents/Admin | incidentService persists operational_incidents and supports open/update/resolve/acknowledge/list/counts. reliabilityMonitorService syncs component incidents and snapshots. IncidentsCenter consumes reliability dashboard and supports check/acknowledge. Not a pure read-only signal sink: connecting it now would introduce DB writes and severity/lifecycle translation. |
| Alert hooks | local logger/system events and persisted incidents exist; no reusable external operational-signal publish contract was found in the inspected helpers. Email notifications are not an incident-routing contract. No transport activated. |
| Rate/noise | API rate limiter is per-process request limiting, not alert throttling. Health monitor records state changes; reliability incidents update occurrence counts by component key. No durable signal-level dedupe/cross-instance throttle established. |
| Redaction | logger removes sensitive keys, configured secrets, URLs/auth/JWT/private-key material and reduces Error objects. This is not comprehensive traveller/card PII protection. systemEventService/incidentService truncate arbitrary messages/metadata and use DB storage; they are not a substitute for an allowlisted projection. New service never passes raw objects there. |
| Missing critical coverage | 7C/7D/6K/6M are pure contracts; critical results can be evaluated without any automatic operational notification. 7J adds callable classification, not active coverage. Production transaction monitoring remains incomplete. |

Sprint7A P1-01/P0-07 gaps remain relevant: external uptime/log retention/alert routing, uncertain-outcome ownership, on-call and rehearsed acceptance. No claim that code-only signals close those operational gaps.

## 3. Signal classification

New `operationalSignals.classify({requestId, lifecycle?, reconciliation?, providerFingerprint?, storageDisabled?})` consumes trusted internal canonical lifecycle states and/or a full trusted 7C evaluator result. Reuses 7D.projectCase() validation/classification and 6M.validateLifecycleState(); normalized lifecycle can originate from 6K recovery decisions, but raw recovery plans/provider payloads are not automatically ingested. No route or runtime evaluator was changed.

Returns immutable, deterministically ordered signals containing signalId, conditionId, signalCode, severity, category, reasonCode, requestId, optional caseId, provider fingerprint or none, booking/payment/lifecycle state, recommendedOperatorAction and requiresAttention. No arbitrary metadata bag, money amount, raw provider label or operational action. Known mismatch/conflict reasons survive as fixed codes. Reconciliation/lifecycle correlation and supplied overlapping states must agree; invalid inputs fail with fixed OPERATIONAL_SIGNAL_INPUT_INVALID.

Required conditions covered: PAYMENT_OUTCOME_UNKNOWN, PAYMENT_STATE_CONFLICT, PAYMENT_AMOUNT_MISMATCH, PAYMENT_CURRENCY_MISMATCH, BOOKING_OUTCOME_UNKNOWN, BOOKING_PAYMENT_INCONSISTENCY, RECONCILIATION_REQUIRED, COMPENSATION_REQUIRED, REFUND_REVIEW_REQUIRED, CANCELLATION_REVIEW_REQUIRED. Additional PAYMENT_CORRELATION_MISMATCH and RETRYABLE_SAFE_CONDITION reuse existing contract semantics. A condition may produce several distinct signals (for example compensation plus refund review); same signal code within one classification is emitted once.

Consistent and ordinary awaiting-provider-evidence 7C results do not create incidents. Existing provider evidence rules are retained: unsupported capture/booking success labels become unknown; no invented assertion that money moved. 7D critical conflict priority denotes risk, not proof of an accepted capture.

## 4. Severity model

| Severity | Conditions |
| --- | --- |
| INFO | BOOKING_DISABLED, PAYMENTS_DISABLED, RECONCILIATION_STORAGE_DISABLED; NO_ACTION, requiresAttention=false. |
| WARNING | Explicit canonical failed-retryable state with known outcome; review recommendation only. |
| HIGH | Unknown booking/payment, reconciliation, mismatches, ordinary state conflict/inconsistency and review without trusted capture evidence. |
| CRITICAL | Compensation required; trusted capture with failed booking; refund/cancellation review with capture risk; 7D critical contradictory evidence/conflict risk. |

Amount/currency mismatch remains HIGH even if accompanying evidence has a capture label. Severity does not authorize payment/refund/cancellation or imply final business success. No invented SLA. Projection rejects attempts to elevate INFO disabled states into critical signals.

## 5. False-positive protection

Current staging booking/payment/storage disabled combination produces exactly three INFO signals and no attention/critical incident. A disabled booking boundary does not suppress a separately observed unknown payment. Storage disabled is explicit contextual input, never polled from a datasource and never treated as outage. Missing optional storage context produces no storage alert.

Unsupported provider success labels are downgraded to uncertainty rather than fake success. Lifecycle inconsistencies remain reviewable without changing primary state. Input state is not mutated.

## 6. Signal identity/deduplication

SHA256 conditionId derives from stable case family plus signalCode. For 7C, reuse 7D caseFamilyId (request/provider/payment fingerprints); lifecycle-only fallback uses trusted request/provider fingerprint. Different integration sources without the same family are not promised to deduplicate across source types.

signalId adds severity and reason to condition identity. Snapshot caseId changes alone do not produce new condition identity. `compare(previous,current)` returns DUPLICATE, ESCALATION, UPDATE or DISTINCT. Same condition/reason/severity is a duplicate; higher severity is an escalation, changed reason or lower severity an update. No time ordering inferred, resolution inference, cache, timers, Redis, persistence or cross-instance dedupe claim. Future dispatcher must use these semantics so an escalation is not suppressed as a duplicate.

## 7. Safe structured projection

`toLogProjection()` emits only: signalId,signalCode,severity,category,reasonCode,requestId,caseId,provider,paymentState,bookingState,lifecycleState,requiresAttention. The field allowlist is frozen and validated against fixed enums/fingerprint formats. provider is a pseudonymous fingerprint, not an untrusted PSP name; no PSP is selected by this sprint.

No raw webhook/signature/Authorization/API key/JWT/DATABASE_URL/offer token/card/passport/DOB/name/contact/provider payload is emitted. Descriptor-based bounded data copying rejects accessors, custom serialization, cycles, symbols and oversized/deep structures before projection; ignored raw extras are never spread into output. Fingerprints are correlation aids, not encryption or proof of trusted provenance. Callable contract is server-only and not an HTTP validation/authentication boundary.

Existing logger can later receive this projection with a constant message and severity mapping. No automatic log hook was added: shared primary request paths and duplicate/noise behavior remain unchanged. No high-frequency local duplicate logging.

## 8. Alert transport boundary

New `operationalAlertTransport` has a constant disabled default (no new env selector). `disabledTransport.publish(signal)` validates projection and truthfully returns `{deliveryState:'DISABLED',providerCalled:false}`. It never claims SENT,DELIVERED or ACKNOWLEDGED. No installed network adapter.

`publishSafely()` passes only the allowlisted projection to an explicitly injected adapter. Thrown/rejected errors become fixed secondary failure results, without raw errors. Unsupported delivery responses are rejected, including synthetic SENT claims. On an adapter failure providerCalled is null (unknown), not falsely asserted false. Current default always returns disabled/false. Future real transport result semantics require a separately reviewed implementation.

No email/Slack/Telegram/Sentry/PagerDuty/webhook call. Existing DB-backed incidentService is intentionally not imported. No fake successful external delivery.

## 9. Lifecycle/reconciliation integration

Pure composition seams only; existing paymentReconciliation,reconciliationOperationsReadModel,bookingPaymentRecovery,bookingLifecycle and runtime callers unchanged. New tests supply real 7C evaluator outputs, not fabricated incident rows. No reconciliation read/write activation or mutation. No booking/payment/recovery lifecycle rewriting.

Transport wrapper owns only secondary delivery results and never accepts or rewrites the primary business outcome. Future wiring must also isolate classification failures from the primary response and apply dedupe before logging/delivery. No automatic remediation, payment retry, reconciliation, refund or cancellation. Existing Admin incident architecture stays available for later approved mapping; no frontend/fake runtime data/new Admin endpoint.

## 10. Tests

Final focused7J: **36/36 PASS**. Covers required risk/disabled states, evaluator integration, evidence conservatism, case-family snapshot dedupe, reason updates/severity escalation, strict projection, secrets/card/traveller exclusion, malformed/accessor/cyclic/oversized input, immutable output, truthful disabled transport and failure isolation. Each test traps DB, provider, PSP, refund/cancel, reconciliation mutation, HTTP/HTTPS/fetch and logger calls; attempted calls0. Additional module import trap verifies default modules import no IO services.

Development setup initially tried to mock a frozen disabled repository method, causing hook failures. Corrected by substituting/restoring the exported test repository reference; assertions unchanged. Additional hardening and identity coverage completed before final-source aggregate. Development focused reruns are not added to final totals.

Adjacent standalone: **NOT RUN** because existing contracts were not touched. Full backend includes 7C/7D/6K/6M/7G and7I regressions.

Full backend exactly once after final source: **1016/1030 PASS**, failures14, cancelled/skipped0, exit1;56 files. Three dedicated DB integration files excluded: hotelbedsCatalog.integration,priceHistory.integration,stagingMigrations.integration. Known DB-blocked14: hotelbedsAccess1,hotelbedsCatalogPlan1,hotelbedsContent3,hotelbedsMultiDestination1,hotelbedsPublicSearch1,hotelbedsStagingTest6,stagingAcceptance1. All block at offline PostgreSQL guard; unexpected failures0. Full PASS is not claimed.

Aggregate preload blocks real pg Pool/Client connect/query and HTTPS; mock executors and local HTTP harnesses are allowed. No real DB or provider call. Release checks once after final source: verifier PASS (254 syntax files,544 scan files,findings empty);6A PASS;migration preflight PASS (DISABLED — SAFE);diff-check PASS. 6B NOT RUN with dirty work. Frontend full tests/lint/build NOT RUN, unchanged.

External alert delivery0; PostgreSQL connections0/queries0; DB mutations0; PSP0; Hotelbeds Availability0/CheckRate0/Booking0/Cancellation0; refunds0/cancellations0; reconciliation mutations0; migration executions0. No DB/schema change. Mock operations do not count as real IO.

## 11. Exact files

Modified existing tracked files: **NONE**.

New:

- backend/services/operationalSignals.js
- backend/services/operationalAlertTransport.js
- backend/tests/operationalSignalsFoundation.test.cjs
- SPRINT_7J_OPERATIONAL_ALERTING_INCIDENT_SIGNALS_REPORT.md

Generated local evidence: .tmp/sprint7j-focused.log,.tmp/sprint7j-backend.log,.tmp/sprint7j-verifier.log,.tmp/sprint7j-6a.log,.tmp/sprint7j-preflight.log; safety preload .tmp/sprint7j-offline.cjs reused from7I. Existing owner files preserved; everything unstaged. Migration021/guard/storage selection untouched.

## 12. Remaining production observability gaps

Operational signal classification READY (offline contract). Safe structured projection READY. Deterministic identity READY. Unknown payment/booking, booking-payment inconsistency and compensation critical signals READY as callable contracts. Intentional disabled states create false critical NO. Duplicate/escalation detectable YES.

External alert transport FUTURE REQUIREMENT. Cross-instance alert deduplication/throttling FUTURE REQUIREMENT. 24/7 monitoring OWNER/OPS/FUTURE REQUIREMENT. Incident Admin integration PARTIAL: existing DB-backed incident UI exists; new signals are not wired. Observability readiness PARTIAL. Production monitoring readiness not claimed. Automatic remediation NO.

Migration activation OFF; storage DISABLED; Admin reconciliation datasource active NO; migration021 executed NO; DB/schema changed NO; frontend changed NO. OWNER BROWSER RECHECK FOR7J NOT REQUIRED. 7E/7G browser acceptance remains PENDING. Real payments BLOCKED. COMMERCIAL PRODUCTION READY NO. PRODUCTION SALES READY NOT CLAIMED.

## 13. Future external alerting path

Separately approve trusted event-source wiring and classification error isolation; route only server-owned correlated observations. Reuse existing logger with the strict projection and condition identity, define cross-instance dedupe/retention/escalation policy, and map safe severities/lifecycle to existing Admin incident architecture after persistence/privacy review. Do not silently map four severities into the current warning/critical schema or treat a repeated observation as resolution.

Owner/ops must select destinations, credentials, access controls, retention and on-call ownership; implement reviewed disabled-by-default transport with truthful delivery/retry semantics. Validate outage/unknown/compensation/escalation fixtures and secondary delivery failures in isolated acceptance before activation. Monitoring must never trigger a financial retry/refund/cancellation; those remain separately authorized business operations. No future step was performed here.
