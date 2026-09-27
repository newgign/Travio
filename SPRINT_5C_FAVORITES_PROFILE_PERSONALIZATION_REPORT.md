# Sprint 5C — Favorites, Profile & Personalization Quality

Status: CODE / OFFLINE: PASS. Focused 5C: 45/45; full frontend: 286/286; full backend: 389/389 across 35 files. Lint/build/verifier/diff-check: PASS. OWNER BROWSER ACCEPTANCE: NOT RUN. DEPLOY: NOT RUN.

## 1. Initial state

Continued on 2026-09-27, develop HEAD 82c6ad2 (`docs: record Sprint 5B owner browser acceptance`). First executed status, branch, latest commit, diff-stat and full diff. Tracked baseline was clean. Prior 5B owner acceptance was committed; no prior-sprint commit blocker existed. Preserved unrelated README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, `tatus --short` and the unusual owner filename containing `record final staging release candidate acceptance`.

## 2. RECOVERED WORK BEFORE CONTINUATION

No modified/untracked 5C implementation, test or report existed at recovery. The committed baseline already supplied shared FavoritesContext/accountListStore, saved cards, profileStore, supported profile form, safe errors, password flow, session events and responsive account/navbar styles. These were reused. No rollback, duplicate state manager, alternate page or duplicate suite was introduced.

## 3. WORK COMPLETED AFTER CONTINUATION

Fixed Hotelbeds favorite creation calling Availability by using the existing local catalog record instead. Added canonical-load-before-toggle, duplicate filtering, add-response validation and delete-success validation. Preserved mock-provider filters. Cleared store data/pending state on invalidation and isolated card/Details favorite control state by session. Added synchronous TourCard click guard, safe expired-session handling, accessible stale-card favorite state/error, saved TEST disclosure and explicit absence of a current offer. Profile trims outgoing supported strings, counts Unicode characters for schema limits, clears private/pending state on invalidation, exposes form busy state and reuses auth-required CTAs. Added one frontend focused suite and one backend focused test. Existing tests were not weakened or edited.

## 4. Auth/user architecture audit

Read current Navbar, Login/Register/AuthPage/authFormStore, session/useSession/authFetch, ProtectedRoute/App/main, FavoritesContext, accountListStore/savedAccountData, Results/TourCard, TourDetails/detailsFavorite, Favorites/SavedHotelCard/AccountStates, Profile/profileStore/profileService/profilePresentation, account presentation/styles and existing account/profile tests. Read backend favorite controller/routes, auth controller/routes/middleware, provider manager/catalog repository and favorites migration source; traced getHotelById through its Availability call.

Session.js remains the shared session authority: token/user in existing localStorage, storage/pageshow/travio-auth-changed subscriptions, bearer authFetch, guarded clearSession and logout redirect. Login/register retains existing safe allowlisted return paths. Backend profile GET is `/auth/profile`, update PUT is the same path, password uses separate `/auth/password`. These account endpoints query application DB; they do not resolve Hotelbeds offers.

## 5. Favorite identity

Existing canonical identity remains provider + providerHotelId (fallback id), exactly matching the backend unique constraint `(user_id, provider, provider_hotel_id)` and delete route. No price/name/room/board/image/index identity. Numeric/string representations of the same hotel ID deduplicate. Loaded duplicates collapse in original order.

## 6. Shared favorite state

One FavoritesContext still owns one session-bound accountListStore. Toggle operations moved into the existing savedAccountData service for direct testing; this is not another cache. Results uses TourCard; Details and Favorites consume this same context, and Navbar uses its known count. Toggle waits for an existing/in-flight list load before deciding add/remove; failed loading cannot silently choose POST. Same-key mutation guard deduplicates concurrent actions.

## 7. Guest behavior

No guest favorites store exists or was added. Guest favorite actions navigate to login without protected mutation. Favorites auth state supplies login/register CTAs with the existing safe account return path. Profile remains protected: direct guest navigation goes to the existing Login page with returnTo=/profile; Login already offers registration. ProfileView also has an explicit AccountAuth state. Existing protected routes and token storage strategy are unchanged.

## 8. Favorite action UX

Mutations remain pessimistic: confirmed state changes after server success only. Failure retains prior items; no fake optimistic success. Per-key pending locks remain; TourCard adds a synchronous ref guard and disabled/pressed/action-label semantics even on its unavailable-price branch. Details retains its existing synchronous guard and safe fixed failure. HTTP 401/AUTH_REQUIRED routes to login. TourCard and the extracted, same-file DetailsFavoriteButton are keyed by context session identity, clearing local pending/error state on user switch; the Details offer/loader itself does not remount for this change. Saved cards retain guarded removal with explicit pressed state.

## 9. Favorites page states

Existing guest/auth, loading skeleton, ready, empty/search CTA and error/retry states are preserved and tested. Failed reads never render raw API details. Retry uses only the application favorites endpoint. Header count remains absent until the shared list is known.

## 10. Favorite card semantics

Stored name/image/category/location render through existing safe presentation helpers. Hotelbeds TEST appears only with stored test-environment evidence. Cards explicitly state that a saved hotel is not a current offer. Old records retain their already-supported `Сохранённый вариант` and `Последняя сохранённая цена` labels and price-may-differ notice. New Hotelbeds favorites contain no price, room, board, availability, signed token or rate key. No historical amount is relabelled current.

## 11. Favorites -> hotel flow

Existing savedSearchLink opens the home search form with factual destination fields only. Dates/prices/rates never become selectedOffer or a signed/current Details snapshot. The retained `Посмотреть отель` link has an explicit new-search explanation; it does not automatically submit Availability. No new hotel-details route or background search was added.

## 12. Profile contract

Backend-supported editable fields remain full_name, phone, preferred_language (ru/en/kk), email_notifications and booking_reminders. Existing preference toggles were retained, without adding notifications functionality. Email is read-only identity. Existing password change remains separate. No traveler/document/birth-date/payment fields added. Profile writes are real DB mutations in normal application usage, so this work only tests them using mocked APIs/controllers; Codex did not perform real account edits.

## 13. Profile states

Loading, ready, saving, success, safe error/retry and auth-required behavior remain. Profile form now exposes aria-busy. Existing save/password promise guards prevent duplicate submissions. Server-confirmed user data is published to the existing session only while the originating token remains current.

## 14. Validation

Name is required after trim; name/phone limits remain 255/50 characters from the existing schema. Unicode code points are counted instead of UTF-16 units, avoiding a stricter accidental limit on supplementary characters. Phone format is not restricted beyond the supported existing length. Outgoing name and phone are trimmed. Email is neither editable nor included in update payload.

## 15. Dirty/reset/save

Existing dirty tracking, unchanged-save disabling and reset-to-server-snapshot are retained. Successful save establishes a new snapshot; failed save retains the dirty draft and confirmed user. No beforeunload handler was added. Existing separate password state is cleared on invalidation.

## 16. Session safety

Existing authFetch handles 401 by clearing only the token that issued the request; late old responses cannot log out a newer account. No retry loops/token logs/new auth provider. Error UI uses fixed copy. No session credentials enter markup; React session keys are internal reconciliation keys.

## 17. User-switch isolation

Context/store instances remain bound to token. Invalidation now clears items, mutations and pending state; old generations cannot remove new mutation locks. Profile invalidation clears user, draft, password, pending flags and feedback. New profile store starts empty and loads its own account. Local favorite controls are keyed by session, while Favorites cards disappear with the old list. Tests cover late load/save responses, logout, fresh second-user state and keyed control source contracts.

## 18. Limited personalization

Reused Navbar's explicit accountName and known favorites count, Profile's real account summary and existing favorites/history shortcuts. No recommendations, tracking, analytics, inferred preferences or new personalization data.

## 19. Header/navigation

Existing guest login/register and authenticated profile/favorites/logout remain. No navbar redesign or duplicated controls. Existing desktop/mobile CSS separation, mobile scroll, semantic links/buttons, Escape/menu focus and bounded display-name styles were preserved. Existing narrow-navbar tests remain green.

## 20. Safe errors

No raw backend error is rendered. Favorites uses fixed load/action errors; Profile uses existing fixed load/save/password copy. Internal codes/status are only used for auth branching. Added response validation prevents a malformed success response from adding an unrelated favorite or removing an item without success confirmation.

## 21. Accessibility

Retained headings, labels, keyboard-operable controls, focus-visible styles, field associations and live save status. Favorite action names reflect add/remove; pressed and disabled states are present, including unavailable-price cards. Saved removal has aria-pressed=true. Profile save form exposes busy state. Browser/screen-reader acceptance remains NOT RUN.

## 22. Responsive

Reused existing responsive CSS: favorites 3/2/1 columns with minmax(0,1fr), profile single column at narrow widths, account action stacking, wrapping/min-width constraints and existing narrow navbar behavior. Focused source/CSS checks and existing responsive suites pass for the contracts covering 320/390/768/1440. SSR/source checks are not independent visual overflow proof; owner must inspect staging.

## 23. Network/performance

Genuine backend defect: POST /favorites called Hotelbeds getHotelById -> Availability. The minimal controller change keeps the existing provider access gate, reads catalog.findHotel in the configured content environment, and allowlists hotel identity/name/country/city/destination/stars/image/contentEnvironment. Missing catalog hotel returns 404, with no external fallback. Raw catalog/provider objects, secrets and current-rate fields are not saved in the new snapshot. Existing user scope and UPSERT remain. Non-Hotelbeds mock flow stays intact, including its existing filter payload.

No transport, availability implementation, rate identity/signing, booking/payment, catalog sync, configuration or schema/migration source changed. Favorites/Profile UI uses app APIs only. Existing list-load deduplication remains; no fetch-on-render or new automatic refresh. This sprint deliberately changes favorite creation behavior to remove its provider request, while Hotelbeds provider runtime itself is unchanged.

## 24. Tests

New single focused frontend suite: `frontend/tests/favoritesProfileQuality.test.mjs`, PASS 45/45 (44 subtests plus enclosing test). Covers required guest/loading/ready/empty/error/retry, canonical identity/dedup, pending/add/remove/failure preservation, shared-view integration contracts, logout/user switch, saved-offer semantics, profile fields/validation/trim/dirty/reset/save/401, header/a11y/responsive and no-provider network. Store/API behavior tests run real application services against deterministic fetch mocks; component states use SSR; integration wiring/layout are source/CSS assertions where stated. Existing suites supply additional controller/session/navbar coverage.

New backend focused suite: `backend/tests/favoritesQuality.test.cjs`, PASS 1/1. Exercises actual controller with mocked catalog/DB, verifies allowlisted snapshot and authenticated user scope, forbids provider adapter search/resolution, tests missing local hotel without a write. No real account/favorite/profile writes. Existing 5B tests unchanged; 5B+initial 5C rerun passed 110/110 before four additional 5C tests. Final full frontend includes all 69 existing 5B tests.

## 25. Regression

| Gate | Result |
| --- | --- |
| Focused 5C | PASS 45/45 |
| Affected backend test | PASS 1/1 |
| Full frontend | PASS 286/286 |
| Lint | PASS; 0 errors, 3 inherited admin hook warnings |
| Build | PASS; JS 508.26 kB / gzip 143.03 kB; CSS 110.63 kB / gzip 20.07 kB |
| Canonical backend | PASS 101/101; 12 files |
| Other backend files | PASS 288/288; 23 files |
| Full backend | PASS 389/389; 35/35 files; no skipped/todo |
| sprint3mVerify | PASS; 206 backend syntax files, 424 scanned files, findings=[] |
| diff-check | PASS |
| Local disposable DB cleanup | PASS |

Frontend tests used existing offlineNetwork.cjs, sequential Node test runner and force-exit. Build TEST display flag was process-only. No env file edited. Full backend enumerated every *.test.js/*.test.cjs; one new file explains the increase from 34/388 to 35/389. Canonical runner was unchanged.

Backend used installed postgres:16 (--pull=never), unique container/database `sprint5c_583fc6da19bb` on 127.0.0.1:51679. Generated credentials and synthetic JWT/offer secrets were child-process-only and not printed. Existing migrations ran only in this disposable database. Canonical suites used their isolated schemas; each remaining file used a separate database cloned from the migrated template with existing READY fixtures. Provider HTTPS blocked by existing offline preload; provider methods mocked in relevant tests. No remote/application DB connection.

Each extra DB dropped in finally, final canonical-schema query returned zero, container removed with its anonymous volume and exact-name listing verified empty. Temporary harness removed. Evidence retained under OS-temp `sprint5c-evidence/sprint5c_583fc6da19bb` (per-suite logs, summary.json, cleanup.txt); frontend logs `sprint5c-focused.log` / `sprint5c-frontend.log`. Two intermediate added-test attempts failed due to shell Unicode encoding in a synthetic fixture; corrected source literals and reran successfully. No test assertions weakened.

## 26. Exact changed files

Existing files changed:

1. backend/controllers/favoriteController.js
2. frontend/src/components/AccountStates.jsx
3. frontend/src/components/SavedHotelCard.jsx
4. frontend/src/components/TourCard.jsx
5. frontend/src/context/FavoritesContext.jsx
6. frontend/src/pages/Profile.jsx
7. frontend/src/pages/TourDetails.jsx
8. frontend/src/services/accountListStore.js
9. frontend/src/services/profileStore.js
10. frontend/src/services/savedAccountData.js
11. frontend/src/utils/detailsFavorite.js
12. frontend/src/utils/profilePresentation.js

New files:

13. backend/tests/favoritesQuality.test.cjs
14. frontend/tests/favoritesProfileQuality.test.mjs
15. SPRINT_5C_FAVORITES_PROFILE_PERSONALIZATION_REPORT.md

No previous sprint report/test or unrelated owner file changed. Final status/diff-stat/full-diff/diff-check reviewed; new test files/report reviewed separately. All Sprint 5C work left unstaged. No git add/commit/push/reset/restore/clean/rollback.

## 27. Warnings

Existing >500 kB JS warning remains (now 508.26 kB). Existing large PNG assets remain. Three inherited admin hook warnings in BookingsTable, NotificationsTable and RefundsTable remain. Git LF-to-CRLF notices are inherited environment behavior.

## 28. Limitations

OWNER BROWSER ACCEPTANCE: NOT RUN. DEPLOY: NOT RUN. No claim of visual layout acceptance or real staging persistence/save acceptance. Missing local Hotelbeds content cannot be added until existing catalog data is available; no automatic provider fetch. Historical saved prices stay historical. Grand Kaptan's accepted upstream `22 EURIdeally...` limitation remains untouched.

Backend changed YES (favorite controller only). DB/schema/migration source changed NO. Hotelbeds provider runtime/transport changed NO; favorite action's previous Availability side effect removed YES. Booking changed NO. Payments changed NO. External service calls by Codex 0; real Hotelbeds calls 0; real application/remote DB mutations 0. Authorized disposable local test mutations ALLOWED / CLEANED. Hotelbeds LIVE disabled, booking/payments disabled, production infrastructure paused. No Render/env/deploy/provisioning.

## 29. Owner browser acceptance checklist

After CODE/OFFLINE PASS and a separately authorized staging release, owner only:

- Guest: Favorites auth-required/login/register, Profile redirect/login/register, header at desktop/390/320.
- Owner-controlled account: sign in; use an existing suitable Results offer to add/remove favorite, inspect same hotel state in Details and Favorites; verify one request per deliberate action and persistence after login again.
- Favorites: loading/empty/error-retry/ready; factual card, TEST where evidenced, historical amount labels only, explicit no-current-offer disclosure and search-form navigation without automatic search.
- Profile: actual account fields, read-only email, dirty/reset/save feedback. Edit one safe reversible supported field only if owner explicitly authorizes, restore it afterwards. If owner declines profile mutation, profile-save acceptance remains NOT RUN.
- Logout and second owner-controlled test account: no prior user's favorites/profile/pending state. Do not share credentials with Codex.
- Desktop, 390 and 320 (preferably 768/1440): keyboard/focus, labels, forms/cards/actions/header/footer and no horizontal overflow.
- Network during Favorites/Profile use: no Availability/Content/CheckRate/Booking/Cancellation requests. Existing search history is not a new action request. No automatic provider refresh to manufacture a fresh offer.

CODE / OFFLINE: PASS. OWNER BROWSER ACCEPTANCE: NOT RUN. DEPLOY: NOT RUN.
