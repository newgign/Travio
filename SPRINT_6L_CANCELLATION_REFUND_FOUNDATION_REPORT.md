# Sprint 6L ? Cancellation & Refund Foundation

SPRINT 6L ? CODE / OFFLINE: **PASS ? tested scope**.
CANCELLATION & REFUND FOUNDATION: **PASS ? tested scope**.
Existing architecture: **REUSED + HARDENED**.

## 1. Baseline

Branch develop, tracked tree clean at start, HEAD `43f84cd` (`docs: record Sprint 6K recovery verification`). Sprint 6K committed. Unrelated untracked owner files retained. Scope: existing Hotelbeds cancellation/payment/refund services/controllers/routes, 6K policy and directly relevant tests/history contracts. No dependency or schema/config change, no reset/restore/clean or git add/commit/push/deploy.

Hotelbeds TEST only; LIVE, real booking, payment, cancellation, refund, charge, email and production sales remain off. Booking disabled; PAYMENTS_MODE disabled, PAYMENTS_PROVIDER none. Production hard gate unchanged, infrastructure remains paused. No activation performed.

## 2. Existing cancellation/refund architecture

Reused HotelbedsBookingService simulateCancellation/cancel and parseCancellationResponse; existing provider routes `/bookings/:id/provider/cancel/simulate` and `/cancel`. Existing simulation is a provider quote operation and persists a cancellation snapshot; actual cancellation uses the booking safety guard and persists provider evidence. Neither is invoked by the new intent.

Existing refundController supports `/payments/:id/refund/request` and `/complete-sandbox`, with sandbox-mode, ownership, non-Hotelbeds and explicit no-real-charge guards, locked booking/payment/refund context, existing idempotency keys and refund rows. There is no connected real PSP refund adapter. Existing refundReadinessService summarizes legacy sandbox/provider-managed readiness. This sprint extends it instead of creating another cancellation/refund subsystem.

Existing booking states include local pending, confirming, confirmation_unknown, confirmation_failed and provider CONFIRMED/MODIFIED/CANCELLED. Payments include pending/requires_action/paid/test/failed; refund records include requested/refunded. Legacy sandbox completion can write simulated refunded/local_refunded/locally cancelled records with explicit no-real-refund metadata; these historical sandbox semantics remain outside the new foundation. No new fake completed state is emitted.

Policy representations: selected-offer cancellationPolicies; saved provider_cancellation_snapshot for quotes; provider_response for actual provider outcomes. Missing policy/fee is not free cancellation. Booking history retains stored facts and explicitly labels TEST/sandbox records and unavailable actions; no new history writes or active UI action. No frontend change required.

## 3. Cancellation intent

New authenticated POST `/api/bookings/:id/provider/cancel/intent`, within existing booking routes/controller/service. Empty JSON body only. Parameter ID must match a stored booking; owner or existing admin role required. Client state, reference, environment, eligibility and penalty fields are rejected.

Eligibility requires Hotelbeds, matching stored provider reference and provider_response.booking.reference/status/currency, provider status CONFIRMED/MODIFIED, TEST snapshot and current TEST configuration. A local status, REVIEW_READY, INTENT_READY, BOOKING_DISABLED, missing reference, unmatched raw provider evidence or failed/pending/unknown record cannot establish a confirmed provider booking. Parameter ID alone is not authority.

All valid responses remain HTTP 503 CANCELLATION_UNAVAILABLE, success false, providerState PROVIDER_NOT_CALLED, cancellationAvailable false. A safe prospective intent gives stable correlation, eligibility reason, TEST, trusted currency and optional estimatedPenalty/penaltyStatus. Eligible stored evidence does not enable cancellation. No provider simulation/DELETE, row lock, cancellation/history write or new booking record.

## 4. Refund intent

New authenticated POST `/api/payments/:id/refund/intent`, reusing refundController/paymentGatewayService/refundReadinessService. Reads stored booking first, checks ownership before payment SELECT, then latest existing payment. No lock or mutation. Empty body only; amount, currency, transaction/payment identity and refund status are rejected as client authority.

A prospective real refundable charge requires matching payment.booking_id, paid status, non-sandbox/non-none gateway, non-sandbox external transaction identity, metadata.realCharge exactly true, explicit matching charge currency in existing metadata, positive numeric charged amount and valid prior refunded amount. Local/sandbox paid labels, absent currency or missing charge evidence cannot establish refund eligibility. No real charge exists in the current enabled flow.

Cancellation-first intent requires actual saved cancelled provider response with matching reference/status/currency; a simulation quote cannot satisfy completion. Unknown actual penalty yields UNKNOWN refund amount. Safe response remains HTTP 503 REFUND_UNAVAILABLE, success false, providerState PROVIDER_NOT_CALLED, refundAvailable false, even for hypothetical fully eligible stored facts. No PSP refund, sandbox completion, refund/transaction/history row or booking mutation.

Validation/access/missing-record errors use fixed COMPENSATION_INTENT_INVALID / BOOKING_ACCESS_DENIED / BOOKING_NOT_FOUND responses (409/403/404). Unexpected errors use HTTP 503 INTERNAL_RETRYABLE_ERROR without raw exception, provider body, stack or PII.

## 5. Trusted penalty/refund amount

Saved quote must refer to the same provider booking and currency. Its fee is labelled ESTIMATE_ONLY, not a freshly verified cancellation quote; absence remains null/UNKNOWN. No policy arithmetic or invented fee. Fixed a demonstrated parser defect: Number(null) and Number(blank) previously became zero; parseCancellationResponse now accepts only nonblank numeric strings/numbers before conversion, preserving genuine explicit zero and supported nested amount fields.

Refund preview uses trusted charged cents minus observed actual cancellation fee minus previously refunded cents, floored at zero, with existing Number/Math.round cents convention. Currency comes from explicit charge metadata and must match stored booking currency; no fallback conversion/default. Missing/malformed monetary facts, absent actual cancellation or unknown fee produce null/UNKNOWN rather than a fabricated refund. Preview remains TRUSTED_ESTIMATE; real settlement/future PSP rules are not implemented. Browser cannot override any amount.

## 6. Unknown outcome semantics

Extended existing 6K pure policy with cancellation/refund observations and compensationPlan. Reuses classifyFailure dispatch/outcome certainty: transient pre-dispatch failure can be retryable; explicit known rejection is final; lost response after possible provider acceptance is OUTCOME_UNKNOWN and RECONCILIATION_REQUIRED. CANCELLATION_UNAVAILABLE/REFUND_UNAVAILABLE are non-retryable. Unknown outcomes are never turned into cancelled/not-cancelled/refunded/final failure.

Only minimal unavailable/not-started/pending/unknown aliases are added. Existing CANCELLED/refunded labels are accepted as hypothetical server input only with explicit providerResultObserved proof; labels alone stay unknown. There is no public endpoint accepting these recovery observations. All execution flags remain false and compensationCompleted false. No automatic retry loop, provider probe or background job.

## 7. Idempotency

Intent correlation derives deterministically from the existing stored booking identity. 6K plan action keys retain request correlation and distinguish cancellation/refund. Repeated/concurrent new intents perform only mocked/real read-only SELECTs, with zero provider attempts and zero writes. Unavailable, pending and unknown recovery observations do not authorize duplicate action; repeated compensation plans retain stable identity.

No distributed lock, new table, persisted request or durable future idempotency claim. Existing provider/sandbox idempotency guards remain unchanged. Duplicate-protection claim applies to currently unavailable boundaries; future execution requires durable attempt/outcome claims.

## 8. Recovery/compensation integration

The intent services derive unavailable permissions through shared 6K compensationPlan, keeping hypothetical internals out of UI responses. Original booking/payment compensation obligations remain.

Cancellation-before-refund: pending/unknown cancellation does not satisfy refund prerequisite. Hypothetical proven cancellation plus failed refund remains COMPENSATION_REQUIRED / REFUND_REQUIRED, success false. Hypothetical proven refund plus unknown cancellation remains RECOVERY_PENDING with reconciliation required. Booking exists plus payment failure preserves CANCELLATION_REQUIRED; payment exists plus proven booking failure preserves REFUND_REQUIRED. Unknown base outcomes also take precedence over retries/compensation.

All cancellation/refund/compensation attempt permissions false; no completed compensation manufactured, no fake CANCELLED or REFUNDED state. A future refund after proven booking failure with no booking to cancel remains a 6K planning obligation; the current refund intent conservatively supports only cancellation-first stored evidence and does not execute that future exception.

## 9. Tests

- Focused 6L: **33/33 PASS**, exactly one run on final source.
- Full backend: **638/652**, exactly one final run over 45 files; **14 known DB-blocked cases**, no new regressions. No full backend PASS claimed. Blocked cases: access 1, catalog planner 1, content 3, multi-destination 1, public search 1, staging TEST 6, staging acceptance 1. Dedicated hotelbedsCatalog.integration.test.js excluded because it requires real isolated PostgreSQL schema.
- Frontend unchanged; frontend tests/lint/build NOT RUN.
- Verifier: **PASS**, 226 backend syntax files / 494 scanned files, no findings. 6A: **PASS**. Diff-check: **PASS**. Final gates each run once; runtime unchanged after focused verification. No 6B while tracked tree is intentionally dirty.
- Coverage: confirmed-booking evidence/ownership, rejected client assertions, trusted/unknown quote fee including null/blank/zero regression, real charge and payment relationship, authoritative cents/currency, no fake completion, ordering, retryable/final/unknown outcomes, duplicate controller submissions, compensation preservation, privacy/technical errors and unauthenticated intent-route 401.
- Provider transport/confirmation/cancellation/refund/sandbox methods and DB connections/mutations/logging forbidden in focused mocks. Only expected booking/payment SELECTs mocked. OS-temp lazy pg preload blocks real DB, existing HTTPS guard blocks external calls; local auth HTTP fixture uses short-lived Node HTTP connections only.
- Real Availability, CheckRate, Hotelbeds Booking, Cancellation, payment and refund provider calls: **0**. Real DB mutations: **0**.

## 10. Exact files

Modified:

- backend/services/refundReadinessService.js
- backend/services/hotelbedsBookingService.js
- backend/services/paymentGatewayService.js
- backend/services/bookingPaymentRecovery.js
- backend/controllers/providerBookingController.js
- backend/controllers/refundController.js
- backend/routes/bookingRoutes.js
- backend/routes/paymentRoutes.js

New:

- backend/tests/cancellationRefundFoundation.test.cjs
- SPRINT_6L_CANCELLATION_REFUND_FOUNDATION_REPORT.md

Backend runtime changed: YES. Frontend changed: NO. DB/schema changed: NO. No migration/dependency changes. All files unstaged.

## 11. Limitations

No real cancellation, refund, booking or payment. No fake CANCELLED, fake REFUNDED or completed compensation emitted by the foundation; legacy sandbox history remains explicitly simulated. Current flags cannot enable new intent execution. Hypothetical stored provider/charge fixtures model future prerequisites only; they are not real provider evidence produced by these tests. No history records created or status rewritten.

No new booking/payment ownership schema, durable compensation state or PSP adapter. Saved quotes may be stale and are estimates; no fresh quote request is made. Charge currency must already be explicit in trusted metadata; no schema change or inferred default. Unknown refund/cancellation requires future authenticated reconciliation before activation.

Owner acceptance NOT RUN. After separately authorized backend deployment, owner may verify /health, /api/health/ready, site operation, no active real cancellation/refund action and booking/payment still disabled. No Hotelbeds or payment request is needed or performed.

## 12. Future activation path

Requires separate authorization and implementation of real provider booking/charge provenance, trusted policy quotes, payment currency/transaction mapping, verified cancellation/refund result handling, authenticated reconciliation, durable idempotency and partial-failure persistence. Decide cancellation/refund ordering and the compensation exception for known no-booking outcomes; do not execute based on browser assertions, stale quotes or unknown provider effects. Existing safety gates must remain until commercial readiness is independently established.

PRODUCTION SALES READY: **NOT CLAIMED**.
