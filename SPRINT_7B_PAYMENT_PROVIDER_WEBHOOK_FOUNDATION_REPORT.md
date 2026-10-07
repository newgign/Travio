# Sprint 7B — Payment Provider Contract & Mock Webhook Foundation

SPRINT 7B — CODE / OFFLINE: PASS — tested scope.
PAYMENT PROVIDER CONTRACT: READY — offline contract scope.
MOCK WEBHOOK FOUNDATION: READY — isolated synthetic scope.
Existing architecture: REUSED + HARDENED. COMMERCIAL PRODUCTION READY: NO.

## 1. Baseline

2026-10-04, Asia/Qyzylorda. develop, clean tracked tree at start; HEAD `13c5283 docs: add commercial production readiness gap audit`, Sprint 7A committed. Unrelated untracked owner files preserved. 7A commercial production NOT READY, 10 P0 packages; consumer/lifecycle RC READY in non-commercial tested scope.

PAYMENTS_MODE=disabled, PAYMENTS_PROVIDER=none; productionGate still hard-disables sales/charges/refunds. Booking/LIVE/email/infrastructure remain unchanged/off/paused. No dependency, migration, card collection, real secret, merchant signup, provider/account selection, external call, deployment or git add/commit/push.

## 2. Existing payment architecture

Inspected narrowly: payment controller/routes/gateway, recovery/lifecycle, 6J tests/contracts, production gate and Express parser/correlation seam. Gateway exposes readiness, legacy sandbox createIntent, trusted checkout prepareCheckoutIntent and refund readiness. 6J reconstructs server booking intent and Review, trusted amount/currency and SHA-256 checkout requestId; returns PAYMENT_INTENT_READY inside PAYMENTS_DISABLED, PAYMENT_NOT_STARTED and PROVIDER_NOT_CALLED.

Legacy sandbox can simulate local paid labels; these are not real charge evidence. Current Hotelbeds path rejects sandbox/local payment and current gate cannot enable real money through env flags. No webhook endpoint exists in payment routes. No selected real PSP API/webhook secret contract exists. Existing sandbox-specific ids remain local; no real PSP field names invented.

Express uses global express.json without raw-body capture. No parser, controller or route changed. Future chosen PSP must define exact bytes/headers/timestamp/replay requirements and a separately reviewed route-local raw-body capture before JSON parsing. Do not sign a reserialized object or rely on browser bearer authentication for provider callbacks.

## 3. Provider contract

New paymentProviderContract is a small server-only pure validator: adapter name/mode plus verifyWebhook(raw Buffer, authentication) and normalizeWebhookEvent(raw Buffer). Those are the only useful capabilities for this sprint; createPaymentIntent/getPaymentStatus/refund are not stubbed as fake successful operations. No provider network/client/credentials import.

Gateway adds a lazy internal createWebhookProcessor export, reusing its trusted 6J intent shape. The processor copies requestId, provider payment correlation and exact cents/currency from a server-owned PAYMENT_INTENT_READY / REVIEW_READY snapshot. This is a trusted server seam, not a browser API or independent payment system. Caller must supply the actual server snapshot; shape validation is not cryptographic proof of snapshot provenance.

No adapter defaults to PAYMENTS_DISABLED. Explicit adapters require offline-contract mode and NODE_ENV=test; production instantiation is rejected. No environment flag, HTTP route or startup module selects the mock. Existing runtime HTTP responses, DB payment records, My Bookings and money gates are unchanged.

## 4. Mock provider

Deterministic synthetic provider lives only in backend/tests/helpers/mockPaymentProvider.cjs. IDs/provider/secret are explicitly synthetic. It emits pending/authorized/captured/failed/cancelled/unknown events in a test-only schema. No real PSP algorithm or contract is claimed. Production/default provider remains none/disabled.

## 5. Webhook authentication

Exact raw Buffer copied before queueing, bounded to 64 KiB at acceptance. Verify first, normalize only on strict true. Missing/invalid signature and verifier exception return INVALID_WEBHOOK_SIGNATURE with fixed diagnostic fields only. Mock HMAC-SHA256 and timingSafeEqual use Node crypto and synthetic secret; authentication input is not returned/logged. Real vendor replay-window/key rotation/signature semantics remain future work, not this mock algorithm.

## 6. Event normalization

Normalized schema requires event id, provider/payment/request correlation, supported type, positive exact-cent money and ISO uppercase currency; rejects unknown fields, malformed JSON/raw body, card/auth/raw payload additions. Internal event projection includes only allowlisted fields.

| Synthetic event | Contract state |
| --- | --- |
| payment.pending | PAYMENT_PENDING |
| payment.authorized | PAYMENT_AUTHORIZED |
| payment.captured | PAYMENT_CAPTURED |
| payment.failed | PAYMENT_FAILED_FINAL |
| payment.cancelled | PAYMENT_CANCELLED |
| payment.unknown | PAYMENT_OUTCOME_UNKNOWN |

These are isolated observation states, not application payment persistence. Every response states contractOnly=true, commercialSuccess=false, applicationPaymentState=PAYMENTS_DISABLED and PROVIDER_NOT_CALLED. Provider here means synthetic source, not a dispatched PSP operation. Authorization is not capture or paid.

## 7. Idempotency

Per-processor in-memory event-id/digest map plus serialized asynchronous acceptance prevents concurrent duplicate effects. Same verified event returns DUPLICATE_WEBHOOK_EVENT without another transition; same id/different event returns PAYMENT_STATE_CONFLICT. Repeated capture under another id has effectApplied=false. Validation failures do not consume the id. At 1,000 accepted event ids processor fails closed rather than evicting replay protection.

Not durable: resets/restarts/new processor instances do not share dedupe/state; no DB table/row/schema added. One processor represents one trusted payment correlation; future server adapter/persistent event store must enforce cross-instance transaction uniqueness and replay policy. Durable production webhook idempotency: FUTURE REQUIREMENT. Async processing commits state only after validation; no operation callbacks or retries.

## 8. State ordering

Not-started can enter pending/final failure/cancelled/unknown; capture requires pending/authorized evidence. Failed/cancelled terminals cannot downgrade to pending. Captured then failed is a conflict. Unknown stays unresolved until a verified normalized event explicitly carries reconciliation evidence; an ordinary signed pending/capture event cannot clear it. This reconciliation flag is mock adapter semantics, not a real PSP receipt or browser override.

bookingLifecycle validates the synthetic provider-observation projection; authorization maps to existing PAYMENT_PENDING, cancelled maps to final failure for consistency, never altering shared existing state enums. bookingPaymentRecovery supplies pending/unknown/compensation semantics. Hypothetical server-observed booking evidence is used solely in the contract projection, not inserted as an actual booking. A captured projection may be internally consistent but never becomes commercialSuccess or real PAID. Durable booking/PSP reconciliation and actual evidence sourcing remain 7A P0-07.

## 9. Trusted amount/currency

Immutable intent copy owns amountMinor/currency. Every authenticated event is compared against those values; discrepancies return PAYMENT_AMOUNT_MISMATCH / PAYMENT_CURRENCY_MISMATCH before transition. Fractional cents, invalid/negative/nonfinite/boolean amounts fail malformed validation. Provider/payment/request mismatch returns PAYMENT_CORRELATION_MISMATCH. Browser prices are not consumed by this service; existing 6J HTTP allowlist and trusted session flow remain responsible for browser input. An adapter may report outcomes, never silently rewrite server intent money.

## 10. Security

No logger, DB/client/provider operation or network import in the foundation. No card field/form/storage. No webhook secret/API key/Authorization/JWT/DB URL/offer secret in returned metadata. Fixed codes distinguish MALFORMED_WEBHOOK, UNSUPPORTED_WEBHOOK_EVENT, DUPLICATE_WEBHOOK_EVENT, PAYMENT_STATE_CONFLICT, amount/currency mismatch and PAYMENT_OUTCOME_UNKNOWN. Raw adapter exceptions are suppressed. No card decline semantics invented.

The current default rejects all events as disabled; no externally usable webhook route. Test-only adapter cannot be instantiated in production. Future real webhook authentication and raw-body HTTP seam must be explicitly reviewed; this offline contract is not PCI, security or production acceptance.

## 11. Tests

Focused final 7B: **34/34 PASS**, exactly one run on final source. Preliminary 32-case run had 31 PASS/1 test-setup failure: Node mock.property cannot install accessors on process.env. Replaced test setup with try/finally env restoration; added repeated capture/new-id and direct capture jump regressions; final runtime/test source then frozen. No existing assertion weakened.

Adjacent: **131/131 PASS**, one invocation of paymentIntentFoundation (6J), bookingPaymentRecovery (6K), bookingLifecycleConsistency (6M), bookingLifecycleReleaseCandidate (6N). Gateway seam and shared lifecycle/recovery integration justify these checks; full aggregate below separately includes them.

Full backend: **748/762**, one final aggregate run of 48 files; **14 known DB-blocked failures**, no additional failures, cancelled/skipped zero. Blocked suites: hotelbedsAccess (1), hotelbedsCatalogPlan (1), hotelbedsContent (3), hotelbedsMultiDestination (1), hotelbedsPublicSearch (1), hotelbedsStagingTest (6), stagingAcceptance (1). Dedicated hotelbedsCatalog.integration.test.js excluded because it requires real isolated PostgreSQL. Full backend PASS is not claimed. Verifier: **PASS**, 233 backend syntax files, 506 secret-scan files, findings empty. 6A: **PASS**. Final diff-check: **PASS**. Each release gate run once. Frontend tests/build/lint NOT RUN — frontend unchanged. 6B NOT RUN with intentionally uncommitted work.

Each focused case traps DB query/connect, Hotelbeds transport/booking/reconciliation, legacy payment initiation, sandbox refund execution and logger calls; forbidden attempts zero. Existing HTTPS preload blocks accidental external HTTPS; pg preload prevents real DB query/connect during regressions. Provider mocks/signatures only, no real incoming webhook/socket or application mutation.

## 12. Exact files

Modified:

- backend/services/paymentGatewayService.js — lazy internal offline processor seam; existing HTTP/payment behavior unchanged.

New:

- backend/services/paymentProviderContract.js
- backend/services/paymentWebhookService.js
- backend/tests/helpers/mockPaymentProvider.cjs
- backend/tests/paymentProviderWebhookFoundation.test.cjs
- SPRINT_7B_PAYMENT_PROVIDER_WEBHOOK_FOUNDATION_REPORT.md

Backend source changed: YES (foundation/export). Frontend changed: NO. DB/schema changed: NO. Dependencies/config/productionGate/routes/controllers unchanged. All files unstaged; unrelated owner files untouched.

## 13. Remaining production gaps

| Capability | After 7B |
| --- | --- |
| Provider-agnostic payment contract | READY — offline repository/tested scope |
| Mock signature validation/normalization | READY — synthetic only |
| Duplicate event protection | Implemented per in-memory processor |
| Durable production webhook idempotency | FUTURE REQUIREMENT |
| Real PSP selected | NO |
| Merchant account configured by this sprint | NO |
| Production API credentials / webhook secret configured | NO |
| Real payments | BLOCKED |

No commercial P0 package is claimed closed: 7A still has 10 P0 work packages. P0-05 now has a tested interface/mock validation component, not real integration. P0-04 account and P0-07 durable execution/reconciliation remain open. No real PSP selected, no merchant account created/configured, no real credentials used, no real charge, no card data, no production webhook. No external account lookup or statement about privately existing accounts outside supplied evidence.

Real payment provider calls: 0. Hotelbeds Booking calls: 0. Hotelbeds Availability/CheckRate/Cancellation calls: 0. Refund calls: 0. Real DB mutations: 0. Real payments remain blocked; production sales ready NOT CLAIMED.

## 14. Future PSP integration path

Owner selects account/model/currencies/authorization-capture/refund requirements. Engineering implements real adapter verification/normalization and hosted/tokenized interface, vendor-required raw-body HTTP handling, durable correlation/event uniqueness, genuine booking/charge evidence, replay window and key rotation, crash-safe transitions/reconciliation/refunds and explicit promotion gates. Tests must exercise real adapter semantics in sandbox before separately authorized production money acceptance. Never repurpose the mock signature as a vendor algorithm or remove hard gates because synthetic tests pass.

No browser acceptance required: frontend unchanged. No real webhook or Hotelbeds call required. If separately deployed later, owner checks /health and /api/health/ready and confirms unchanged disabled site behavior. No deploy/browser acceptance performed here.
