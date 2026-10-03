# Sprint 6G — Traveller / Guest Data Flow

SPRINT 6G — CODE / OFFLINE: **PASS — tested scope**.
TRAVELLER / GUEST DATA FLOW: **PASS**.

## 1. Baseline

Branch `develop`; tracked tree clean at start, unrelated owner untracked files retained. HEAD `0c1408c`; Sprint 6F foundation committed in `07763b2` and report in `6c0e443`. At implementation baseline, staging deployment and owner acceptance had not yet been performed. Subsequent owner acceptance is recorded below.

## 2. Existing traveller architecture found

Reused and hardened `TravelerStep`, Checkout review and the authenticated `/bookings/intent` endpoint. Existing rows use `AD`/`CH`, names, optional `birthDate`, child search age and room 1. Existing profile contact enrichment is visible and editable; saved guest identity requires explicit selection. First adult is the existing holder. Hotelbeds payload maps holder/name/surname/type/room, with no DOB requirement. Checkout sessions store confirmed offers, not traveller records; no traveller persistence mechanism was added.

## 3. Occupancy authority

Guest form uses the confirmed CheckRate response occupancy, not URL counts. Backend independently reads the existing checkout session and validates its server snapshot, columns, TEST environment, CheckRate freshness and price acceptance. Count, adult/child distribution and child-age multiset must match that snapshot. Client occupancy overrides/expected counts are rejected. Frontend is not authoritative.

## 4. Traveller model

Internal intent receives normalized `travelers`: exact `AD`/`CH`, trimmed international `firstName`/`lastName`, room 1, child age matching confirmed search expectations, and optional explicitly supplied valid `birthDate`. No independent lead flags or external lead identity are supported; the first adult remains holder. Unknown fields, including alternate identity aliases, passport/contact/lead fields, are rejected rather than silently used.

## 5. Data-integrity rules

DOB is never fabricated. Traveller names are never fabricated. Missing child age no longer defaults to zero. No invented phone/email/passport. Existing profile values remain visible for confirmation/editing. Optional DOB rejects impossible/future dates; no new Hotelbeds DOB/category rule is invented. Child ages retain the existing 0–17 contract. Blank names are blocked, names trimmed without ASCII restrictions or character substitution.

## 6. Frontend UX

Hotelbeds flow: price review → occupancy-driven guest rows → intent validation → booking-disabled screen. Stable adult/child labels, editable names and optional DOB, inline field errors, fixed safe submission errors and invalid Continue blocking. Drafts survive normal Back navigation; confirmed CheckRate is reused without another provider request. Editing/navigation disabled while submitting, with a ref lock and a shared pending intent request. New route/offer selection resets the flow. Stepper describes the three safe stages. Existing mock checkout path remains available.

## 7. Backend validation

Malformed arrays/rows, missing/blank/oversized names, unknown fields, invalid room, child ages, optional DOB and count/type mismatch fail before the boundary. Existing `VALIDATION_ERROR` convention is retained with fixed `validationKind` (`TRAVELLER_VALIDATION_ERROR` or `OCCUPANCY_MISMATCH`) for correctable guest errors. Unexpected errors remain safe retryable errors. Existing session, rate, price and CheckRate checks remain required.

## 8. Booking-intent integration

Normalized guests reach internal `INTENT_READY`; public output excludes travellers and ends at `BOOKING_DISABLED` / `PROVIDER_NOT_CALLED`, never booking confirmation. Booking remains disabled. Payments remain disabled. No booking row, session-consumption write or new durable idempotency system. Even valid intent has no provider booking/payment execution path. No Hotelbeds Booking call occurred.

## 9. PII/privacy safeguards

No traveller logging added, no DOB/contact in error messages, no guest PII in intent responses or URLs, no additional DB storage. Intent request includes token, normalized guests and token-bound price acceptance only; local contact/comment fields are not sent to this endpoint. Tests use synthetic data. API wrapper discards raw backend messages/data; UI renders fixed copy.

## 10. Tests

- Focused backend: **25/25 PASS**, single run.
- Focused frontend: **21/21 PASS** (20 cases plus parent), single run.
- Full backend: **489/503 HISTORICAL SINGLE RUN** over 40 files; **14 DB-blocked** failures. Not rerun during final frontend cleanup; no full backend PASS claimed. No real DB was used. The dedicated `hotelbedsCatalog.integration.test.js` suite was excluded because it requires PostgreSQL and writes an isolated schema. No claim of 503/503.
- DB-blocked cases: `hotelbedsAccess` 1; `hotelbedsCatalogPlan` 1; `hotelbedsContent` 3; `hotelbedsMultiDestination` 1; `hotelbedsPublicSearch` 1; `hotelbedsStagingTest` 6; `stagingAcceptance` 1. Direct DB guard errors or DB-backed TEST access gate failure/derivative assertions.
- Original full frontend: **788/790**. The original frontend regression was a stale test expectation from the previous intentional FAQ cleanup, not a Sprint 6G runtime defect. The assertion required the standalone Home FAQ `/help` CTA removed by baseline commit `0c1408c`; the other failure was its parent/aggregate consequence.
- Final cleanup changed only the stale expectation in `frontend/tests/helpUx.test.mjs`: FAQ heading/accordion remain, standalone link absent, footer Help link present, `/help` route valid. Affected verification: **8/8 PASS**, once. Full frontend FINAL: **790/790 PASS**, exactly one final run over 29 files. Runtime source changed during cleanup: **NO**.
- Lint: PASS, 0 errors and 3 existing Admin hook warnings.
- Build: PASS. Entry `index-BjFBD_f-.js`: **245,945 bytes**, Vite **245.94 kB / gzip 76.76 kB**. Independent default Node gzip measurement: **76,032 bytes**. JS chunks: **26**. No >500 kB JS warning.
- Verifier: PASS, 219 backend syntax files / 477 scanned files, no findings. 6A: PASS. Diff-check: PASS. Lint/build/verifier/6A/diff-check each run once during final cleanup; runtime source unchanged after focused verification.
- Availability, CheckRate, Hotelbeds Booking, payment calls and real DB mutations: **0**. Tests use mocks with HTTPS and real PostgreSQL access prohibited by an OS-temp lazy preload guard. No 6B manifest run while tracked tree is intentionally dirty.

## 11. Exact files

Modified:

- `backend/controllers/bookingController.js`
- `backend/services/hotelbedsBookingService.js`
- `frontend/src/components/checkout/CheckoutStepper.jsx`
- `frontend/src/components/checkout/TravelerStep.jsx`
- `frontend/src/pages/Checkout.jsx`
- `frontend/src/services/bookingService.js`
- `frontend/tests/helpUx.test.mjs` (final cleanup: test expectation only)

New:

- `backend/tests/travellerGuestFlow.test.cjs`
- `frontend/tests/travellerGuestFlow.test.mjs`
- `frontend/src/utils/travellerData.js`
- `SPRINT_6G_TRAVELLER_GUEST_DATA_FLOW_REPORT.md`

## 12. Limitations

Guest flow focused scope and final full frontend pass. Real DB cases remain intentionally unavailable; full backend result is historical and limited. Owner browser acceptance now passed for the explicitly observed two-adult flow; the earlier intentional FAQ runtime cleanup is owner-accepted. Drafts live only in existing Checkout component state, not across reloads. Single-room occupancy remains the existing supported scope. No schema/migration/dependency change. TEST-only, LIVE/booking/payments/charges/refunds/email/sales flags unchanged; production infrastructure remains paused. Production sales readiness is not claimed. No git add/commit/push/deploy; all changes unstaged.

## 13. Recorded owner staging acceptance

OWNER BROWSER ACCEPTANCE: **PASS ? tested scope**.

Owner reported successful backend/frontend staging deployment and Hotelbeds TEST Search, Hotel Details and CheckRate PASS. POST `/api/checkout/review` returned HTTP 200. Confirmed offer: Sultan Gardens Resort; Premium Jacuzzi Suite Pool View; BED AND BREAKFAST; **2075.98 EUR**.

Traveller step became reachable after successful CheckRate. Expected occupancy was 2 adults and the UI displayed 2 adult rows. Names and DOB were not auto-generated. User-entered synthetic traveller data remained available through the flow. Safe progression to Final Review succeeded. Traveller step: **PASS ? tested scope**.

Booking intent reached intentional HTTP 503 `BOOKING_DISABLED`, state `BOOKING_DISABLED`, providerState `PROVIDER_NOT_CALLED`, review.state `REVIEW_READY`, bookingAvailable false, paymentAvailable false. No Hotelbeds Booking API call, real booking, payment, charge or fake booking confirmation. This was the deliberate safety boundary, not a provider booking failure.

Evidence recording only: no runtime edits, tests/build/lint/verifier commands, external calls or deployment performed in this task. Historical offline numbers above are unchanged. General smoke checks not explicitly supplied in this evidence are not assigned PASS.

PRODUCTION SALES READY: **NOT CLAIMED**.

## Release evidence recorder outcome

Input: `STAGING_RELEASE_EVIDENCE_6I.json`; generated output: `STAGING_RELEASE_EVIDENCE_6I.md`, using the unchanged 6D schema and recorder.

**STAGING ACCEPTANCE: FAIL**. Recorder's embedded prerequisites reported 6A PASS, 6B manifest FAIL and 6C smoke plan FAIL. Required owner fields not explicitly observed in this supplied evidence remain NOT_RUN: home, authSession, profile, favorites, myBookings, helpLegal, health, readiness. Only changedFeature and changedEndpoint are PASS. Successful deploy alone is not substituted for these checks. No recorder rules or prerequisite metadata were weakened; no additional standalone verifier/gate command was run. The owner feature acceptance recorded above remains PASS ? tested scope, independently of aggregate release acceptance.
