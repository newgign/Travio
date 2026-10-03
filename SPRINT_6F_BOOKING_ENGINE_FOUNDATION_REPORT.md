# Sprint 6F — Booking Engine Foundation & Safe Booking Intent

SPRINT 6F — CODE / OFFLINE: PASS — tested scope. BOOKING ENGINE FOUNDATION: PASS. Full backend retains the intentional 14-case no-real-DB limitation below; no 478/478 claim.

## 1. Baseline

develop; 77ec560 (`docs: record Sprint 6E staging acceptance evidence`). Tracked tree clean at start; final Sprint 6E report/evidence committed. Unrelated owner untracked files preserved. No staging, commit, push or deployment.

## 2. Existing booking architecture found

REUSED + HARDENED. Existing authenticated `POST /api/bookings` stores a local draft, pending payment and events, then consumes checkoutToken in a transaction. Provider confirmation is separate at `POST /api/bookings/:id/provider/confirm`; sync/cancellation/voucher routes already exist. No existing booking-intent dry-run found; cancellation simulation is a separate provider operation, not an offline booking intent.

HotelbedsBookingService.confirm → existing source.createBooking → existing transport.createBooking. assertBookingAllowed checks bookingEnabled first; transport read-only/LIVE/production guards remain unchanged. Existing provider statuses include local_pending, confirming, confirmation_unknown, confirmation_failed and RATE_EXPIRED; provider confirmation uses an atomic conditional claim and reconciles uncertain outcomes rather than sending a second booking POST. Existing checkout sessions use FOR UPDATE and used_at for actual booking consumption.

Sprint 6E Checkout review performs price verification and stores a session, not a booking. Its confirmed provider rateKey/price and checkRatePerformed/checkedRateAt are retained in the server offer_snapshot. Frontend Hotelbeds booking/payment actions remain blocked.

## 3. Booking intent contract

New authenticated validate-only `POST /api/bookings/intent`, within existing booking router/controller/service. Input: checkoutToken and travelers (AD/CH, firstName, lastName, optional roomId=1, required child age). Optional provider/hotelId/rateKey/price/currency/priceEnvironment assertions must match server authority; acceptedPriceToken is required for changed-price sessions. Unknown top-level fields are rejected.

INTENT_READY projection contains server-confirmed provider/hotel/rate, numeric price/currency, room/board, stay dates/nights, single-room occupancy, expected traveler count, TEST environment and a deterministic requestId derived from the existing checkout identifier. It does not echo session token or traveler PII. Request data never replaces confirmed money or identity.

## 4. CheckRate trust boundary

Existing opaque UUID checkoutToken resolves to a stored session. New readForIntent shares existing session validation but reads without locking or consuming. Missing/unknown/tampered tokens, used/expired/invalid expiry, missing/stale/future CheckRate markers, inconsistent stored identity/money, browser mismatches, invalid dates/occupancy/travelers and unaccepted price changes fail safely.

CheckRate must actually have been performed: checkRatePerformed=true, recent checkedRateAt, BOOKABLE and recheckRequired=false. A search snapshot or BOOKABLE Availability-only refresh is insufficient for this stricter intent foundation. Room/board and traveler expectations come from the server snapshot, not browser filters.

## 5. Booking-disabled boundary

Valid intent invokes existing assertBookingAllowed and stops at BOOKING_DISABLED / PROVIDER_NOT_CALLED, HTTP 503, success=false. No provider payload execution, booking/payment/event creation or fake confirmation. The validate-only method has no path to provider booking even if flags are changed later. VALIDATION_ERROR returns 409; unexpected DB/guard/internal failures return safe RETRYABLE_INTERNAL_ERROR, 503. Arbitrary exception/provider/credential material is never echoed.

Legacy Hotelbeds create-booking is additionally blocked before acquiring a connection when bookingEnabled=false; resolving a Hotelbeds session through another request provider also encounters the existing guard before INSERT. The existing staging read-only guard remains intact.

## 6. Duplicate/idempotency behavior

Repeated/concurrent valid submissions return the same requestId for one checkout session. Each is an independent read-only validation with zero downstream attempt, zero writes and no session consumption. No global cache or new infrastructure. Existing transactional checkout consumption and conditional provider claim remain unchanged for the legacy path. Intent identifier is correlation, not a new durable provider-execution idempotency system.

## 7. Persistence behavior

DB/schema changed: NO. No migration or new persistence. Existing checkout session creation/actual-booking storage remain in their original paths. Intent only SELECTs a session; it never creates booking history, payments or events, nor updates used_at. Deployed intent validation legitimately needs the existing DB; automated verification mocks it and forbids real DB operations.

## 8. Tests

- Focused 6F backend final: PASS 24/24. Covers actual service/controller/session validation, strict source authority, mismatches, occupancy/ages, disabled guards, duplicates, no side effects/leakage and registered route/auth middleware.
- Initial focused attempt passed all 24 checks but hit a Windows libuv assertion at forced exit after a local HTTP helper. Test helper changed to direct registered middleware/handler dispatch without sockets; final focused run PASS. Runtime source unchanged after final focused verification.
- Full backend: 464/478, exactly one offline run across 39 files; exit 1, 14 failed, 0 skipped. All 14 are the same known DB-dependent limitation, intentionally blocked rather than forced through a real connection. No preload or new product assertion failures. Explicit real-DB integration script excluded; no 478/478 claim.
- Frontend runtime/config changed: NO. Frontend focused/full, lint/build: NOT RUN — not required.
- Verifier: PASS, 218 backend syntax files, 473 scanned files, findings []. 6A: PASS. `git -c core.safecrlf=false diff --check`: PASS. Each executed once after final source. 6B manifest not run against intentionally dirty source.

DB-blocked failure counts: hotelbedsAccess 1; hotelbedsCatalogPlan 1; hotelbedsContent 3; hotelbedsMultiDestination 1; hotelbedsPublicSearch 1; hotelbedsStagingTest 6; stagingAcceptance 1. Total 14. Transport-oriented cases depend on persisted TEST access-control storage and fail closed when its DB access is blocked.

Runner: `node --require <OS-temp>/sprint6fOffline.cjs --test --test-concurrency=1 --test-force-exit`; focused file `backend/tests/bookingIntentFoundation.test.cjs`; full run enumerates `backend/tests/*.test.js` and `*.test.cjs` except `.integration.test.js`. Guard lazily blocks unmocked pg queries/connections and real HTTPS. Full log: OS-temp `sprint6f-backend.log`.

## 9. Safety

Sprint 6F does NOT perform a Hotelbeds booking. Booking remains disabled; payments remain disabled. No booking confirmation is manufactured. CheckRate confirmation is not booking confirmation. TEST configuration and all existing guards retained; no LIVE, real charges/refunds, email activation or production provisioning. Production infrastructure remains PAUSED and was not contacted.

Real Availability/CheckRate/Hotelbeds Booking/payment calls: 0/0/0/0. Real DB mutations: 0. Focused tests forbid these calls; unrelated legacy regression suites may exercise synthetic mocks. No dependency/environment/config changes. Production sales readiness is not claimed.

## 10. Exact files

Modified:

- backend/controllers/bookingController.js
- backend/routes/bookingRoutes.js
- backend/services/checkoutSessionService.js
- backend/services/hotelbedsBookingService.js

New:

- backend/tests/bookingIntentFoundation.test.cjs
- SPRINT_6F_BOOKING_ENGINE_FOUNDATION_REPORT.md

All changes remain unstaged. Frontend runtime unchanged; backend runtime changed.

## 11. Known limitations

Intent validation uses existing bearer checkout sessions; no new owner binding or schema is introduced. No durable intent record or cross-process execution claim. BOOKABLE Availability-only confirmation cannot satisfy the explicit CheckRate requirement. A valid real CheckRate success was not requested during verification. Owner acceptance for 6F remains NOT RUN; 6E evidence is not automatically promoted to 6F acceptance.

## 12. Future provider-booking activation path

Any future activation requires explicit authorization and review of existing booking/transport/production gates, traveler/contact payload, current confirmation, transactional session claim, ownership and existing provider idempotency/reconciliation. Merely changing flags cannot turn the intent endpoint into provider execution. No activation is performed in 6F.

After a future authorized staging deploy, owner should verify a naturally confirmed/checkrated offer reaches Checkout's truthful booking-unavailable boundary, with no fake success, no payment activation and a responsive app. Do not create a real Hotelbeds booking for acceptance. Optional intent API validation requires existing authentication and session; its expected valid result is BOOKING_DISABLED, not booking confirmation.

OWNER BROWSER ACCEPTANCE: NOT RUN. PRODUCTION SALES READY: NOT CLAIMED.
