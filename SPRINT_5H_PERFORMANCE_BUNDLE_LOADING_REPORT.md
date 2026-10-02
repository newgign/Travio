# Sprint 5H — Performance, Bundle & Loading Optimization

Status: CODE / OFFLINE: PASS. Focused 5H: 91/91 PASS. Full frontend: 664/664 PASS. Lint/build/verifier/diff-check: PASS. OWNER BROWSER ACCEPTANCE: NOT RUN. No deploy. Hotelbeds TEST/read-only; LIVE, real booking and payments disabled; production infrastructure paused.

## 1. Initial baseline

Sprint 5G/5G.1/5G.2 CODE/OFFLINE and deployed owner acceptance PASS in its documented scope. Latest frontend 573/573, focused 83/83; Home 320 acceptance covers upper/middle flow, not independently screenshot-captured Footer. Prior untested registration/password/second-account/booking READY/details checks are not upgraded. Historical backend 399/399 is not a fresh 5H run.

RECOVERED WORK BEFORE CONTINUATION: four modified files (App.jsx, CollectionImage.jsx, HotelImage.jsx, TestDestinationCards.jsx) and three new files (RouteBoundary.jsx, performanceBundleQuality.test.mjs, this report). Route splitting, eager CSS cascade, safe route fallback, image decoding hints and the passing focused/full/lint/build checks were already completed. The exact paths are listed in sections 26–27. RouteStyles.css is absent from the recovered tree; the final implementation imports existing CSS directly in App.jsx.

WORK COMPLETED AFTER CONTINUATION: repeated the requested Git recovery audit, read all seven Sprint 5H files, reviewed route guards/fallbacks/image behavior and the 26 final JS artifacts, and completed report precision and final diff checks. Implementation and tests preserved unchanged; prior 91/91 and 664/664 results remain applicable and were not rerun. Verifier already passed after the final source change: 208 backend syntax files, 442 scanned files, findings=[]. No architecture replacement.

## 2. Git baseline

Started 2026-10-02 on develop, HEAD **8c88399** (`docs: record Sprint 5G owner browser acceptance`). Ran status --short, branch --show-current, log -1, diff --stat and full diff before editing. Tracked baseline clean; final 5G report committed. Preserved unrelated README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, `tatus --short` and unusual old filename containing `record final staging release candidate acceptance`. Prior sprint reports untouched. No reset/restore/clean/staging/commit/push.

## 3. Performance architecture audit

Read main/App/router, actual route imports, ConsumerShell/ConsumerErrorBoundary, ProtectedRoute/SessionBoundary/useSession, global FavoritesProvider, account stores, Results cache, selected-offer loader, image components, CSS imports, Vite/package configuration and relevant existing regression contracts. Existing React/Vite capabilities suffice; no analyzer dependency.

main remains StrictMode -> SessionBoundary -> FavoritesProvider -> BrowserRouter -> App. App originally eagerly imported every routed page, including all AdminPanel tabs, checkout steps/payment client, voucher operations and account pages. The baseline build contained a single JS chunk. Imports do not prove every dependency in package.json is bundled: source/build graph is the evidence. No speculative attribution to unused recharts/server-side packages.

## 4. Eager import audit

Home, NotFound, router/auth guard, ConsumerShell, metadata/navigation and the new small RouteBoundary remain eager. Home includes its existing search controls, image references, catalog loader, navbar/footer and FAQ. Shared session/Favorites/authFetch and search intent cache stay available without changing ownership. Thirteen noncritical page modules are lazy. Production build graph tests verify none of those thirteen page implementations is in the entry's transitive static import closure. No barrel import defeats splitting.

## 5. Route splitting strategy

Module-scope React.lazy declarations for Help, Contacts, Results, Favorites, TourDetails, Login, Register, Checkout, MyBookings, BookingDetails, Profile, Voucher and AdminPanel. Existing URLs, aliases, elements and props unchanged. Login/Register are small wrappers but share a deferred AuthPage chunk; they defer credential-form code rather than duplicating it. Automatic Vite chunking only: no manual vendor grouping, threshold change or warning suppression.

## 6. Auth/session safety

SessionBoundary remains above the router/providers and withholds the app until validated guest/authenticated resolution. ProtectedRoute remains outside each private lazy child and checks token/validated identity and adminOnly before rendering that child. Guest private requests never evaluate the protected lazy module in new execution tests. Normal user does not evaluate AdminPanel; authorized admin retains /admin/bookings initialTab. Favorites intentionally keeps its existing guest auth-required view under root bootstrap, not a newly introduced redirect. No auth/storage/401/returnTo changes.

## 7. Route loading fallback

One new RouteBoundary reuses ConsumerErrorBoundary and wraps Routes in Suspense. RouteLoading uses already loaded account-page/account-state styles, a single H1 and role=status text “Подождите, страница загружается…”. No private fields, fake percentages, animation library, autofocus or data request. No key on Suspense or route tree, so ordinary rerenders do not introduce remounts. Existing location key/path/search resets only the error boundary state after navigation.

Existing ConsumerShell intentionally excludes admin/checkout/voucher and canonical booking-details paths. The additional boundary covers those lazy imports too without changing shell layout. Rejected imports use existing fixed generic error and native Home link (full reload recovery), not raw stack/URL. There is no automatic import retry loop. Existing boundary class behavior is tested; SSR does not independently exercise a client error boundary catching an actual network chunk failure.

## 8. Admin splitting

AdminPanel and its tab/component/service graph move out of initial consumer JS. Largest lazy route chunk: AdminPanel-CTQurAli.js, 82.30 kB / gzip 18.94 kB. Existing protected adminOnly routes, initialTab, effects, APIs and three hook warnings remain unchanged. Importing route code does not execute its component effects; no admin API invoked in tests.

## 9. Checkout/Voucher/Booking splitting

Checkout, Voucher, BookingDetails and MyBookings are lazily imported behind their original guards. Routes retained, no feature deletion. Provider, payment, refund, cancellation and voucher-generation handlers/gates untouched and not executed. No booking record or account created. These page modules are absent from initial Home JS graph. Historical price infrastructure remains intact.

## 10. Search/Results/Details preservation

Results and TourDetails are deferred pages. HomeSearch still calls beginResultsSearch and navigates with the existing URL; module cache identity and validation remain unchanged. TourCard still carries selectedOffer/resultsOrigin in location.state; RouteBoundary never transforms navigation state/query. Lazy imports are cached per module and declared outside render; revisit does not reevaluate modules. Existing 5A/5B tests remain unmodified and pass. No search, rate refresh or resolver prefetch introduced.

## 11. Context/provider preservation

No changes to main, FavoritesContext, session, profileStore, bookingHistory or accountListStore. Providers stay above navigation; lazy page code does not mount another provider. New tests retain Favorites data across a route import then verify logout invalidation, retain booking cache identity/filter across imports then isolate next user, and check Profile's existing bootstrap-response reuse and page-local lifecycle. Existing full account/session regression supplies pending-response/401/user-switch behavior coverage.

## 12. Image loading audit

Added decoding=async to TestDestinationCards and CollectionImage. HotelImage defaults decoding to async while allowing explicit caller override. Existing loading=lazy on result/saved/booking cards and gallery thumbnails retained. Existing source-specific failure handlers, neutral hotel fallback, Centre Portugal abstract CSS fallback, alt text and dimensions/container layout remain. No image content, binary asset, URL, dependency or remote fallback added. No image conversion/download.

## 13. Hero/LCP handling

Hero remains eagerly imported by eager Home and continues its decorative local CSS background image; it is not deferred through a lazy image/observer. Main hotel gallery photo retains loading=eager and decoding=async. No new preload or fetchPriority claim. Large PNG sizes remain a documented limit; no browser LCP measurement made.

## 14. Network behavior

Normal Home retains only its own existing catalog loader for discovery; removed special-offers request remains absent. Session validation and authenticated Favorites reads remain legitimate existing own-app behavior. Route code loads on demand; no aggressive route prefetch, data prefetch, polling, service worker or provider warming.

New tests intercept fetch and exercise actual module evaluation/streaming SSR without component effects: zero requests during import/render/build. Other frontend suites use deterministic mocks/offline fixtures. External calls: 0. Hotelbeds calls: 0. Payment/email/SMS/push calls: 0. Real DB mutations: 0. No staging/browser/network operation.

## 15. Dependency audit

package.json, lockfile and vite.config.js unchanged. No analyzer/router/state/image/performance package, upgrades or warning suppression. Shared runtime chunks are selected automatically by Vite, not a hand-built vendor bucket. Installed but unused package entries were not removed for cosmetic size claims.

## 16. CSS/build behavior

CSS audit found existing global admin universal/font/body rules and cross-route selectors. Deferring that CSS could change typography/cascade only after navigating to a lazy route. App now imports the existing CSS modules directly in the original eager dependency order. Page CSS imports remain deduplicated; no new CSS rules or redesign. Final build emits exactly one stylesheet, **index-BzNDx__O.css**, byte-for-byte identical to the pre-edit baseline captured in OS-temp sprint5h-baseline.css. Thus this sprint splits route JavaScript, not CSS; avoids late route-CSS appearance/order changes. An intermediate CSS @import aggregation experiment duplicated output; it was removed before final testing. Final output has no duplicate route CSS artifacts.

## 17. Accessibility

Route fallback has semantic main/H1/status with no repeated live regions or fake progress. It contains no private values or focus capture. Existing native Home recovery link and page focus/keyboard behavior preserved. Actual assistive-technology acceptance NOT RUN.

## 18. Responsive preservation

Existing CSS is byte-identical, including 320/390/768/1440 source contracts, consumer navbar and account wrapping. Fallback reuses responsive account shell width/padding. Native decoding hints do not change geometry. New tests parse/check CSS and markup; they are not measured browser overflow/CLS evidence.

## 19. Before build measurements

Fresh pre-edit frontend build with the existing TEST flag process-only: index-CM91qqST.js **502.85 kB / gzip 142.85 kB**, one JS chunk; index-BzNDx__O.css **106.43 kB / gzip 19.41 kB**. Vite >500 kB warning present. Hero/country PNGs 2.66–3.09 MB unchanged. Build output and local artifact inspection used, no analyzer.

## 20. After build measurements

Final entry **index-DFkzcWZ8.js: 244.80 kB / gzip 76.47 kB**. Largest route/lazy chunk AdminPanel **82.30 kB / gzip 18.94 kB**. Total JS chunks: **26**, including automatically generated shared modules. No JS chunk exceeds 500 kB; warning absent. CSS remains **106.43 kB / gzip 19.41 kB**.

Entry alone is not the complete initial load. index.html also modulepreloads jsx-runtime-BDf_igt8.js and authFetch-9h7BOSgf.js. The production graph confirms those three comprise the transitive initial static JS closure: **300,169 UTF-8 bytes (~300.17 kB)**, sum of Vite-reported gzip approximately **96.65 kB**. Admin and other route pages are absent from that closure. Vite natural preloads were not suppressed.

## 21. Chunk table

All 26 JS artifacts from final frontend/dist/assets. kB/gzip columns reproduce Vite output; byte column is filesystem UTF-8 length (small rounding/string-length differences are not additional assets).

| JS artifact | UTF-8 bytes on disk | Vite kB | Vite gzip kB |
| --- | --- | --- | --- |
| index-DFkzcWZ8.js | 244809 | 244.80 | 76.47 |
| AdminPanel-CTQurAli.js | 82309 | 82.30 | 18.94 |
| jsx-runtime-BDf_igt8.js | 54469 | 54.46 | 19.57 |
| Checkout-C1gwGtyj.js | 27528 | 27.52 | 8.20 |
| Results-DwzHmHCu.js | 23878 | 23.87 | 7.34 |
| TourDetails-gIdOTqo9.js | 12545 | 12.54 | 4.41 |
| Profile-DMi7TCz3.js | 11382 | 11.38 | 3.90 |
| BookingDetails-CpFq_gb0.js | 8579 | 8.57 | 2.61 |
| Voucher-B9ZmDD92.js | 7219 | 7.21 | 2.43 |
| detailsPresentation-Dy0_twjC.js | 7039 | 7.03 | 3.18 |
| savedAccountPresentation-BAzwrBhz.js | 6179 | 6.17 | 2.48 |
| MyBookings-IktzZgc-.js | 5796 | 5.79 | 2.20 |
| AuthPage-DuhCu_Ih.js | 5348 | 5.34 | 2.51 |
| Favorites-AlJJExtk.js | 4061 | 4.06 | 1.75 |
| AccountStates-CqmnCEmR.js | 1933 | 1.93 | 0.84 |
| Help-CVcO83Ce.js | 1778 | 1.77 | 0.76 |
| bookingHistory-DTCQcJDq.js | 1557 | 1.55 | 0.83 |
| feedbackPresentation-oc0g6gT4.js | 1396 | 1.39 | 0.56 |
| authFetch-9h7BOSgf.js | 891 | 0.89 | 0.61 |
| Contacts-Bgrj0WSA.js | 807 | 0.80 | 0.47 |
| StayPrice-CgPdwjuR.js | 604 | 0.60 | 0.41 |
| HotelImage-BHGb6QVt.js | 491 | 0.49 | 0.37 |
| money-DV-55iup.js | 384 | 0.38 | 0.29 |
| profileService-CHvJLtuC.js | 312 | 0.31 | 0.18 |
| Register-CEirGjmV.js | 165 | 0.16 | 0.15 |
| Login-BrGXemMW.js | 162 | 0.16 | 0.15 |

frontend/dist is ignored, confirmed with git check-ignore; build artifacts remain ignored/uncommitted. Hashed filenames are measured evidence only, not hardcoded assertions. No stale output retained by Vite's normal build.

## 22. Bundle delta

Compared with the 5G baseline using Vite displayed sizes: entry reduction **258.05 kB (51.32%)**, entry gzip reduction **66.38 kB (46.47%)**. Including static shared chunks, initial JS reduction is approximately **202.68 kB (40.31%)**; sum of reported initial gzip falls from 142.85 to ~96.65 kB (~32.34%). Splitting defers code rather than deleting it; total downloaded code across all routes is not claimed reduced. No Lighthouse score, bandwidth timing, LCP/CLS measurement or “site is X% faster” claim.

## 23. Warning status

Vite >500 kB warning: **REMOVED naturally**. Warning threshold modified: **NO**. No warning filter, manualChunks or custom minifier setting. Existing lint warnings remain. CSS/large PNG optimization was not disguised as completed work.

## 24. Tests

One focused suite: frontend/tests/performanceBundleQuality.test.mjs, **91/91 PASS** (90 subtests plus enclosing test), zero skipped/todo. Actual React.lazy page evaluation via Vite/streaming SSR; guest/unknown/user/admin gates before lazy evaluation; safe pending/error presentation; all existing routes/aliases; module reuse; providers/store lifecycle; search/selected-offer preservation; image loading/decoding/fallbacks; responsive source contracts; package/config safety; actual in-memory production build graph and static payload closure; zero-network guard.

Existing tests unchanged, no removed functionality/assertions. First new focused run exposed a test-harness issue: Vite dev-server setup left NODE_ENV=development before the in-memory build, inflating React shared code. The measurement now scopes NODE_ENV=production during build and restores it afterward. No product/test limit was weakened. Final focused and full runs both pass. Image prop ordering preserves the old main-image markup contract.

## 25. Regression

| Gate | Result |
| --- | --- |
| Focused 5H | PASS 91/91 |
| Full frontend | PASS 664/664 |
| Lint | PASS; 0 errors, 3 inherited admin hook warnings |
| Build | PASS; 26 JS chunks, no >500 kB warning |
| Verifier | PASS; 208 backend syntax files; 442 scanned files; findings=[] |
| diff-check | PASS |
| Full backend | Not rerun; unchanged; prior 399/399 historical only |

Used required node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit with focused path and frontend/tests/*.test.mjs; npm.cmd --prefix frontend run lint/build; node backend/scripts/sprint3mVerify.cjs; git -c core.safecrlf=false diff --check. All final tests zero failures/cancelled/skips/todo. Build TEST flag process-only. OS-temp sprint5h-focused.log / sprint5h-frontend.log; artifact inventory sprint5h-chunks.json. No env-file edit.

## 26. Exact modified files

1. frontend/src/App.jsx — lazy route declarations, shared route boundary, explicit unchanged CSS cascade imports.
2. frontend/src/components/CollectionImage.jsx — async decoding hint.
3. frontend/src/components/HotelImage.jsx — default async decoding, caller override preserved.
4. frontend/src/components/TestDestinationCards.jsx — async decoding hint.

## 27. Exact new files

1. frontend/src/components/RouteBoundary.jsx — Suspense loading presentation plus reuse of existing error boundary for all routes.
2. frontend/tests/performanceBundleQuality.test.mjs — sole focused performance suite.
3. SPRINT_5H_PERFORMANCE_BUNDLE_LOADING_REPORT.md — sole 5H report.

## 28. Warnings

Three inherited react-hooks/exhaustive-deps warnings: admin BookingsTable, NotificationsTable, RefundsTable. Existing multi-megabyte PNGs remain. Normal LF/CRLF notices. No new lint warnings/dependencies and no bundle-size warning in final build.

## 29. Limitations

OWNER BROWSER ACCEPTANCE: **NOT RUN**. No deploy/browser performance/network measurement. CSS kept eager to preserve existing global cascade; no CSS load reduction claimed. SSR executes imports/rendering but not mounted effects/real failed chunk fetch recovery. Existing regression mocks verify data contracts; actual navigation latency, focus, no-flash behavior and image rendering await owner. Cache lifetimes/provider placement preserved by source and execution tests, not a new browser audit.

Backend changed: NO. DB/schema changed: NO. Hotelbeds behavior changed: NO. Booking/payment runtime changed: NO. No database/container or production infrastructure operation. No staging registration/password mutation. No provider/payment/email call. Prior skipped owner acceptance remains unchanged.

## 30. Owner browser acceptance checklist

Prepare only after separate authorized deployment; use existing account.

- Desktop Home hard reload: visuals and Hero, Centre Portugal artwork, header/footer, no blank loading or raw errors.
- Navigate Home -> Results form without submitting a new provider search; Help/Contacts, Login, Profile, Favorites, My Bookings; existing authorized admin route. Back/forward and route revisits retain intended state and login.
- Slow chunk loading: safe status text then page; no private flash while identity resolves, no missing/late-changing CSS, no unexpected logout. If a chunk failure occurs naturally, fixed safe error and Home recovery; do not invent acceptance of untested failure states.
- At 390/320 (768/1440 if available): no clipped fallback, overlap or overflow, existing layouts/focus/images preserved.
- Network: page JS chunks load on demand; initial Home does not load Admin/Checkout/Voucher/BookingDetails code. Existing own account/catalog requests remain. No unintended Availability, Content, CheckRate, Booking, Cancellation or payment operation. Browser observation is not an independent server-side traffic audit.
- Do not create accounts/bookings, change passwords or initiate fresh Hotelbeds search merely for this acceptance. Booking READY/details remain untested without existing records.

All 5H changes left unstaged. Unrelated owner files and prior reports preserved. No deploy, git add, commit or push.

## Final Owner Render Browser Acceptance

This section records subsequently supplied owner browser evidence and supersedes the earlier pending owner acceptance status only for the tested scope below. This is owner-reported evidence, not an independent browser run. Earlier technical results remain historical; no tests, build or verifier were rerun for this report-only update.

### Confirmed owner observations

- Home opened correctly after deployment.
- Login loaded as a separate lazy JS chunk.
- Profile loaded separate route-related JS chunks and rendered correctly after lazy navigation.
- Authentication state remained preserved.
- `/admin` opened using an existing authorized admin account. Network filtered to JS showed a separate `AdminPanel-*.js` chunk when navigating to Admin.
- Admin UI and System/3A rendered correctly.
- No blank route screen, noticeable CSS/layout shift after route navigation or raw lazy-load error was observed.

| Owner acceptance check | Result |
| --- | --- |
| DEPLOYED STAGING | PASS |
| OWNER BROWSER ACCEPTANCE | PASS — tested scope |
| HOME INITIAL LOAD | PASS |
| LOGIN LAZY CHUNK | PASS |
| PROFILE LAZY CHUNK | PASS |
| ADMIN LAZY CHUNK | PASS |
| ROUTE-LEVEL CODE SPLITTING | PASS |
| ADMIN CODE ON-DEMAND | PASS |
| AUTH STATE PRESERVED | PASS |
| ADMIN ROLE ACCESS PRESERVED | PASS |
| CSS/LAYOUT STABLE | PASS — observed |

Network screenshots were filtered to JS. They establish route chunk loading, not an independent Hotelbeds/API traffic audit. These observations do not establish measured page-speed improvement or upgrade other untested checklist items.

### Retained technical results

| Check / measurement | Result |
| --- | --- |
| Focused 5H | 91/91 PASS |
| Full frontend | 664/664 PASS |
| Lint | PASS |
| Build | PASS |
| Verifier | PASS |
| diff-check | PASS |
| BEFORE main JS | 502.85 kB / gzip 142.85 kB |
| AFTER entry | 244.80 kB / gzip 76.47 kB |
| Largest lazy chunk | Admin 82.30 kB / gzip 18.94 kB |
| JS chunks | 26 |
| Entry reduction | 258.05 kB / 51.32% |
| Initial JS dependency-chain reduction | ~40.31% |
| Bundle >500 kB warning | REMOVED |
| Warning threshold modified | NO |
| Backend / DB / Hotelbeds / booking / payments | UNCHANGED |

Only this report was changed for the acceptance update. Source code, tests, env and runtime configuration were not changed. No git add/commit/push or deployment was performed; the report remains unstaged for owner review.
