# Sprint 6J ? Payment Architecture Foundation & Safe Payment Intent

SPRINT 6J ? CODE / OFFLINE: **PASS ? tested scope**.
PAYMENT ARCHITECTURE FOUNDATION: **PASS ? tested scope**.

## 1. Baseline

Branch develop, tracked tree clean at start, HEAD `3467f97` (`docs: record Sprint 6I staging acceptance evidence`). Sprint 6I evidence committed. Unrelated untracked owner files retained. Scope restricted to existing payment controller/routes/service, checkout session and booking intent/review dependencies. No dependencies added, no reset/restore/clean or git add/commit/push/deploy.

Hotelbeds TEST only; LIVE and booking disabled. PAYMENTS_MODE disabled, PAYMENTS_PROVIDER none. Real charges/refunds and production sales remain disabled by the unchanged production hard gate. Email remains off; production infrastructure remains paused. No configuration or infrastructure activation performed.

## 2. Existing payment architecture

Reused and extended `paymentGatewayService`, `paymentController` and authenticated `paymentRoutes`; no parallel payment provider system.

Existing routes: GET /payments/readiness, POST /payments/:id/intent, GET /payments/:id, PUT /payments/:id/pay, POST /payments/:id/refund/request and /complete-sandbox. Existing provider abstraction is the gateway service: disabled by default, optional legacy local sandbox, no connected real PSP adapter. Mode/provider come from PAYMENTS_MODE/PAYMENTS_PROVIDER and unchanged productionGateService.

Existing legacy createIntent reads a persisted booking, checks user/admin access, rejects Hotelbeds and allows sandbox-only payment-row updates. Existing sandbox completion writes paid/local_paid with explicit sandbox metadata and no real charge; existing sandbox refund controller/readiness supports persisted sandbox-only refund requests/completion and blocks Hotelbeds. These historical simulated states are outside the new Hotelbeds checkout boundary and unchanged. They are not evidence of real operations. Legacy payment correlation/idempotency keys and refund idempotency schema already exist.

Existing createBooking has booking/payment-row writes in local/mock flows, but Hotelbeds booking-disabled guards block this route before creation. Hotelbeds booking intent and review read an existing checkout session without creating/consuming rows. Booking intent already contains trusted price/currency and stable hash-based request correlation.

PaymentStep makes no direct gateway request. For Hotelbeds it returns an early disabled placeholder with amount and Back only; FinalReviewStep shows booking/payment unavailable and has a disabled final button. Checkout's Hotelbeds payment callback is already guarded; current Hotelbeds flow uses final review, not sandbox success. Legacy mock checkout can call existing sandbox intent/completion when explicitly configured. Relevant UI has payment method labels but no PAN/expiry/CVV/card-credential inputs. No frontend change needed.

## 3. Payment intent contract

New authenticated POST `/api/payments/intent`, within existing payment routes. It accepts the existing checkout booking-intent submission: checkoutToken, travelers and explicit review true, with existing optional token-bound price acceptance and selection assertions. No booking ID is required because no booking exists.

Existing `checkoutSessionService.readForIntent` reads/validates the opaque session. Existing `hotelbedsBookingService.prepareIntent` validates fresh confirmed CheckRate, TEST identity, session columns, stay/occupancy, guests and selected-price acceptance, producing INTENT_READY. Existing reviewPreview reconstructs server REVIEW_READY for this exact submission. Browser state/reviewReady flags or a review object cannot establish readiness. Both internal state names are checked before payment preview.

Response HTTP 503: success false, code/state PAYMENTS_DISABLED, paymentState PAYMENT_NOT_STARTED, providerState PROVIDER_NOT_CALLED, bookingState BOOKING_DISABLED, bookingAvailable/paymentAvailable false. Safe intent contains PAYMENT_INTENT_READY, REVIEW_READY, existing booking request correlation, hotel/provider context, TEST environment, requested payment mode/provider, confirmed amount/currency and bounded expiry. It excludes rateKey, checkout token, guests and transaction references. PAYMENT_INTENT_READY describes validation only, never payment execution.

Error contract: absent review/session or expired/used/unconfirmed CheckRate and missing changed-price acceptance -> PAYMENT_PREREQUISITE_MISSING; malformed/untrusted fields, invalid guests/product/money -> PAYMENT_VALIDATION_ERROR. Both HTTP 409 with fixed public copy. Unexpected failures -> HTTP 503 INTERNAL_RETRYABLE_ERROR and PAYMENT_NOT_STARTED. No decline/card rejection/payment-provider failure inferred without a provider operation.

## 4. Trusted amount/currency

Only server booking intent derived from confirmed checkout snapshot supplies amount/currency. Session and offer money must agree under existing numeric cents convention (Number plus Math.round(value * 100)); no formatted-string comparison or conversion. Preview preserves confirmed numeric amount (synthetic test 2075.98 EUR). Optional matching price/currency assertions may pass; substitutions and stale search-price assertions are rejected. Unknown amount fields are rejected. Client cannot change payable amount or currency. No fallback to Availability/search-card money.

## 5. Booking dependency

No confirmed booking or provider booking reference exists. This intent is a validate-only prospective payment preview from the same prerequisites as final review, not an invoice or instruction to pay now. Server revalidates review on each request; no durable prior-review record is invented. Existing opaque session model is reused, without new user-binding/session schema. Route requires authentication; possession of the current opaque session remains the existing intent capability model, not proof of a persisted booking owned by that user.

Actual future collection requires an explicitly approved booking/payment orchestration decision, a legitimate booking relationship and durable transactional/idempotency/ownership rules. None is bypassed here.

## 6. PAYMENTS_DISABLED boundary

The new service method is validate-only and does not call existing sandbox createIntent, Hotelbeds confirmation or any PSP/refund function. Hard stop is unconditional even if someone requests sandbox/live payment or production flags. Existing production gate still forces real charges/refunds/sales false. No payment row, charge row, refund row, booking row or session-consumption write.

No payment provider called, no card data collected, no charge, no authorization, no capture, no refund. Booking remains disabled. No fake PAID/AUTHORIZED/CAPTURED/REFUNDED/SUCCESS state, booking reference or payment transaction reference is generated by the new path. Production sales readiness not claimed.

## 7. Card-data prohibition

Request allowlist reuses only existing booking intent fields. Card number, CVV/CVC, expiry, cardholder, 3DS, bank account, PSP token, client payment status/mode and booking-reference fields are rejected, never processed into a payment payload or logged. No new card form, credentials storage or PCI-like flow. Response projection excludes raw request, secrets, tokens, guest names/DOB/contact and provider payload. New controller returns fixed messages without raw error/stack.

## 8. Duplicate/idempotency safety

Reuse existing booking intent requestId derived from checkout identity. Concurrent and later repeated submissions revalidate current session and produce the same preview while it remains valid; stale/used sessions fail. No mutation or provider execution exists, so no duplicate row/charge can occur. No completed payment cache, consumption write, distributed lock or durable payment-idempotency promise was added. Existing legacy sandbox idempotency remains untouched.

## 9. Tests

- Backend focused FINAL: **27/27 PASS**. Initial 27 assertions passed but Windows/libuv aborted local HTTP fixture teardown with fetch under test-force-exit, producing one aggregate process failure. Replaced only the fixture client with short-lived Node http.request/Connection close; the failed suite was rerun once and passed. Runtime unchanged after focused verification.
- Full backend: **577/591**, exactly one final run over 43 files; **14 known DB-blocked cases**, no new regression. No full backend PASS claimed; real DB forbidden. Blocked scope: access 1, catalog planner 1, content 3, multi-destination 1, public search 1, staging TEST 6, staging acceptance 1. Dedicated hotelbedsCatalog.integration.test.js excluded because it requires real isolated PostgreSQL schema.
- Frontend focused/full/lint/build: **NOT RUN ? frontend runtime unchanged**.
- Verifier: **PASS**, 223 backend syntax files / 489 scanned files, no findings. 6A: **PASS**. Diff-check: **PASS**. Final gates each run once. Runtime unchanged after focused test fixture correction; no 6B while tracked source is intentionally dirty.
- Focused tests exercise real session/booking/review/payment validation with mocked session SELECT only; provider APIs, payment/sandbox entry, booking confirmation, refunds, DB connection/mutations and logging forbidden. Local HTTP test checks unauthenticated 401 and authenticated disabled response. OS-temp PostgreSQL preload blocks real queries/connections; existing HTTPS preload blocks external calls.
- Automated real Availability, CheckRate, Hotelbeds Booking, payment and refund provider calls: **0**. Real DB mutations: **0**.

## 10. Exact files

Modified:

- backend/services/paymentGatewayService.js
- backend/controllers/paymentController.js
- backend/routes/paymentRoutes.js

New:

- backend/tests/paymentIntentFoundation.test.cjs
- SPRINT_6J_PAYMENT_ARCHITECTURE_FOUNDATION_REPORT.md

Frontend runtime changed: NO. Backend runtime changed: YES. DB/schema changed: NO. No migration/dependency/config changes. All changes unstaged.

## 11. Limitations

Focused scope only; real DB suites intentionally blocked. No real PSP implementation, booking confirmation, transaction persistence or commercial payment lifecycle. Existing legacy sandbox semantics are outside this new boundary. The new endpoint is not wired to a payment UI because Final Review already truthfully disables payment. Owner 6J payment-flow acceptance **NOT OBSERVED / NOT RUN**; prior 6I staging acceptance is not relabelled as a new 6J browser test.

Owner acceptance plan: use an existing naturally available Final Review only; verify payment unavailable, no card fields/real Pay button/fake success and booking still disabled. Do not request a new Hotelbeds search solely for 6J. If no fresh confirmed session remains, retain NOT OBSERVED. No deployment or owner browser test performed by Codex.

## 12. Future payment activation path

Requires separate authorization and implementation: decide booking/payment sequencing and failure compensation; confirm real booking ownership/relationship; select/configure PSP and environment; implement server-side amounts, durable intent/idempotency lifecycle and authenticated callbacks; validate real operation state transitions, refund/cancellation policy and privacy controls. Existing hard production/booking/payment gates must remain until separately approved commercial readiness is demonstrated. This sprint does not provide an activation toggle or claim production readiness.

PRODUCTION SALES READY: **NOT CLAIMED**.
