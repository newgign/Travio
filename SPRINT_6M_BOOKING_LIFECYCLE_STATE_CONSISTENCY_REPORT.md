# Sprint 6M — Booking Lifecycle & State Consistency

SPRINT 6M — CODE / OFFLINE: **PASS — tested scope**.
BOOKING LIFECYCLE CONSISTENCY: **PASS — tested scope**.
Existing lifecycle architecture: **REUSED + HARDENED**.

## 1. Baseline

Branch develop, tracked tree clean at start, HEAD `bde4841` (`docs: record Sprint 6L cancellation refund verification`). Sprint 6L committed; unrelated untracked owner files retained. Narrow lifecycle backend scope, no dependency/schema/config changes or repository re-audit. No reset/restore/clean, git add/commit/push/deploy.

Hotelbeds TEST only, LIVE/real booking/payment/cancellation/refund/charges/email/production sales off, infrastructure paused. Existing hard gates remain unchanged; no activation.

## 2. Existing state model

| Stage | Existing contracts and normalized aliases |
| --- | --- |
| CheckRate | CONFIRMED, PRICE_CHANGED, UNAVAILABLE, RETRYABLE_ERROR; pending confirmation is NOT_CONFIRMED |
| Travellers/review | Validation failures or valid normalized guests; REVIEW_NOT_READY / REVIEW_READY |
| Booking | INTENT_READY is validation only; BOOKING_DISABLED is current boundary; confirming -> BOOKING_PENDING, confirmation_unknown -> BOOKING_OUTCOME_UNKNOWN, confirmation_failed -> BOOKING_FAILED_FINAL; provider CONFIRMED/MODIFIED -> observed BOOKING_CONFIRMED |
| Payment | PAYMENT_INTENT_READY validation only; PAYMENT_NOT_STARTED/PAYMENTS_DISABLED; pending/requires_action -> PAYMENT_PENDING; failed -> PAYMENT_FAILED_FINAL; paid requires provider evidence |
| Recovery | RECOVERY_NOT_REQUIRED, RECOVERY_PENDING, COMPENSATION_REQUIRED; CANCELLATION_REQUIRED / REFUND_REQUIRED; unknown outcomes require reconciliation |
| Cancellation | NOT_STARTED/UNAVAILABLE/PENDING/OUTCOME_UNKNOWN; existing CANCELLED/CANCELED are provider-result inputs only |
| Refund | NOT_STARTED/UNAVAILABLE/PENDING/OUTCOME_UNKNOWN; existing refunded is a provider-result input only |

Existing naming is retained; aliases normalize inside the validator only. Current states cannot reach commercial success because all operation gates remain off. Legacy local sandbox paid/refunded/cancelled records are explicitly simulated historical facts and not real provider evidence. No blanket renaming or second operation runner.

## 3. Lifecycle invariants

New small pure bookingLifecycle exposes validateLifecycleState, assertLifecycleState, validateTransition and deriveLifecycleStatus. It imports no DB, provider or logger; accepts trusted server state observations, not a browser API payload.

Ready review requires confirmed CheckRate and valid travellers; booking pending/confirmed requires review. Pending payment requires confirmed booking. Paid with failed booking needs explicit unresolved recovery/compensation and payment-operation evidence. Cancellation completion requires booking and cancellation evidence; refund completion requires charge evidence. Unavailable-operation flags cannot coexist with completed operation claims.

All provider success labels require explicit trusted evidence. Unknown outcomes require reconciliation; booking unknown cannot assume cancellation succeeded. Partial failures must carry unresolved recovery. success/completed true are invalid unless booking/payment have observed results and there is no unresolved recovery, compensation, cancellation/refund failure or unknown outcome.

Public validation results contain only fixed reason codes, status/category and validity; raw inputs/errors/secrets are not echoed. Assert failures expose fixed LIFECYCLE_INCONSISTENT, not provider payload.

## 4. Transition rules

Validates both before/after snapshots and allowed stage edges. Review can enter the disabled booking/payment boundary. Pending booking/payment may become retryable/final failure or unknown; pending cancellation/refund may become unknown. Success edges additionally require the destination's trusted evidence and prerequisites.

Disabled/unavailable states cannot transition to provider success. Not-started cannot jump to completed operation. Unknown can leave uncertainty only with explicit reconciled evidence; retryable/final failure can restart pending only with explicit recovery authorization. Terminal results cannot regress to not-started. Recovery/compensation cannot silently disappear without explicit recovery authorization. No transition executes an operation or adds retry loops.

## 5. Disabled vs failed semantics

Current staging snapshot: confirmed CheckRate, valid travellers, ready review, BOOKING_DISABLED and PAYMENTS_DISABLED. It is valid and derives BOOKING_DISABLED / SAFE_DISABLED_TERMINAL. Disabled is not an internal error or provider failure. Existing HTTP 503 disabled semantics remain unchanged.

Failed final is FAILED_TERMINAL when no unresolved partial effects exist; retryable is distinct from unknown. Pending is in progress, never success. No booking/payment/cancellation/refund activation.

## 6. Unknown outcome semantics

Booking/payment/cancellation/refund unknown states derive RECONCILIATION_REQUIRED, category UNKNOWN. They cannot become final success or failure merely through state assignment; transition checks require reconciliation. 6K dispatch/outcome classifier and 6L compensation semantics are reused without provider probes. Historical uncertainty is not flattened to unavailable or confirmed failure.

## 7. Partial-failure handling

Confirmed booking plus failed payment requires unresolved recovery/cancellation obligation. Captured/paid payment plus failed booking requires refund/compensation obligation. Observed cancellation plus refund failure remains unresolved refund recovery. Observed refund plus cancellation unknown requires reconciliation. None may be labelled fully completed/successful.

No compensation is executed or marked complete by this validator. Operation evidence flags describe future trusted adapter observations in synthetic tests only; no actual operation is manufactured.

## 8. Derived lifecycle status

Derives REVIEW_NOT_READY / READY_FOR_BOOKING, BOOKING_DISABLED, PAYMENTS_DISABLED, BOOKING_IN_PROGRESS, PAYMENT_REQUIRED, RECOVERY_REQUIRED, CANCELLATION_PENDING, REFUND_PENDING, RECONCILIATION_REQUIRED, FAILED_FINAL or LIFECYCLE_INVALID as justified. COMPLETED is validated only for a hypothetical evidenced booking/payment result with no unresolved work; local intents cannot derive it.

No public current intent gains a success status. Provider/state names remain existing API names; aliases/statuses are internal consistency results, not UI redesign.

## 9. API/read-model safety

Integrated validator into existing server review creation, 6K booking/payment disabledBoundary and 6L unavailable compensation permissions. Existing input validation, ownership, server session money/guests, safety flags and response shapes remain. Current responses still success false / PROVIDER_NOT_CALLED.

Proven provider-confirmation defect: early existing-reference branch returned success true / alreadyConfirmed even for unknown/non-confirmed provider status. It now requires matching reference/status and saved provider evidence, otherwise fixed HTTP 503 LIFECYCLE_INCONSISTENT with no second booking attempt. Direct provider confirmation results and reconciliation results also require confirmed matching evidence before confirmation success; a matching reference alone is insufficient. Existing safety guard remains before provider execution.

Provider confirmation is an individual operation result, not a claim that the booking/payment lifecycle is commercially complete. Existing sync/quote/read response success flags mean that specific read operation succeeded; they are not converted to lifecycle completion. No broad response rewrite.

Current booking history exposes stored facts, labels TEST/sandbox and gives Hotelbeds unknown/failure status precedence over local labels; it does not derive this new COMPLETED status. The new lifecycle summary is not wired to account pages. Historical cross-domain record cleanup or commercial history presentation is outside this backend-only foundation; no stored status/reference/history row is fabricated or rewritten. Future activated history must consume validated lifecycle summaries for partial payment/refund states instead of treating provider confirmation as overall completion.

## 10. Tests

- Focused 6M: **36/36 PASS**, exactly one run on final source, synthetic state objects only.
- Adjacent focused: **112/112 PASS**, exactly one invocation of bookingIntentFoundation (6F), paymentIntentFoundation (6J), bookingPaymentRecovery (6K), cancellationRefundFoundation (6L). Required because shared review/boundary contracts were touched.
- Full backend: **674/688**, exactly one run of 46 test files; **14 known DB-blocked failures**, no additional failures. Blocked suites: hotelbedsAccess (1), hotelbedsCatalogPlan (1), hotelbedsContent (3), hotelbedsMultiDestination (1), hotelbedsPublicSearch (1), hotelbedsStagingTest (6), stagingAcceptance (1). These cases cannot run under the intentional no-real-DB constraint; full backend PASS is not claimed. Dedicated hotelbedsCatalog.integration.test.js excluded because it requires real isolated PostgreSQL schema.
- Frontend unchanged; frontend full/tests/lint/build NOT RUN.
- Verifier: **PASS**, 228 backend syntax files and 497 secret-scan files, findings empty. 6A: **PASS**. Final diff-check: **PASS**. Each gate run once; 6B not run on intentionally dirty tracked source.
- Covers safe current flow, missing review prerequisites, impossible combinations, unknowns/reconciliation, both partial-failure directions, cancellation/refund recovery, transition restrictions, evidence-gated hypothetical completion, provider-reference regression predicate, malformed state privacy and shared disabled-boundary safety.
- Focused provider/DB/payment/refund/cancellation/logging methods forbidden. OS-temp pg guard prohibits real PostgreSQL; existing HTTPS guard prohibits external network operations. Adjacent tests use synthetic mocks and permitted local auth fixtures.
- Real Availability, CheckRate, Hotelbeds Booking, Cancellation, payment and refund provider calls: **0**. Real DB mutations: **0**.

## 11. Exact files

Modified:

- backend/services/bookingPaymentRecovery.js
- backend/services/hotelbedsBookingService.js
- backend/services/refundReadinessService.js
- backend/controllers/providerBookingController.js

New:

- backend/services/bookingLifecycle.js
- backend/tests/bookingLifecycleConsistency.test.cjs
- SPRINT_6M_BOOKING_LIFECYCLE_STATE_CONSISTENCY_REPORT.md

Frontend changed: NO. Backend runtime changed: YES. DB/schema changed: NO. All files unstaged.

## 12. Limitations

Pure server-only consistency/transition foundation, no persistence framework, provider operations or activation. Evidence flags must originate in trusted adapters; boolean flags alone are not real-world receipts. This sprint does not build durable distributed lifecycle enforcement or automatically apply the validator to every legacy sandbox/history mutation. Current staging terminal remains disabled; lifecycle validator does not manufacture success. Full backend intentionally limited by no-real-DB constraint.

Owner acceptance NOT RUN. After separately authorized deploy, owner checks /health, /api/health/ready, existing site operation, Checkout BOOKING_DISABLED, payment unavailable and no new success/cancel/refund UI. No Hotelbeds request or new provider call solely for 6M.

## 13. Future activation path

Separate authorization required for durable booking/payment/cancellation/refund ownership/outcome evidence, transactional state persistence, authenticated reconciliation and operation idempotency. Apply consistency/transition checks at actual mutation and history-projection boundaries before activating a commercial lifecycle. Never treat intent readiness, local sandbox state or an uncertain reference as successful provider evidence.

PRODUCTION SALES READY: **NOT CLAIMED**.
