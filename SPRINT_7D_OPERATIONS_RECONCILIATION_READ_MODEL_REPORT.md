# Sprint 7D — Operations / Reconciliation Queue & Admin Read Model Foundation

SPRINT 7D — CODE / OFFLINE: PASS — focused contract scope.
OPERATIONS RECONCILIATION READ MODEL: PASS. SAFE QUEUE PROJECTION: PASS.
Existing architecture: REUSED + HARDENED. COMMERCIAL PRODUCTION READY: NO.
PRODUCTION SALES READY: NOT CLAIMED. Full backend PASS is not claimed.

## 1. Baseline

2026-10-07, Asia/Qyzylorda. Branch develop, tracked tree clean at start; HEAD `dbc8631 docs: record Sprint 7C reconciliation verification`. Sprint 7C service/tests/report tracked and committed. Existing untracked owner files preserved: README.txt, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, docs/ and two anomalous filename entries. No reset/restore/clean, git add/commit/push or deploy.

7C payment reconciliation/manual review PASS in offline scope; unknown, conflicts, money and booking disagreement supported. Durable storage/operator UI remained future requirements; automatic reconciliation absent and real payments blocked. Preserve PAYMENTS_MODE=disabled, PAYMENTS_PROVIDER=none, real charge/refund/sales hard gates, disabled booking and Hotelbeds LIVE off. No provider/account/credential selection, network request, DB access or infrastructure/config changes by this foundation.

## 2. Existing operations/admin architecture

Narrow source audit: adminOperations routes/controller and adminAuditService, booking inspection controller projections, bookingHistoryPublic, requestTelemetry/logger diagnostics, 7B/7C contract sources, bookingPaymentRecovery/bookingLifecycle and relevant tests/report. No frontend implementation changed.

Existing adminOperations router requires authentication, admin role and admin.operations.read; system endpoints add specific permissions. Existing bookings/refunds/actions/system-event/readiness/metrics/reliability endpoints and mutation operations already exist. This sprint does not wire into or call them. Admin audit service writes DB records and is inappropriate for a pure projection.

Admin booking list selects payment/refund and booking provider states separately, with pagination/items, but includes traveller/account contact fields. Overview attention recognizes unknown/failed/rate-expired booking states. Refunds/actions and provider-job responses can return broad DB rows/metadata. The separate administrative booking inspection returns its broad `b.*` projection with payment_metadata; stored provider_response and other columns can therefore be exposed where present. No live response/DB query performed; this is a source boundary finding, not a completed global security audit or claim that every metadata record is sensitive. Existing routes were left unchanged in this scoped sprint.

Consumer bookingHistoryPublic already uses explicit list/detail field selection to omit raw payloads; reuse that allowlist approach and existing `{ items }` list convention, without copying its customer-specific data fields. Payment reconciliation's safe identifiers/reasons are reused directly. HTTP requestTelemetry can accept an arbitrary bounded incoming request-id and generate UUIDs, so this model uses only the stricter 7C 32-hex server payment correlation. Logger redaction exists but is not imported/called; unsafe fields never enter this model's output.

## 3. Operations case model

New pure server-only reconciliationOperationsReadModel exports `projectCase(result)`, `list(results, filters)` and `detail(results, identity)`. Call paymentReconciliation.evaluate on trusted evidence first, then supply its trusted output. This layer does not accept raw webhooks or browser evidence assertions; schema validation does not authenticate provenance. No runtime startup, route or admin controller imports this service.

Explicitly validates 7C status/reason/action enums, states, booleans, disabled safety fields, fingerprints and server requestId. eventType must be a primitive supported string or null; objects with coercion methods cannot carry nested secrets into output. Extra raw/PII fields in input/diagnostic/manualReview are ignored and omitted. Invalid inputs raise fixed OPERATIONS_READ_MODEL_INPUT_INVALID, without including supplied values.

List fields: caseId, caseFamilyId, category, priority, status, reasonCode, requestId, providerFingerprint, paymentState, bookingState, amountMatch, currencyMatch, manualReviewRequired, reconciliationRequired, compensationRequired, recommendedNextAction, contractOnly, commercialSuccess, applicationPaymentState, operatorActionsExecutable. All flags preserve commercialSuccess=false, PAYMENTS_DISABLED and operatorActionsExecutable=false.

Provider names/payment/event labels remain fingerprints, consistent with 7C minimization. AmountMinor, currency, lifecycleStatus and timestamps are deliberately absent: 7C does not expose trusted intent money/lifecycle inspection/timestamps in its result. Incoming-event money must not be substituted for trusted server intent money. No invented amount, clock, provider label, successful execution or completion state.

## 4. Priority classification

Deterministic display priority, no SLA or response-time promise:

| Supplied reconciliation evidence | Priority / category |
| --- | --- |
| Captured + booking failed / refund review | CRITICAL / REFUND_REVIEW_REQUIRED |
| State conflict with capture observation or captured event type | CRITICAL / PAYMENT_STATE_CONFLICT |
| Payment unknown | HIGH / PAYMENT_OUTCOME_UNKNOWN |
| Booking confirmed + failed payment | HIGH / CANCELLATION_REVIEW_REQUIRED |
| Money mismatch without capture indication | HIGH / PAYMENT_AMOUNT_MISMATCH or PAYMENT_CURRENCY_MISMATCH |
| Booking disagreement / unresolved recovery | HIGH / BOOKING_PAYMENT_INCONSISTENCY or RECONCILIATION_REQUIRED |
| Nonfinal conflict without unknown/final/capture indication | MEDIUM / conflict category |
| Consistent pending/authorized awaiting provider evidence | LOW / AWAITING_PROVIDER_EVIDENCE |

Capture indications are risk observations, not evidence that a real charge occurred. Incoming capture conflicting with intent/state still never produces commercial success. Aggregated family priority is the highest supplied priority; conflict takes precedence over action-review recommendations. Unresolved flags are combined so a lower-risk observation cannot hide compensation/reconciliation risk.

## 5. Queue/list projection

`list` returns `{ items }` of compact allowlisted rows, sorted by priority then selected 7C caseId. Consistent NO_ACTION_REQUIRED observations return null from projectCase and create no incident. Pending/authorized provider waits are informational AWAITING_EVIDENCE entries, not completed/paid cases.

Queue statuses only MANUAL_REVIEW_REQUIRED, RECONCILIATION_REQUIRED, COMPENSATION_REQUIRED and AWAITING_EVIDENCE. STATE_CONFLICT becomes manual review while original reason remains visible. No RESOLVED, REFUNDED, CANCELLED, PAID or COMPENSATED queue state. No database querying, queue broker, cache/global state or workflow mutation.

## 6. Detail projection

Adds paymentFingerprint, sorted relatedCaseIds and a deduplicated normalized observation timeline. Each entry contains only eventFingerprint, eventType, internalPaymentState, observedPaymentState, bookingState, reconciliationStatus, reasonCode, amountMatch, currencyMatch, recommendedNextAction, incomingEvidenceFingerprint, previousEvidenceFingerprints.

Timeline explicitly identifies DETERMINISTIC_OBSERVATION_ORDER. It is a sequence of supplied reconciliation snapshots, sorted by canonical fingerprint; it is not provider-time chronology or reconstructed raw event history. 7C supplies fingerprints of prior events, not their full states, so those fingerprints remain opaque. Internal/observed state and incoming event type stay separate; a failed event conflicting with captured observation does not display an accepted failed transition. No timestamps/causal ordering or vendor sequence semantics invented.

Lookup accepts a validated 7C caseId or caseFamilyId and returns the family's safe detail; unknown identity returns null. Recommendations are display values; no callbacks, buttons or execution handlers exist.

## 7. Filters/sorting

Pure equality filters: priority, category, queue status, providerFingerprint, manualReviewRequired and compensationRequired. Provider filter uses the existing safe provider fingerprint, not arbitrary provider labels. Unknown keys/values, nonboolean flags and invalid fingerprints fail closed. Sort order is CRITICAL/HIGH/MEDIUM/LOW, then case identity; supplied array order does not affect rows/details. Aggregate first, filter afterward to avoid hiding other snapshots in a family. No pagination/DB filter SQL, timestamp sorting or SLA.

## 8. Case identity/deduplication

Individual caseId is exactly the 7C identity. caseFamilyId is SHA-256 of server requestId/providerFingerprint/paymentFingerprint; related conflicts remain visibly linked to the same payment correlation. Pure aggregation groups supplied unresolved cases into one logical family row. Repeated identical results collapse to one row/timeline observation. Duplicate webhook snapshots with distinct 7C ids remain one family and preserve relatedCaseIds. Same case id carrying inconsistent safe snapshots is rejected instead of selecting one arbitrarily.

Selected case is deterministic: conflict before compensation/reconciliation/manual review/provider wait, then risk priority and caseId. Family priority uses maximum risk and flags use any-required semantics. Detail preserves all distinct supported observations. A later consistent/no-action result does not close a supplied unresolved case. This is deliberately conservative aggregation over caller-supplied snapshots, not a latest-state resolver. Caller must supply the actual unresolved set; stale snapshots are not automatically retired.

Different provider/payment correlations do not collapse. Outputs are detached from caller arrays/objects. No random id, persistent update, durable identity guarantee, cross-instance uniqueness or deployment storage claim. No durable queue.

## 9. Data minimization/security

Imports only node crypto and existing provider contract state names. Reuses 7C fingerprints and finite enums. No DB/logger/provider/admin/network client or operation import. No raw webhook, full payload, signature, webhook secret, API key, Authorization, JWT, DB URL, offer token, card data or traveller name/DOB/email/phone/passport in projection. No user-supplied free-text summaries. Strict core types prevent coercible objects from smuggling nested data through eventType.

No public/internal reconciliation endpoint, operator mutation route, UI or permission change. Existing admin authorization is partial groundwork for future wiring; this standalone service does not perform authentication. Future consumers must enforce access checks and maintain evidence provenance. This sprint is not a global admin sanitization or production security acceptance.

## 10. Lifecycle/reconciliation integration

Trusted evidence → existing paymentReconciliation → operations projection. 7C already invokes bookingPaymentRecovery and bookingLifecycle; this layer consumes their resulting classifications without duplicating lifecycle transitions or reevaluating evidence. No existing contract/source modification needed.

Captured + failed booking gives critical compensation/refund review. Unknown + confirmed booking gives high reconciliation/status-verification recommendation. Failed payment + confirmed booking gives high cancellation review. Money/currency/state conflicts remain visible and commercially unsuccessful. REVIEW_REFUND is never REFUNDED, REVIEW_CANCELLATION never CANCELLED, VERIFY_PROVIDER_STATUS never RESOLVED, COMPENSATION_REQUIRED never COMPENSATED. No automatic retry/reconciliation/compensation.

## 11. Tests

Focused final 7D: **38/38 PASS**. Cases use real 7C evaluator outputs plus explicitly synthetic projection fixtures for distinct families. Covers categories/priorities, exact list/timeline allowlists, raw/signature/secret/PII omission, strict core types, filters/order, repeated/duplicate family collapse, related ids, deterministic detail, no mutation, no-action/no resolution, disabled flags and operation traps.

Preliminary focused also 38/38. Preliminary aggregate was 824/838 with 14 known DB-blocked. Final review then hardened eventType to reject coercible objects and extended an existing focused case; final focused 38/38. Source frozen after that change. The aggregate was repeated because of this concrete source/security change, not to improve totals; final aggregate result recorded below. No existing assertion weakened and no unrelated test source changed.

Adjacent focused: **NOT RUN separately** — shared 7C/7B/recovery/lifecycle contracts untouched. They are included in the backend aggregate.

Final full backend: **824/838 PASS, 14 known DB-blocked, 0 unexpected failures**, cancelled/skipped zero, exit 1. Both aggregates use 50 files, offline HTTPS plus lazy pg preload, concurrency=1 and force-exit. Excluded all three dedicated real-PostgreSQL files: hotelbedsCatalog.integration.test.js, priceHistory.integration.test.js, stagingMigrations.integration.test.js. No DB connection/mutation allowed. The corrected lazy pg preload avoids 7C's historical eager-import failures; those are not current product failures.

Known DB-blocked suites: hotelbedsAccess (1), hotelbedsCatalogPlan (1), hotelbedsContent (3), hotelbedsMultiDestination (1), hotelbedsPublicSearch (1), hotelbedsStagingTest (6), stagingAcceptance (1): 14 total. Full backend PASS not claimed. Verifier: **PASS**, 237 backend syntax files, 512 secret-scan files, findings empty. Sprint 6A: **PASS**. `git -c core.safecrlf=false diff --check`: **PASS**. Each release check ran once on final source; only this report's result text was finalized afterward. No tracked diff exists because this sprint adds three untracked files; syntax/secret verifier includes them. Index remains empty.

Every focused case traps Pool query/connect, Hotelbeds Availability/CheckRate/Booking/Cancellation/status/reconciliation, legacy payment initiation, sandbox refunds, admin audit/action recording and logging; forbidden calls zero. HTTPS preload prevents external HTTPS; temporary lazy pg preload blocks real Pool/Client queries/connects without eagerly importing pg. Temporary preload/logs are in OS TEMP, outside product source. Real PSP calls: 0; Hotelbeds Availability: 0; CheckRate: 0; Booking: 0; Cancellation: 0; refund calls: 0; cancellation calls: 0; real DB mutations: 0; operator action executions: 0. Synthetic evidence only; no real incoming webhook/status lookup/card/payment.

Frontend full tests/lint/build: NOT RUN — frontend unchanged. 6B NOT RUN with intentionally uncommitted work. No deployment/browser acceptance.

## 12. Exact files

Modified existing files: **NONE**.

New:

- backend/services/reconciliationOperationsReadModel.js.
- backend/tests/reconciliationOperationsReadModel.test.cjs.
- SPRINT_7D_OPERATIONS_RECONCILIATION_READ_MODEL_REPORT.md.

Backend source added: YES. Frontend changed: NO. DB/schema changed: NO. No dependencies, migration, config, production gate, route/controller or existing source changes. All new work untracked/unstaged; unrelated owner files preserved. No git add/commit/push/deploy.

## 13. Remaining production gaps

| Capability | After 7D |
| --- | --- |
| Operations reconciliation read model | READY — offline tested scope |
| Safe queue/list projection | READY — supplied synthetic results |
| Case priority classification | READY — deterministic risk display, no SLA |
| Manual review detail projection | READY — normalized snapshots only |
| Durable case/queue storage | FUTURE REQUIREMENT |
| Operator authentication/authorization UI | EXISTING PARTIAL admin guards; reconciliation UI FUTURE REQUIREMENT |
| Operator action execution | NOT IMPLEMENTED |
| Real PSP status lookup | BLOCKED — no PSP selected |
| Real payments | BLOCKED |

Unknown/conflict cases safely visible, compensation prioritized, deterministic case identity, duplicate cases collapsed: YES in tested scope. Raw webhook/secrets/traveller PII exposed: NO. Operator actions executable: NO. Fake PAID/REFUNDED/RESOLVED possible through this foundation: NO. No commercial P0 package closed; 7A's 10 work packages remain open. No merchant account or production credentials configured by this sprint; no claims about private accounts outside supplied evidence.

COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.

## 14. Future operator UI/persistence path

Future authorized work must establish durable server evidence/case storage, transactional correlation/event uniqueness, actual unresolved-set management, provider-specific status/signature/order verification and secure evidence retention. Wire this projection into existing admin authentication/permissions with explicit list/detail allowlists; separately audit broad existing admin payloads. A future UI may display these recommendations, but execution requires a separately reviewed authorization/audit/idempotency/confirmation boundary. No mock flag/fingerprint/recommendation constitutes real provider evidence or permission to move money.

No durable queue, DB persistence, operator action execution, real PSP, payment, refund, cancellation or Hotelbeds provider action implemented. No fake resolution and no production sales readiness claim.

OWNER BROWSER RECHECK: NOT REQUIRED. If separately deployed later, owner checks only /health and /api/health/ready; no Hotelbeds search/CheckRate/webhook/payment/refund/cancellation. No deploy performed.
