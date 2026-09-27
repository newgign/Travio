# Sprint 5D — My Bookings & Booking History Quality

Status: CODE / OFFLINE: PASS. Focused 5D: 53/53. FULL FRONTEND: 339/339. FULL BACKEND: 399/399 (36 files). Lint/build/verifier/diff-check: PASS. OWNER BROWSER ACCEPTANCE: NOT RUN. DEPLOY: NOT RUN. Hotelbeds TEST/read-only; LIVE disabled; booking/payments disabled; production infrastructure paused.

## 1. Initial state

Started on 2026-09-27, develop, HEAD 896b02a (`docs: record Sprint 5C offline verification`). Before editing ran git status --short, branch --show-current, log -1 --oneline, diff --stat and complete diff. No tracked Sprint 5C report/owner-evidence changes existed. The 5C report was not edited.

User-supplied baseline: 5A owner acceptance PASS; 5B/5B.1/5B.2/5B.3 code/backend/frontend/deployed/owner acceptance PASS; 5C code/backend 389/389/frontend 286/286/deployed staging PASS. The user's 5C browser evidence covers guest Favorites auth, authenticated empty Favorites, Grand Kaptan add/card/remove, no new provider request from favorite action, and visible Profile. Profile save/reset persistence, logout/login isolation acceptance and final 390/320 Profile/Favorites acceptance remain NOT RUN / OWNER SKIPPED. This report does not upgrade those items.

**RECOVERED WORK BEFORE CONTINUATION:** four tracked modifications existed: bookingController.js, PersistedBookingCard.jsx, MyBookings.jsx, savedAccountPresentation.js; two untracked services existed: backend/services/bookingHistoryPublic.js and frontend/src/services/bookingHistory.js. Preserved and audited this partial 5D implementation rather than claiming it as newly authored. It included an initial public serializer, session history store, details link, persisted filter state and presentation helpers. There was no focused 5D test/report yet.

Preserved unrelated README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, `tatus --short` and the unusual filename containing `record final staging release candidate acceptance`. No reset/restore/clean/add/commit/push.

## 2. Booking architecture audit

Traced Navbar desktop/mobile account links -> App /my-bookings and /my-bookings/:bookingId -> ProtectedRoute -> useSession/session/authFetch -> MyBookings/PersistedBookingCard and BookingDetails -> bookingService GET /bookings/me and /bookings/:id/details -> authMiddleware -> bookingController -> bookings/latest payments/booking_events in application PostgreSQL. Added protected /bookings and /bookings/:bookingId aliases; canonical links remain /my-bookings.

Read the current pages, navbar/header, router/protected route, account states/store, session/auth helpers, money/date/room/board helpers, booking APIs, controller, provider booking controller/service, payment controller/gateway/refund readiness, voucher controller/model, event service and relevant schema migrations 002/004/006/007/009/010/011/012. Reviewed account/auth/booking regression contracts and historical 2G/2H/2I, 3S, 3T and 5C reports; earlier 5B acceptance remains unchanged.

Two genuine safety issues: old standalone Details imported active provider sync/cancellation, PDF generation and sandbox refund actions and displayed raw errors/internal payment identifiers; old account GET responses exposed b.* and operational payloads. Completed the recovered narrow public projection and replaced Details with read-only history. Existing owner/admin checks remain intact. No new provider/data resolver.

## 3. Booking semantics

A booking row is a persisted application order/request, not proof of a live Hotelbeds reservation. Creation stores user ownership, provider/hotel/offer identifiers, contact/travelers, original offer_snapshot/search_filters, quoted amount/currency, total amount/currency and local/provider state. Mock, legacy and Hotelbeds records coexist. Snapshot and original quote describe the selection; provider_status, references, latest payment/refund status, total/currency and lifecycle timestamps can be updated by historical operational code. Thus total_amount is the last stored order total, not necessarily the original quote or current market price. No such operation runs during history reads.

## 4. List states

Existing guest/auth -> login CTA, loading skeleton, empty/search CTA, fixed error/retry and ready cards are retained. Real guest routes use existing ProtectedRoute login behavior; views also render explicit auth-required states. Empty copy now explicitly states that no saved order records exist and booking/payment are disabled. Existing sorting and filters (at five records) remain local. Data is hidden in auth/loading/error states.

## 5. Booking card

Stored hotel/location/image (neutral image fallback), stay, guests, native room/board disclosure, stored amount/currency, human status, record ID and created date. Added an accessible order-specific link to standalone Details, read-only record disclosure and evidence-gated sandbox no-charge text. List/listitem semantics added. Existing new-search link remains a search-form link and never resolves a historical offer. Provider identifiers are not repurposed as current offer IDs.

## 6. Status mapping

Reused shared savedAccountPresentation mappings: local Новая / Подтверждена / Отменена; Hotelbeds LOCAL_PENDING, CONFIRMING, CONFIRMATION_UNKNOWN, CONFIRMATION_FAILED, RATE_EXPIRED, CONFIRMED, MODIFIED, CANCELLED, CANCELED. Case-normalized Hotelbeds outcome takes priority. Local payment/refund implementation also writes local_paid/local_refunded for non-Hotelbeds records; these use their actual local booking status, not invented provider mappings. UNKNOWN/unrecognized values have a neutral label. Payment/refund states are separate. Timeline event types use a fixed known-label map, with a neutral unknown-event label and no raw title/description/metadata output.

## 7. TEST/simulation disclosure

Evidence remains provider=mock, offer_snapshot.priceEnvironment=test, gateway_provider=sandbox or payment_status=test. TEST records explicitly do not confirm a real Hotelbeds booking or right to check in. Provider name alone is not evidence of environment. Unknown-environment records explicitly state that creation mode is unconfirmed and the record does not confirm a real Hotelbeds booking.

The no-real-charge assertion requires BOTH sandbox and stored payment_metadata.realCharge=false; the backend emits only that derived boolean. Other records do not invent a payment result. A stored provider reference is labeled historical, never new/live confirmation; missing reference says it is not saved. We do not claim that an unknown outcome proves no provider booking exists.

## 8. Details page

Back to My Bookings; one h1; order ID/status/date/reference/TEST disclosure; stored hotel; stay and selected room/board; order price; payment, cancellation, documents and stored provider confirmation state; safe chronological event list; optional explanation of stored data. No traveler/contact/raw operational panels or mutation actions. Booking uses a native disabled button; payment/cancellation/document unavailability is explicit text. Errors have retry; unavailable/not-found records have a safe common state and Back link.

## 9. Historical snapshot

Public account serializer allowlists fields already stored in offer_snapshot/search_filters and booking/payment columns. It ignores joined current tours hotel/location/image/price. A stored images array may provide the image when the original image field is absent. Snapshot room/board/date/price/currency are not merged with a new search. No inferred checkout, occupancy or current offer. Legacy rows lacking a snapshot show truthful missing-data labels, which is a deliberate correction of the old current-tours fallback.

## 10. Price semantics

Existing savedMoney/formatMoney retained with stored total_amount/currency and existing original quoted fallback. No projected price, hardcoded currency, FX, discount or recomputation. Details says “Стоимость заказа” and explicitly describes the stored sum as not current price or proof of payment. Card retains its tested sum-of-request/booking labels and “Сумма в записи, не подтверждение оплаты.” Currency symbols follow the shared formatter (e.g. EUR appears as €). Invalid/missing amounts do not become zero.

## 11. Voucher

Audit confirmed existing voucher GET/PDF handlers generate a document and write voucher_generated_at/events; they do not serve a durable stored file URL. Details therefore has no active voucher/download link and never calls these handlers. A generation timestamp is shown only as a historical marker, not proof that a downloadable file exists. Existing separate voucher routes and PDF implementation were not changed. Existing backend regression tests exercise their offline in-memory PDF model; no account document was generated or persisted by this work.

## 12. Cancellation

Existing provider “simulation” is itself a provider API operation, not a harmless local preview. All provider sync/simulation/cancellation actions removed from this account Details page. Saved cancelled status and separate local/provider cancellation dates remain factual history; UI does not claim this viewing session cancelled anything. Underlying protected operational endpoints/transport/gates remain unchanged and were never invoked externally.

## 13. Payment

Latest saved payment state uses stable labels; sandbox/test is explicit. Readiness/refund actions, payment metadata, external IDs, idempotency keys and raw failure text are absent from the account response/page. Refund status is historical only. No charge/pay/retry/refund CTA, no payment service import and no operation. Existing payment/refund backend remains disabled by the established runtime configuration and unchanged by 5D.

## 14. Navigation

Completed recovered bookingHistory service using existing createAccountListStore. One in-memory session-owned list and per-ID details stores; in-flight GET deduplication, retained filter group and no repeat list request on Details -> Back. First Details opening fetches its own authorized app endpoint (needed for events and ownership), revisits reuse the same store. No persistent history storage or polling. New tab/reload creates a new cache. Current-record status is the last app response; there is no claim of live synchronization. Auth-return allowlist now accepts bounded numeric account Details paths and rejects arbitrary URLs/queries/traversal.

## 15. Auth/ownership

Backend list remains WHERE b.user_id=$1 for every user, including admin. Details loads the requested row, then checks owner OR existing admin role before events/serialization. Other owner receives existing 403; missing row 404; frontend combines them into “Запись не найдена или недоступна.” No authorization expansion. JWT middleware still rejects missing/invalid bearer; predictable IDs confer no access. Session events clear history even after leaving the page; token changes and late-response generation guards prevent another account's data from populating the new store. Protected routes prevent guest private-data flash.

## 16. Safe identifiers

Only intended account record ID, application reference and stored provider reference are rendered, escaped as React text. No offerToken/rateKey, checkout token, provider_response/provider_last_error/cancellation payload, contact/traveler information, payment metadata/secret/external ID/idempotency key or event metadata is serialized to these account endpoints. Admin access rules and operational endpoints are retained. The shared booking SQL projection also returns timestamp text on the admin list, preserving stored calendar values; its fields and authorization are unchanged. No JSON dump in UI.

## 17. Dates/times

Reuse displayDate for validated user-friendly calendar dates. Account booking timestamps are selected as PostgreSQL ::text; public event projection also selects occurred_at::text, avoiding pg Date -> UTC day changes for timestamp-without-timezone fields. Original calendar date is displayed; no timezone is invented. Invalid values become neutral fallbacks. No provider timestamp is reinterpreted as browser-local time. Original Hotel Details cancellation offset presentation is untouched.

## 18. Error model

Fixed “Не удалось загрузить бронирования”, “Не удалось открыть заказ.” and common unavailable-record state. No error.message, SQL, stack, provider payload or URL/token rendering. Store keeps safe state only; retry reloads the same application GET. Invalid/mismatched success responses fail safely. Invalid Details identifiers never reach the API from the history service.

## 19. Accessibility

Single h1 per view/state, h2/h3 hierarchy, definition lists, ordered events, list/listitem semantics, text status alongside tone, meaningful hotel image alt/fallback, order-specific link accessible name, native summary and disabled button. Existing account :focus-visible and 44px button minimum retained. Loading status and error alert preserved. Keyboard/browser/screen-reader acceptance NOT RUN.

## 20. Responsive

Reused account shell/header/footer/card breakpoints and added Details minmax(0,1fr), min-width:0, wrapping, two-column layout collapsing at 768px and stacked hotel/facts at 480px. No wide tables, fixed booking bar or sticky obstruction. Source/CSS and SSR contracts cover narrow 320/390, tablet 768 and desktop 1440 intentions; they do not establish measured browser overflow acceptance.

## 21. Network/performance

History only uses own GET /bookings/me and /bookings/:id/details, with no fetch-on-render, polling, resolver or provider refresh. Events public query selects only id/type/date. Existing protected detail request performs ownership before reading events. Cache avoids repeat navigation fetches; session invalidation removes private cached data. Stored image URLs may load images normally in a browser; no new Content request is introduced. No new dependencies.

## 22. Tests

Single new frontend suite: frontend/tests/myBookingsQuality.test.mjs, **PASS 53/53** (52 subtests and enclosing test). Covers list/details auth/loading/error/ready, empty, retry, persisted fields, all status mappings/unknowns, TEST evidence/no-charge limits, historical price and no current-tour substitution, safe identifiers, voucher/payment/cancellation, aliases/auth return, ownership source contract, no provider network, direct ID validation, common 403/404, mismatched payload, request dedup, filter/list cache, session invalidation/races, semantic markup and responsive CSS. Real services use deterministic fetch mocks; view tests use SSR. Actual backend ownership is additionally exercised below and by stagingAcceptance on disposable fixtures.

New backend focused bookingHistoryQuality.test.cjs tests real serializer/controllers with mocked query/provider methods, owner/admin denial/order, fixed DB errors, own-list scope, no provider calls, raw sentinel exclusion, payment evidence, stored image/currency fallback, original dates and invalid bearer. Focused backend: PASS 10/10. Affected sprint2i file: PASS 1/1 in both complete runs.

Updated only the affected historical sprint2i.test.js assertions: old contract required provider sync/refund buttons, raw operational details and inline room mapping; 5D now asserts publicDetails/ownership, safe event/room helpers and absence of those actions. Existing backend refund/payment/voucher/audit safety checks remain. No assertions skipped, ignored or reduced to unconditional pass; no other existing suite changed.

Intermediate focused failures: new currency check initially expected literal EUR rather than shared formatter's €; corrected to its existing formatter contract. New invalid-bearer test initially lacked JWT_SECRET and correctly received configuration 500; supplied/restored a synthetic test-only secret. Neither required product weakening.

## 23. Regression

| Gate | Result |
| --- | --- |
| Focused 5D frontend | PASS 53/53 |
| Full frontend | PASS 339/339, zero skipped/todo |
| Lint | PASS, 0 errors; 3 inherited admin hook warnings |
| Build | PASS; JS 500.46 kB / gzip 141.66 kB; CSS 105.15 kB / gzip 19.16 kB |
| Canonical backend | PASS 101/101; 12 files |
| Other backend files | PASS 298/298; 24 files |
| Full backend | PASS 399/399; 36/36 files; zero failures/skipped/todo |
| Verifier | PASS; 208 backend syntax files, 430 scanned files, findings=[] |
| diff-check | PASS |
| Disposable DB cleanup | PASS for both runs; zero remaining canonical schemas |

Commands: node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit frontend/tests/myBookingsQuality.test.mjs; same runner with frontend/tests/*.test.mjs; npm.cmd --prefix frontend run lint/build; node backend/scripts/sprint3mVerify.cjs; git -c core.safecrlf=false diff --check. Build TEST flag process-only.

Backend harness runs unchanged canonical node backend/scripts/sprint3mRegression.cjs (12 files), explicitly enumerates every other backend *.test.js/*.test.cjs and runs each separately, with offlineNetwork.cjs. Uses installed postgres:16 --pull=never, unique container, generated secret kept in process environment, ephemeral port bound only to 127.0.0.1, existing migrations on disposable empty DB. Canonical suites use their existing isolated schemas; other files get separate databases cloned from the migrated template and existing READY fixtures. No Render/staging/production/ordinary developer DB. Child connection variables explicitly point to the disposable local identity; synthetic JWT/offer secrets never printed. Docker access required sandbox escalation; this was not permission to contact a remote DB.

First complete run passed 398/398 before the extra date-preservation test/fix, container sprint5d_e9b3bbac3663 on 127.0.0.1:62377 removed with its anonymous volume. Final run: sprint5d_ba513de403df on 127.0.0.1:51308, PASS 399/399. All 36 file logs independently summed. Every additional database was dropped in finally; final schema query returned []. Unique container and anonymous volume removed, exact-name container listing empty. Evidence: OS-temp sprint5d-evidence/sprint5d_ba513de403df, including 3m canonical logs, individual suite logs, summary.json, schemas.json and cleanup.txt. No ordinary container/database/volume removed. Per-suite logs, summary and schemas/cleanup evidence are in OS-temp sprint5d-evidence. Frontend logs: sprint5d-focused.log and sprint5d-frontend.log. Temporary harness removed before final audit. Final full frontend rerun after the event-date and browser-title changes also passed 339/339; focused/lint/build repeated after title changes. Final status/diff-stat/full-diff/diff-check reviewed; untracked scoped services/tests/report inspected separately. All 17 scoped files remain unstaged for owner review.

## 24. Exact changed files

Tracked:

1. backend/controllers/bookingController.js — recovered serializer wiring; stored timestamps/currency and safe account response.
2. backend/services/bookingEventService.js — optional safe public date/type projection; default operational contract retained.
3. backend/tests/sprint2i.test.js — current read-only account contract assertions.
4. frontend/src/App.jsx — protected /bookings aliases.
5. frontend/src/components/AccountStates.jsx — factual saved-record empty copy.
6. frontend/src/components/PersistedBookingCard.jsx — recovered details link/disclosure; accessible link and no-charge evidence.
7. frontend/src/pages/BookingDetails.jsx — read-only historical details and states.
8. frontend/src/pages/MyBookings.jsx — recovered session store/filter persistence and list semantics.
9. frontend/src/styles/BookingDetails.css — responsive historical layout.
10. frontend/src/utils/authPresentation.js — bounded account Details return path.
11. frontend/src/utils/savedAccountPresentation.js — recovered shared history labels/facts, validated counts/aliases.
12. frontend/src/utils/consumerTitle.js — correct alias/details browser titles; Details mounts existing ConsumerMetadata.

New/untracked scoped:

13. backend/services/bookingHistoryPublic.js — recovered account serializer, completed and verified.
14. frontend/src/services/bookingHistory.js — recovered session-owned history cache, completed and verified.
15. backend/tests/bookingHistoryQuality.test.cjs — focused backend coverage.
16. frontend/tests/myBookingsQuality.test.mjs — sole focused frontend 5D suite.
17. SPRINT_5D_MY_BOOKINGS_HISTORY_QUALITY_REPORT.md — sole sprint report.

## 25. Warnings

Existing >500 kB build warning remains at 500.46 kB (5C was 508.26 kB). Existing 2.66–3.09 MB PNG assets remain. Three inherited hook dependency warnings in admin BookingsTable, NotificationsTable and RefundsTable. Existing Git LF-to-CRLF notices. No new dependency or asset.

## 26. Limitations and safety ledger

OWNER BROWSER ACCEPTANCE NOT RUN; no deploy. SSR/CSS is not rendered layout/keyboard evidence. No staging record was read/created to manufacture READY acceptance. Legacy missing snapshots remain incomplete rather than using current tours fields. Environment/no-charge/provider confirmation cannot be inferred where stored evidence is absent. History cache is in-memory and last-loaded, not a live provider view. Existing separate voucher/checkout/admin operational code is out of this page's display-only scope and unchanged.

Backend changed YES (account serialization and event projection); frontend changed YES. Booking history/API presentation changed YES; booking creation/confirmation/cancellation runtime unchanged and disabled. Payment presentation changed YES; payment/charge/refund runtime unchanged and disabled. Hotelbeds transport/provider behavior changed NO. DB/schema/migration source changed NO. Real application/remote DB mutations 0; authorized disposable test mutations ALLOWED, cleanup verified separately. External service calls 0; real Hotelbeds calls 0; real payment/refund calls 0. Local HTTP test servers and mocked provider methods are offline test fixtures. No env-file edits, Render changes, deploy, production provisioning, git add/commit/push.

## 27. Owner browser acceptance checklist — prepare only, NOT RUN

Owner later, on a separately approved deployed version:

- Guest: open /my-bookings and /bookings plus a Details URL; login/protected state, no private flash; return path after login.
- Authenticated: empty list OR existing stored records. No new/fake/staging booking should be created for this checklist.
- If an existing record is available: card -> Details -> Back, filter/list retention, stored hotel/stay/room/board/amount/currency, factual status and created date; TEST/unknown-mode/no-charge wording consistent with evidence.
- Payment/refunds disabled; cancellation unavailable; document unavailable or historical marker only; no active voucher generation/provider sync.
- Check missing/unauthorized ID safe state, app error/retry if naturally available, keyboard/focus/headings and readable long values.
- At 390 and 320 (preferably also 768/1440): list/empty/card/details/status/hotel/stay/price/disclosures/footer, no horizontal overflow or obstruction.
- Network: only own booking GETs and ordinary stored images; no Availability, Content, CheckRate, Booking or Cancellation. Back reuses loaded list; no polling.
- If staging has no booking records: READY/details owner acceptance stays NOT RUN. Record actual evidence without upgrading skipped 5C items.
