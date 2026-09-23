# Sprint 3Z — Pre-production hardening / staging launch readiness

Latest 3Z.1 implementation and owner evidence are recorded in section 30. Earlier missing-snapshot and blocked statuses below describe historical stages.

CODE / OFFLINE: PASS.
SPRINT 3Z.1 HOTFIX: PASS.
PRE-PRODUCTION PREFLIGHT: PASS.
BUILD PREFLIGHT: PASS WITH WARNING.
REAL RENDER ACCEPTANCE: NOT RUN.
DATABASE STATE: NOT_QUERIED.
REAL HOTELBEDS CALLS: 0.
REAL PAYMENT CALLS: 0.
REAL DB MUTATIONS: 0.
LOCAL TEST DB MUTATIONS: TEMPORARY SCHEMAS ONLY — PASS / CLEANED BY EXISTING REGRESSION CONTRACT.

Это подготовка безопасного staging release candidate, не production launch. Дата проверки: 2026-09-22. Ни remote acceptance, ни доступность реального runtime из offline evidence не выводятся.

## 1. Initial git state

При первоначальном начале 3Z строго выполнены `git status --short`, `git diff --stat`, `git diff`: tracked tree чистое. Незакоммиченных 3Y changes уже не было. Unrelated untracked: README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md.

После сообщения о продолжении эти три команды повторены в том же порядке. На входе продолжения: 27 modified tracked files с узкими logging/error edits (107 insertions, 104 deletions), три новых 3Z files и прежние unrelated paths. Report ещё отсутствовал. Ничего не откатывалось, не staging-илось и не коммитилось. Older reports, 3Y helper/tests/runbook не редактировались.

## 2. Recovered work before continuation

Сохранены созданные ранее в этом sprint `preProductionCheck.cjs`, `preProductionEnvSchema.cjs`, `preProductionReadiness.test.cjs`. Уже были configuration/source checks, strict status/exit semantics, reuse CORS/database/Hotelbeds/3Y inventory parsers, synthetic-secret fixtures, no-network tests, graceful-shutdown VM test и безопасный error handler/logger.

Сохранены 27 tracked изменений: controllers заменяли raw console errors безопасными logger records; services/server передавали Error как metadata вместо stack/message; HTTP client перестал печатать URL; logger получил nested redaction; ordinary production handler скрывал internal code и query URL. До продолжения focused suite прошёл 29/29. Offline `npm ls` и `npm ls --omit=dev` для обоих пакетов уже завершились exit 0. Это recovered execution этого же 3Z, не повторный запуск или evidence 3Y.

## 3. Work completed after continuation

Завершён audit прямых controller responses: некоторые catch branches обходили central error handler и возвращали raw `error.message` при 500. В существующий ApiResponse добавлены publicMessage/publicCode; affected responses теперь используют безопасный fallback в production для internal failures, validation 4xx сохранены. Booking/payment/refund SQL, authorization, provider calls и gates не менялись.

Logger дополнен private-key redaction, сохранением Date и безопасной обработкой binary metadata. Preflight дополнен optional build inspection, summary counts и отказом API URL с внешними пробелами, которые runtime client не нормализует. Добавлены negative source/build fixtures. В repo blueprint явно задан HOTELBEDS_READ_ONLY=true. Создан этот report, выполнены перечисленные ниже проверки. Tooling 3Y не переписывалось.

Финальное verification-продолжение после уточнения владельца: строго повторены git status --short, git diff --stat, git diff; сохранены все 30 tracked modifications и четыре новых 3Z files. Единственный edit этого продолжения — этот report. Runner и production code не менялись. Владелец явно разрешил существующие isolated local temporary schemas; конфликт снят. Выполнен один запуск sprint3mRegression и требуемые повторные focused/3Y/verifier checks, результаты — раздел 24.

## 4. Inherited verified baseline

3X: CODE/OFFLINE PASS; прежняя owner Render acceptance для Home → Results → Details → Back → Favorites → My Bookings → Profile → Help → Contacts, titles и точного selected room/board/TOTAL. Это историческое ограниченное evidence, не новый 3Z browser run.

3Y: CODE/OFFLINE PASS; local synthetic restore PASS; real Render backup BACKUP_VERIFIED PASS; real dump local restore PASS — LOCAL COPY ONLY; Render migration NOT RUN. Новых backup/restore/provision действий в 3Z нет. Restored local DB и реальные dump/manifest не читались/не изменялись для этого sprint.

## 5. Architecture audit

Frontend: Vite → main.jsx → StrictMode/FavoritesProvider/BrowserRouter → App routes. ConsumerShell изолирует consumer CSS, error boundary и metadata; admin/checkout/voucher и booking details сохраняют свои прежние границы. API client удаляет завершающий slash; DEV fallback localhost, production fallback /api. Отдельный Render Static Site требует explicit public HTTPS /api URL. Routes включают wildcard NotFound; SPA rewrite нужен для deep links.

Backend: Express 5, dotenv, shared pg Pool, request telemetry/security headers, bounded /health, CORS, JSON parser, health routes, API/auth rate limits, existing route mounts, 404 и error handler. Consumer/auth/admin routes не изменены. Server запускает только существующие gated monitors; migration runner отдельно. Shutdown прекращает HTTP acceptance, останавливает jobs и закрывает pool. Preflight не импортирует server/db/providers singleton и не вызывает collector с DB side effects.

Database: PostgreSQL-specific migrations/public schema, DATABASE_URL или local DB_* fallback в runtime config, verified TLS для URL по умолчанию. Blueprint использует repository root, чтобы migrations directory была доступна. Offline gate требует URL для проверяемого production-like staging contract, но не соединяется с ним.

## 6. Environment contract

Machine-readable source: `backend/scripts/preProductionEnvSchema.cjs`. Только имена, категории и безопасные constraints. `--contract` печатает схему, не process.env.

| Category | Contract |
| --- | --- |
| REQUIRED_SECRET | DATABASE_URL; JWT_SECRET |
| REQUIRED_NON_SECRET | CORS_ORIGINS; VITE_API_URL (frontend build environment supplied alongside operator snapshot) |
| MUST_EQUAL | NODE_ENV=production; ACTIVE_PROVIDER=hotelbeds; HOTELBEDS_ENV=test; HOTELBEDS_READ_ONLY=true; PAYMENTS_MODE=disabled; PAYMENTS_PROVIDER=none |
| MUST_BE_FALSE | HOTELBEDS_BOOKING_ENABLED; HOTELBEDS_LIVE_BOOKING_ENABLED; PRODUCTION_SALES_ENABLED; REAL_CHARGES_ENABLED; REAL_REFUNDS_ENABLED; HOT_DEALS_MONITOR_ENABLED; HOTELBEDS_CONTENT_SYNC_ENABLED |
| OPTIONAL secret | OFFER_TOKEN_SECRET, with actual runtime fallback to JWT_SECRET; HOTELBEDS_API_KEY/API_SECRET and legacy HOTELBEDS_SECRET when reads enabled; DB_SSL_CA_PATH |
| OPTIONAL non-secret | APP_ENV; HOTELBEDS_ENABLED; HOTELBEDS_STAGING_TEST_ENABLED; HOTELBEDS_READ_RETRIES; DB_SSL_MODE; VITE_HOTELBEDS_STAGING_TEST_ENABLED; limits, job flags, TRUST_PROXY |
| Unused name | OFFER_SECRET is not read by runtime and does not replace OFFER_TOKEN_SECRET; supplying it produces WARN |

JWT/effective offer secret: at least 32 characters, no surrounding whitespace, at least 10 distinct characters, no obvious placeholder/default/password phrases. This is a conservative operator check, not proof of cryptographic randomness. Explicit weak offer secret fails even with strong JWT. No rotation performed. Runtime auth still requires a secret but does not automatically invoke this release gate.

APP_ENV, if present, normalized for validation and restricted to staging/test; absent selects this CLI's staging scope, not evidence of a deployed env. Runtime NODE_ENV/ACTIVE_PROVIDER/boolean spellings remain exact to match existing parsers. Hotelbeds buildConfig, CORS allowedOrigins and databaseConfig reused. No second provider parser, no dotenv autoload, no env writes. Retry integer 0..3; TEST disclosure flag must match backend staging-test intent. Provider credentials tested for presence only when provider enabled; no probe.

Owner commands, from repository root, after safely supplying an operator snapshot of existing backend runtime env and frontend build env (never paste secrets in output/screenshots):

```powershell
node backend/scripts/preProductionCheck.cjs --contract
node backend/scripts/preProductionCheck.cjs
# After building frontend with the actual reviewed build-time configuration:
node backend/scripts/preProductionCheck.cjs --build
```

PASS/WARN exit 0; BLOCKED exit 1. Unsupported arguments fail. Outputs are fixed check IDs/status/reason codes and summary only. No supplied URL/host/username/secret is emitted. `--build` reads only JS/CSS/HTML, not dump contents. Base source checks detect public backup artifacts by filenames. Complete config/source PASS does not mean DB schema or deployed browser acceptance PASS.

## 7. Provider/payment safety

TEST/read-only/disabled-sales baseline unchanged. Dangerous boolean requests are BLOCKED even though productionGate currently hard-disables production sales/real money. PaymentGatewayService consumes gate state; Hotelbeds client also checks gate for LIVE mutations. Booking/LIVE flags, monitors and content sync remain false. No CheckRate enablement. Existing read-only transport allows some read operations including CheckRate; 3Z neither invokes them nor changes authorization for them.

EMAIL_ENABLED and DB_BACKUP_AUTO_ENABLED must be absent/false; health/reliability monitor flags must explicitly be false because their runtime defaults are true. These are release constraints for this staging blueprint, not changes to application defaults. No provider/package installation, quota probe, import or payment operation.

## 8. Database/startup safety

20 SQL files 001–020, sequential prefixes, unique filenames, current inventory 23 tables/72 explicit indexes. Existing 3Y parser is bounded to repo syntax. Migration ledger/advisory lock 319003 and per-migration transaction logic unchanged. Source audit confirms no migrate/reset/seed in npm start/server; gate rejects startup script hooks and destructive startup tokens. No migration was executed by preflight.

Runtime DATABASE_URL syntax/TLS parsed locally; CA read is filesystem-only. DB_SSL_MODE=require source-backup exception from 3Y does not apply to app runtime/preflight. Remote certificate compatibility is not proven by this check. No current DB ledger/reachability assertion is fabricated.

## 9. Backup tooling exposure audit

3Y dbBackup/dbRestore remain manual CLI, not startup or HTTP routes. Runtime source has no Express static serving/download of backup directory; frontend public/dist have no dump/manifest/key artifacts. backend/backups/ remains ignored. New gate detects public artifact filename exposure and symlinks without reading backup data. Existing legacy backupSchedulerService is still wired but disabled by staging env; this is distinct from manual 3Y tooling. Its only edit here is safe error logging, not scheduling/backup behavior.

No DB-expiry deadline added to consumer UI. No backup action, custom dump listing, restore or retention cleanup performed.

## 10. Auth/security audit

Bearer token from Authorization header; JWT verification server-side. Admin routes mount auth + role/permission checks; client protected route is UX only. Register does not accept role elevation; bcrypt cost 12; public user fields allowlisted. Login/profile/password DB operations remain parameterized and user-scoped. Raw caught DB errors previously could contain constraint details/password hashes; safe logger now omits Error detail/config/stack/message.

Frontend token/user stored in localStorage (existing XSS exposure tradeoff, no auth redesign). AuthFetch sends header, not query token. Strict returnTo path allowlist denies external URLs/query/encoding and role-inappropriate admin return. Session revision/snapshot protects late responses; logout clears local auth state. Existing tokens are not server-revoked on logout/password change; this pre-existing limitation is not presented as fixed.

## 11. Logging/redaction

Confirmed defects: raw console Error inspection in controllers; stack/message interpolation in services/server; full request URL in central error log; outbound URL/error log; shallow metadata redactor. These could expose query tokens, Axios headers/config and pg error details. Replaced only these diagnostic paths, retaining operation labels and safe error codes. Existing logger now recursively redacts sensitive keys, known configured secret strings, connection/HTTP URLs, bearer/basic auth, JWT/bcrypt/private-key material; Error objects expose only safe name/code. Circular/binary values do not dump contents.

Public ordinary production 500 response uses generic message/code and no stack. Controllers that bypassed middleware now use existing ApiResponse's shared safe fallback methods. Validation errors retain their behavior; no successful business response changed. Access telemetry already omits query/body/headers. Request IDs remain correlation metadata. Existing email console provider intentionally logs content when separately enabled; this release blocks EMAIL_ENABLED, and no email delivery occurs. This audit is not a formal guarantee against arbitrary future logging of unnamed data or custom diagnostic code.

## 12. CORS

Existing parser preserved: explicit comma-separated HTTP(S) origins, no wildcard/credentials/path/query/hash. Express credentials=true with exact includes(origin), no wildcard. Requests without Origin retain existing behavior. Offline release gate additionally requires nonempty public HTTPS origins and rejects local/private literal addresses for production-like staging. DNS is deliberately not resolved; domain ownership/private DNS equivalence remains owner validation. No CORS model redesign.

## 13. Security headers

Backend middleware already sets nosniff, DENY frame policy, no-referrer, disabled camera/microphone/geolocation, same-site CORP and restrictive API CSP; HTTPS production gets HSTS. x-powered-by disabled. API CSP is not copied to the frontend. Render Static Site response headers cannot be established offline; owner must inspect actual responses. No blind CSP or duplicate middleware added.

## 14. Request/rate limits

Existing JSON default 1mb, ordinary API 600/min, auth 30/15min. Health bypasses limiter intentionally. Admin/provider endpoints inherit API limiter plus authorization. Preflight blocks disabled rate limiting or invalid/over-1mb explicit body limit for this release. TRUST_PROXY=1 is blueprint topology assumption, not independently verified. Rate state is in-memory per process, resets on restart and is not a distributed abuse control. No aggressive new rate limits.

## 15. Graceful shutdown

Existing SIGTERM/SIGINT handling retained: idempotent shared promise, lifecycle draining, four monitor/scheduler stop calls, HTTP close/idle connection close, then pool.end; default 10s deadline forces exit on hang. VM test invokes actual server source with fake Express/pool/jobs/process/timers; verifies ordering, one shutdown, pool close, successful exit and forced deadline. No live process terminated.

Graceful shutdown semantics changed: NO. server.js edits are diagnostic logging only. Active optional job cancellation beyond current stop/deadline semantics is not newly guaranteed; this staging contract disables those jobs. No new shutdown framework.

## 16. Health/readiness

Existing `/health`: bounded SELECT 1, safe DB boolean/503. Existing `/api/health/live`: process liveness. Existing `/api/health/ready`: DB reachability + draining state; it is not schema readiness. Existing admin system/readiness endpoints and DB-connected preflight.js are operational diagnostics, not the new offline gate; some older production-readiness blockers intentionally describe unavailable real sales and must not be “fixed” by enabling money/booking.

New endpoint not added: existing routes cover liveness/draining, while schema/ledger remains an explicit owner DB check using 3Y tools under separate authorization. Calling a new schema-heavy public endpoint here would not establish actual Render acceptance. The new preflight explicitly reports databaseState=NOT_QUERIED and requires separate schema/ledger evidence. Health/readiness code changed: NO.

## 17. Frontend build audit

No frontend source redesign/edits. Full consumer suite passed 112/112; production build succeeded, 170 modules. Artifact inspection: 10 files, 0 sourcemaps, 2 hashed JS/CSS assets, no localhost API URL, server-secret markers or serviceWorker registration. Scanner found no known secret values in bundle. Mock/legacy labels and admin diagnostics are existing intentional paths, not proof that active provider is mock; TEST consumer visibility/disclosure remains controlled by build flag and backend offer evidence. No extra debug controls introduced.

Important: local build env did not provide VITE_API_URL. The resulting /api fallback is a compilation test artifact, not publish-ready evidence for a separately hosted Render Static Site. New `--build` check correctly blocks absent/mismatched embedded HTTPS API. Build-time flags are not runtime env; owner must rebuild with reviewed values. VITE_HOTELBEDS_STAGING_TEST_ENABLED=true was used only in the requested local build process.

## 18. Static/cache audit

Render Static Site publishes frontend/dist, SPA rewrite /* → /index.html, Vite hashed assets. No service worker/PWA or extra offline cache. Repo does not specify index Cache-Control overrides; actual CDN/browser cache headers, atomic deploy/old asset retention and stale index behavior are unverified offline. No assumption that current remote defaults are adequate was converted into PASS; owner checklist includes revalidation/cache inspection. Existing asset sizes/chunk warning remain WARN, no splitting refactor.

## 19. render.yaml audit

Backend root build `npm --prefix backend ci --omit=dev`, start `npm --prefix backend start`, healthCheckPath /health. Frontend rootDir frontend, `npm ci --include=dev && node scripts/validate-staging-env.mjs && npm run build`, publish dist, SPA rewrite. Both branch develop, autoDeployTrigger off, NODE_VERSION 24. Backend plan free unchanged; no region/database/remote settings modified. Secrets use sync:false.

One proven repo mismatch fixed: HOTELBEDS_READ_ONLY was absent, whose TEST default without staging-test opt-in is false; blueprint now explicitly sets true, matching requested baseline. HOTELBEDS_ENABLED remains false, no TEST search enabled by this edit. Backend/frontend staging-test opt-in must be deliberately paired by owner for the existing accepted TEST flow. Actual deployed branch/env/latest revision have not been queried.

## 20. Dependency audit

Backend and frontend `npm.cmd ls --offline` and `npm.cmd ls --omit=dev --offline`: all exit 0, no missing/invalid top-level dependencies. Additional `npm.cmd ls --all --offline --json` for both packages also exit 0: full installed trees valid, including peer dependencies. Existing resolved packages and lockfiles unchanged. Node v24.18.1 satisfies installed Vite ^20.19.0 or >=22.12.0, React Router >=20, Express >=18 and blueprint Node24 assumption.

Backend nodemon in production dependencies and unused server packages in frontend dependencies are packaging debt, not demonstrated build blockers; no mass reclassification or upgrades. No npm audit/outdated/install/network performed. npm ls is dependency consistency evidence, not a vulnerability/advisory scan.

## 21. Secret/placeholder scan

Existing scanProviderSecrets.js: PASS, 453 scanned entries including build, knownValuesCompared=2, findings=[]. It checks tracked credential files, private-key patterns, known env values, bundle server-secret markers without printing values. New source gate distinguishes admin env-name labels from actual env access. No real backup contents scanned.

`node backend/scripts/sprint3mVerify.cjs`: PASS, 194 backend syntax files, findings=[]. Intermediate scan included generated npm tree JSON logs (396/397 scanned entries as files completed). Those two logs were moved to existing ignored backend/cache/3z; no implementation files were removed. Obvious documentation/test placeholders are not treated as real secrets; production-like use is rejected by preflight. Neither scan proves absence of every unknown secret format.

## 22. Exact changed files

Recovered modified (27; all preserved, with further response/redaction edits where stated):

1. backend/controllers/adminOperationsController.js
2. backend/controllers/authController.js
3. backend/controllers/bookingController.js
4. backend/controllers/dashboardController.js
5. backend/controllers/favoriteController.js
6. backend/controllers/hotelController.js
7. backend/controllers/paymentController.js
8. backend/controllers/refundController.js
9. backend/controllers/searchController.js
10. backend/controllers/tourController.js
11. backend/controllers/travelerProfileController.js
12. backend/controllers/userController.js
13. backend/controllers/voucherController.js
14. backend/middleware/errorHandler.js
15. backend/server.js
16. backend/services/adminAuditService.js
17. backend/services/backupSchedulerService.js
18. backend/services/bookingEventService.js
19. backend/services/healthMonitorService.js
20. backend/services/incidentService.js
21. backend/services/maintenanceRunService.js
22. backend/services/notificationService.js
23. backend/services/reliabilityMonitorService.js
24. backend/services/searchService.js
25. backend/services/systemEventService.js
26. backend/utils/httpClient.js
27. backend/utils/logger.js

Recovered new (3; continued in place):

28. backend/scripts/preProductionCheck.cjs
29. backend/scripts/preProductionEnvSchema.cjs
30. backend/tests/preProductionReadiness.test.cjs

Added to changed/new set after continuation (4):

31. backend/controllers/notificationController.js — safe public failure messages.
32. backend/utils/apiResponse.js — shared internal-error response helper.
33. render.yaml — explicit read-only provider baseline, repo only.
34. SPRINT_3Z_PREPRODUCTION_HARDENING_REPORT.md — this report.

Package/lockfiles, frontend source, database config/migrations, auth/gate parsers, 3Y tooling/tests/runbook and all older reports unchanged. README.txt/docs/3N untracked content untouched. Runtime dist/cache output is ignored, not source changes.

## 23. Focused tests

`node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit backend/tests/preProductionReadiness.test.cjs`: PASS 33/33 after final changes. Includes actual search controller execution with mocked service failures: safe internal response, preserved validation status and typed provider unavailability code.

Coverage: safe config, every dangerous flag, payment/provider modes, weak/missing/effective secrets, CORS/API origins, missing env, strict runtime DB TLS, TEST disclosure/credentials/retries, output privacy, job/rate/body gates, backup isolation, migrations, negative source/build fixtures, nested redaction, public errors, health, actual shutdown source under VM stubs. HTTP/HTTPS/TCP/TLS/fetch and child execution throw if used; zero attempts. Tests do not create DBs or inspect real rows.

During development one test initially flagged an admin diagnostic env-name label as a secret; source rule narrowed to actual env access/secret material without deleting the label. A synthetic duplicate migration test needed a mocked file body; fixed fixture, no real migrations/files modified.

## 24. Full regressions

| Check | Result |
| --- | --- |
| 3Y databaseContinuity focused | PASS 20/20 |
| Full frontend 3X consumer regression | PASS 112/112 |
| Backend sprint3mRegression | PASS 101/101, 12 suites, exit 0 |
| Repeated focused 3Z | PASS 33/33 |
| Repeated focused 3Y | PASS 20/20 |
| Frontend lint | PASS, 0 errors / 3 existing hook warnings |
| npm ls / omit=dev, backend/frontend | PASS, 4 commands |

Владелец уточнил: REAL DB MUTATIONS=0 относится к Render/remote/owner/staging/production data; существующие isolated local temporary test schemas разрешены. Прежний instruction blocker снят, он не был defect кода.

До запуска read-only configuration preflight повторил фактический dotenv/backend config precedence без вывода значений: loopback=true, DATABASE_URL отсутствует, PGSERVICE/PGHOSTADDR/PGOPTIONS/PGSERVICEFILE overrides отсутствуют, NODE_OPTIONS отсутствует. Никакого Render URL не использовано. Existing runner имеет собственный local host guard; каждому suite создаёт уникальную sprint3m_reg_* schema, использует SET search_path/child PGOPTIONS, применяет fixtures только внутри неё, затем RESET search_path и DROP SCHEMA собственной schema в finally. Public/application/staging schema не использовалась для test writes. Новая persistent database не создавалась.

Ровно один `node backend/scripts/sprint3mRegression.cjs`: PASS 101/101, все 12 suites, exit 0. Existing cleanup contract успешно завершён; pool закрыт. Runner не изменён. Provider requests mocked, offlineNetwork preload сохранён; Hotelbeds/payment/email external calls=0. Это новый execution 3Z, не заимствованный PASS 3Y.

После него повторены только разрешённые проверки: preProductionReadiness.test.cjs 33/33; databaseContinuity.test.cjs 20/20; sprint3mVerify.cjs PASS — 194 backend syntax files, 395 secret-scan files, findings=[]; git -c core.safecrlf=false diff --check PASS. Frontend 112/112, lint/build не повторялись: frontend source не менялся после предыдущего PASS. No production migrations, backup/restore, .env/Render/deploy changes.

Frontend command is exactly the requested 16 test files, offlineNetwork preload, test-concurrency=1 and test-force-exit. Historical frontend provider counter 1 refers to mocked Availability, not an external request.

## 25. Build results

Vite 8.2.0, 170 modules: index.html 1.08 kB / gzip 0.57; JS 504.03 kB / gzip 140.93; CSS 111.36 kB / gzip 20.15. Existing main chunk >500 kB warning, image assets about 2.66–3.09 MB each. No bundling/image refactor. Build exit 0 is distinct from missing API deployment contract BLOCKED.

## 26. Release blockers

Actual operator preflight without supplied env: BLOCKED, exit 1; required runtime identity/provider safety/DB/JWT/CORS/API configuration not provided. `--build`: 26 PASS / 1 WARN / 22 BLOCKED at execution, including missing embedded public API. These are missing local evidence, not a claim that Render config is wrong. Synthetic complete configuration passes.

Required backend DB regression завершён успешно; instruction conflict разрешён владельцем. CODE/OFFLINE PASS не зависит от отсутствующего operator env: PRE-PRODUCTION PREFLIGHT BLOCKED здесь означает оставшийся owner configuration/acceptance step, а не defect кода. Настоящий runtime/build env в preflight не предоставлялся, новый PASS для него не заявляется. Render/browser/current schema/ledger acceptance NOT RUN. Do not promote the locally compiled fallback-API artifact as a completed staging release candidate. Owner must supply reviewed env privately, rebuild, run gate, review separate DB schema/ledger evidence and perform checklist below. No secret values requested.

## 27. Warnings

Main JS >500 kB; large existing image assets; three existing admin useEffect warnings; per-process rate-limit state; localStorage session exposure; no server-side JWT revocation; frontend packaging debt. Real browser registration and 3Z responsive acceptance remain unverified. Static headers/cache behavior and Render topology/branch/revision need owner confirmation. None of these cosmetic/performance observations alone was converted into a release BLOCKED.

## 28. Limitations

Configuration/source checks are bounded assertions, not complete static analysis or remote/runtime attestation. Source migration inventory does not read deployed ledger. Known-secret scanner and redaction cannot prove protection against arbitrary future unnamed payload logging. No dependency security advisory lookup, browser automation, external HTTP or Render account checks.

REAL Hotelbeds status/content/availability/checkrate/booking/cancellation=0; payment=0; email delivery=0; Render API=0; Render DB=0; REAL DB MUTATIONS=0 (Render/remote/owner/staging/production schema/data). LOCAL TEST DB MUTATIONS: TEMPORARY SCHEMAS ONLY — PASS / CLEANED BY EXISTING REGRESSION CONTRACT. Regression выполнял разрешённые DDL/fixtures и cleanup только в собственных изолированных local schemas; это не считается real DB mutation по явному уточнению владельца. No production migrations, backup/restore, persistent database creation, env file edit/rotation, plan/region/database/deploy change, git add/commit/push/reset/checkout/restore/clean.

## 29. Owner Render acceptance checklist — NOT RUN

1. Privately compare current env names/boolean states with `--contract`; no screenshots/output containing secrets. Preserve NODE_ENV=production, Hotelbeds TEST/read-only, all booking/sales/charges/refunds off, payments disabled/none, monitors/content sync off. Confirm TEST build flag intentionally matches existing approved flow.
2. Build with real reviewed HTTPS VITE_API_URL ending /api; run configuration/source gate and `--build`; review warnings and exit status. Missing configuration is not a PASS. Resolve required regression evidence before promotion.
3. After separately authorized deploy, verify expected commit/branch and backend /health plus existing /api/health/ready. These endpoints do not prove schema: separately review migration ledger/schema with read-only owner tools. Startup logs show no reset/migrations, no unexpected jobs, no provider/payment/email calls and no secret values.
4. Frontend Home, Results (owner-decided TEST search only if needed), Details exact selected offer, Favorites, MyBookings, Profile, Login/Register pages, Help, Contacts and 404. This checklist does not itself authorize provider search/registration mutations.
5. Widths 1440, 768, 390, 320: navigation/focus, dialogs, wrapping, disabled sales/payment disclosure. DevTools: no mixed content, localhost API, failing assets, runtime errors, tokens/secrets in URLs/page/source or accidental debug controls.
6. Inspect Static Site headers and index cache revalidation, deep-link SPA fallback, hashed asset requests after redeploy/reload and old-tab behavior. Verify actual CORS origin/proxy topology. Do not enable LIVE/booking/payment to satisfy older admin production-readiness messages.

Working tree remains for owner review. `git -c core.safecrlf=false diff --check`: PASS. Final status/diff audit is performed after this report update; git diff excludes the four new untracked 3Z files, which were inspected separately. В этом verification-продолжении изменён только report; прежние 3Z source edits сохранены, unrelated README.txt/docs/3N и older reports untouched.

CODE / OFFLINE: PASS.
PRE-PRODUCTION PREFLIGHT: BLOCKED — OWNER RUNTIME/BUILD CONFIG NOT YET PROVIDED.
REAL RENDER ACCEPTANCE: NOT RUN.
REAL HOTELBEDS CALLS: 0.
REAL PAYMENT CALLS: 0.
REAL DB MUTATIONS: 0.
LOCAL TEMPORARY TEST SCHEMA MUTATIONS: EXPECTED / PASS.
LOCAL TEST DB MUTATIONS: TEMPORARY SCHEMAS ONLY — PASS / CLEANED BY EXISTING REGRESSION CONTRACT.

## 30. Sprint 3Z.1 — Render Internal PostgreSQL preflight compatibility

### Owner evidence and initial audit

REAL OWNER PREFLIGHT BEFORE FIX: PASS 43 / WARN 0 / BLOCKED 1. The only blocker was DATABASE_URL / INVALID_DATABASE_CONFIGURATION. Owner reports a syntactically valid Render INTERNAL URL without an sslmode query parameter, with DB_SSL_MODE=disable. All other release safety checks passed. This is supplied owner evidence, not a new agent execution or connection. No URL, hostname, username or password is recorded here.

The first commands were git status --short, git diff --stat, git diff, in that order. Tracked tree was clean; unrelated untracked README.txt, docs/ and SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md were preserved.

### Confirmed root cause

preProductionCheck.cjs calls databaseConfig(env), then independently requires db.ssl?.rejectUnauthorized to be truthy. databaseConfig accepts disable and returns ssl=false, so the additional release-gate condition rejects this otherwise parser-supported configuration. This mismatch is not evidence of a failed deployed DB connection. Runtime supports only disable and verify-full; require is currently rejected and cannot be advertised as supported by a preflight-only fix.

### Mandatory stop: reliable identification unavailable

The requested source/config audit found no established trusted Render-internal hostname rule or binding of DATABASE_URL to a Render database resource. render.yaml declares DATABASE_URL with sync:false, without fromDatabase provenance. The internal-looking hostname in a 3Y synthetic test is a fixture for remote restore acknowledgement, not a trusted classification contract. Neither an unqualified hostname, a dpg prefix, a private IP nor the diagnostic label LIKELY_RENDER_INTERNAL proves the required classification.

Per the owner's explicit instruction to STOP if reliable automatic identification cannot be established from existing source/config, no permissive heuristic or TLS exception was added. A reviewed identification/provenance contract is needed before implementation can proceed; raw credentials are not needed. External/unknown database protections remain unchanged. No external documentation request or network call was made.

### Changes, verification and status

Only SPRINT_3Z_PREPRODUCTION_HARDENING_REPORT.md changed. Runtime DB behavior changed: NO. render.yaml changed: NO. Preflight, env schema, tests and 3Y tooling changed: NO. No regression suites were rerun because implementation stopped at the explicitly required identification boundary; previous 3Z evidence remains 33/33 focused, 20/20 3Y, 101/101 backend (12 suites), verifier 194 syntax files / 395 secret-scan files / findings=[]. Those are historical results, not new 3Z.1 executions. Final git diff checks passed.

CODE / OFFLINE (completed 3Z baseline): PASS — prior verified evidence.
SPRINT 3Z.1 HOTFIX: BLOCKED — RELIABLE INTERNAL IDENTIFICATION CONTRACT NOT ESTABLISHED; NOT IMPLEMENTED.
PRE-PRODUCTION PREFLIGHT: BLOCKED — OWNER EVIDENCE 43 PASS / 0 WARN / 1 BLOCKED; OWNER RE-RUN REQUIRED AFTER A FUTURE FIX.
REAL RENDER ACCEPTANCE: NOT RUN.
REAL HOTELBEDS CALLS: 0.
REAL PAYMENT CALLS: 0.
REAL DB MUTATIONS: 0.
LOCAL TEST SCHEMA MUTATIONS IN THIS CONTINUATION: 0.

No Render/env/deploy changes, external PostgreSQL calls, email, backup, restore, migrations, git add/commit/push, reset/restore/clean or edits to unrelated paths were performed.

### Owner provenance established; hotfix completed — 2026-09-23

The preceding STOP was correct under the then-authorized automatic-identification requirement. The owner subsequently supplied explicit identity evidence from a private comparison of the backend URL with the selected Render Internal Database URL:

HOST_MATCH=True; PORT_MATCH=True; DATABASE_MATCH=True; USER_MATCH=True; SAME_DATABASE_IDENTITY=True.

These are owner-reported comparison results, not agent network verification. No raw identity values or second URL are stored. The owner explicitly authorized an operator assertion instead of automatic classification. No hostname, dpg-prefix or private-IP heuristic was added.

#### Recovered work before continuation

The ordered git status/diff audit found exactly four modified files: this report, preProductionCheck.cjs, preProductionEnvSchema.cjs and preProductionReadiness.test.cjs. The three source/test changes were already complete and were preserved. They add exact preflight-only attestation, a separate OPTIONAL_OPERATOR_ATTESTATION category and six focused tests, retaining all previous 33 tests. Focused 39/39 and 3Y 20/20 had already passed in this same hotfix execution. The backend regression and verifier processes had been started after a safe local-only configuration check.

#### Work completed after continuation

Reviewed the recovered implementation and collected the final completion results of those existing processes: backend 101/101 across 12 suites, exit 0; verifier 194 syntax files / 395 secret-scan files / findings=[], exit 0. No duplicate regression run or implementation rewrite was needed. Only this report was edited after continuation; final diff checks passed.

#### Preflight-only contract and owner procedure

PREPROD_RENDER_INTERNAL_DB_ATTESTATION accepts exactly I_VERIFIED_DATABASE_URL_MATCHES_RENDER_INTERNAL_URL. With DB_SSL_MODE=disable and a valid URL/configuration, that assertion permits DATABASE_URL PASS with fixed code OWNER_ATTESTED_RENDER_INTERNAL_DATABASE. Missing/wrong assertion fails closed for disable. A supplied invalid assertion also blocks verify-full; the existing verified-TLS path with no assertion remains unchanged. Malformed/missing URLs, SSL query overrides and unsupported require still fail through existing validations. Provider/payment/JWT and all other release gates remain active.

This is an operator assertion, not proof produced by the CLI. The operator must privately compare host, port, database and user with the intended Render Internal URL before each relevant snapshot check. Never set the assertion automatically based on a hostname or to suppress an unexplained blocker. Do not persist it in .env, Render runtime settings, frontend build env or application configuration. Use it only in the controlled local operator process after loading the reviewed snapshot; do not change DATABASE_URL or DB_SSL_MODE. The CLI neither logs the supplied assertion value nor emits identity values; --contract exposes only its name and purpose.

Example for an owner who has already completed that identity comparison (not executed against an owner snapshot here):

```powershell
$env:PREPROD_RENDER_INTERNAL_DB_ATTESTATION='I_VERIFIED_DATABASE_URL_MATCHES_RENDER_INTERNAL_URL'
try {
  node backend/scripts/preProductionCheck.cjs
  # Review exit code and safe check results; do not infer deployed acceptance.
} finally {
  Remove-Item Env:PREPROD_RENDER_INTERNAL_DB_ATTESTATION -ErrorAction SilentlyContinue
}
```

The runtime does not read this variable. Runtime DB behavior changed: NO. backend/config/database.js changed: NO. render.yaml changed: NO. Render env changed: NO. DATABASE_URL/DB_SSL_MODE, server startup, productionGate and 3Y backup/restore behavior unchanged. No second URL or hostname allowlist was introduced.

#### Exact changed files and validation

1. backend/scripts/preProductionCheck.cjs — narrowly scoped operator assertion validation and safe PASS reason.
2. backend/scripts/preProductionEnvSchema.cjs — separate optional operator metadata, no assertion value in --contract.
3. backend/tests/preProductionReadiness.test.cjs — six added tests for assertion, URL/mode failures, other safety gates, output privacy and runtime/3Y isolation.
4. SPRINT_3Z_PREPRODUCTION_HARDENING_REPORT.md — preserved blocked-stage history and recorded completion.

Required commands completed for this implementation: focused preProductionReadiness 39/39 PASS; databaseContinuity 20/20 PASS; sprint3mRegression 101/101 PASS, 12 suites; sprint3mVerify PASS, 194 backend syntax files, 395 secret-scan files, findings=[]; git -c core.safecrlf=false diff --check PASS. Existing focused tests were not weakened. Frontend source unchanged; frontend suites/build not repeated.

Before regression: localOnly=true, DATABASE_URL absent; no PGSERVICE/PGHOSTADDR/PGOPTIONS/PGSERVICEFILE/NODE_OPTIONS overrides. Only the unchanged runner's isolated local temporary schemas were created, populated and cleaned by its existing finally contract. No persistent database or owner/application schema was created or modified. LOCAL TEMPORARY TEST SCHEMA MUTATIONS: EXPECTED / PASS / CLEANED BY EXISTING REGRESSION CONTRACT.

REAL Hotelbeds/payment/email/Render API/Render DB/remote PostgreSQL calls=0. Backup/restore/production migrations=0. No env-file changes, Render changes, deploy, git add/commit/push or unrelated edits. README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md and older reports remain untouched.

CODE / OFFLINE: PASS.
SPRINT 3Z.1 HOTFIX: PASS.
PRE-PRODUCTION PREFLIGHT: OWNER RE-RUN REQUIRED.
REAL RENDER ACCEPTANCE: NOT RUN.
REAL HOTELBEDS CALLS: 0.
REAL PAYMENT CALLS: 0.
REAL DB MUTATIONS: 0.

At the code-completion stage above, the owner's real snapshot had not yet been rerun with the assertion. The new owner evidence below supersedes that pending status; earlier results remain historical.

### Final owner preflight evidence — 2026-09-23

The owner reports a successful ordinary preflight after temporarily supplying the operator attestation, then a frontend build using the actual staging build values from the Render snapshot and a successful `node backend/scripts/preProductionCheck.cjs --build`. These are owner executions, not new agent runs.

| Owner verification | PASS | WARN | BLOCKED |
| --- | --- | --- | --- |
| OWNER PREFLIGHT AFTER 3Z.1 | 44 | 0 | 0 |
| OWNER BUILD PREFLIGHT | 48 | 1 | 0 |

The only build warning is BUILD_CHUNK_SIZE / MAIN_CHUNK_OVER_500_KB, the known non-blocking bundle-size warning. Reported output retains acceptance=NOT_RUN and databaseState=NOT_QUERIED. Configuration/source/build validation does not establish deployed Render/browser acceptance or database reachability/schema state.

Per owner evidence, PREPROD_RENDER_INTERNAL_DB_ATTESTATION was used only temporarily in controlled owner PowerShell and was NOT added to Render Environment. DATABASE_URL unchanged; DB_SSL_MODE unchanged; runtime DB behavior unchanged. Owner-verified identity evidence remains HOST_MATCH=True, PORT_MATCH=True, DATABASE_MATCH=True, USER_MATCH=True, SAME_DATABASE_IDENTITY=True. No raw URL, hostname, user or password is recorded.

The owner reports no Hotelbeds, payment or Render DB calls during these checks. This report-only update performs no network/DB calls, builds, preflight runs or regression runs. Only SPRINT_3Z_PREPRODUCTION_HARDENING_REPORT.md was edited in this update. Existing hotfix source/test changes were preserved without modification; render.yaml and backend/config/database.js remain unchanged. Unrelated README.txt/docs/3N and older reports remain untouched. Ordered initial/final git audits and final diff check completed; no git add/commit/push/deploy.

CODE / OFFLINE: PASS.
SPRINT 3Z.1 HOTFIX: PASS.
PRE-PRODUCTION PREFLIGHT: PASS.
BUILD PREFLIGHT: PASS WITH WARNING.
REAL RENDER ACCEPTANCE: NOT RUN.
DATABASE STATE: NOT_QUERIED.
REAL HOTELBEDS CALLS: 0.
REAL PAYMENT CALLS: 0.
REAL DB MUTATIONS: 0.
