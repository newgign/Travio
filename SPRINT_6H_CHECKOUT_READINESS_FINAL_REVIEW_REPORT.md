# Sprint 6H — Checkout Readiness & Final Review Contract

SPRINT 6H — CODE / OFFLINE: **PASS — tested scope**.
CHECKOUT READINESS: **PASS — tested scope**.

## 1. Baseline

Branch `develop`, tracked tree clean at start, HEAD `3ec10b8` (`docs: record Sprint 6G traveller flow verification`). Sprint 6G committed; unrelated owner untracked files retained. No reset/restore/clean, git add/commit/push or deployment.

## 2. Existing checkout architecture

Reused and hardened existing Checkout, CheckRate review, TravelerStep, authenticated booking intent and the existing external-store transition pattern. Before 6H, Hotelbeds price review → guests → intent ended directly at the disabled PaymentStep placeholder, without a final normalized guest/offer review. Price review uses confirmed CheckRate response, not search-card data. First adult remains holder. Existing profile enrichment, optional DOB and mock checkout path preserved. Hotelbeds now proceeds price review → guests → validated final review with explicit disabled boundary.

## 3. Review source of truth

Explicit `review: true` on existing `/bookings/intent` reads and validates the server checkout session using unchanged 6F/6G offer, CheckRate, occupancy, money and traveller checks. The server projects a safe `REVIEW_READY` model from confirmed snapshot and normalized guests. Hotel, dates/nights, descriptive room/board, price/currency and occupancy come from that model. Browser search data cannot override final display. Absent labels stay null and render as missing; technical ID/code fallbacks are omitted. CheckRate confirmation is not a booking.

## 4. Step gating

CheckRate and current TEST checkout session required; changed price acceptance remains token-bound. Valid guests required before intent request. Final readiness is held only in memory and bound to current checkout token/acceptance/normalized guests. Back/edit invalidates readiness without erasing input; new selection/refresh starts a new flow. Expiration invalidates preview at the earlier of session and CheckRate TTL expiry. Late responses cannot restore invalidated review, duplicate pending validation shares one request. Final view checks status/model; manually selecting a later step cannot display a ready review without the validated transition. Hotelbeds never renders SuccessStep or the payment path.

## 5. Traveller review

Expected count, adult/child roles, confirmed child ages and normalized international names displayed. Optional DOB appears only when explicitly entered/selected and validated. Names, DOB, contact and passport data are never generated. Guest drafts remain in existing component state across normal Back navigation; no reload persistence added.

## 6. Booking intent preview

Preview explicitly whitelists hotel label, stay, room/board descriptions, exact price/currency, occupancy, normalized guest names/roles/optional DOB, TEST and disabled availability. No rateKey, provider IDs, checkout/JWT tokens, request ID, raw provider payload or secrets. Ordinary 6F intent response remains PII-free when preview is not requested. Preview is available only through the existing authenticated route for the submitted guests; no new endpoint/session storage/schema.

## 7. Booking-disabled boundary

Validated preview is returned inside existing HTTP 503 `BOOKING_DISABLED` / `PROVIDER_NOT_CALLED` boundary. No commercial success; final button disabled and labelled “Бронирование пока недоступно”. Booking remains disabled. No provider booking happened. No confirmed booking row/history or session-consumption write. No fake booking confirmation.

## 8. Payment-disabled behavior

Hotelbeds PaymentStep already returned a disabled placeholder before any payment controls; its implementation is unchanged. Final review now explicitly shows payment unavailable and has no payment action/gateway path. Payments remain disabled. No card data collected, payment row, authorization, charge/refund or email activation. Existing mock behavior outside Hotelbeds remains unchanged.

## 9. Privacy/PII

No guest PII in URL/query params, logs or generic errors. Preview returns only normalized guests from the explicit current authenticated submission, with no contact/comment/passport echo. Frontend projects whitelisted fields before storing/displaying review, discards raw errors and keeps bindings/drafts in memory only. Server errors remain fixed; CheckRate-required, traveller validation, review-not-ready, internal-retryable and booking-disabled states remain distinct. Synthetic data only in tests.

## 10. Tests

- Backend focused: **24/24 PASS**, one run.
- Frontend focused FINAL: **23/23 PASS** (22 cases plus parent). Initial run found missing explicit currency code in the price label; UI label corrected, then failed suite rerun once. No passed suite repeated without source change.
- Full backend: **513/527**, one run over 41 files, **14 known DB-blocked cases**. Not a full backend PASS. Lazy real-PostgreSQL guard blocks connections/queries; no real DB used. Dedicated `hotelbedsCatalog.integration.test.js` excluded because it requires a real isolated PostgreSQL schema. Same blocked files/cases as 6G: access 1, catalog planner 1, content 3, multi-destination 1, public search 1, staging TEST 6, staging acceptance 1.
- Full frontend: **813/813 PASS**, one run over 30 files.
- Lint: PASS, no errors; three existing Admin hook warnings.
- Build: PASS. Entry `index-BrCuwMRo.js`: **245,969 bytes**, Vite **245.96 kB / gzip 76.77 kB**. Default Node gzip measurement: **76,054 bytes**. **26 JS chunks**; no >500 kB JS warning. Checkout chunk 43.08 kB / gzip 11.94 kB.
- Verifier: PASS, 220 backend syntax files / 482 secret-scan files, no findings. 6A: PASS. Diff-check: PASS. Final gates each run once; source unchanged after final frontend focused correction. No 6B with intentionally dirty tracked tree.
- Real Availability, CheckRate, Hotelbeds Booking, payment calls and real DB mutations: **0**. Offline HTTPS guard and fixtures/mocks used. No staging/provider quota consumed.

## 11. Exact files

Modified:

- `backend/controllers/bookingController.js`
- `backend/services/hotelbedsBookingService.js`
- `frontend/src/components/checkout/CheckoutStepper.jsx`
- `frontend/src/components/checkout/ReviewStep.jsx`
- `frontend/src/pages/Checkout.jsx`
- `frontend/src/services/bookingService.js`
- `frontend/src/utils/travellerData.js`

New:

- `backend/tests/checkoutReadiness.test.cjs`
- `frontend/tests/checkoutReadiness.test.mjs`
- `frontend/src/components/checkout/FinalReviewStep.jsx`
- `frontend/src/services/checkoutReadiness.js`
- `SPRINT_6H_CHECKOUT_READINESS_FINAL_REVIEW_REPORT.md`

## 12. Known limitations

Offline contract verified; 6H owner browser acceptance now PASS ? tested scope (section 14). Single-room supported occupancy unchanged; no new PII persistence, DB/schema/migration or dependencies. Full backend remains limited by 14 DB-blocked cases. TEST only; LIVE/booking/payments/charges/refunds/email/production sales flags unchanged; production infrastructure PAUSED. Successful staging CheckRate confirmation is now recorded from explicit owner evidence below. Production sales readiness is not claimed. All changes unstaged.

## 13. Historical CheckRate diagnostic

Three historical owner attempts returned UNAVAILABLE. Their individual causes remain unproven; they are not all attributed to the subsequently proven premature pre-provider defect. The dedicated 6I follow-up fixed that defect; the owner now reports successful staging CheckRate and downstream review. The current upstream blocker is no longer reproduced in the observed flow.

## 14. Recorded owner staging acceptance

OWNER BROWSER ACCEPTANCE: **PASS ? tested scope**.

Backend/frontend staging deployment succeeded. Owner observed Hotelbeds TEST Search, Hotel Details and CheckRate PASS; POST `/api/checkout/review` returned HTTP 200. Confirmed offer: Sultan Gardens Resort; Premium Jacuzzi Suite Pool View; BED AND BREAKFAST; **2075.98 EUR**.

Final Review became reachable and displayed hotel, stay dates, nights, room, board, confirmed CheckRate price/currency and two travellers. Synthetic user-entered traveller data remained available; names and DOB were not fabricated. No raw rateKey, token or provider secret was displayed. Final Review: **PASS ? tested scope**.

POST booking intent returned intentional HTTP 503: code/state `BOOKING_DISABLED`, providerState `PROVIDER_NOT_CALLED`, review.state `REVIEW_READY`, bookingAvailable false, paymentAvailable false. Booking and payment remained unavailable. Hotelbeds Booking API was not called; no real booking, payment, charge or fake confirmation occurred. This is the current intentional safety boundary, not a provider booking failure. HTTP semantics remain unchanged.

Evidence recording only: no runtime edits, tests/build/lint/verifier commands, external calls or deployment performed in this task. Historical offline results above are unchanged. Owner evidence does not establish unreported general smoke checks.

PRODUCTION SALES READY: **NOT CLAIMED**.

## Release evidence recorder outcome

Input: `STAGING_RELEASE_EVIDENCE_6I.json`; generated output: `STAGING_RELEASE_EVIDENCE_6I.md`, using the unchanged 6D schema and recorder.

**STAGING ACCEPTANCE: FAIL**. Recorder's embedded prerequisites reported 6A PASS, 6B manifest FAIL and 6C smoke plan FAIL. Required owner fields not explicitly observed in this supplied evidence remain NOT_RUN: home, authSession, profile, favorites, myBookings, helpLegal, health, readiness. Only changedFeature and changedEndpoint are PASS. Successful deploy alone is not substituted for these checks. No recorder rules or prerequisite metadata were weakened; no additional standalone verifier/gate command was run. The owner feature acceptance recorded above remains PASS ? tested scope, independently of aggregate release acceptance.
