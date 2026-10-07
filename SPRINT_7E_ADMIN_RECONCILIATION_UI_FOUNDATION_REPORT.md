# Sprint 7E — Admin Reconciliation UI Foundation

SPRINT 7E — CODE / OFFLINE: PASS — focused foundation and repaired bundle regression.
ADMIN RECONCILIATION UI FOUNDATION: PASS. READ-ONLY OPERATOR UI: PASS.
Existing Admin architecture: REUSED + HARDENED.
Full frontend aggregate PASS is not claimed; owner browser acceptance pending.
COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.

## 1. Baseline

2026-10-07, Asia/Qyzylorda. develop, tracked tree clean at start, HEAD `a4e8594 docs: record Sprint 7D operations read model verification`. 7D committed. Unrelated untracked README.txt, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, docs/ and two anomalous filename entries preserved. No reset/restore/clean or git add/commit/push/deploy.

7D queue/detail read model ready offline; deterministic identity/family aggregation; no raw payload/secrets/PII/actions. Durable storage, real cases and PSP remain unavailable. Preserve payment provider none/mode disabled, production charge/refund/sales hard gates, disabled booking and Hotelbeds LIVE off. No config, dependency, DB/schema, account, credential or infrastructure changes.

## 2. Existing Admin architecture

AdminPanel lives at existing /admin and /admin/bookings routes, both under ProtectedRoute adminOnly. It uses Sidebar tab navigation, shared Header/DashboardCards and separate bookings/refunds/operations/notifications/system/incident sections. Lists use tables; existing detail/edit modal patterns can execute operations, so this sprint uses an inline read-only detail section without adopting mutation handlers.

ProtectedRoute waits for a validated session, redirects guests to login and non-admins to /. A cached localStorage admin object alone is not authorization. Existing adminService/authFetch implement API-relative requests and auth expiry handling. New reconciliation contract has no configured API and does not call those transports.

Backend adminOperations already requires authMiddleware, requireRole(admin), admin.operations.read, and additional permissions for system endpoints. Inspected those guards narrowly; no route/controller changed. Existing broad admin payloads are not used as reconciliation data. No Home/Search/Hotel Details/Checkout/Profile/Favorites/My Bookings runtime changes. App.jsx changes only the eager stylesheet import required by existing bundle architecture.

## 3. Data-source decision

Choose frontend service contract + truthful unavailable state, with NO backend route. There is no durable repository to query; adding a permanently empty backend endpoint would add architecture without a data source.

Runtime readReconciliationList returns exactly `{ source: 'unavailable', items: [] }`; detail returns fixed not-found/404. No network transport, real queue, DB access, fallback to admin booking records or synthetic runtime data. Test-injected future read adapters exercise loading/errors/empty/list/detail without changing default runtime behavior. No environment flag can enable fixtures.

Frontend validates/selects the exact supported 7D row/detail fields, then translates them into display labels. Synthetic test cases are produced by the real 7C evaluator and 7D read model, only in frontend/tests. Future datasource integration must feed the backend safe read model rather than expose internal objects.

## 4. Admin authorization

Reuse the existing route/session architecture; no new role system. ReconciliationCenter also checks validated admin access, and its store checks admin identity before reads and after asynchronous responses. Account/token/role changes clear or suppress old data; late reads cannot reveal another admin's snapshots. 401/403 clear queue/detail to a fixed access-denied state. Detail close invalidates pending responses.

Tests exercise actual ProtectedRoute with admin/user/guest/restored-unvalidated admin sessions; store also denies unauthorized reads. Current admin-only frontend access: READY in tested scope. No reconciliation backend endpoint or public data exists. Future authenticated data endpoint needs server-side admin/permission enforcement; frontend checks alone will not authorize sensitive backend data. Existing backend admin guards are reusable partial groundwork.

## 5. Queue UI

Sidebar adds “Сверка платежей” within Admin only. AdminPanel renders ReconciliationCenter for that tab. Russian semantic table includes case-open control, textual priority, category/status, payment/booking state and recommended action. No consumer navigation entry or redesign.

Priorities have both readable text and badge styling; no SLA. Case identity is retained, with short button text and full accessible label. Frontend collapses identical family rows and fails closed on contradictory duplicate family projections instead of choosing a lower-risk row. Preserves 7D sorting by priority/case identity. No fabricated queue counts or demo incidents.

Amount/currency values, lifecycleStatus and raw provider names are not invented: 7D does not supply those trusted values. Supported money consistency checks appear in detail. Provider/payment identifiers remain safe fingerprints internally rather than arbitrary source labels or credentials. No raw JSON dump.

## 6. Detail UI

Case-open button calls the read-detail contract; inline labelled detail region shows full caseId, Russian priority/category/status/reason, payment/booking summaries, amount/currency consistency, review/reconciliation/compensation flags and recommendation text. It is not a modal and does not trap focus. Open attempts focus on detail heading; close restores focus to its queue control.

Timeline selects only supported event type, internal/observed payment states, booking state, safe reason/action and money consistency checks. It explicitly says display order does not represent provider event order. An incoming failed event and retained captured observation remain distinct. No invented successful transition, chronology, provider response or resolution. Identity mismatch fails closed.

REVIEW_REFUND, REVIEW_CANCELLATION, VERIFY_PROVIDER_STATUS remain text recommendations. No refund/cancel/retry/resolve/force-success action button, callback or transport exists. Only case opening, closing and local filters are interactive.

## 7. Filters/states

Five labelled local filters: priority, category, queue status, manual review and compensation review. They operate on safe rows without server queries/provider calls. No polling, websocket or refresh button.

Distinct loading, available-empty, unavailable-source, filtered-empty, access-denied, generic request error, detail loading/error and detail 404 states. Current runtime shows “Источник данных сверки пока не подключён.” Available source with no rows can show “Нет случаев для проверки.” Unavailable response containing rows is rejected. Backend error messages/stacks are never rendered.

Store is page-local, subscription-based and discards stale asynchronous results. It does not persist cases, drafts, operator actions or evidence in localStorage/DB. Existing session remains the identity source.

## 8. Security/data minimization

safeRow/safeList/safeDetail explicitly select primitive finite enums, hashes, booleans and supported observations; arbitrary extra fields are omitted. Core strings, coerced enum objects, unsafe action flags and malformed identities are rejected with fixed errors. Contract safety flags require commercialSuccess=false, PAYMENTS_DISABLED, contractOnly=true and operatorActionsExecutable=false. Runtime does not import backend server code; backend contract imports are test-only.

No raw webhook/signature/secret/API key/Authorization/JWT/DB URL/offer token/card data/full provider payload or traveller name/DOB/email/phone/passport in UI state or markup. Tests inject markers into raw/auth/card/PII/manual fields and confirm omission. No JSON.stringify debug rendering. No mutation API or operator endpoint added.

Real PSP calls: 0. Hotelbeds Availability: 0. CheckRate: 0. Booking: 0. Cancellation: 0. Refund calls: 0. Cancellation calls: 0. Operator mutation calls: 0. Real DB mutations: 0. New runtime service has no fetch/authFetch/axios transport; focused fetch trap records zero calls. Adjacent backend suites trap DB/provider/refund/admin action/log operations. Synthetic fixtures only, no real webhook/status lookup/payment/card.

## 9. Accessibility/responsive

Semantic caption/table, column headers, native labelled selects and case buttons, status/alert regions, textual priority and visible focus. Inline detail has a focusable heading and close control; no modal keyboard behavior required. Scoped CSS wraps filters on narrow viewports, allows local table scrolling and breaks long case identities. No global consumer CSS selectors introduced.

New stylesheet is eagerly imported beside existing admin.css in App.jsx to preserve the established single global stylesheet contract. No route implementation moved into the initial JS graph. Source/SSR/CSS and bundle checks passed; actual browser focus, geometry and narrow-viewport acceptance are still owner checks, not claimed tested here.

## 10. Tests

Final focused frontend: **30/30 PASS** (29 scenarios plus parent). Preliminary run: 28/30, one scenario and its parent failed because the test searched HTML option value attributes for internal enums. Corrected to inspect visible text; enum-backed form values remain legitimate. No pre-existing test assertion weakened.

Backend focused: **NOT RUN** — no backend runtime changes. Adjacent backend: **76/76 PASS**, one invocation of 7C paymentReconciliationFoundation and 7D reconciliationOperationsReadModel with offline HTTPS/lazy pg blocking. Existing admin/session tests are included in the frontend aggregate; auth/session implementation unchanged.

Full frontend: **841/843 PASS, 2 failures** in one aggregate of 31 files, cancelled/skipped zero. Both failures are one bundle stylesheet scenario and its parent: initial component-local CSS produced a second stylesheet, violating the existing single eager stylesheet requirement. Fixed by moving only the CSS import to App.jsx; no old test changed. Final targeted run of focused 7E plus performanceBundleQuality: **121/121 PASS** (30 focused + 91 bundle). Full aggregate was not rerun and its exact limited result is retained; no synthesized full-PASS total claimed. No remaining failure in the targeted bundle verification.

Full backend: **NOT RUN** — backend unchanged. Known DB-blocked count: NOT MEASURED this sprint; adjacent has zero blocked/failing cases. Historical backend blocked suites are not recounted as a new full result.

Full frontend lint ran once: **PASS**, exit 0, 0 errors and 3 existing exhaustive-deps warnings in BookingsTable/NotificationsTable/RefundsTable. Final targeted lint of modified/new JS/JSX after the import move: **PASS**, no output. Initial build passed; final build rerun after concrete CSS integration change: **PASS**, single 108.35 kB CSS asset, hashed lazy AdminPanel chunk, no chunk warning. performanceBundleQuality independently builds in memory as its existing regression behavior. Build/lint checks were not repeated solely to improve totals.

Release verifier: **PASS**, 237 backend syntax files, 518 secret-scan files, findings empty. Sprint 6A: **PASS**. `git -c core.safecrlf=false diff --check`: **PASS**. Each ran once on final source; only this report's result text was finalized afterward. Index empty. No 6B with intentionally uncommitted work. No deploy/browser acceptance. Synthetic SSR/store checks do not substitute for owner browser acceptance.

## 11. Exact files

Modified:

- frontend/src/App.jsx — one eager reconciliation stylesheet import.
- frontend/src/pages/AdminPanel.jsx — reconciliation component/title/tab wiring.
- frontend/src/components/admin/Sidebar.jsx — admin-only navigation entry.

New:

- frontend/src/components/admin/ReconciliationCenter.jsx.
- frontend/src/services/reconciliationService.js.
- frontend/src/services/reconciliationStore.js.
- frontend/src/utils/reconciliationPresentation.js.
- frontend/src/styles/ReconciliationCenter.css.
- frontend/tests/adminReconciliation.test.mjs.
- SPRINT_7E_ADMIN_RECONCILIATION_UI_FOUNDATION_REPORT.md.

All changes unstaged; owner files untouched. No backend source, dependency, config, schema/migration or route change. Build output is ignored; no artifact publication.

## 12. Runtime impact

Frontend runtime changed: YES, Admin navigation/read-only section and scoped eager CSS. Backend runtime changed: NO. DB/schema changed: NO. Operator mutation routes: 0. Default source is unavailable with zero rows/transport calls. Existing payment/booking/consumer runtime paths and hard gates remain unchanged.

No fake runtime cases, refund action, cancellation action, payment retry, resolution action, real PSP or DB persistence. No automatic reconciliation/compensation. Real payments remain blocked.

## 13. Remaining production gaps

| Capability | After 7E |
| --- | --- |
| Admin reconciliation queue UI | READY — tested foundation; owner browser acceptance pending |
| Admin reconciliation detail UI | READY — synthetic safe projection tests; no real datasource |
| Admin authorization | READY for current validated frontend guard; future data endpoint authorization pending |
| Safe read data contract | READY — 7D-compatible supported allowlists |
| Durable reconciliation storage | FUTURE REQUIREMENT |
| Real reconciliation cases | UNAVAILABLE until durable evidence source exists |
| Operator actions | NOT IMPLEMENTED |
| Real PSP status lookup | BLOCKED — no PSP selected |
| Automatic reconciliation | NO |
| Real payments | BLOCKED |

Filters READY; truthful unavailable state YES; admin-only access YES; normal/unauthenticated denied YES in tested scope. Synthetic runtime cases/raw webhook/secrets/traveller PII NO. Refund/cancellation/payment retry/mark resolved executable NO. No commercial P0 work package closed; existing production gaps remain. COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.

## 14. Future durable operations path

Future separately authorized work must create genuine durable unresolved-case/evidence storage, server-side admin role/permission checks and GET-only projection endpoints using the existing 7D read model. Then replace the unavailable frontend adapter with those safe reads, preserving schema, identity checks and generic error states. Any real status query or operator mutation needs a separate reviewed provider/evidence/authorization/audit/idempotency boundary. UI recommendations must not become executable operations implicitly.

OWNER BROWSER RECHECK: **REQUIRED, NOT PERFORMED HERE**, because frontend runtime changed. After separately authorized deployment or local owner preview: log in as admin → Admin → “Сверка платежей”; confirm page opens with unavailable-source message; confirm no Refund/Cancel/Retry Payment/Mark Resolved control; check keyboard/narrow viewport and ordinary consumer navigation. Do not initiate Hotelbeds search/CheckRate/webhook/payment/refund/cancellation. Backend unchanged, so this sprint adds no backend health acceptance requirement. No deploy performed.
