# Sprint 6N — Booking Lifecycle Release Candidate

SPRINT 6N — CODE / OFFLINE: PASS — tested scope.
BOOKING LIFECYCLE RC: READY — tested scope.
RELEASE BLOCKERS: 0 in the tested non-commercial contract.

## 1. Baseline

Branch `develop`; tracked tree clean at start. HEAD `43a624a` (`docs: record Sprint 6M lifecycle verification`), following `a593439` (`feat: enforce booking lifecycle state consistency`). Sprint 6M committed. Unrelated untracked owner files retained. No reset/restore/clean, staging, commit, push or deploy.

Hotelbeds TEST retained; LIVE, real booking, payment, charges, refunds, cancellation, email and production sales remain off. PAYMENTS_MODE=disabled, PAYMENTS_PROVIDER=none. Production infrastructure remains paused; no provisioning or remote changes.

## 2. RC scope

Existing 6E–6M implementations reused without runtime, dependency, configuration or schema changes. Inspection limited to lifecycle integration and corresponding focused suites. New verification joins signed offer normalization/token verification, checkout CheckRate, server checkout session reads, traveller validation, Review, booking/payment intents, recovery, cancellation/refund readiness and lifecycle validation.

Backend runtime changed: NO. Frontend runtime changed: NO.

## 3. Integrated lifecycle

The RC test uses a synthetic search hotel/rate, the real provider normalizer and offer generator, and a real signed offer token. Checkout invokes the real CheckRate adapter normalization with a mocked transport response. An in-memory session repository boundary retains the exact confirmed offer; subsequent intent endpoints use the real readForIntent validation and an allowlisted mocked SELECT.

Confirmed CheckRate → valid entered travellers → REVIEW_READY → INTENT_READY → BOOKING_DISABLED → PAYMENTS_DISABLED is valid, SAFE_DISABLED_TERMINAL. Both current intent endpoints return intentional HTTP 503, success=false and PROVIDER_NOT_CALLED. No provider operation or checkout consumption occurs.

The session create boundary is mocked, not a real database insertion. This verifies module contracts, not persistence, deployment or a real provider response. Existing HTTP semantics are unchanged.

## 4. Trust boundaries

The exact opaque rateKey survives signing, provider mock and private intent. CheckRate price/currency are authoritative; changed price replaces search price and requires current checkout-token acceptance. Browser price, currency, occupancy and state cannot override server intent prerequisites. Invalid signatures fail before provider dispatch; valid BOOKABLE and RECHECK selections reach the CheckRate mock without an Availability refresh. Provider-derived UNAVAILABLE is tested only after that mocked response; malformed/untrusted offers may still correctly fail before dispatch.

Confirmed room, board, hotel, dates and nights survive into Review. Server occupancy controls traveller count, adult/child types and child ages. Entered names are normalized, not fabricated; optional DOB is validated and never generated. Invalid guest/DOB data prevents Review. Tokens, rateKeys, provider IDs and injected raw secrets are absent from the public Review. Guest PII is intentionally present in the explicitly requested Review body, and absent from ordinary intent responses, errors and captured logs; no URL flow is introduced.

## 5. Booking/payment safety

Booking uses current, unused server CheckRate confirmation, valid travellers and trusted offer identity/money. Review is reconstructed server-side rather than accepted as a browser assertion. Existing provider guard and disabled boundary are retained. Payment reconstructs the same ready booking/review prerequisites, rejects altered money, client states and card fields, and stays PAYMENT_NOT_STARTED with mode disabled/provider none.

Sequential and concurrent duplicate submits keep stable intent/correlation data and never dispatch operations, consume sessions or create rows. This is duplicate safety at the current disabled boundary, not a new durable commercial idempotency system. No fake booking reference, payment ID or PAID/AUTHORIZED/CAPTURED result is produced.

## 6. Recovery consistency

Existing recovery policy distinguishes retryable, final and unknown outcomes. Lost/unknown outcomes require reconciliation before retry. Synthetic observed booking plus payment failure requires cancellation compensation; observed payment plus booking failure requires refund compensation. Such plans have success=false, compensationCompleted=false and all attempt permissions false. Lifecycle validation rejects completion while those obligations remain. No automatic retry, provider probe or compensation execution is added.

## 7. Cancellation/refund safety

Cancellation readiness requires matching stored TEST booking reference/status and provider-result evidence plus owner access. A disabled Review/intent is not a confirmed booking. Client state/reference cannot establish eligibility. Even a synthetic evidenced confirmed booking remains CANCELLATION_UNAVAILABLE.

Refund readiness requires a real-charge observation, not a local sandbox paid label. Client amount/currency/state fields are rejected; absent charge remains REAL_CHARGE_REQUIRED with unknown amount. Adjacent 6L covers trusted charge/cancellation/penalty estimates and ownership. Duplicate cancellation/refund validations stay unavailable with no fake CANCELLED/REFUNDED result. Unknown compensation remains unresolved and reconciliation-required.

## 8. Lifecycle consistency

Existing bookingLifecycle is reused. Current disabled staging flow is valid and distinct from failed or unknown. Tests reject Review without confirmed CheckRate, paid with failed booking and no recovery, completed unavailable cancellation/refund, completion with compensation or reconciliation, not-started jumps to confirmation, leaving unknown without reconciliation and leaving a disabled terminal for pending execution.

No second lifecycle framework or activation path is added. Hypothetical trusted operation evidence in synthetic states does not mint real confirmations or authorize operations. Existing 6M integration and limitations remain unchanged.

## 9. RC tests

New `backend/tests/bookingLifecycleReleaseCandidate.test.cjs`: **40/40 PASS**, focused invocation once. Covers the integrated safe chain, trust tampering, changed-price acceptance, obsolete pre-provider refresh regression, guests, Review privacy, booking/payment guards, duplicates, recovery, compensation and impossible states.

Per-test forbidden-operation counters remain zero. DB queries are limited to the mocked checkout SELECT; connections/writes/session consumption, Availability, booking/cancellation adapters and transport, payment initiation and sandbox refund execution are forbidden. Logs are captured and checked for synthetic guest PII, full rateKey and signing secret. Existing HTTPS offline guard blocks accidental real HTTPS. The external OS-temp pg preload blocks real PostgreSQL query/connect, including full regression. No application dependency or repository guard file is changed.

Full backend: **714/728**, exactly one aggregate run of 47 test files; **14 known DB-blocked failures**, zero cancelled/skipped and no additional regressions. Blocked suites: hotelbedsAccess (1), hotelbedsCatalogPlan (1), hotelbedsContent (3), hotelbedsMultiDestination (1), hotelbedsPublicSearch (1), hotelbedsStagingTest (6), stagingAcceptance (1). Dedicated hotelbedsCatalog.integration.test.js excluded because it requires a real isolated PostgreSQL schema. Full backend PASS is not claimed.
Verifier: **PASS**, 229 backend syntax files, 499 secret-scan files, findings empty. 6A: **PASS**. Final diff-check: **PASS**. Release gates each run once.
Full frontend, lint and build: NOT RUN — no frontend runtime/config change.

## 10. Adjacent regression

**256/256 PASS**, each of these relevant focused suites invoked once together:

- 6E: checkRateReadiness.test.cjs
- 6F: bookingIntentFoundation.test.cjs
- 6G: travellerGuestFlow.test.cjs
- 6H: checkoutReadiness.test.cjs
- 6I: checkRateStagingDiagnostic.test.cjs
- 6J: paymentIntentFoundation.test.cjs
- 6K: bookingPaymentRecovery.test.cjs
- 6L: cancellationRefundFoundation.test.cjs
- 6M: bookingLifecycleConsistency.test.cjs

The separate single full-backend invocation includes those suites as aggregate RC evidence; no additional focused reruns. No unrelated frontend suite. 6B manifest not run; new RC evidence is intentionally uncommitted.

## 11. Release blockers

**0 observed release blockers in tested scope.** No guard bypass, trusted-money override, fabricated operation success, exposed Review secret/PII error or accepted tested contradiction was found. No runtime fix was required.

Intentional disabled booking/payment/cancellation/refund, paused production, no LIVE credentials/payment gateway and known DB-blocked cases are limitations, not blockers for this non-commercial RC. This classification does not certify future activated commercial workflows.

## 12. Exact files

Modified existing files: **none**.

New files:

- backend/tests/bookingLifecycleReleaseCandidate.test.cjs
- SPRINT_6N_BOOKING_LIFECYCLE_RELEASE_CANDIDATE_REPORT.md

All files unstaged. DB/schema changed: NO. Dependencies changed: NO.

## 13. Known limitations

Offline mocked verification, not a live provider, persistent database, production or newly deployed staging acceptance. Known DB-dependent cases intentionally cannot run against a real DB. Existing pure lifecycle validator is not durable distributed transaction enforcement; future commercial mutations/history projections need separately authorized evidence, reconciliation and idempotency integration.

Real Hotelbeds Availability calls: 0. Real Hotelbeds CheckRate calls: 0. Hotelbeds Booking calls: 0. Hotelbeds Cancellation calls: 0. Payment provider calls: 0. Refund provider calls: 0. Real DB mutations: 0.

Real Booking/Payments/Cancellation/Refund remain disabled. Booking enabled: NO. Payments enabled: NO. **BOOKING LIFECYCLE RC != production-sales-ready. PRODUCTION SALES READY: NOT CLAIMED.**

## 14. Owner acceptance plan

OWNER BROWSER RECHECK: **NOT REQUIRED — existing 6I staging evidence remains applicable**, because 6N makes no runtime changes. Reuse the explicitly established Search → confirmed CheckRate → Travellers → Final Review → BOOKING_DISABLED evidence. No new browser run, deployment or Hotelbeds call was performed or required for this verification sprint. A future runtime change would require a separately scoped browser recheck; commercial activation remains separately authorized work.
