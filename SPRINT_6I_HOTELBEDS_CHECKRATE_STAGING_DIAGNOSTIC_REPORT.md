# Sprint 6I — Hotelbeds CheckRate Staging Diagnostic & Error Classification

SPRINT 6I — CODE / OFFLINE: **PASS — tested scope**.
CHECKRATE DIAGNOSTIC: **PASS — tested scope**.
ROOT-CAUSE CLASSIFICATION: **A. CODE DEFECT FOUND AND FIXED** — offline classification/integrity defects; current correlated request confirms an internal pre-CheckRate branch; causal attribution of the three historical staging attempts remains unproven.

## 1. Staging evidence

Owner observed three separate TEST attempts, including different destinations/offers: Availability and Hotel Details passed, selected price/room/board displayed, CheckRate normalized to UNAVAILABLE, UI blocked the offer without raw provider errors. At the initial diagnostic stage, successful staging CheckRate confirmation was NOT OBSERVED; the three historical requests remain unattributed. The later correlated owner request is analyzed in section 13. Start: `develop`, tracked tree clean, HEAD `7b444c1` (Sprint 6H report); 6H committed. Unrelated untracked owner files retained.

## 2. Offer lifecycle

Availability rate → `normalizeHotel` → existing `offerService.generateOffer` → signed compact offer → selected-offer Details snapshot → Checkout token verification → existing CheckRate builder → checked-rate identity/money normalization → existing checkout session. Checkout uses the signed selection directly and explicitly requests CheckRate confirmation for both BOOKABLE and RECHECK. Other provider callers retain the default RECHECK-only behavior. Availability refresh is no longer a checkout confirmation prerequisite. Direct navigation resolves a server provider offer rather than trusting browser rate/price fields. Details preserves the selected snapshot and rejects mismatched/stale selection. No frontend/Checkout UX rewrite.

## 3. rateKey integrity

Synthetic tests prove byte-for-byte source key preservation through normalization, generated offer, JWT/JSON round-trip and outgoing CheckRate; whitespace, Unicode, slash/plus/percent/encoding markers and long keys are not trimmed/reconstructed/case-converted. Diagnostics use SHA-256 UTF-8 fingerprint prefix (16 hex characters) and UTF-8 byte length, never the raw key. Decoded/prepared fingerprints match. A provider-returned replacement key remains allowed only through the existing same-product identity validator; confirmed session stores that returned key, and outcome logs its separate fingerprint. This legitimate post-response rotation is not evidence of transport corruption. No key/token validation weakened.

## 4. Occupancy/child-age integrity

Availability request carries rooms/adults/children and existing CH age paxes; selected rate normalization retains occupancy. Existing offerService adds request adults/children/ages before signing. Tests prove 2 adults + 2 children, ages 5/9, survive trusted token, CheckRate matching and session. Browser count/age/key/price overrides cannot replace signed data. Missing trusted ages no longer fall back to browser filters. Inconsistent trusted counts/ages stop before provider call as a technical selection error.

Fixed demonstrated age-integrity defect: blank comma elements previously became age 0 via `Number('')`; the existing integer 0–17 contract is now checked without dropping/defaulting elements. Fixed classification defect: missing/invalid child ages in a provider response, required by existing product matching, now mean malformed response rather than an unavailable rate. No new Hotelbeds age rule invented; missing actual staging metadata is not assumed.

## 5. CheckRate request contract

Existing request unchanged: POST `/hotel-api/1.0/checkrates`, JSON `rooms: [{ rateKey: trustedKey }]`. No price, currency, occupancy/paxes, holder or booking payload in this envelope. Those fields describe/validate selected product and response identity; the current repository contract sends the opaque key only. Credentials/signature/TLS remain exclusively in the existing transport, using TEST mTLS endpoint. No retries added; TEST transport retains no automatic retries. Booking/payments, LIVE, charges/refunds/email/sales and provisioning remain off/paused. No DB/schema/migration/dependency change.

## 6. Error classification

| Evidence | Previous behavior | Final consumer outcome / safe reason |
| --- | --- | --- |
| Valid empty hotel/rate list or existing explicit normalized RATE_NOT_AVAILABLE | UNAVAILABLE | UNAVAILABLE / RATE_UNAVAILABLE |
| Complete checked response fails existing hotel/room/board/currency/occupancy identity match | UNAVAILABLE | UNAVAILABLE / RATE_IDENTITY_MISMATCH; selection unusable, not proof of expiry |
| Checked rate remains RECHECK or AT_HOTEL is unsupported | UNAVAILABLE | UNAVAILABLE / RATE_NOT_BOOKABLE or UNSUPPORTED_RATE |
| Invalid/expired signed token, wrong hotel/provider/environment | UNAVAILABLE | UNAVAILABLE / SELECTION_INVALID; unusable selection, not provider outage proof |
| Unknown provider HTTP 400/404/422 | RATE_NOT_AVAILABLE → UNAVAILABLE (defect) | RETRYABLE_ERROR / PROVIDER_REJECTED_REQUEST |
| HTTP 401/403 | Technical/retryable | RETRYABLE_ERROR / PROVIDER_AUTH_ERROR |
| HTTP 429 | Technical/retryable | RETRYABLE_ERROR / PROVIDER_RATE_LIMITED |
| Provider 5xx | Technical/retryable | RETRYABLE_ERROR / PROVIDER_SERVER_ERROR |
| Timeout / network failure | Technical/retryable | RETRYABLE_ERROR / PROVIDER_TIMEOUT or NETWORK_ERROR |
| Malformed response, absent price/type, missing required response child ages | Child-age absence could become UNAVAILABLE (defect) | RETRYABLE_ERROR / MALFORMED_PROVIDER_RESPONSE |
| Unknown 2xx error envelope | Technical/retryable | RETRYABLE_ERROR / UNKNOWN_PROVIDER_ERROR; actual observed HTTP status preserved |
| Unknown internal exception | Technical/retryable | RETRYABLE_ERROR / INTERNAL_ERROR |
| Missing offer-token signing configuration | Wrapped as OFFER_TOKEN_INVALID → UNAVAILABLE (defect) | RETRYABLE_ERROR / INTERNAL_ERROR; original configuration code retained |

No undocumented provider wire error code is assumed to mean expired/unavailable rate. Unknown provider bodies/messages/codes are not copied into logs/UI. Follow-up updates only the two 6E BOOKABLE checkout expectations: confirmation and malformed-response handling now use CheckRate instead of Availability. Other 6E assertions are retained. No Availability price is promoted into CheckRate confirmation, no alternate hotel/key substituted, no errors suppressed and no forced successful result.

## 7. Safe diagnostics

Structured `checkRateDiagnostic` events use existing valid UUID request ID or a generated safe UUID. Same request ID is returned in normalized Checkout response. AsyncLocalStorage isolates concurrent attempts. Stages: REQUEST_RECEIVED → TRUSTED_OFFER_DECODED → PROVIDER_REQUEST_PREPARED → PROVIDER_RESPONSE_RECEIVED → NORMALIZED_OUTCOME. Concurrent identical selection may add PROVIDER_REQUEST_SHARED with the first attempt's safe ID; correlation then includes that shared provider request. Completed rates are not cached.

Whitelisted metadata only: TEST, numeric hotel identifier, key presence/fingerprint/byte length, room/board codes, currency/amount, anonymous occupancy/child-age summary, stay dates, actual observed HTTP status/category, fixed diagnostic reason and normalized outcome. No observed HTTP response yields NOT_OBSERVED, not invented provider 502 evidence. Outcome records completion stage and optional checked-key fingerprint. No raw rateKey, API key/signature/Authorization, JWT/signing secret/DB URL, traveller names/DOB/contact or raw provider payload logged. Generic logger sanitation remains intact; no PII persistence added.

## 8. Tests

- Follow-up diagnostic focused: **37/37 PASS**.
- Existing CheckRate focused: **22/22 PASS**. Only the two BOOKABLE checkout expectations changed for the corrected confirmation contract.
- Follow-up full backend: **550/564**, exactly one run on final runtime, 42 files; **14 known DB-blocked cases**, no new failures. No full backend PASS claimed.
- Same 14 blocked cases: access 1, catalog planner 1, content 3, multi-destination 1, public search 1, staging TEST 6, staging acceptance 1. OS-temp lazy PostgreSQL guard forbids real queries/connections; dedicated `hotelbedsCatalog.integration.test.js` excluded because it requires a real isolated PostgreSQL schema. HTTPS is blocked by the existing offline preload.
- Prior 6I evidence retained as historical: diagnostic 32/32, CheckRate 22/22, backend 545/559 with the same 14 DB-blocked cases; the previous turn had an intermediate and a final full run. The follow-up has only one full run.
- Frontend runtime unchanged. Full frontend/lint/build: **NOT RUN -- not required**.
- Follow-up verifier: PASS. 6A: PASS. Diff-check: PASS. Runtime did not change after focused verification. No 6B while tracked source is intentionally dirty.
- Real Availability, CheckRate, Hotelbeds Booking, payment calls and real DB mutations: **0**; transport, access gate and sessions mocked, HTTPS and real DB access prohibited.

## 9. Historical initial 6I files

The following list describes the initial 6I implementation. Current follow-up files are listed in section 13.

Modified:

- `backend/controllers/checkoutController.js`
- `backend/integrations/hotelbeds/client.js`
- `backend/sources/hotelbeds.js`
- `backend/services/offerTokenService.js`

New:

- `backend/services/checkRateDiagnostic.js`
- `backend/tests/checkRateStagingDiagnostic.test.cjs`
- `SPRINT_6I_HOTELBEDS_CHECKRATE_STAGING_DIAGNOSTIC_REPORT.md`

## 10. Root-cause classification

**A. CODE DEFECT FOUND AND FIXED.** Offline evidence proves over-broad HTTP 4xx classification, missing-age response classification, blank-age defaulting and missing signing-config classification defects. Exact key/request envelope preservation is proven; no rateKey transport defect found. The follow-up also fixes the proven BOOKABLE checkout branch that could fail during Availability refresh before CheckRate. This classification covers demonstrated code defects, not attribution of the three actual staging failures.

## 11. Remaining uncertainty

Repeated UNAVAILABLE has not been attributed to Hotelbeds or Asedeliya unless evidence proves it. The three historical attempts lack correlated provider status/reason evidence. No claim of TEST instability, actual stale keys or actual malformed requests. Subsequent successful staging confirmation is recorded in section 14. Next manual evidence is required to distinguish provider rejection, identity mismatch, empty-rate availability, configuration/transport failure or response-contract metadata absence. No Render inspection/deployment/provider calls performed here. Production sales readiness NOT CLAIMED. All changes unstaged.

## 12. Historical one-call owner diagnostic plan

**READY after a separately authorized backend deployment.** No deployment or owner call performed by Codex.

1. Use exactly one fresh Hotelbeds TEST search and selected BOOKABLE or RECHECK offer, then Details → Checkout once. Keep the original selected snapshot; do not edit token/key/occupancy or repeat/retry. Use the intended occupancy/explicit child ages. Stop at the result; do not initiate booking/payment. Both eligible rate types must now reach CheckRate preparation. If no prepared event occurs, record the safe validation/configuration reason without retrying.
2. Browser Network: inspect only General, Payload and Response/Preview for the Checkout request. Record method/status, safe hotel/provider/occupancy fields, normalized checkRateStatus/code and returned requestId. **Do not inspect/share Request Headers. Do not share full Payload/Response**: existing objects contain offer/session tokens and opaque rateKeys. Use selected safe fields only, or redact those values completely; do not share PII.
3. Owner reads Render backend logs around that returned requestId and filters `checkRateDiagnostic` events. If sharedRequestId appears, include that safe ID's events too. Record ordered stage, decoded/prepared key fingerprint and byte length, occupancy/ages, HTTP status/category, fixed reason, completion stage and normalized outcome. No raw keys/headers/provider bodies needed.
4. Compare decoded/prepared fingerprints: mismatch identifies pre-provider identity corruption; absence of prepared stage requires tracing the recorded validation/configuration reason; it alone does not identify the exact predicate. Prepared with no HTTP observation identifies pre-response configuration/access/timeout/network/internal failure. Actual 400/404/422 identifies provider request rejection; 401/403 auth, 429 rate limit, 5xx server error remain technical. 2xx plus malformed reason identifies response contract validation; 2xx plus rate identity mismatch identifies product-matching failure; valid empty lists support unavailable. Do not infer exact provider root cause from the category alone.
5. Share only those safe observations once. If outcome remains UNAVAILABLE/RETRYABLE_ERROR, keep successful staging CheckRate NOT OBSERVED and diagnose from the captured single attempt. No automatic retry storm or additional quota consumption. Historical plan status: **READY, NOT RUN at that time**. Subsequent owner retest: PASS, section 14.

## 13. Staging root-cause follow-up

**INTERNAL PRE-PROVIDER CHECKRATE DEFECT CONFIRMED** for the correlated current request, independently of the three historical attempts.

Owner evidence: requestId `07687474-8c7a-4a60-a794-932898c1b416`, POST `/api/checkout/review`, HTTP 409, `UNAVAILABLE`, code `RATE_NOT_AVAILABLE`. Trusted offer: hotel 7654, key present and 144 bytes, room DBL.SU, board RO, EUR 621.32, 1 room / 2 adults / 0 children / ages [], 2026-10-26 to 2026-11-02. Stages were REQUEST_RECEIVED, TRUSTED_OFFER_DECODED, NORMALIZED_OUTCOME; completedAt TRUSTED_OFFER_DECODED, HTTP null / NOT_OBSERVED, reason RATE_UNAVAILABLE. No CheckRate preparation or response was observed. No raw key is recorded.

### Exact code trace before the fix

`backend/controllers/checkoutController.js::getCheckout` verifies the signed token, matches provider/hotel and logs TRUSTED_OFFER_DECODED. It then checks TEST environment, nonempty key, hotel, BOOKABLE/RECHECK type, positive price/currency and trusted occupancy/child ages. Those guards throw environment/token/selection codes, not RATE_NOT_AVAILABLE. The only subsequent pre-CheckRate path producing the captured code is `if (offerToken && offer.rateType !== 'RECHECK') refreshOffer(offer)`; following validation, that means a signed BOOKABLE offer. CheckRate itself was gated by `offer.rateType === 'RECHECK'`.

`backend/sources/hotelbeds.js::refreshOffer` calls Availability, finds hotel and room, then requires `room.rates.find(item => item.rateKey === offer.rateKey)`. It throws RATE_NOT_AVAILABLE on `!rate || rate.packaging || rate.paymentType === 'AT_HOTEL'`; its subsequent `hotelbedsRateIdentity.selectCheckedRate` can also throw that code if no unique matching product exists. The controller catch maps this code to HTTP 409 / UNAVAILABLE; diagnostic.reason maps it to RATE_UNAVAILABLE. Availability is not instrumented as CheckRate, so completion remains TRUSTED_OFFER_DECODED with no CheckRate HTTP observation. Availability could have been called: this evidence does not establish that no provider API of any kind was reached.

**Evidence boundary:** the logs uniquely identify this refresh branch in the inspected code, but do not distinguish the individual `!rate` / packaging / AT_HOTEL / identity predicates or show rateType directly. Claiming a missing key in refreshed Availability, absent optional metadata, or an expired provider key as the exact staging subcause would be speculation. The proven defect is making this Availability-only selection test a prerequisite for CheckRate and allowing BOOKABLE checkout to bypass actual CheckRate confirmation. The three historical requests are not assigned this cause.

### Narrow fix and regression contract

Checkout removes the signed BOOKABLE Availability refresh and calls `checkRateOffer(offer, { confirmBookable: true })` for both eligible types. The provider explicitly supports this checkout confirmation option; default callers retain BOOKABLE skipping and RECHECK behavior. Pending-request identity includes that option, preventing sharing a bypass result with a confirmation request. Unknown types fail with a distinct technical selection reason; missing/empty/non-string keys fail safely. The request envelope, opaque key, identity checks, price normalization, TEST restriction, booking/payment guards and transport remain unchanged.

No Availability price is used as confirmation. Only an actual mocked CheckRate response can create a checked snapshot. Provider rejection/timeout/auth/429/5xx remain technical; valid empty provider lists remain unavailable after response. Optional display labels/comments/cancellation metadata are not eligibility prerequisites. Required product identity is still validated after response; no identity rules were weakened.

Five added diagnostic tests cover staging-shaped BOOKABLE and RECHECK, a synthetic 144-byte key, the exact safe hotel/room/board/currency/amount/occupancy/dates, optional display metadata omitted, exactly one CheckRate call, no Availability call, confirmation from provider response, and provider-derived unavailable only after PREPARED/RESPONSE. Missing/empty/non-string keys are separately blocked. Existing privacy/technical-error tests remain.

Follow-up modified files only:
- `backend/controllers/checkoutController.js`
- `backend/sources/hotelbeds.js`
- `backend/tests/checkRateReadiness.test.cjs`
- `backend/tests/checkRateStagingDiagnostic.test.cjs`
- `SPRINT_6I_HOTELBEDS_CHECKRATE_STAGING_DIAGNOSTIC_REPORT.md`

Frontend, token schema, transport, DB/schema, booking and payments unchanged. External Hotelbeds calls and real DB mutations: 0. No deployment, staging retest or git staging/commit/push performed. At follow-up completion, the next owner retest was READY after separately authorized deployment. Subsequent deployment/retest evidence is recorded in section 14.

## 14. Recorded owner one-call staging retest

OWNER ONE-CALL STAGING RETEST: **PASS**.

Owner reports successful backend/frontend deployment, Hotelbeds TEST Search PASS, Hotel Details PASS and CheckRate PASS. CheckRate reached the Hotelbeds path after the fix; POST `/api/checkout/review` returned **HTTP 200**. Confirmed offer: **Sultan Gardens Resort**, **Premium Jacuzzi Suite Pool View**, **BED AND BREAKFAST**, **2075.98 EUR**. The proven premature pre-provider UNAVAILABLE defect no longer reproduced in this observed flow. This does not establish identical causes for the three historical UNAVAILABLE attempts.

Traveller step and Final Review were reachable and passed their tested scope. Occupancy and displayed traveller rows matched 2 adults. Names/DOB were not auto-generated; synthetic user-entered data remained available. Review displayed hotel, dates, nights, room, board, confirmed price/currency and two travellers. No raw rateKey/token/provider secret displayed.

Downstream POST booking intent stopped at deliberate **HTTP 503 BOOKING_DISABLED**: code/state BOOKING_DISABLED; providerState **PROVIDER_NOT_CALLED**; review.state REVIEW_READY; bookingAvailable false; paymentAvailable false. No Hotelbeds Booking API call, real booking, payment, charge or fake confirmation. The 503 was the current intentional disabled boundary, not a provider booking failure; HTTP semantics were not changed.

This update records supplied owner evidence only. No runtime changes or fresh test/build/lint/verifier commands, provider calls, deployment or git staging/commit/push performed. Existing offline counts remain unchanged. The 6D recorder is invoked separately using its existing schema; unreported general frontend/health/readiness checks remain NOT_RUN rather than inferred PASS. Production sales readiness remains NOT CLAIMED.

## Release evidence recorder outcome

Input: `STAGING_RELEASE_EVIDENCE_6I.json`; generated output: `STAGING_RELEASE_EVIDENCE_6I.md`, using the unchanged 6D schema and recorder.

**STAGING ACCEPTANCE: FAIL**. Recorder's embedded prerequisites reported 6A PASS, 6B manifest FAIL and 6C smoke plan FAIL. Required owner fields not explicitly observed in this supplied evidence remain NOT_RUN: home, authSession, profile, favorites, myBookings, helpLegal, health, readiness. Only changedFeature and changedEndpoint are PASS. Successful deploy alone is not substituted for these checks. No recorder rules or prerequisite metadata were weakened; no additional standalone verifier/gate command was run. The owner feature acceptance recorded above remains PASS ? tested scope, independently of aggregate release acceptance.
