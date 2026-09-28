# Sprint 5E — Authentication, Session & Account Security Quality

Status: CODE / OFFLINE: PASS. Focused 5E: 70/70. FULL FRONTEND: 414/414. Lint/build/verifier/diff-check: PASS. Backend unchanged; prior 5D 399/399 remains historical, not rerun. OWNER BROWSER ACCEPTANCE: NOT RUN. REGISTRATION OWNER MUTATION: NOT RUN. PASSWORD CHANGE OWNER MUTATION: NOT RUN. Deploy: NOT RUN.

## 1. Initial state

Started from clean tracked develop, HEAD 730ecae (`docs: record Sprint 5D owner browser acceptance`). Ran git status --short, branch, latest commit, diff-stat and full diff before editing. No partial 5E edits recovered. Unrelated README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, `tatus --short` and the unusual owner filename remain untouched. No git add/commit/push/reset/restore/clean.

Baseline 5A and 5B owner acceptance remains PASS. 5C skipped profile persistence, logout/login isolation and final narrow-width browser checks remain NOT RUN / OWNER SKIPPED. 5D owner guest, history GET, [] -> EMPTY and browser-observed no-provider checks remain PASS; READY/Details remains NOT RUN because no stored bookings exist. Prior full backend 399/399 is historical.

## 2. Auth architecture audit

Pre-change contract: main StrictMode -> FavoritesProvider -> BrowserRouter -> App. useSession reads token/user from localStorage through sessionSnapshot/readSession and subscribes to storage/pageshow/travio-auth-changed. No current-user startup validation exists. ProtectedRoute trusts stored token/user, then checks stored role for admin. Favorites is a public route with account auth states; Profile/history/checkout/voucher/admin use ProtectedRoute. Navbar uses the same useSession.

Login/Register delegate to AuthPage/AuthView and createAuthFormStore. POST /api/auth/login returns token + public user; POST /api/auth/register returns public user without login. Registration supports full_name/email/password/optional phone. Email is trimmed client-side, normalized lowercase server-side; password is unchanged. Existing form stores deduplicate, abort stale attempts, clear passwords and use fixed error messages. Return paths use an exact allowlist, including bounded booking IDs and role-gated admin paths.

GET /api/auth/profile returns public user plus booking stats. PUT /api/auth/profile updates supported personal/preferences fields only. PUT /api/auth/password accepts currentPassword/newPassword; minimum eight JS characters. bcrypt cost 12, JWT default expiry 7d (configurable). JWT middleware verifies signature/expiry, fixed 401/500 messages. requireRole gates admin endpoints. Existing app/auth rate limiters remain. Public serializers omit hashes; logger redacts sensitive metadata. No auth service/identity provider separate from authController exists.

Profile store is page-local with load/save/password deduplication, generation guards and cleanup; Favorites uses createAccountListStore with token ownership. Booking history already uses token + user ID and session-event invalidation. authFetch attaches bearer to configured API base, clears matching token on 401, but retains raw error body internally. Logout clears both storage entries, emits event and navigates home. No remote logout exists.

Implementation plan after audit: validate restored sessions before exposing identity; retain storage strategy and server contracts; fail closed on bootstrap failures without treating 5xx as invalid credentials; scope Favorites/Profile by user identity; preserve existing auth form/password/return behavior and test it. No backend or schema change planned.

## 3. Token/session source of truth

Existing localStorage keys `token` and `user` remain. No cookie/storage migration, new auth provider or independent account identity store. session.js now exposes a cached validated snapshot; useSession returns identity only after a successful login response or current-user validation. Persisted user/role alone cannot open private/admin UI. Token stays in the Authorization header to the configured own API base, never in query strings or rendered text. No real credentials used in fixtures or reports.

JWT signature and expiry remain server responsibilities. No client JWT decode, refresh token, polling, timer-based expiry inference or remote logout was introduced. Expired credentials are invalidated on bootstrap/current authenticated API 401. Session restoration performs the existing own GET `/api/auth/profile`, not `/auth/me`.

## 4. Bootstrap states

States: `unknown` (restored token not yet checked), `bootstrapping` (validation pending), `guest`, `authenticated`, and `error` (validation unavailable). Unresolved/error snapshots expose null token/user to components. main wraps FavoritesProvider/BrowserRouter/App in SessionBoundary; unresolved startup therefore mounts no private pages or Favorites requests. ProtectedRoute independently enforces the same gate. The existing auth-card CSS provides loading/status and fixed error/retry/exit UI.

Concurrent validation calls share one promise for the storage snapshot and auth revision. useSession schedules through a cancellable zero-delay effect, preserving StrictMode setup/cleanup behavior. Validated rerenders do not revalidate. Login already supplies verified identity and does not cause another bootstrap GET. Profile can consume the validated bootstrap user once; later explicit profile loads use the existing GET. That one-use response is scoped to the current validated session and discarded on identity change. This is an in-memory last-validated snapshot, not a live account feed.

401 or profile 404 (deleted/missing user) clears session and shows a fixed sign-in notice. Network/5xx, invalid JSON and malformed identity fail closed into error without deleting stored credentials. Only explicit Retry repeats validation; Exit performs local logout. Snapshot/revision guards discard late validation after logout or another login. No deployment bootstrap/network acceptance is claimed.

## 5. Login

Preserved the existing form store's idle/pending/success-navigation/error behavior, synchronous in-flight guard, cancellation/generation checks and validated allowlisted login response. Email is trimmed; password bytes represented by the input string are passed unchanged. Fixed 401 copy does not distinguish unknown email from wrong password. Labels, native form submit/Enter, disabled pending inputs/button, focus-to-first-validation-error and accessible show/hide remain. POST refuses redirects, so credentials are not forwarded by an API redirect.

Successful login updates the existing session once and uses the existing safe replace-navigation. Confirmed authenticated visits to Login/Register now redirect through the same return allowlist instead of presenting a second credential form. Unresolved auth visits show session loading/error. Login can display the fixed expired-session notice. Existing unit/controller contracts were preserved.

## 6. Registration

Preserved supported full_name, email, password and optional phone only. confirmPassword is UI-only; role and unrelated fields are never submitted. Existing name/email/phone bounds and minimum eight-character password validation remain, with confirmation match and duplicate-submit guard. Success clears sensitive fields and navigates to login; registration does not establish an authenticated session. Existing intentional 409 account-conflict text remains fixed; raw database/server response is not shown. No staging registration performed.

## 7. Safe return navigation

Reused authReturnPath/authOrigin without extending their allowlist: Profile, Favorites, My Bookings/aliases, bounded positive booking IDs; admin destinations only for admin. Absolute/protocol-relative URLs, javascript/data schemes, traversal, encoded targets, arbitrary queries/fragments and unsupported paths fall back to home. ProtectedRoute retains returnTo on login navigation. Registration preserves the bounded return destination through its login link/success navigation. Checkout return behavior was not expanded.

## 8. Password UX

Preserved current-password/new-password autocomplete, hidden-by-default fields, labeled show/hide buttons with aria-pressed, and independent confirmation inputs. Password strings are neither trimmed nor put in URLs/storage/logs. Login/registration clear password fields after completion; password change clears inputs on success/failure. Only transient form state holds inputs. Tests verify native submit markup and visibility wiring; actual keyboard/focus/screen-reader browser acceptance remains NOT RUN.

## 9. Password change

Existing PUT `/api/auth/password` only: currentPassword and newPassword; confirmPassword checked locally, never sent. Existing minimum eight-character contract, pending/dedup guard, fixed wrong-current-password guidance and success message retained. General Profile save and security form remain separate, with distinct payloads, state and banners. Session change invalidates pending password completion and clears its fields/banners. No real password mutation performed. Existing backend password changes do not revoke all previously issued JWTs; this sprint does not claim or add all-device revocation.

## 10. Logout

Existing local logout clears both keys, emits the established session event and navigates home. Repeated logout is safe and sends no request. Added immediate connected-store invalidation for Favorites/Profile on owner change, plus cleanup on unmount. Profile invalidation clears identity, draft, dirty state, pending flags, errors, password fields and both success banners. Favorites clears items/pending mutations and ignores late completions. Booking history already subscribes globally and clears list/details/filter state; its implementation remains unchanged. The validated session view hides private content and Navbar receives no old identity.

## 11. User-switch isolation

Favorites reuses createAccountListStore, now owned by the serialized token + normalized user ID. Its exposed favoriteSessionKey also changes with identity, resetting existing card/details favorite-control feedback. createFavoritesStore is a factory for that same store, not a second cache; connect subscribes to existing session events.

Profile captures current user ID along with token, checks both before dispatch/publication, subscribes while mounted, and discards old pending results. ProtectedRoute's existing user-ID key remounts Profile on a user switch. Injectable readToken/readUserId/API/publish seams preserve offline/SSR use without browser storage. In normal application mounting, bootstrap guarantees a known identity before Profile exists. Token-only injected fixtures remain supported; they are not the production auth gate.

Tests exercise EMPTY/READY/ERROR/PENDING account stores across same-token identity switches, logout with dirty/password state, delayed favorite mutations/password responses and new user-owned history loads. New user state starts fresh. Booking history's existing token/user cache was reused, not replaced. No new cross-tab system; existing storage/pageshow/auth events remain.

## 12. Expired/invalid session

Unauthorized own API responses clear only the captured current token and identity. A late 401 from another token or same-token/different-user request cannot clear the newer session. Bootstrap additionally checks auth revision and full storage snapshot. Cleared identity is immediately unavailable to useSession/ProtectedRoute; connected account stores clear sensitive state. No credential retry or redirect loop. Server expiry is enforced when a request is checked; no background expiration monitor was added.

## 13. 401/error handling

Expired notice: “Сессия завершена. Войдите снова.” Bootstrap failure: fixed “Не удалось проверить сессию. Попробуйте ещё раз.” Login/register/Profile retain their existing fixed messages. authFetch no longer retains raw error payload/message for `/auth/` paths; it exposes fixed AUTH_REQUEST_FAILED plus numeric status, and AUTH_REQUIRED for 401. Non-auth operational error payload contracts remain unchanged. Invalid JSON cannot establish a session. 5xx/network failure keeps stored credentials and requires explicit retry where bootstrap failed.

## 14. Protected routes

Profile, history list/details, aliases, checkout, voucher and admin retain their existing route structure. ProtectedRoute adds loading/error gating before guest/admin checks and retains user-ID remounting. Favorites stays a public route with its existing guest auth-required view, behind the root bootstrap boundary. Admin UI uses server-confirmed role; backend role checks remain authoritative and unchanged. Login/Register authenticated redirects use the existing role-aware safe destination helper. No admin redesign or authorization expansion.

## 15. API client safety

authFetch rejects caller-supplied absolute/protocol-relative URLs, backslashes, whitespace/fragments and decoded dot-segment paths before fetch, retaining configured API_URL as the trusted own backend base. Redirect following is disabled for authenticated calls, bootstrap and credential POSTs. Authorization is never appended to a query and is not added to provider/image fetches. Both same-token identity and token guards protect 401 invalidation. No Hotelbeds client change. Existing configured cross-origin own backend remains supported; VITE_API_URL was not changed.

## 16. Header auth state

Navbar source/layout is unchanged; its existing useSession now returns only validated identity. Root bootstrap prevents guest-controls/old-user flicker during restoration. Guest has login/register; authenticated has account/logout; admin indication requires confirmed admin. Logout removes old username. Favorites count uses the same newly scoped Favorites store. Prior narrow navbar rules remain intact.

## 17. Privacy/error disclosure

No token/JWT/hash/raw server error is rendered or logged by the changed auth flow. Bootstrap applies the existing strict authSuccess/publicProfile allowlist, including supported role/type checks, before publishing identity. Tests use synthetic fixtures and inspect behavior without printing credentials. Numeric internal user IDs are used for ownership, not added to account UI. No new JSON dump or error.message JSX interpolation.

## 18. Accessibility

Preserved visible labels, email semantics, autocomplete, native forms, keyboard submit, validation association, show/hide accessible names/pressed state, pending/disabled controls, status/alert/live-region semantics and focus-visible CSS. SessionBoundary uses one h1, an accessible loading status and plain labeled retry/exit buttons. Focus after form validation remains managed by existing focusAuthError; server failure leaves the form available. No new icon-only controls. Browser/screen-reader acceptance NOT RUN.

## 19. Responsive

No CSS changed. Session state uses the established auth card; existing 360/600/1024 breakpoints and min-width:0/wrapping cover 320/390/768/1440 intentions. Profile security stacking and narrow Navbar rules remain. Focused and existing regression assertions cover source/CSS/SSR contracts, not measured browser geometry. Actual overflow acceptance NOT RUN.

## 20. Network/external safety

Focused tests mock only own auth/profile/password/favorites/history endpoints; unexpected origins/paths fail. External service calls: 0. Real Hotelbeds calls: 0. Real application/remote DB mutations: 0. No payment/email/identity-provider calls, real registration or password change. Existing full frontend tests include mocked provider methods and mocked backend query/controller calls; these are not real Hotelbeds/DB operations. offlineNetwork.cjs remains preloaded. No staging/browser/Render operation performed.

Hotelbeds TEST/read-only baseline retained; LIVE, real booking and payments remain disabled; production infrastructure paused. No env-file/config change. Build uses the established TEST flag in the child process only.

## 21. Backend changes

Backend source changed: NO. No auth endpoint, JWT/bcrypt contract, middleware, rate limiter or public serialization change needed. DB/schema/migration changed: NO. No disposable DB required. Full backend not rerun; prior 5D 399/399 remains historical. Existing frontend regression still exercises real backend auth/profile controllers with deterministic query/crypto/provider mocks. No new backend focused suite created.

## 22. Tests

One new focused suite: `frontend/tests/authSessionSecurityQuality.test.mjs`, 69 subtests plus enclosing test = 70 tests. Existing suites/assertions are unchanged. Coverage includes bootstrap unknown/guest/auth/error, pending dedup, reload memory model, malformed stored user, spoofed role, 401/404/5xx/network/JSON failures, retry, one-use Profile response, stale bootstrap, login/register validation/pending/success/errors, unaltered passwords, safe return targets, auth-page redirects, protected/header SSR, logout/store clearing, same-token user isolation in all account states, late 401, API path/redirect boundaries, password form/payload isolation, a11y/CSS and allowed-network assertions.

Existing authUx/profileUx/favoritesProfileQuality/myBookingsQuality suites initially passed 123/123. First complete frontend run exposed an SSR dependency regression: createProfileStore accessed localStorage even when API/readToken/publish were injected in releaseCandidate.test.mjs. Corrected the store's optional identity reader, retaining production user-ID guarding and browserless injection support. No old tests changed, weakened or skipped. Reran mandatory gates after the fix.

These are deterministic service/store tests, SSR rendering and source contracts, not a mounted browser or deployed acceptance run. Hard-reload and StrictMode claims are bounded to snapshot/promise/effect-scheduling contracts; browser rechecks remain required.

## 23. Regression

| Gate | Final result |
| --- | --- |
| Focused 5E | PASS 70/70; zero failed/skipped/todo |
| Full frontend | PASS 414/414; zero failed/skipped/todo |
| Lint | PASS, 0 errors; 3 inherited admin hook warnings |
| Build | PASS; 172 modules; JS 504.41 kB / gzip 143.01 kB; CSS 105.15 kB / gzip 19.16 kB |
| Bundle warning | Existing >500 kB warning remains |
| sprint3mVerify | PASS; 208 backend syntax files, 433 scanned files, findings=[] |
| diff-check | PASS |
| Full backend | Not required/rerun; backend unchanged, prior 399/399 historical |

All gates above were completed after the SSR injection fix. Final status/diff-stat/full tracked diff reviewed; new boundary/suite/report inspected separately. All 13 scoped files remain unstaged. No existing test was modified.

Commands: `node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit frontend/tests/authSessionSecurityQuality.test.mjs`; same runner with `frontend/tests/*.test.mjs`; `npm.cmd --prefix frontend run lint`; `npm.cmd --prefix frontend run build`; `node backend/scripts/sprint3mVerify.cjs`; `git -c core.safecrlf=false diff --check`. Test logs: OS-temp `sprint5e-focused.log`, `sprint5e-frontend.log`; preliminary affected-suite log `sprint5e-existing.log`.

## 24. Exact changed files

Tracked changes:

1. `frontend/src/services/session.js` — validated bootstrap snapshot, one-use Profile response, safe session notice and identity helpers.
2. `frontend/src/hooks/useSession.js` — subscribes to validated snapshot and schedules deduplicated validation.
3. `frontend/src/main.jsx` — bootstrap boundary before account providers/router.
4. `frontend/src/components/ProtectedRoute.jsx` — unresolved/error gate before private/admin access.
5. `frontend/src/components/AuthPage.jsx` — authenticated redirect, bootstrap state and expired notice.
6. `frontend/src/services/authFormStore.js` — credential POST redirect refusal.
7. `frontend/src/services/authFetch.js` — own-path validation, redirect refusal, identity-aware 401 and safe auth error projection.
8. `frontend/src/context/FavoritesContext.jsx` — existing store scoped to token/user identity, immediate invalidation and control key.
9. `frontend/src/services/profileStore.js` — identity guard, connected cleanup and bootstrap response consumption; injectable SSR identity reader.
10. `frontend/src/pages/Profile.jsx` — connects/disconnects existing page-local store.

New files:

11. `frontend/src/components/SessionBoundary.jsx` — loading/error/retry/exit boundary.
12. `frontend/tests/authSessionSecurityQuality.test.mjs` — sole focused 5E suite.
13. `SPRINT_5E_AUTH_SESSION_ACCOUNT_SECURITY_REPORT.md` — this report.

Prior sprint reports, unrelated owner files, backend and existing tests remain untouched. Changes remain unstaged.

## 25. Warnings

Same three inherited admin react-hooks/exhaustive-deps warnings in BookingsTable, NotificationsTable and RefundsTable. Existing >500 kB bundle warning remains; no new dependency or image asset. Existing large PNGs and Git LF-to-CRLF notices remain. Exact final bundle size is recorded with regression results.

## 26. Limitations

Owner/deployed/browser acceptance NOT RUN. localStorage persistence remains and has not been migrated to cookies. Backend JWT expiry/role claims and lack of all-device revocation remain existing contracts. Bootstrap failure temporarily gates the application, with explicit retry/local exit; public UI becomes available after guest resolution. Account caches are session-owned in-memory snapshots, not live data. No new provider/auth features, cross-tab protocol, polling or schema introduced. 5C skipped and 5D READY/Details browser evidence is not upgraded by 5E offline tests.

Auth architecture: HARDENED, not replaced — same localStorage, session module, JWT backend and account stores; new startup validation/gating and ownership guards. Hotelbeds behavior changed: NO. Booking behavior changed: NO. Payments changed: NO. Shared auth routes/guards necessarily affect access to protected pages, but booking/payment operations are unchanged and disabled.

## 27. Owner browser acceptance checklist

Prepare only; NOT RUN. On a separately approved staging deployment:

- Guest: Login/Register render, labels, show/hide, keyboard submit and safe validation; direct Profile/Favorites/My Bookings and Details protected behavior, no private flash.
- Existing account: login with safe returnTo; authenticated header/Profile/Favorites/My Bookings; hard reload shows validation/loading then correct user, one bootstrap GET `/api/auth/profile`; Profile can reuse that response; history still uses `/api/bookings/me`.
- Authenticated visits to Login/Register redirect safely. Verify no admin UI for ordinary account. On naturally occurring expiry/401, private content closes and sign-in notice is safe; no request/redirect loop. Network/server failure should permit explicit retry without false guest authentication.
- Logout: old username, private data, drafts and banners disappear; login again. Use only an already available safe second account for user-switch acceptance; otherwise USER-SWITCH OWNER ACCEPTANCE = NOT RUN.
- Network: only own application login/account APIs for these actions. No Availability, Content, CheckRate, Booking or Cancellation from account/auth actions. This is a browser Network check, not an independent server traffic audit.
- At 390/320 plus desktop (and 768 if available), inspect Login/Register, security section, auth-required/bootstrap states and guest/auth header for overflow, readable labels, keyboard focus and accessible pending/errors.
- Registration mutation is OPTIONAL. Do not create a real staging account merely for PASS. REGISTRATION OWNER MUTATION: NOT RUN unless owner explicitly chooses it later.
- Password change is OPTIONAL. Do not modify a real password merely for PASS. PASSWORD CHANGE OWNER MUTATION: NOT RUN unless owner explicitly authorizes it later.
- No booking creation to obtain READY/Details evidence. Preserve prior skipped acceptance states.

OWNER BROWSER ACCEPTANCE: NOT RUN. REGISTRATION OWNER MUTATION: NOT RUN. PASSWORD CHANGE OWNER MUTATION: NOT RUN. No deploy, Render/env change, production provisioning, git add/commit/push performed.
