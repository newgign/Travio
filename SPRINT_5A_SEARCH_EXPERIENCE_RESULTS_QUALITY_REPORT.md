# Sprint 5A — Search Experience & Results Quality

CODE / OFFLINE: PASS. Owner browser acceptance: NOT RUN.
Scope: frontend search UX; production infrastructure remains paused.

## 1. Initial state

Initial ordered audit: `git status --short`, `git branch --show-current`, `git log -1 --oneline`, `git diff --stat`, `git diff`. Branch develop; HEAD 69c5515 (`feat: add production database provisioning safeguards`); tracked tree was clean before 5A. The six 4C.1 files were tracked and unchanged: production DB snapshot/runbook/report, compareDatabaseTargets.cjs, productionDatabaseProvisioningCheck.cjs and its focused test. No infrastructure work resumed.

Unrelated README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md and the pre-existing untracked filename containing `record final staging release candidate acceptance` remain untouched. No owner changes reverted, staged or committed.

## 2. RECOVERED WORK BEFORE CONTINUATION

The continuation audit found 15 modified frontend source files and two new helpers, resultsSearch.js and searchExperience.js. Preserved the form/count hardening, explicit default-order path, name filter, chips/summary, safe favorite error, price formatter improvements, rooms snapshot check, Results validation/state integration and responsive rules. Existing guest selector, loading skeleton, chips and exact-offer navigation were reused.

The partial cache still used an independent 60-second limit and automatically fetched after expiry; it was not final. Prior full frontend run had 108/112 passing, with failures in old source/label expectations; that intermediate result was not a 5A PASS. New focused suite and report were still missing.

## 3. WORK COMPLETED AFTER CONTINUATION

Finished strict URL validation, fixed rooms presentation, canonical request identity, default/reset ordering, distinct empty/error notices, explicit stale-result refresh, shared offer freshness and manual-new-search invalidation. Removed raw search errors and dead pagination wiring for the locally filtered loaded subset. Added 59 focused cases plus their enclosing test (Node reports 60 tests), updated three existing tests to the new intentional behavior, and completed full regression, lint, build and verifier.

## 4. Audited flow and rooms contract

Read the active Home -> HeroBanner -> HomeSearch -> GuestPanel/homeSearch -> Results -> local filters/sort -> TourCard -> TourDetails/detailsOffer -> Back path, supporting URL/display/freshness helpers, styles and existing tests. TourCard is the active Results card; legacy HotelCard was not redesigned.

Backend Hotelbeds occupancy and TEST search validation support exactly one room. Backend unchanged. UI shows `Номера: 1` and the explanation that only one room is supported; no room +/- controls. Missing URL rooms defaults to 1; rooms=0, rooms=2 or malformed values produce an invalid-search form before the search request. Form restoration may present the safe editable value 1, but a new explicit submit is required; invalid URLs never silently execute as rooms=1.

Existing form labels, Enter submit, inline errors, guest bounds (1–6 adults, 0–3 children), required child ages and catalog destination selection remain. Submit is disabled when the catalog cannot support a search; otherwise validation remains discoverable on submit. No browser alert for normal validation or favorite failures.

## 5. URL validation and edit search

Results validates supported provider, country/destination code syntax, ISO future date including impossible dates, 1–14 nights, occupancy and 0–17 child ages/count. Duplicate identity fields, conflicting aliases, unsupported diagnostic selector and explicit hotelCodes in ordinary consumer URLs are rejected. Optional checkout must match check-in plus nights. Destination existence/availability remains an authoritative backend/catalog decision, not an invented frontend lookup.

Search identity normalizes supported aliases/defaults and country/destination casing; ignores presentation parameters and unknown parameters. Results also validates the original URL before normalization, so explicit malformed values cannot disappear into defaults. The request helper independently validates its normalized input. Refresh restores the query; edit-search restores destination, dates, nights, adults, children/ages and one room. Child counts from malformed query strings are bounded before array creation.

## 6. Filter and sort pipeline

Original loaded results -> local hotel/candidate predicates, including trimmed case-insensitive hotel name -> local sorting -> visible cards. Rate predicates still select one exact signed candidate satisfying board, room and budget together. No candidate synthesis, cross-rate combination or mutation of original result order. Name has a label, native search input, applied chip and clear/reset paths.

`По умолчанию` and reset preserve the array order received after existing backend normalization. Explicit price ascending/descending, per-night, name, stars/rating use existing data; no recommendation algorithm. Mixed currencies retain existing currency grouping, without conversion. The existing backend request's priceAsc normalization remains unchanged; frontend default no longer re-sorts the selected candidates by price. A local filter can select a different existing candidate as before, but navigation preserves precisely that displayed candidate.

Filter and sort parameters are excluded from request identity. Effects depend on canonical search identity/validity; local typing, chips, reset and sorting do not fetch. Visible filtering is memoized. Counts are `originalResults.length` and `visibleResults.length`, explicitly described as loaded results; they are not a claim about the provider's full inventory. Unfiltered count is not repeated. Existing bounded first-page request uses limit=100; no new server pagination or provider expansion added.

## 7. Loading, empty and safe errors

INITIAL presents the editable search form. LOADING keeps the existing three-card skeleton. READY presents cards. PROVIDER_EMPTY says no hotels matched the search and offers change-search. FILTER_EMPTY has a separate message and reset action. ERROR uses fixed friendly text with explicit retry/change-search. Known TEST_CATALOG_EMPTY retains the safe catalog-empty explanation.

ResultsNotice never accepts raw error text for display. Search exceptions, stack, provider details and URLs are neither rendered nor logged by Results. Favorite failures use a fixed inline alert instead of raw alert(error.message). Retry is a user action; no background retry/polling.

## 8. Cache, freshness and Details Back

resultsSearch is tab-memory only: no localStorage/sessionStorage or disk cache. It retains exact response objects and deduplicates in-flight requests. The normal sequential flow retains up to three populated result sets; lightweight stale markers prevent discarded entries from triggering an automatic refetch. Manual Home submit invalidates previous stored results, removes the new search's old entry and advances an in-memory generation so even an identical submit starts a new context.

Freshness reuses the existing selected-offer 15-minute observedAt policy, now exposed as offerFreshUntil in the existing selectedOfferSnapshot helper. There is no separate 60-second cache TTL. Earliest expiry across hotel and candidate offers limits reuse; missing, invalid or future observation timestamps fail closed. Expired incoming responses are rejected. Empty sets have no offer freshness evidence and require explicit refresh on a later cache revisit.

Back with fresh cached results restores the same original objects, selected prices and URL filters/sort/name with no additional search call. Expired/discarded/previously failed entries show an explicit update-required state; only the update button requests again. Mounted Results schedules UI expiry using the same freshness deadline; it does not request automatically. A hard browser refresh loses memory and can execute the URL search again; memory-only cache does not promise persistence across reloads, tabs or process restarts.

Existing Results origin/history navigation remains, with hotelName added to the allowlist. Exact hotel, room, board, dates, occupancy, nights, total and currency continue through selectedOffer state. Snapshot validation also rejects mismatched or duplicated rooms. Rejected/stale selection has no silent resolver substitution. The 3R/3X integration regressions remain passing.

## 9. Card and price quality

Preserved image/fallback, name, category, location, selected room/board, stay/guests, TEST badge, dominant TOTAL, secondary per-night, Details, favorite and disabled TEST booking. Favorite pending state prevents repeated clicks and exposes aria-pressed. Shared formatMoney handles unavailable/non-finite input safely and uses currency minor-unit precision (existing KZT policy retained); StayPrice continues to use offer currency and validates totals. No hardcoded EUR substitution for another offer currency.

## 10. Accessibility and responsive evidence

Label/control association, icon-button labels, semantic buttons/links, focus-visible, filter-drawer keyboard trap/Escape and focus return remain covered. Room count is output text. Empty/error notices have status/alert semantics and labelled actions. Long-name wrapping, chips, local search and narrow controls use existing scoped consumer layout plus narrow additions; navbar/profile/global layout untouched.

320/390/768/1440 coverage is SSR/helper/CSS source applicability and parsing, including existing consumer regressions. This is not measured browser geometry, visual screenshot acceptance or a fresh deployed-device PASS. Owner must confirm focus, wrapping and horizontal overflow on real pages.

## 11. Focused tests

`node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit frontend/tests/searchExperience.test.mjs`

PASS 60/60 (59 cases + enclosing test), exit 0. Covers valid submit; invalid URL fields and request boundary; refresh/edit restoration; rooms limit; loading; provider/filter empty; safe errors/retry; local name/chips/reset; nonmutating default/price sorts; counts; card disclosure/room/board/currency/per-night/booking/favorite; exact Details and Back; fresh/in-flight/stale cache; earliest candidate expiry; explicit new search; missing freshness; no automatic repeat after failure; CSS/accessibility contracts; zero external fetch.

During development, corrected an image-less fixture that expected an img alt and strengthened duplicate-room snapshot rejection. No failing check was relabelled PASS or removed. Existing tests updated: local filter control count 6 -> 7 with all label/uniqueness assertions retained; rate-price-order test now explicitly selects priceAsc; old provider-error source markers replaced by safe error component/explicit retry/no-raw-error assertions.

## 12. Regressions and build

| Check | Result |
| --- | --- |
| Full frontend: `node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit frontend/tests/*.test.mjs` | PASS 172/172, 17 files, exit 0 |
| `npm.cmd --prefix frontend run lint` | PASS, 0 errors / 3 existing admin hook warnings |
| `npm.cmd --prefix frontend run build` | PASS, Vite 8.2.0, 170 modules |
| `node backend/scripts/sprint3mVerify.cjs` before report creation | PASS, 205 backend syntax files / 419 secret-scan files / findings=[] |
| Final verifier including this report | PASS, 205 backend syntax files / 420 secret-scan files / findings=[], exit 0 |
| `git -c core.safecrlf=false diff --check` | PASS |

Build JS 501.78 kB (gzip 141.04); CSS 110.14 kB (gzip 19.96); index 1.08 kB (gzip 0.58). Known >500 kB chunk warning remains. Large existing images remain 2.66–3.09 MB. No dependency/build-system migration or splitting project.

TEST disclosure flag was set only for the local build process and restored afterwards. No env file or Render setting changed. Build is compilation evidence, not a deployable Render acceptance assertion about its actual API URL/configuration. Frontend package has no npm test script; the existing Node test command above was used.

Backend runtime source unchanged: full backend DB regression was not required or run. Existing frontend suites invoke some real backend helpers/controllers with injected provider/DB mocks. Their Availability=1 counters describe fixture calls, not external requests. No DB connections or temporary regression schemas were used in 5A.

## 13. Warnings and limitations

Three inherited admin useEffect warnings and bundle/image-size warnings remain. Cache does not establish current remote availability or replace signed-offer/server authorization. Browser back/scroll/focus behavior is covered by helpers/source and existing SSR tests, with real browser interaction pending. Automated tests do not render a browser layout engine or prove that no overflow exists at every content length. No real TEST search performed; no deployed build claimed. Unknown but syntactically valid destination codes may receive safe backend errors without frontend catalog attestation.

## 14. Owner manual acceptance — NOT RUN

1. Use an existing/reused TEST result flow where possible. If a new Availability request is unavoidable, owner explicitly authorizes at most one TEST search. Agent performs none. Avoid refresh/retry/new submit during a reuse-only acceptance: these actions can intentionally start a search.
2. Desktop 1440: Home keyboard/Enter, required destination/date, guest ages, fixed one room -> Results -> name/board/room/budget -> chips/reset -> default/ascending/descending. Confirm loaded vs visible counts, and that filter/sort typing sends no search request.
3. Choose the exact displayed Grand Kaptan candidate (when present); record room, board, dates, guests, nights, TOTAL and currency privately. Details must match; Back within freshness must preserve search/name/filter/sort and issue no additional Availability request.
4. At 390 and 320, also inspect 768: labels, guest panel, results controls, drawer Escape/focus, chips, long hotel names, card actions and empty/error states. Confirm no horizontal overflow. TEST badge remains visible; booking/payment unavailable.
5. Exercise invalid query, loading, provider-empty/filter-empty and safe error/stale states with local fixtures or already obtained evidence, without spending the one-search budget on repeated provider calls. Stale state must wait for explicit action; do not click refresh against the provider merely to test it.

## 15. Safety and unchanged scope

BACKEND CHANGED: NO. DB RUNTIME CHANGED: NO. productionGate CHANGED: NO.
HOTELBEDS RUNTIME BEHAVIOR CHANGED: NO; frontend dispatch/dedup/return UX changed as documented.
BOOKING CHANGED: NO. PAYMENT CHANGED: NO. PRODUCTION INFRASTRUCTURE CHANGED: NO.
render.yaml CHANGED: NO. render.production.yaml CHANGED: NO.
Hotelbeds remains TEST/read-only; LIVE/booking/cancellation/sales/charges/refunds remain disabled.
EXTERNAL HOTELBEDS CALLS: 0. ALL EXTERNAL CALLS: 0. REAL DB MUTATIONS: 0.
No provisioning, billing, Render API/browser automation, deploy, env modification, migration, backup/restore, email, git add/commit/push/reset/restore/clean.

## 16. Final audit

Working tree is reserved for owner review. Final ordered status/diff-stat/diff/diff-check is performed after this report update. New untracked 5A sources/tests/report were reviewed separately because ordinary git diff omits them. Older reports and all six tracked 4C.1 files remain unchanged. Final audit scope is exactly the 23 files listed below; no staged changes or remote actions.

## 17. Exact changed/new files

Modified (18):

1. frontend/src/components/GuestPanel.jsx
2. frontend/src/components/HomeSearch.css
3. frontend/src/components/HomeSearch.jsx
4. frontend/src/components/LocalResultsFilters.jsx
5. frontend/src/components/ResultsToolbar.jsx
6. frontend/src/components/TourCard.jsx
7. frontend/src/pages/Results.jsx
8. frontend/src/styles/Results.css
9. frontend/src/utils/detailsPresentation.js
10. frontend/src/utils/homeSearch.js
11. frontend/src/utils/hotelOfferDisplay.js
12. frontend/src/utils/localOfferFilters.js
13. frontend/src/utils/money.js
14. frontend/src/utils/resultsPresentation.js
15. frontend/src/utils/selectedOfferSnapshot.js
16. frontend/tests/globalUxPolish.test.mjs
17. frontend/tests/rateAwareFiltering.test.mjs
18. frontend/tests/resultsAcceptance.test.mjs

New (5):

19. frontend/src/components/ResultsNotice.jsx
20. frontend/src/services/resultsSearch.js
21. frontend/src/utils/searchExperience.js
22. frontend/tests/searchExperience.test.mjs
23. SPRINT_5A_SEARCH_EXPERIENCE_RESULTS_QUALITY_REPORT.md
