# Sprint 5G — Home & Discovery Quality

Status: Sprint 5G.2 CODE / OFFLINE: PASS. Focused 5G: 83/83 PASS. Full frontend: 573/573 PASS. Lint/build/verifier/diff-check: PASS. OWNER BROWSER ACCEPTANCE: IN PROGRESS / REQUIRES RECHECK after deployment. No deploy by this follow-up. Hotelbeds TEST/read-only; LIVE, real booking, payments and email delivery remain disabled; production infrastructure paused. Earlier sections retain historical 5G evidence.

## 1. Initial state

Started from develop, HEAD **15be923** (`docs: record Sprint 5F owner browser acceptance`). Before editing ran git status --short, branch --show-current, log -1 --oneline, diff --stat and full diff. Tracked tree was clean and final 5F owner acceptance was committed: the 5G baseline gate passed.

At the original 5G start no partial implementation existed. The post-limit continuation recovered the 14 modified files listed in section 24 and all three new files listed in section 25, including the completed focused suite and this report. Preserved unrelated untracked README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, `tatus --short` and the unusual filename containing `record final staging release candidate acceptance`. Prior reports untouched.

**RECOVERED WORK BEFORE CONTINUATION:** explicit catalog/special-offer states and retry, validated catalog responses, guarded Home search submit, factual destination and historical-price presentation, image fallback and responsive adjustments, useHomeLoad, the 90/90 focused suite and this report. Exact recovered paths are sections 24–25. Focused 90/90, lint and build were already completed against this implementation.

**WORK COMPLETED AFTER CONTINUATION:** recovered status/branch/HEAD/stat/full diff, reviewed existing source and new files, preserved implementation/tests, repeated the requested full frontend and verifier checks, and updated this report. No implementation changes after recovery; focused/lint/build were not rerun unnecessarily. Final audit includes status, diff-stat, full diff and diff-check; all scoped changes remain unstaged.

**WORK COMPLETED:** reused and hardened Home, its search entry, discovery cards, saved promotion presentation and own-API loading. One focused suite, one report, no dependency or provider/runtime change.

Baseline 5F frontend 490/490 and JS 505.68 kB / gzip 143.21 kB are historical. Backend 399/399 is the historical 5D result, not a fresh 5G run.

## 2. Homepage architecture audit

Traced App `/` -> Home -> Navbar, HeroBanner/HomeSearch, PopularDestinations/TestDestinationCards, HotTours/HotToursSection/HotTourCard, Advantages, FaqSection and Footer. Inspected HomeSearch/guest helpers, Results entry/validation/cache contracts, site config, old country data, image components, Home/hero/collections/search/consumer CSS and existing Home/search/catalog/global/help regression contracts.

Home initially loaded catalog data in a page effect and special offers in a separate component effect. Catalog malformed responses could become []; unknown discovery status could fall through to data/empty. Special offers initialized as [] and swallowed load errors, making loading/failure indistinguishable from absence of offers. Search validation was already shared and correct but had no synchronous duplicate-navigation guard. Existing destination cards were locations, not hotel cards. Popularity was unsupported copy, not measured data.

No backend defect requiring a change was identified. Read-only source tracing of `/catalog/test-options`, testCatalogReadiness, `/special-offers` and priceHistoryService established their local data contracts; none was called externally.

## 3. Existing sections and data sources

| Section | Actual source and meaning |
| --- | --- |
| Hero/search | Existing local hero PNG; shared HomeSearch and homeSearch.js validation; catalog options from own app API |
| Directions/countries | `/api/catalog/test-options`: locally imported provider catalog plus configured scopes; hotelCount means imported catalog rows, not available rooms |
| Special offers | `/api/special-offers`: saved price_history comparisons; TEST returns [] by existing backend gates |
| Benefits | Static descriptions of implemented search/filter/details features; no metrics |
| FAQ | Existing helpContent.js, shared with Help |
| Header/footer/contacts | Existing routes and site.js canonical contact configuration |

The old CountrySection and data/popularDestinations.js are not imported by current Home. Their legacy static country links are not introduced or rewritten in this sprint. Country discovery remains in the existing catalog-driven block, labelled by country and destination. No supported code is invented from image mappings or display labels.

## 4. Hero

Badge now explicitly says `Asedeliya · поиск отелей`; existing meaningful H1 and comparison explanation retained. Primary CTA remains “Найти отели”. Scoped CSS resolves the older collection stylesheet's competing hero padding/min-height with explicit desktop/tablet/mobile spacing. No full redesign, new asset or unverifiable marketing claim.

## 5. Search entry

Reused buildHomeSearch, initialHomeSearch, guest panel, validation, one-room support and Results URL contract. No second search implementation. Added a small submitHomeSearch wrapper with a synchronous ref lock: invalid fields leave submission available; a valid submit calls existing beginResultsSearch and navigation once. Pending button/form semantics make the transition explicit. No provider request is made by the form itself.

Existing dates/nights/adults/children/ages/destination are serialized unchanged. Existing visible defaults remain; discovery links do not supply an invented date. Diagnostic search behavior and downstream exact-offer handling unchanged. Native form Enter submission, field labels/errors and guest-panel Escape/focus behavior retained.

## 6. Destination discovery

Renamed the unsupported “Популярные направления” heading to “Направления по странам”. Copy explains that a card prepares the form and search starts only after submission. Cards use only the actual catalog rows; their titles are destination names and country labels, not hotel names. Ready cards explicitly say “Выбрать даты и гостей”. Zero-import rows remain noninteractive with truthful “отели пока не загружены”. No live room counts, reviews, popularity metrics or dates added.

Destination link remains `/results?provider=hotelbeds&countryCode=...&destinationCode=...`. With no check-in it resolves to Results INITIAL/search form, not a provider search. Existing 5A validation verifies this behavior.

## 7. Country discovery

Existing `#countries` header anchor is retained in the same destination block. Country names derive from catalog identities and the existing display-label helper. No duplicate country section or additional country codes. Local image mappings only illustrate known identities; missing mappings receive the existing neutral direction fallback.

## 8. Special offers/promotions

Backend source shows saved exact-rate price history, with TEST excluded and LIVE/threshold/readiness gates. Under the current TEST baseline the endpoint returns []; no promotional fixture was inserted into any DB.

Moved the existing own-API read into loadHomeSpecials alongside the catalog loader. HotTours now distinguishes loading/unknown, error with explicit retry, successful empty/unqualified list and supported historical promotions. Empty explains that lack of confirmed price reductions does not mean no hotels exist in search and links to the search form. HotToursSection retains its established evidence-only renderer; its title/copy now identifies price history. No fake static offers fill the section.

## 9. Truthful pricing/discount audit

**PASS — CODE/OFFLINE.** Added shared confirmedPriceDrop guard: Hotelbeds LIVE snapshot, price_history evidence, finite positive current/previous amounts with a real reduction, currency code and parseable observation time. TEST, absent/manual evidence, zero/nonfinite prices, invalid dates/currency cannot become a Home promotion. The backend fingerprint supplies comparison identity/currency/occupancy guarantees; the frontend does not invent that evidence.

Percent is calculated from the two recorded amounts, never a hardcoded -30%. “Ранее зафиксировано” remains historical. Added “Цена на момент наблюдения, не текущая доступность”; observation copy says “Зафиксировано”, not a new live check. Removed the unsubstantiated rating display and stopped rounding invalid star categories into invented stars. No countdown, last-room, best-price, testimonial or availability claim. Valid old/new prices are shown only for evidence-backed comparisons. Stored-detail CTA retains the same selected snapshot route and does not become a booking CTA.

## 10. CTA audit

**PASS — CODE/OFFLINE.** Native search submit; semantic destination Links to a preselected form; explicit catalog/offer retry buttons; empty promotions Link to `/#home-search`; saved offer Link to its existing Details route; header account/navigation, FAQ toggle/help link and footer help/contact links remain meaningful. Retry buttons are disabled when a handler is absent. No href="#", javascript:void, fake alert, empty click handler or new purchase CTA. Route/anchor integrity checked offline; actual clicks in staging remain owner work.

## 11. Contacts/social audit

Existing site.js phone/email/city preserved, including existing environment overrides. ContactDetails retains accessible tel/mailto links. No social URLs are configured in current Home/footer; no social section or handle invented. No contact form or delivery operation added.

## 12. Trust/benefits

Four existing factual capabilities remain: search, prices, filters and selected details. Heading is now “Возможности Asedeliya”, avoiding implied popularity evidence. Replaced the credit-card icon with a price icon so the benefits do not visually suggest enabled payments. No 24/7 support, refunds, guaranteed booking, partnership or scale metrics claimed.

## 13. Loading/empty/error

A small page-owned createHomeLoad in the existing homeCatalog service and useHomeLoad hook share identical loading logic for the two existing own-API reads. No global cache/store, persistent data or new provider boundary. Initial state is loading; only a validated array sets ready. Unknown UI status renders a skeleton. Errors store no raw exception and show fixed text. In-flight promises deduplicate retry clicks; dispose aborts the request and invalidates late responses. Cancellable zero-delay mount scheduling avoids dispatch from an immediately cancelled mount. No background retry or polling.

Catalog validates response shape, codes and nonnegative integer imported hotel counts; malformed data is ERROR, not EMPTY. Special offers validates success/list structure. Retry repeats only the same own app GET. Ready catalog is shared between the form and cards; it is not fetched separately for each section.

## 14. Header/navigation

Navbar implementation unchanged. Home/Hotels/Countries/Search/Contacts and guest/authenticated/admin controls preserved. Existing FavoritesProvider and validated session may make their own established account reads for authenticated users; these are separate from the two Home discovery requests. No auth architecture or mobile menu behavior changed. Tests SSR guest/user/admin headers and retained menu semantics.

## 15. Footer

Implementation unchanged: canonical contacts, navigation, Help/booking/cancellation/privacy pages and © 2026 Asedeliya. Those information pages are not upgraded to legal guarantees. No social placeholders, fake service or broken route introduced.

## 16. Accessibility

Single H1, section H2/card H3, native labels/form/links/buttons retained. Search busy/disabled pending; loading role=status/aria-busy; failure role=alert; retry labels identify the relevant data. Existing focus-visible and reduced-motion behavior retained. Destination images now name the illustrated destination; hero is decorative/aria-hidden. No positive tabindex, inaccessible clickable div, timed toast or notification framework. Keyboard and screen-reader browser acceptance NOT RUN.

## 17. Responsive

Source/CSS contracts checked for 320/390/768/1440. Existing search 5-column -> 2-column -> 1-column and guest panel mobile normal flow preserved; existing destination wrapping and collection/benefit/footer breakpoints reused. New Home overrides bound hero spacing, wrap feedback/long labels and allow full-width mobile CTAs with at least 44px height. No navbar CSS edits. These are source/SSR/CSS checks, not measured browser overflow or screenshots.

## 18. Images

No new assets. Existing local country/destination illustrations retained with meaningful alt and on-error fallback; hero remains decorative and has a background color fallback. CollectionImage previously substituted the large hero image for a missing hotel photo. It now uses a neutral “Фото недоступно” fallback and source-specific loaded/failed state, with no fallback request loop. Existing photo containers, aspect ratios and object-fit preserve layout intent. Large PNG optimization deferred to 5H.

## 19. Performance

Build JS **509.28 kB / gzip 144.34 kB**; CSS **106.47 kB / gzip 19.35 kB**. Compared with 5F, JS +3.60 kB and gzip +1.13 kB, from loading/retry lifecycle, validation and truthful copy. No new dependency, carousel, animation framework, code-splitting work or large asset. Existing >500 kB warning remains. No measured performance improvement claimed.

## 20. Network/provider safety

Home-specific requests remain own GET `/api/catalog/test-options` and `/api/special-offers` (configured API base may replace `/api`). Source tracing confirms local catalog/history reads and existing in-memory readiness gates, not fresh Availability/Content/CheckRate. Destination navigation lacks dates and prepares the search form. Explicit valid search remains the existing user-controlled 5A flow; it was not executed against a provider.

External calls: **0**. Real Hotelbeds Availability/Content/CheckRate/Booking/Cancellation calls: **0**. Payment/email/SMS/push/external-notification calls: **0**. Tests use deterministic fetch mocks, SSR and the existing offlineNetwork preload. Existing full frontend suites include simulated provider methods/local fixtures, not real provider traffic. No polling or background offer prefetch added.

## 21. Backend/DB boundary

Backend changed: **NO**. DB/schema/migrations changed: **NO**. Real application/remote DB mutations: **0**. No fake offers/destinations inserted. No disposable DB needed. Hotelbeds behavior, booking/payment/email runtime and credentials unchanged. No env-file edit, Render billing/config/provisioning, production action or deploy. Historical backend 399/399 not rerun.

## 22. Tests

One new suite: `frontend/tests/homeDiscoveryQuality.test.mjs`, **90/90 PASS** (89 subtests plus enclosing test), zero failures/skips/todo. Covers Home SSR/H1/hero, real shared submit/validation/dedup, supported destination identities and no-date routing, catalog/special API contracts, malformed response rejection, loading/error/empty/ready, explicit retry/dedup/disposal, recorded price evidence and fabricated-data exclusion, truthful benefits, contacts/routes/anchors, guest/user/admin header, images, keyboard semantics, CSS breakpoints, dependency/provider boundaries and intercepted own requests.

Existing Home+5A focused regressions passed 70/70 before the new full run. All prior tests retained unchanged. New focused and full runs passed without test failures. These are store/helper execution plus SSR/source/CSS contracts, not mounted browser or rendered geometry evidence; click/network owner acceptance remains NOT RUN.

## 23. Regression

| Gate | Result |
| --- | --- |
| Focused 5G | PASS 90/90 |
| Full frontend | PASS 580/580 |
| Lint | PASS, 0 errors; 3 inherited admin hook warnings |
| Build | PASS |
| JS / gzip | 509.28 kB / 144.34 kB |
| CSS / gzip | 106.47 kB / 19.35 kB |
| Bundle warning | Existing >500 kB warning present |
| Verifier | PASS; 208 backend syntax files; 439 scanned files; findings=[] |
| diff-check | PASS |
| Backend | Unchanged; no fresh run; prior 399/399 historical only |

Commands: required Node offlineNetwork.cjs preload with --test --test-concurrency=1 --test-force-exit for homeDiscoveryQuality.test.mjs and frontend/tests/*.test.mjs; npm.cmd --prefix frontend run lint/build; node backend/scripts/sprint3mVerify.cjs; git -c core.safecrlf=false diff --check. Build TEST flag was process-only. Logs: OS-temp sprint5g-existing.log, sprint5g-focused.log and sprint5g-frontend.log. No tests skipped or weakened.

Post-limit continuation on 2026-09-30: full frontend rerun PASS 580/580, zero failures/cancelled/skips/todo; log OS-temp sprint5g-cont-frontend.log. Verifier rerun PASS: backendSyntaxFiles=208, secretScanFiles=439, findings=[]. Source/tests remained unchanged, so prior focused 90/90, lint and build results remain applicable. Backend regression was not rerun.

## 24. Exact modified files

1. frontend/src/components/Advantages.jsx — factual heading and price icon.
2. frontend/src/components/CollectionImage.jsx — neutral source-specific fallback.
3. frontend/src/components/HeroBanner.jsx — explicit brand/search identity.
4. frontend/src/components/HomeSearch.jsx — shared guarded submit and pending state.
5. frontend/src/components/HotTourCard.jsx — recorded-price wording, evidence guard and factual category presentation.
6. frontend/src/components/HotTours.jsx — explicit loading/error/empty/ready and retry.
7. frontend/src/components/HotToursSection.jsx — evidence filter and historical framing.
8. frontend/src/components/PopularDestinations.jsx — factual destination heading, positive-ready state, retry.
9. frontend/src/components/TestDestinationCards.jsx — meaningful image alt and prepare-search CTA copy.
10. frontend/src/pages/Home.jsx — shared page-owned catalog loading.
11. frontend/src/services/homeCatalog.js — validated own API loaders and lifecycle state.
12. frontend/src/styles/Home.css — scoped hierarchy/wrapping/feedback layout.
13. frontend/src/utils/homeSearch.js — submit wrapper around unchanged validation/URL builder.
14. frontend/src/utils/hotTours.js — shared recorded-price comparison guard.

## 25. Exact new files

1. frontend/src/hooks/useHomeLoad.js — small per-instance loader hook.
2. frontend/tests/homeDiscoveryQuality.test.mjs — sole focused 5G suite.
3. SPRINT_5G_HOME_DISCOVERY_QUALITY_REPORT.md — sole 5G report.

## 26. Warnings

Inherited hook dependency warnings in admin BookingsTable, NotificationsTable and RefundsTable; JS >500 kB; existing 2.66–3.09 MB PNG assets; normal Git LF/CRLF notices. No new lint warnings or dependencies. Bundle splitting/image optimization remains 5H work.

## 27. Limitations

OWNER BROWSER ACCEPTANCE: **NOT RUN**. No independent staging/browser/network audit or deploy. No live promotion was fetched; positive promotion tests use clearly synthetic offline evidence. No current provider availability is inferred from catalog counts or recorded prices. The old unused country component/data remains outside Home. Source/CSS cannot prove actual mobile geometry, contrast measurements or assistive technology behavior.

Previous skipped 5C checks, 5D READY/Details absence of stored bookings, and 5E registration/password/second-account browser tests remain unupgraded. 5F owner acceptance remains its previously documented tested scope. No real booking, registration or password mutation performed for this sprint.

## 28. Owner browser acceptance checklist

Prepare only after a separate owner deployment:

- Desktop Home: coherent first screen, brand/value/search hierarchy, header, directions by country, truthful offers loading/empty/history, benefits, FAQ and footer.
- Verify each primary CTA: destination prepares the supported form without searching; explicit search uses entered dates/guests only if the owner chooses to test it. Do not perform a fresh provider search merely for 5G acceptance.
- Verify no fake prices/discounts/popularity/urgency or purchase implications. Cards represent destinations or stored hotel offers as labelled. No broken images, dead links or raw errors.
- At 390/320 (also 768/1440 if available): hero, fields, guest panel, long labels, cards, retry/buttons, header/menu and footer; no clipped controls, overlap or horizontal overflow; keyboard focus usable.
- If naturally available, confirm error/retry and successful-empty states separately; do not manufacture provider failures or populate fake DB offers.
- Browser Network on Home/navigation: expected own catalog/special/account requests only; no unintended Availability, Content, CheckRate, Booking or Cancellation. Browser observation is not an independent server-side traffic audit.

Truthful pricing audit: PASS — offline. Destination semantics audit: PASS — offline. CTA audit: PASS — offline. Homepage architecture: REUSED / HARDENED.

All scoped changes remain unstaged. Existing unrelated paths and prior reports preserved. No git add/commit/push/reset/restore/clean or deploy.


## Sprint 5G.1 — Owner UX Follow-up

### Entry and owner evidence

On 2026-10-02, initial status/branch/latest commit/diff-stat/full diff confirmed a clean tracked baseline on develop, HEAD **e00de25** (`docs: record Sprint 5G offline verification`). No partial 5G.1 edits were recovered. Existing unrelated untracked owner paths were preserved.

Owner staging review found the large empty price-drop section visually misleading: “Предложения со снижением цены” and its no-confirmed-price-reduction panel suggested nonworking functionality. This is supplied owner evidence, not an independent browser run. Owner requested removal of the entire section from Home.

### Change and preserved boundaries

Home now renders Hero/search -> directions -> Advantages -> FAQ -> Footer, without price-drop loading, error, retry, empty or populated presentation. Removed its HotTours import/mount and the exclusively associated loadHomeSpecials request implementation. Normal Home discovery now needs only the existing catalog GET; no frontend source calls special-offers.

Removed section-only skeleton/empty CSS. Shared .home-loading was retained because TourCard still uses it. Catalog loading/retry, useHomeLoad, destination semantics, search contract, TEST disclosure, header, contacts and booking/payment-disabled copy remain intact. No replacement promotion was added.

HotToursSection, HotTourCard, CollectionImage and historical price helpers remain available and covered by existing direct component/helper tests. offerDetailsLink remains used by TourCard. Historical price_history backend, endpoint, data and schema remain unchanged. HotTours.jsx is now a two-line legacy export of the pure presentation component, with no fetching or state and no Home mount. Initial removal of this tracked file caused the existing verifier to fail with ENOENT because it scans Git-index paths before staging. Retaining the presentation export allows the required unchanged verifier to run without git add or backend edits. Final checks below passed after this adjustment.

### Tests and regression

Updated only the existing homeDiscoveryQuality.test.mjs. Removed 14 cases specific to the deleted loader/view (including three duplicate offers lifecycle cases); added four checks for absent panel, retained section order/search, catalog-only Home dependency and catalog-only actual loader calls. Fetch mocks now reject special-offers. Historical price-evidence tests and unrelated regression coverage remain. No skips or weakened unrelated assertions.

| Gate | 5G.1 result |
| --- | --- |
| Focused 5G | PASS 80/80 |
| Full frontend | PASS 570/570 |
| Lint | PASS; 0 errors, 3 inherited admin hook warnings |
| Build | PASS |
| JS / gzip | 502.92 kB / 142.88 kB |
| CSS / gzip | 105.84 kB / 19.25 kB |
| Bundle warning | PRESENT >500 kB |
| Verifier | PASS; backendSyntaxFiles=208, secretScanFiles=439, findings=[] |
| diff-check | PASS |
| Backend regression | Not rerun; unchanged; 399/399 historical only |

Used required offlineNetwork preload/sequential/force-exit focused and full commands, npm.cmd frontend lint/build, sprint3mVerify and git diff-check. Final focused/full runs have zero failures, cancelled, skipped or todo tests. Logs: OS-temp sprint5g1-focused.log and sprint5g1-frontend.log. Build TEST flag was process-only; env files untouched. No claim of runtime performance improvement; bundle optimization remains outside this follow-up.

### Exact changed files

1. frontend/src/pages/Home.jsx — remove section import/mount.
2. frontend/src/components/HotTours.jsx — remove Home loading/request/state wrapper; retain pure legacy export.
3. frontend/src/services/homeCatalog.js — remove Home-only specials loader.
4. frontend/src/styles/Home.css — remove specials skeleton override.
5. frontend/src/styles/HomeCollections.css — remove specials skeleton/empty-state styles.
6. frontend/tests/homeDiscoveryQuality.test.mjs — update removed-section contract and enforce catalog-only Home requests.
7. SPRINT_5G_HOME_DISCOVERY_QUALITY_REPORT.md — current status and this follow-up.

New files: none. Deleted files: none. Changes left unstaged. No git add/commit/push or deploy.

### Safety and owner recheck

Home price-drop section removed: YES. Home special-offers request removed: YES. Backend price-history feature preserved: YES. Backend changed: NO. DB/schema changed: NO. Hotelbeds behavior changed: NO. Booking/payment/email runtime changed: NO. External calls: 0. Hotelbeds calls: 0. Real DB mutations: 0.

**OWNER BROWSER ACCEPTANCE: IN PROGRESS / REQUIRES RECHECK.** After a separate deployment, owner should confirm desktop/390/320 Home flows directly from directions to Advantages/FAQ/footer, without price-drop panel/gap, and Network has no Home special-offers request. Recheck search preparation, directions and existing navigation without a fresh Hotelbeds search merely for acceptance. Offline source/SSR checks do not establish rendered layout or browser Network acceptance. No previous Home browser status is treated as final PASS for this changed UI.


## Sprint 5G.2 — Destination Image Polish

Owner browser review after 5G.1 found a grey fallback on the Portugal / Centre Portugal card; the remainder of Home was reported visually correct. This is supplied owner evidence, not an independent browser run.

Initial audit on 2026-10-02: develop, HEAD **9cd7ee8** (`docs: record Sprint 5G.1 home follow-up`), clean tracked baseline. Status/branch/log/stat/full diff reviewed before editing. Unrelated owner paths preserved.

**Root cause:** TestDestinationCards owns its own DestinationImage (not CollectionImage). Its local mapping has TR:AYT, EG:SSH, AE:DXB and TH:HKT only; PT:CEN has no mapped asset. The existing fallback was a muted grey gradient with plain text. Source inspection of catalog/test-options and testCatalogReadiness confirms identity/count metadata, not destination image URLs. No catalog/staging request was made. Repository asset/config search found no identifiable Portugal/Centre Portugal image; other-country/hotel assets were not repurposed as a photograph of Portugal.

Kept the existing missing/failed-image mechanism and replaced the grey inline styling with a dedicated abstract CSS gradient, warm circular accent, decorative contour lines and a small “Направление путешествия” label. This is generic artwork, not an image claiming to depict Centre Portugal. The card's country/name/link and CTA remain unchanged. Missing images render no img element; existing onError switches failed images to the same fallback without another request. Existing caption overlay, responsive card sizing and four local image mappings remain intact. No new asset, external URL, dependency or network operation.

Only these files changed:

1. frontend/src/components/TestDestinationCards.jsx — intentional missing/failed-image fallback class and label.
2. frontend/src/styles/HomeCollections.css — scoped abstract fallback presentation.
3. frontend/tests/homeDiscoveryQuality.test.mjs — three added cases: Centre Portugal fallback/identity, four existing local images, shared missing/error fallback with no network dependency.
4. SPRINT_5G_HOME_DISCOVERY_QUALITY_REPORT.md — current status and this follow-up.

No new/deleted files. Hero, HomeSearch, Advantages, FAQ, Footer, auth/header and Home architecture unchanged. Backend/DB/schema/Hotelbeds behavior and booking/payment runtime unchanged.

| Gate | 5G.2 result |
| --- | --- |
| Focused 5G | PASS 83/83 |
| Full frontend | PASS 573/573 |
| Lint | PASS; 0 errors, 3 inherited admin hook warnings |
| Build | PASS |
| JS / gzip | 502.85 kB / 142.85 kB |
| CSS / gzip | 106.43 kB / 19.41 kB |
| Bundle warning | PRESENT >500 kB |
| Verifier | PASS; backendSyntaxFiles=208, secretScanFiles=439, findings=[] |
| diff-check | PASS |

Required offlineNetwork/sequential/force-exit focused and full frontend commands completed with zero failures/skips/todo; logs OS-temp sprint5g2-focused.log and sprint5g2-frontend.log. Frontend lint/build, sprint3mVerify and diff-check completed. Build TEST flag process-only, no env-file edit. Backend regression not rerun because backend unchanged. Tests use SSR, source/CSS checks and fetch mocks; no mounted browser/image-error event or rendered geometry acceptance is claimed.

Centre Portugal fallback polish implemented: YES. Other destination card mappings preserved: YES, verified offline. External calls: 0. Hotelbeds calls: 0. Real DB mutations: 0. No deploy or git add/commit/push; changes left unstaged.

**OWNER BROWSER ACCEPTANCE: REQUIRES RECHECK.** After separate deployment, owner should check Centre Portugal artwork/caption/CTA at desktop, 390 and 320, plus unchanged Antalya, Dubai, Phuket and Sharm el Sheikh images. Confirm readable text, no clipping/overlap or broken image indicator. Do not initiate a provider search merely to check artwork. Earlier browser observations do not establish acceptance of this changed fallback.

## Final Owner Render Browser Acceptance

This section records subsequently supplied owner browser evidence and supersedes the earlier pending/recheck status for the tested scope below. This is owner-reported staging acceptance, not an independent browser run. Offline results are retained from the latest completed 5G.2 checks; no tests, build or deployment were performed for this report-only update.

### Desktop Home

Owner confirmed correct Hero, Home search and destination section rendering. Centre Portugal's intentional CSS fallback rendered correctly; Antalya, Dubai, Phuket and Sharm el Sheikh cards were preserved. The price-drop section is absent after 5G.1, and destinations flow directly to Advantages. FAQ and Footer rendered correctly. No raw technical errors or obvious desktop horizontal overflow were visible.

| Check | Owner result |
| --- | --- |
| HOME DESKTOP | PASS |
| HERO | PASS |
| SEARCH | PASS |
| DESTINATIONS | PASS |
| CENTRE PORTUGAL FALLBACK | PASS |
| PRICE-DROP SECTION REMOVED | PASS |
| ADVANTAGES | PASS |
| FAQ | PASS |
| FOOTER | PASS |
| NO RAW TECHNICAL ERRORS OBSERVED | PASS |

### Responsive 320 px

Owner inspected Home at 320 px: hamburger/mobile header rendered, Hero remained readable, search fields and primary CTA fit, and TEST disclosure wrapped correctly. Destination cards stacked in one column and fit the viewport; Centre Portugal's fallback remained intentional. Advantages stacked in one column. No visible horizontal overflow was observed in the inspected upper/middle sections.

| Check | Owner result |
| --- | --- |
| HOME 320PX | PASS — inspected upper/middle flow |
| HERO 320PX | PASS |
| SEARCH 320PX | PASS |
| DESTINATIONS 320PX | PASS |
| ADVANTAGES 320PX | PASS |

Footer at 320 px was not independently screenshot-captured; these observations do not establish separate 320 px Footer acceptance.

### Responsive 390 px

Owner inspected Home at 390 px: header, Hero, search, destination cards, Centre Portugal fallback and Advantages fit. The lower FAQ section rendered, and Footer rendered in a one-column mobile layout. Navigation, contact and help links fit. No visible horizontal overflow was observed.

| Check | Owner result |
| --- | --- |
| HOME 390PX | PASS |
| FAQ 390PX | PASS |
| FOOTER 390PX | PASS |
| CONTACTS 390PX | PASS |

### Final Sprint 5G status

| Gate | Final status |
| --- | --- |
| CODE / OFFLINE | PASS |
| DEPLOYED STAGING | PASS |
| OWNER BROWSER ACCEPTANCE | PASS — tested scope |
| SPRINT 5G | PASS |
| SPRINT 5G.1 | PASS |
| SPRINT 5G.2 | PASS |
| Focused 5G latest | 83/83 PASS |
| Full frontend latest | 573/573 PASS |
| Lint | PASS |
| Build | PASS |
| Verifier | PASS |
| diff-check | PASS |
| JS | 502.85 kB |
| gzip | 142.85 kB |
| Bundle warning | PRESENT >500 kB |
| Backend changed | NO |
| DB/schema changed | NO |
| Hotelbeds behavior changed | NO |
| Booking changed | NO |
| Payments changed | NO |

Only this report was edited for this acceptance update. Source code, tests, env and runtime configuration remain unchanged. No new network/provider audit or search execution is inferred from the supplied visual evidence. Previous unrelated skipped acceptance checks remain unchanged. No git add/commit/push or deployment was performed; the report remains unstaged for owner review.
