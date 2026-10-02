# Sprint 5K — Consumer Release Candidate

Status: CODE / OFFLINE PASS. CONSUMER RC: READY — tested offline scope only. OWNER BROWSER ACCEPTANCE: NOT RUN.

## 1. Baseline

develop, HEAD 60816f9 (`docs: record Sprint 5J owner browser acceptance`). Required status/branch/latest-commit checks confirmed clean tracked baseline and committed 5J final report. Preserved unrelated README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, `tatus --short` and historical unusual acceptance filename. Baseline frontend 724/724; entry 245.78 kB / gzip 76.66 kB, 26 chunks, warning removed.

## 2. RC scope

Verification-only consumer path: Home/search intent -> Results -> Details -> Login -> Favorites/Profile/My Bookings -> Help/trust navigation. Existing architecture reused; targeted App/import/SSR and contract checks, not repeated whole-repository audits. READY means no known release-blocking consumer defect in tested offline scope, not production sales, LIVE Hotelbeds, real booking/payments, legal certification or production infrastructure readiness.

## 3. Release blockers found

**NO RELEASE-BLOCKING CONSUMER DEFECT FOUND OFFLINE.** Count: 0. No claim of independent staging/browser acceptance.

## 4. Fixes made

NONE to product code. Added one focused RC test and this report. Initial new test falsely matched authFetch with an unbounded fetch regex; corrected the test to identify the direct fetch function. No old assertion weakened or existing suite edited.

## 5. Consumer journey verification

Actual lazy imports and streaming SSR resolve Home, Results search entry, Details loading, Login, Help and informational topics without API calls. Search intent preserves destination/date/nights/guests; invalid input blocks navigation and repeated submit navigates once. Private routes gate guests/unvalidated identities; Favorites retains its intended guest auth-required view, not a newly introduced route redirect. Validated account routes open, logout closes private access. No stored booking fixture created.

Results loading/error/empty, local sorting/filter controls, selected-offer state and safe invalid Details branch preserved by targeted contracts and existing full regression. Booking EMPTY checked only with ready []; unknown/error stay distinct. Own-app Favorites transport, Profile/security form separation and notification wording retained. Footer/nav route resolution, 5I focus/menu/FAQ/guest labels, TEST disclosures and disabled booking controls preserved. SSR does not mount effects or prove browser no-flash/focus/geometry; existing suites cover deeper mocked service behavior.

## 6. Known accepted limitations

Hotelbeds TEST/read-only; LIVE, real booking, payments/refunds and email delivery OFF; production infrastructure PAUSED. Booking READY/Details owner acceptance remains NOT RUN without stored records. Registration/password mutation and second-account owner tests not performed. Prior 5C skipped persistence/isolation/browser checks and 5J standalone Contacts/390/320 limitations not upgraded. No legal certification or Safari/Firefox acceptance. No new staging account, password change, fake booking, provider search or real DB mutation.

## 7. Tests/regression

Focused **26/26 PASS** (25 subtests plus parent). Full frontend **750/750 PASS**, zero failures/cancelled/skips/todo; run once after final test correction. Lint PASS, zero errors and three inherited admin react-hooks/exhaustive-deps warnings (BookingsTable:40, NotificationsTable:31, RefundsTable:33). Build PASS. Verifier PASS: 208 backend syntax files, 448 scanned files, findings=[]. Final diff-check PASS. Lint/build/verifier/diff-check each run once. Required offlineNetwork.cjs preload, sequential Node runner and force-exit used. Full frontend log: OS-temp sprint5k-frontend.log. Backend unchanged, not rerun; 399/399 historical only. No new dependency. External calls 0; Hotelbeds calls 0; real DB mutations 0.

## 8. Performance guard

Final entry index-CgdvV1K8.js **245.78 kB / gzip 76.66 kB**, unchanged from 5J. **26 JS chunks**; >500 kB warning **REMOVED**. Product source/config/package files unchanged; existing React.lazy architecture, eager CSS and unchanged warning threshold retained. No further optimization or measured browser-speed claim. Build TEST flag process-only, no env-file edit.

## 9. Exact files

Modified tracked files: NONE.

New: frontend/tests/consumerReleaseCandidate.test.mjs; SPRINT_5K_CONSUMER_RELEASE_CANDIDATE_REPORT.md.

Backend/DB/schema/Hotelbeds/booking/payment/runtime unchanged. No git add/commit/push/deploy/reset/restore/clean. All new work unstaged; unrelated owner files preserved.

## 10. Owner acceptance checklist

Prepare only after separately authorized deployment. Existing account: Home -> Login -> Profile -> Favorites -> My Bookings -> Help -> Home. Verify routes open, auth survives navigation, no blank lazy page/raw error/dead CTA/layout break, TEST status remains truthful. Optional existing fresh results only; no fresh Hotelbeds search solely for RC. Quick 390px Home check if needed. Do not create bookings/accounts or change passwords to manufacture PASS. Record only tested scope; owner acceptance currently NOT RUN.

## Sprint 5K.1 — Admin to Home Navigation

Owner requested direct navigation from Admin to consumer Home. Started from clean tracked develop baseline 330e8e7. Added a native React Router Link **«На главную»**, target exactly **/**, above the existing Admin header title. Same-tab navigation; keyboard-accessible link with default browser focus behavior. No new component or CSS redesign. Existing logout implementation, admin role/auth guards and routes unchanged.

Modified only frontend/src/components/admin/Header.jsx, frontend/tests/consumerReleaseCandidate.test.mjs and this report. Two added tests check the actual admin route's semantic link, retained authenticated identity across route rendering, and rejection of guest/non-admin access. SSR/source evidence, not browser click acceptance; no mounted API effects.

CODE / OFFLINE: PASS. Focused **28/28 PASS**; full frontend **752/752 PASS**, zero failures/skips/todo. Lint PASS with the same three inherited admin hook warnings. Build PASS: entry **245.78 kB / gzip 76.65 kB**, **26 JS chunks**, >500 kB warning absent; Admin chunk 82.36 kB / gzip 18.97 kB. Verifier PASS: 208 backend syntax files, 448 scanned files, findings=[]. Diff-check PASS. Each required check ran once after final source. Full frontend log: OS-temp sprint5k1-frontend.log; build TEST flag process-only.

Backend/DB/Hotelbeds/booking/payments unchanged; no new dependency. External/provider calls and real DB mutations: 0. No git add/commit/push/deploy; changes unstaged, unrelated owner files preserved. **OWNER BROWSER RECHECK: REQUIRED** — existing authorized admin opens Admin, tabs to «На главную», activates it and verifies Home plus retained auth state.
