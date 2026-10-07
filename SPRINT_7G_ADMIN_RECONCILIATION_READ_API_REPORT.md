# Sprint 7G — Admin Reconciliation Read API Contract

SPRINT 7G — CODE / OFFLINE: PASS — tested scope.
ADMIN RECONCILIATION READ API: PASS. FRONTEND API INTEGRATION: PASS.
Existing architecture: REUSED + HARDENED. Commercial production readiness: NO. Production sales readiness: NOT CLAIMED.

## 1. Baseline

2026-10-08, Asia/Qyzylorda. Branch develop; tracked tree clean at start; HEAD `4bce49c docs: add reconciliation persistence design`. Sprint 7F committed. Unrelated untracked owner files preserved. 7D read model, 7E UI foundation and 7F disabled/test repository and schema design reused. Previous 7E owner browser acceptance remains pending separately.

PAYMENTS_MODE=disabled / PAYMENTS_PROVIDER=none and existing hard money gates remain unchanged. No real PSP, merchant account, credentials, LIVE booking, dependency, migration, deployment or git add/commit/push.

## 2. Existing admin API architecture

server.js already mounts adminOperations at `/api/admin`. Its existing controllers use Express JSON and page/limit pagination with pagination metadata. The new router registers within that namespace at `/reconciliation`; no new server mount or parallel authentication system. Service owns query validation, repository reads and 7D projection; router owns transport/error mapping. Existing requestTelemetry supplies `req.requestId` and `x-request-id`; no extra business correlation is accepted from a request header.

## 3. Authorization

Existing authMiddleware verifies Bearer JWT; requireRole('admin') enforces role; requirePermission('admin.operations.read') enforces existing permission. Guest/invalid JWT: 401; authenticated ordinary user: 403; admin: reads allowed. Existing auth error messages and role/permission behavior unchanged. Namespace terminates before other admin routes; every method is guarded, and only GET is accepted. POST/PUT/PATCH/DELETE (also HEAD) return 405/Allow: GET after authorization. Unknown descendants return safe 404.

## 4. Repository injection

Router factory accepts a repository implementing the 7F contract; service validates it with assertRepository. Actual admin registration calls the factory without injection and uses the frozen disabled repository. No PostgreSQL import, runtime mock selection or environment datasource activation exists in this seam. Focused tests inject the existing test-only memory repository; it is not runtime storage. Service never calls upsertCase or findByCorrelation.

## 5. List contract

`GET /api/admin/reconciliation`: current default is HTTP 200 `{source:'unavailable',code:'RECONCILIATION_SOURCE_UNAVAILABLE',items:[],pagination:{page:1,limit:25,total:0,pages:1}}`. Supplied valid pagination is reflected. This is a successful read contract with an unavailable datasource, not fabricated available cases.

Available repository snapshots pass through operations.list before serialization. Only existing 7D list fields are returned: safe case/family/request hashes, provider fingerprint, category/priority/status/reason, observed payment/booking states, consistency flags, recommendation and disabled commercial/action markers. No new amount, currency, lifecycle or time fields invented beyond the existing 7D projection. Repository evidence, timestamps, version and storage internals are not serialized. Available empty source is distinct from unavailable.

## 6. Detail contract

`GET /api/admin/reconciliation/:caseId`: lowercase 64-hex case or family identity only; no detail query parameters. Disabled source and missing case return HTTP 404 `{code:'RECONCILIATION_CASE_NOT_FOUND'}`. Available record snapshots pass through operations.detail using the requested identity; mismatched identity cannot return another case. Exact existing safe detail projection includes related hashes and normalized timeline, consistency flags and recommendations. No raw provider evidence or actual commercial success. Malformed identities: 400; repository/data failure: fixed 503.

## 7. Filters/pagination/sorting

Allowlisted priority/category/status enums and exact string booleans for manualReviewRequired/compensationRequired. Unknown keys, arbitrary sort, arrays, invalid enums/booleans, fractional/negative/zero pagination rejected with HTTP 400 INVALID_RECONCILIATION_FILTER. Page defaults 1, limit defaults 25; max limit 100, max page 100000. Existing 7D deterministic priority/case-id ordering reused; no client sort override. Filter/group before pagination; pagination reports total and pages (minimum one for empty). Maximum 1000 records and 1000 combined snapshots, fail closed beyond bounds. No DB query optimization claimed.

## 8. Frontend integration

reconciliationService now uses existing authFetch with explicit GET for list/detail; bearer session and 401 cleanup reuse existing session handling. List requests page=1/limit=100; optional allowlisted filters encoded by URLSearchParams, booleans preserved, invalid paths/filters rejected before transport. Existing store/view remain unchanged: local filters, loading/unavailable/empty/error/not-found/denied states, session-change isolation and safe projection. Runtime datasource stays disabled, displaying “Источник данных сверки пока не подключён”, with no synthetic rows. No refund/cancel/retry/resolve method or optimistic action.

The UI currently reads only the first bounded page and filters that page locally. Future available durable datasource activation must separately add/review page navigation or completeness handling; this sprint does not claim a complete active large queue.

## 9. Security/data minimization

Projection occurs before HTTP serialization; no raw repository response returned. Unknown raw webhook/signature/auth/key/card/PII additions are excluded by 7D explicit copying and frontend safe projection. Fixed service errors suppress repository messages/stacks/SQL. No browser-supplied trusted evidence, force-paid flag or mutation input. API is read-only; operatorActionsExecutable=false and commercialSuccess=false persist. No real DB persistence, PSP, payment/refund/cancellation or operator mutation.

## 10. Tests

Focused backend: 30/30 PASS, one run, real auth/role/permission middleware through local loopback Express requests. Every test traps DB query/connect, Hotelbeds transport/booking/reconciliation, payment initiation, refund execution, audit/operator and logger calls; forbidden attempts and HTTP repository writes zero. Synthetic JWT secret only. HTTPS offline preload blocks accidental external requests.

Focused new frontend: 23/23 PASS (22 cases plus parent). Adjacent changed 7E: 30/30 PASS, one combined invocation, total 53/53. Fetch intercepted only for expected reconciliation GETs; no external network or mutation. Covers requests, session gates, unavailable/empty, filter/path rejection, safe rendering, 401/403/404/503 and absent controls. Existing 7E assertion updated explicitly for four expected mocked GET reads, preserving zero external/mutation semantics.

7D/7F source/tests unchanged; no separate adjacent run. Aggregate backend includes them. Full backend: **892/906**, **14 known DB-blocked failures**, unexpected failures **0**, cancelled/skipped zero. Not a full backend PASS. Blocked suites: hotelbedsAccess (1), hotelbedsCatalogPlan (1), hotelbedsContent (3), hotelbedsMultiDestination (1), hotelbedsPublicSearch (1), hotelbedsStagingTest (6), stagingAcceptance (1). Dedicated real PostgreSQL integration files excluded. Full frontend: **866/866 PASS**, cancelled/skipped zero. Each full aggregate ran once.

Frontend lint: PASS, zero errors and three existing useEffect dependency warnings in BookingsTable/NotificationsTable/RefundsTable. Frontend build: PASS. Verifier: PASS, 243 backend syntax files, 528 secret-scan files, findings empty. 6A: PASS. Diff-check: PASS. Each release check ran once. All runtime/test source frozen before aggregate checks; no repeated full runs to improve totals. Report-only result completion afterward. 6B NOT RUN with intentionally dirty work.

## 11. Exact files

Modified:

- backend/routes/adminOperations.js — guarded reconciliation router registration.
- frontend/src/services/reconciliationService.js — authenticated GET adapter.
- frontend/tests/adminReconciliation.test.mjs — intercept expected read transport in existing 7E tests.

New:

- backend/routes/adminReconciliation.js
- backend/services/adminReconciliationReadService.js
- backend/tests/adminReconciliationReadApi.test.cjs
- frontend/tests/adminReconciliationReadApi.test.mjs
- SPRINT_7G_ADMIN_RECONCILIATION_READ_API_REPORT.md

All unstaged. Unrelated owner files untouched.

## 12. Runtime impact

Backend changed: YES; frontend changed: YES. New authenticated read endpoints and frontend adapter. DB/schema changed: NO; durable storage: NO; datasource active: NO; synthetic runtime cases: NO; operator mutation endpoints added: 0. Existing consumer flow, store/UI semantics, payment/booking/refund gates unchanged. No deploy performed.

Real PostgreSQL queries: 0; real DB mutations: 0; real PSP calls: 0; Hotelbeds Availability/CheckRate/Booking/Cancellation calls: 0; refund calls: 0; cancellation calls: 0; operator action executions: 0. Local loopback HTTP requests only in focused backend tests; frontend transport mocked. Aggregate PG preload lazily blocks real Pool/Client query/connect before use.

## 13. Remaining production gaps

Durable PostgreSQL storage: FUTURE REQUIREMENT. Read API readiness does not activate evidence ingestion or close commercial P0 work packages. Persistent evidence/correlation uniqueness, transactional/crash-safe execution, PSP selection/account/credentials, reconciliation policy and real evidence sourcing remain open. Real payments BLOCKED; COMMERCIAL PRODUCTION READY: NO; PRODUCTION SALES READY: NOT CLAIMED.

OWNER BROWSER RECHECK: REQUIRED after a separately authorized future deploy. Check /health and /api/health/ready, admin login → Admin → Reconciliation, truthful unavailable message, no fake cases or Refund/Cancel/Retry/Mark Resolved controls, ordinary user denied and consumer navigation functional. No Hotelbeds request, payment or webhook needed. Not performed here. Prior 7E browser acceptance remains pending separately.

## 14. Future durable datasource activation

Implement/review the actual PostgreSQL repository with separately authorized migrations and isolated DB tests, safe ingestion and transactional uniqueness; review bounded projection/pagination against real queue sizes and frontend completeness. Preserve server auth/projection/error gates and commercial hard gates. Reconciliation actions require a separate explicit design and authorization; this GET contract grants none. Activate datasource only after dedicated testing and owner acceptance; never replace unavailable data with demo records.
