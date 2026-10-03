# Sprint 6I — Hotelbeds CheckRate Staging Diagnostic & Error Classification

SPRINT 6I — CODE / OFFLINE: **PASS — tested scope**.
CHECKRATE DIAGNOSTIC: **PASS — tested scope**.
ROOT-CAUSE CLASSIFICATION: **A. CODE DEFECT FOUND AND FIXED** — offline classification/integrity defects; causal attribution of the three staging attempts remains unproven.

## 1. Staging evidence

Owner observed three separate TEST attempts, including different destinations/offers: Availability and Hotel Details passed, selected price/room/board displayed, CheckRate normalized to UNAVAILABLE, UI blocked the offer without raw provider errors. Successful staging CheckRate confirmation NOT OBSERVED; staging root cause NOT ESTABLISHED. Start: `develop`, tracked tree clean, HEAD `7b444c1` (Sprint 6H report); 6H committed. Unrelated untracked owner files retained.

## 2. Offer lifecycle

Availability rate → `normalizeHotel` → existing `offerService.generateOffer` → signed compact offer → selected-offer Details snapshot → Checkout token verification → existing CheckRate builder → checked-rate identity/money normalization → existing checkout session. RECHECK uses the signed selection directly; BOOKABLE retains its existing Availability refresh path without forcing CheckRate. Direct navigation resolves a server provider offer rather than trusting browser rate/price fields. Details preserves the selected snapshot and rejects mismatched/stale selection. No frontend/Checkout UX rewrite.

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

No undocumented provider wire error code is assumed to mean expired/unavailable rate. Unknown provider bodies/messages/codes are not copied into logs/UI. Existing 6E tests were not rewritten; no classification contradiction remains in those tests. No Availability price is promoted into CheckRate confirmation, no alternate hotel/key substituted, no errors suppressed and no forced successful result.

## 7. Safe diagnostics

Structured `checkRateDiagnostic` events use existing valid UUID request ID or a generated safe UUID. Same request ID is returned in normalized Checkout response. AsyncLocalStorage isolates concurrent attempts. Stages: REQUEST_RECEIVED → TRUSTED_OFFER_DECODED → PROVIDER_REQUEST_PREPARED → PROVIDER_RESPONSE_RECEIVED → NORMALIZED_OUTCOME. Concurrent identical selection may add PROVIDER_REQUEST_SHARED with the first attempt's safe ID; correlation then includes that shared provider request. Completed rates are not cached.

Whitelisted metadata only: TEST, numeric hotel identifier, key presence/fingerprint/byte length, room/board codes, currency/amount, anonymous occupancy/child-age summary, stay dates, actual observed HTTP status/category, fixed diagnostic reason and normalized outcome. No observed HTTP response yields NOT_OBSERVED, not invented provider 502 evidence. Outcome records completion stage and optional checked-key fingerprint. No raw rateKey, API key/signature/Authorization, JWT/signing secret/DB URL, traveller names/DOB/contact or raw provider payload logged. Generic logger sanitation remains intact; no PII persistence added.

## 8. Tests

- Diagnostic focused FINAL: **32/32 PASS**.
- Existing CheckRate focused: **22/22 PASS**, unchanged assertions; repeated only after token runtime changed. Final full run also includes these suites.
- Initial diagnostic concurrency fixture accidentally generated two different observedAt snapshots; corrected to one identical selected offer. Later missing-signing-configuration test found diagnostic reason still labelled selection invalid; internal reason corrected and failed diagnostic suite rerun.
- Full backend FINAL: **545/559**, one run after final runtime, 42 files; **14 known DB-blocked cases**. One earlier intermediate full run also produced 545/559 before the last signing-configuration guard; final run was necessary because source then changed. No full backend PASS claimed.
- Same 14 blocked cases as 6H: access 1, catalog planner 1, content 3, multi-destination 1, public search 1, staging TEST 6, staging acceptance 1. OS-temp lazy PostgreSQL guard forbids real queries/connections; dedicated `hotelbedsCatalog.integration.test.js` excluded because it requires a real isolated PostgreSQL schema.
- Frontend runtime unchanged. Full frontend/lint/build: **NOT RUN — not required**.
- Verifier: PASS, 222 backend syntax files / 485 scanned files, no findings. 6A: PASS. Diff-check: PASS. Final gates each run once; runtime source unchanged after final focused correction. No 6B while tracked source is intentionally dirty.
- Real Availability, CheckRate, Hotelbeds Booking, payment calls and real DB mutations: **0**; transport, access gate and sessions mocked, HTTPS and real DB access prohibited.

## 9. Exact files

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

**A. CODE DEFECT FOUND AND FIXED.** Offline evidence proves over-broad HTTP 4xx classification, missing-age response classification, blank-age defaulting and missing signing-config classification defects. Exact key/request envelope preservation is proven; no rateKey transport defect found. This classification covers demonstrated code defects, not attribution of the three actual staging failures.

## 11. Remaining uncertainty

Repeated UNAVAILABLE has not been attributed to Hotelbeds or Asedeliya unless evidence proves it. The three historical attempts lack correlated provider status/reason evidence. No claim of TEST instability, actual stale keys, actual malformed requests or successful staging confirmation. Next manual evidence is required to distinguish provider rejection, identity mismatch, empty-rate availability, configuration/transport failure or response-contract metadata absence. No Render inspection/deployment/provider calls performed here. Production sales readiness NOT CLAIMED. All changes unstaged.

## 12. One-call owner diagnostic plan

**READY after a separately authorized backend deployment.** No deployment or owner call performed by Codex.

1. Use exactly one fresh Hotelbeds TEST search and selected offer requiring CheckRate (RECHECK), then Details → Checkout once. Keep the original selected snapshot; do not edit token/key/occupancy or repeat/retry. Use the intended occupancy/explicit child ages. Stop at the result; do not initiate booking/payment. BOOKABLE may follow existing refresh without CheckRate; if no CheckRate prepared event occurs, record that path without forcing another request.
2. Browser Network: inspect only General, Payload and Response/Preview for the Checkout request. Record method/status, safe hotel/provider/occupancy fields, normalized checkRateStatus/code and returned requestId. **Do not inspect/share Request Headers. Do not share full Payload/Response**: existing objects contain offer/session tokens and opaque rateKeys. Use selected safe fields only, or redact those values completely; do not share PII.
3. Owner reads Render backend logs around that returned requestId and filters `checkRateDiagnostic` events. If sharedRequestId appears, include that safe ID's events too. Record ordered stage, decoded/prepared key fingerprint and byte length, occupancy/ages, HTTP status/category, fixed reason, completion stage and normalized outcome. No raw keys/headers/provider bodies needed.
4. Compare decoded/prepared fingerprints: mismatch identifies pre-provider identity corruption; absence of prepared stage identifies token/selection validation failure. Prepared with no HTTP observation identifies pre-response configuration/access/timeout/network/internal failure. Actual 400/404/422 identifies provider request rejection; 401/403 auth, 429 rate limit, 5xx server error remain technical. 2xx plus malformed reason identifies response contract validation; 2xx plus rate identity mismatch identifies product-matching failure; valid empty lists support unavailable. Do not infer exact provider root cause from the category alone.
5. Share only those safe observations once. If outcome remains UNAVAILABLE/RETRYABLE_ERROR, keep successful staging CheckRate NOT OBSERVED and diagnose from the captured single attempt. No automatic retry storm or additional quota consumption. OWNER ONE-CALL DIAGNOSTIC: **READY, NOT RUN**.
