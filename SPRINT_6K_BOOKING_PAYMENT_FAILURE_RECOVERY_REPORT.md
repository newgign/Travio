# Sprint 6K ? Booking + Payment Failure Recovery Foundation

SPRINT 6K ? CODE / OFFLINE: **PASS ? tested scope**.
FAILURE RECOVERY FOUNDATION: **PASS ? tested scope**.
Existing recovery architecture: **REUSED + HARDENED**.

## 1. Baseline

Branch develop, tracked tree clean at start, HEAD `ccae8aa` (`docs: record Sprint 6J payment foundation verification`). Sprint 6J committed; unrelated untracked owner files retained. Inspected only booking/payment intent services/controllers, directly relevant provider recovery/transport/session helpers, tests and booking history projection/presentation. No dependency, schema, config or infrastructure change; no reset/restore/clean, git add/commit/push/deploy.

Safety preserved: Hotelbeds TEST only, LIVE/real booking off, booking disabled, PAYMENTS_MODE disabled, PAYMENTS_PROVIDER none. Real charges/refunds and production sales remain hard-disabled; email off, infrastructure paused. No activation performed.

## 2. Existing failure handling

Hotelbeds provider confirmation already has durable `confirming`, `confirmation_unknown`, `confirmation_failed`/RATE_EXPIRED and actual provider CONFIRMED/MODIFIED states. Existing controller claims a booking atomically before POST; duplicate confirming requests are busy and unknown requests follow reconciliation instead of a new POST. An empty reconciliation list after timeout is not proof of no booking. Mutation transport explicitly disables automatic Booking/cancellation retries. Existing reconciliation can perform reads in the separately guarded provider workflow; no such call is made by the new policy.

Checkout session is valid/unexpired/unused or rejected; intent reads do not consume it. Booking intent is INTENT_READY with stable hash-based requestId, but ends at BOOKING_DISABLED. 6J payment preview is PAYMENT_INTENT_READY, then PAYMENTS_DISABLED/PAYMENT_NOT_STARTED without rows or provider calls.

Legacy local sandbox payment uses pending/requires_action/paid; sandbox refund requests/completion and idempotency keys already exist. These simulated persisted states do not prove real PSP effects and are not used to authorize 6K recovery. Existing legacy sandbox fake paid/local booking confirmation is outside the current Hotelbeds intent boundaries and unchanged.

My Bookings public projection preserves stored provider facts without synthesizing confirmation. Existing frontend bookingStatus gives Hotelbeds provider status precedence; confirming/unknown/failed records are not promoted through a local confirmed label. Persisted cards label TEST records and stored amounts explicitly, with disabled booking/payment actions. No history rows or frontend changes are introduced by 6K.

Existing provider persistence/payment updates span operations; the legacy sandbox/provider workflows are not a complete atomic booking/payment saga. Future partial-failure consistency needs durable ownership/outcome/idempotency mechanisms. This sprint does not claim to solve that persistence problem or enable those workflows.

## 3. Recovery state model

Added one shared pure `bookingPaymentRecovery` policy module, composing existing booking/payment states. It is not a second operation runner, route or durable state machine. Existing service intent boundaries derive their unchanged disabled responses through this policy; controller status semantics and public shapes remain unchanged. Hypothetical recovery internals are not exposed to users.

Server-only observations recognize BOOKING_NOT_STARTED/BOOKING_DISABLED, confirming, confirmation_unknown and confirmation_failed; PAYMENT_NOT_STARTED/PAYMENTS_DISABLED, pending/requires_action, failed and OUTCOME_UNKNOWN. Existing provider-result labels CONFIRMED/MODIFIED/paid require explicit trusted providerResultObserved evidence; labels alone remain unknown. This flag is for a future trusted adapter, never accepted from browser payloads; current routes reject arbitrary state fields.

Pure output distinguishes NOT_STARTED, DISABLED, PENDING, RETRYABLE, NON_RETRYABLE, OUTCOME_UNKNOWN and OBSERVED_RESULT. Aggregate policy uses RECOVERY_PENDING, COMPENSATION_REQUIRED or RECOVERY_NOT_REQUIRED; even hypothetical observed results never emit commercial success. All booking/payment/compensation attempt permissions are unconditionally false. No BOOKED, PAID, REFUNDED, CANCELLED or compensation-completed result is manufactured.

## 4. Retryable/non-retryable/unknown outcomes

Trusted dispatch metadata: NOT_SENT, SENT or UNKNOWN; outcomeKnown must be explicit. Disabled operations are non-retryable. Lost/uncertain response after possible dispatch is OUTCOME_UNKNOWN before interpreting a 5xx/timeout as failure; reconciliation is required and retransmission is forbidden.

With proven pre-dispatch or known no-effect outcome, transient network/timeout, 429/5xx and existing retryable internal codes are retryable, requiring an explicit retry after revalidation. Known input/auth/provider rejection and disabled codes are non-retryable. Unclassified codes are conservatively non-retryable once outcome is known. Existing confirmation_unknown stays unknown; it is not flattened to failure or success. A known HTTP error alone must not be assumed to prove absence of side effects; future adapters must establish outcome certainty.

No automatic retry loop, sleep, provider probe or background recovery job added. These decisions are planning classifications, not execution authorization.

## 5. Idempotency

Reuses the validated booking intent requestId. Stable action correlations append booking/payment/compensation labels to the same identity; these are internal plan keys, not fabricated transaction references. Repeated/concurrent disabled booking/payment submissions have zero provider attempts and zero writes; pending/unknown model observations also prohibit replay. Repeated compensation plans share identity and cannot execute.

No distributed locking, completed-operation cache or new persistence. Stable keys alone do not provide durable idempotency for future activated operations; existing provider atomic claim/reconciliation and sandbox keys remain unchanged. The duplicate-protection claim covers current disabled boundaries only.

## 6. Partial-failure semantics

- Booking fails before payment: payment remains not started, no payment retry or execution allowed.
- Future proven booking result plus payment failure/disabled: COMPENSATION_REQUIRED, CANCELLATION_REQUIRED; no full success.
- Future proven payment result plus booking failure/disabled: COMPENSATION_REQUIRED, REFUND_REQUIRED; no full success or silent confirmation.
- Any unknown booking/payment outcome: RECOVERY_PENDING, reconciliation first; no premature cancellation/refund and no retry of uncertain mutation.
- Pending attempts: wait and block duplicate action. Two hypothetical proven results mean no recovery is required by this policy, not a public commercial success response.

These are synthetic server-observation scenarios only; no operation was simulated as an actual completed booking or payment record. This foundation is not a complete future execution/ordering or partial-progress persistence contract.

## 7. Compensation foundation

CANCELLATION_REQUIRED/REFUND_REQUIRED describe future obligations only. compensationCompleted false and compensationAttemptAllowed false in every plan. No cancellation/refund invocation, fake completed compensation or recovery row. Existing cancellation/refund guards and implementations are unchanged; future activation requires separate authorization and reconciliation of real provider evidence.

Pure module imports no DB/provider/logger. Whitelisted enum decisions and stable correlation only; raw errors, stack, auth/payment secrets, JWT, DB URL and traveller PII are never copied. Current intent responses remain fixed and private under existing projection.

## 8. Tests

- Focused 6K: **28/28 PASS**, exactly one run on final source.
- Full backend: **605/619**, exactly one final run over 44 files; **14 known DB-blocked cases**, no new regression. No full backend PASS claimed; no real DB. Blocked cases: access 1, catalog planner 1, content 3, multi-destination 1, public search 1, staging TEST 6, staging acceptance 1. Dedicated hotelbedsCatalog.integration.test.js excluded because it requires isolated PostgreSQL schema.
- Frontend runtime unchanged; full frontend/lint/build NOT RUN.
- Verifier: **PASS**, 225 backend syntax files / 492 scanned files, no findings. 6A: **PASS**. Diff-check: **PASS**. Each final gate run once; runtime source unchanged after focused verification. No 6B with intentionally dirty tracked source.
- Focused coverage: retryable/final/unknown booking and payment; dispatch certainty; disabled/pending replay; concurrent real controller intent submissions; stable action keys; cancellation/refund obligations; both partial-failure directions; unknown-before-compensation; no inferred sandbox/provider success; malformed observations/privacy; unchanged disabled responses/history projection.
- Provider APIs, confirmation/reconciliation/cancellation/refund calls, payment execution, DB connection/mutation/session consumption and logger calls are forbidden by focused mocks. Session SELECT is mocked. OS-temp lazy pg preload blocks real PostgreSQL and existing offline HTTPS preload blocks external calls.
- Real Availability, CheckRate, Hotelbeds Booking, payment, refund and cancellation provider calls: **0**. Real DB mutations: **0**.

## 9. Exact files

Modified:

- backend/services/hotelbedsBookingService.js
- backend/services/paymentGatewayService.js

New:

- backend/services/bookingPaymentRecovery.js
- backend/tests/bookingPaymentRecovery.test.cjs
- SPRINT_6K_BOOKING_PAYMENT_FAILURE_RECOVERY_REPORT.md

Backend runtime changed: YES. Frontend changed: NO. DB/schema changed: NO. All changes unstaged.

## 10. Limitations

Current validate-only boundaries remain disabled. No real booking, payment, refund, cancellation, automatic retry loop or fake success. Recovery plans are server-only and transient; no persisted recovery saga or activation path exists. Future callers must supply trusted dispatch/outcome evidence, not treat provider status/error alone as execution proof. Existing provider/legacy sandbox execution paths were not redesigned. Full backend remains limited by intentional no-real-DB verification.

Owner acceptance NOT RUN. No new Hotelbeds request required: after separately authorized deploy, owner may check backend health/readiness, site operation, booking/payment still disabled and no new fake success UI. No provider call needed.

## 11. Future activation path

Separate authorization needed for actual booking/payment ordering, proven provider outcomes, authenticated reconciliation, durable claims/idempotency/ownership, crash recovery and transaction boundaries. Unknown effects must be reconciled before retry or compensation; compensation needs its own authorized provider operation and verified result. Do not reinterpret disabled responses or policy keys as confirmation or execute refund/cancellation based solely on an error message.

PRODUCTION SALES READY: **NOT CLAIMED**.
