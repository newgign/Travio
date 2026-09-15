# Sprint 3M — Hotelbeds TEST request observations and auth circuit breaker

> Исторический отчёт 3M. Архитектура global circuit, initial READY и STATUS recovery ниже заменена Sprint 3M.1. Актуальное поведение и проверки: [Sprint 3M.1](SPRINT_3M_1_CATEGORY_SCOPED_ACCESS_REPORT.md). Не использовать прежние rollout/SQL-инструкции для новой версии.

## Result

CODE / OFFLINE: PASS. Render acceptance: NOT RUN.

Implemented over HEAD `557210c`, without reverting Sprint 3L. Initial `git status --short` contained only existing untracked `README.txt` and `docs/`; neither was modified.

**Observed app requests != official Hotelbeds quota.** No remaining-quota arithmetic, reset-time inference, or assertion that quota exhaustion caused the owner's historical 403.

## Audit and architecture

Before: Content, status, Availability, diagnostic 3424, CheckRate, offer refresh and favorite refresh ultimately used `HotelbedsClient.performRequest`. Process-local health, queues and probe cooldown did not provide a shared auth circuit. Search could return process-local cached availability. Content already had the Sprint 3L bounds, PostgreSQL advisory lock, catalog transaction and identity validation.

After: TEST read transport enters a persistent gate immediately before constructing/sending the HTTP request. The gate covers normal request helpers and direct `performRequest` calls. Public search additionally checks persistent state before cache lookup. Local PostgreSQL catalog reads remain independent of provider transport. The existing TEST probe reports local gate rejection as BLOCKED, with `networkAttempted=false` when its first operation was blocked.

Audited persistence: `provider_job_state` (migration 019), `system_events` (014), incidents/reliability snapshots (017), catalog environment identity (020). Existing storage is sufficient; **no migration or new table**. Migration 020 is unchanged. Existing primary key `(job, environment)` and system-event category/time index are reused.

The shared reliability component reads the TEST circuit locally and reports degradation. It reuses the existing `reliability:hotelbeds` incident lifecycle; there is no incident write or provider probe per rejected request. Existing HTTP telemetry remains separate from provider observations.

## Persistent state and concurrency

One `provider_job_state` row: `job=hotelbeds_test_access`, `environment=test`. The fixed job identifies Hotelbeds; clients cannot select provider/environment.

Its JSON details contain `state`, `openedAt`, `reason`, `lastAuthErrorAt`, `lastAuthErrorCategory`, `lastSuccessAt`, `lastSuccessCategory`, armed/consumed timestamps, and a private in-flight token. Optional timestamps appear as null until known.

- Initial state: READY. Earlier requests and the historical Render 403 are **not backfilled**; initial READY does not prove access recovery.
- Actual HTTP 403 + normalized AUTH_ERROR: AUTH_BLOCKED, reason HOTELBEDS_AUTH_ERROR, auth timestamp/category updated.
- Ordinary requests cannot leave AUTH_BLOCKED.
- Successful permitted STATUS: READY; success metadata updated.
- Failed permitted STATUS, including 401, 403, 429 and 500: permit remains consumed; circuit remains AUTH_BLOCKED.
- No midnight/24-hour reset, expiration-based recovery, Retry-After recovery, scheduler, background probe, retry, or re-import was added. TEST transport retries are forcibly zero.

`BEGIN` + row `FOR UPDATE` atomically checks state, consumes a matching permit and commits an in-flight token before transport. A second consumer cannot acquire that token. Transactions release their row locks before HTTP; no DB transaction is held across network.

**Conservative serialization:** only one TEST read may be in flight across instances, even in READY. Overlapping reads receive a safe unavailable result. This is deliberately stricter than the old process-local queues.

State storage and observation-table availability/insert privileges are checked before transport. A failed preflight persistence check results in zero provider calls. Completion records the observation and circuit transition in one transaction. If completion persistence fails, the durable in-flight token remains and prevents further traffic, including another control operation. No in-memory fallback exists.

## Exact permit/API semantics

Supported operation is **STATUS only**. CONTENT permits and cancel/reset endpoints are not implemented.

- `GET /admin/providers/hotelbeds/access`: local inspection/counters only.
- `POST /admin/providers/hotelbeds/access/arm`, body `{"operation":"STATUS"}`: arms one permit; **zero Hotelbeds calls**.
- `POST /admin/providers/hotelbeds/access/control`, same body: separate explicit status-only operation, one transport attempt at most.

All endpoints require authenticated admin plus existing permissions (`admin.system.read` or `admin.system.selftest`, and operations access). POST bodies reject extra keys, arbitrary operations, URL, credentials, provider/environment and scope. Arm requires AUTH_BLOCKED, no active request and no existing armed permit. Double arm is rejected. The consumed permit cannot be reused after recovery.

Public Availability, diagnostic 3424, ordinary admin probes, Content and CheckRate cannot consume this permit. Internal control permission is never accepted from public search parameters. LIVE does not consult or update TEST access state/counters.

## Content and public behavior

Content retains one configured scope per manual run, next batch up to 10, configured batch up to 20, overall cap 20 unique hotel codes per destination, advisory lock 319030, 60-second cooldown, identity checks, transaction rollback and TEST/LIVE isolation.

The STATUS permit does not authorize a Content import. While AUTH_BLOCKED, Content transport calls are zero and local planning remains available. UI text: “Импорт заблокирован защитой доступа Hotelbeds TEST.” Local status is refreshed after an import error.

When READY, Content is still bounded by up to two metadata GETs (1–100 and 101–200), then one hotel GET; retries=0, interval=1000 ms, timeout=12000 ms. A 403 at metadata #1 stops after one call; at metadata #2 after two calls; at hotel GET after three calls. Successful metadata does not undo a later auth block. No further metadata/hotel requests or automatic page search follow an error.

Results clears offers and distinguishes AUTH_BLOCKED from empty rates with: “Hotelbeds TEST временно недоступен. Последняя проверка доступа завершилась ошибкой авторизации.” Public responses expose a safe unavailable code/message, without circuit metadata, counters, permits or provider response. Existing rate/offer identity and freshness rules are unchanged; a blocked cache lookup cannot return old availability.

## Observations and admin UI

Only actual invocations of the HTTP transport produce `system_events` entries with category `hotelbeds_test_read`. Metadata contains only fixed provider/environment, allowlisted category and success boolean; timestamp, normalized error code, known HTTP status and duration use existing columns. No body, raw response, rateKey, API key/secret, signature, authorization header, certificate, private key, PII or payment data is stored by this feature.

Counters aggregate these observations, across instances:

- Today: UTC calendar day.
- Last 24h: rolling 24 hours.
- Breakdown: status, content, availability, checkrate.
- Timestamp: observation completion, stored explicitly in UTC in the existing timestamp column.
- Blocked calls, arm/inspect actions and failures before transport are excluded.

UI displays state, last auth error, last success, counters, breakdown, armed status and separate arm/execute buttons. Mandatory explanation: “Локальный счётчик запросов этого приложения. Это НЕ официальный остаток квоты Hotelbeds.” The auth explanation lists quota/access/account configuration as possible causes, not a proven diagnosis.

**Observation limit:** a process crash or DB write failure after transport can leave an unrecorded outcome. The in-flight latch exposes this uncertainty and blocks further calls. Counters are committed local observations, not an exact provider-side ledger. They exclude traffic before rollout and traffic from other applications.

## Offline validation

`node backend/scripts/sprint3mRegression.cjs` runs from any directory, uses local PostgreSQL only, creates a unique schema per suite, applies existing migrations there, then removes that schema. HTTP provider responses are fixtures/stubs. Its preload forbids real HTTPS. No existing test was deleted or weakened.

| Suite | Result |
|---|---|
| Sprint 3M | PASS — 13 reported tests (12 scenarios plus parent) |
| Sprint 3L | PASS — 2 |
| Sprint 3K / frontend acceptance | PASS — 2 |
| Sprint 3J | PASS — 2 |
| Sprint 3I | PASS — 3 |
| Sprint 3G | PASS — 9 |
| Sprint 3F | PASS — 2 |
| Sprint 3E | PASS — 16 |
| Sprint 3D | PASS — 24 (8 read-only + 10 live + 6 isolation) |
| Backend syntax | PASS — 176 files |
| Frontend lint | PASS — 0 errors, 3 existing warnings |
| Frontend production build, VITE_HOTELBEDS_STAGING_TEST_ENABLED=true | PASS |
| git diff --check | PASS |
| Secret scan | PASS — 303 source/report files, configured secret values/private-key blocks, no findings |

3M covers persistence across service instances, Content auth blocking, Availability/3424/CheckRate zero calls, STATUS-only consumption, simultaneous consumers, success recovery, auth/non-auth control failures, UTC/24h counters, safe persisted/API output, LIVE isolation, Content stops at calls 1/2/3, mutation guards, endpoint roles/body allowlist, blocked search cache, and missing/failed observation persistence.

Existing frontend warnings concern missing `load` hook dependencies in BookingsTable, NotificationsTable and RefundsTable. Frontend acceptance prints an existing Vite websocket port-24678 conflict, but both tests pass. A UTC-boundary fixture mismatch found during validation was corrected to use the explicitly UTC observation storage; final assertions were retained.

The secret checker compares tracked/new source files against locally configured secret values (never printing values), checks private-key blocks and performs backend syntax checks. It excludes README.txt/docs and is not a claim of exhaustive secret detection.

The initial legacy regression run created 11 offline observations and one new access-state row in the local development database. Those exact fixtures were identified by category, count and timestamps and removed transactionally. Final regressions used isolated schemas. No real-provider observation was removed.

## Changed files

New: `backend/services/hotelbedsTestAccess.js`, `backend/tests/hotelbedsAccess.test.js`, `backend/tests/offlineNetwork.cjs`, `backend/scripts/sprint3mRegression.cjs`, `backend/scripts/sprint3mVerify.cjs`, `frontend/src/components/admin/HotelbedsAccess.jsx`, this report.

Updated: `backend/integrations/hotelbeds/client.js`, `backend/package.json`, `backend/routes/adminOperations.js`, `backend/services/hotelbedsLiveReadOnlyService.js`, `backend/services/hotelbedsTestContent.js`, `backend/services/reliabilityMonitorService.js`, `backend/services/searchService.js`, `frontend/src/components/admin/HotelbedsContentStatus.jsx`, `frontend/src/components/admin/HotelbedsStatus.jsx`, `frontend/src/pages/Results.jsx`.

## Owner Render acceptance — not executed

1. Review and deploy separately, preserving all read-only/booking/payment flags and disabled schedulers. No new migration/env/secret file is required; migrations 014/019/020 must already be applied. Every serving instance must run the guard; mixed old/new instances are not protected as a group.
2. Before any provider traffic, inspect access and Content planning locally. Counts represent only new observations. The historical Render 403 is not automatically imported; do not interpret fresh READY or zero counters as proof of restored access. If carrying that known block into rollout, initialize the fixed TEST job row as AUTH_BLOCKED in a separately reviewed local DB operation before enabling traffic, preserving the known category and only a genuinely known historical timestamp.
3. Verify local counts/plans for PT:CEN, AE:DXB, TR:AYT, EG:SSH and TH:HKT against current PostgreSQL state. No provider request is needed.
4. With AUTH_BLOCKED, verify public search/diagnostic/Content/ordinary probe/CheckRate are unavailable, counters do not increase and local catalog browsing works.
5. Only after a separate owner decision to use provider access, click arm. Verify CONTROL REQUEST ARMED and unchanged counters. Public search must leave it armed.
6. Separately click “Выполнить контрольный STATUS”. Verify one observation and consumed permit. Success returns READY; 403 or another failure leaves AUTH_BLOCKED. Never loop controls or infer quota/reset time.
7. Recheck local Content status after recovery. Any Content import/Availability acceptance is a further explicit owner action; booking/payment remains disabled. Do not manufacture another real 403 to test the gate: offline tests cover it.

### Uncertain in-flight outcome

If `inFlight` remains after a crash/write failure: restore PostgreSQL, quiesce **all** application instances and wait for outstanding provider requests to terminate. A reviewed DB operation may then remove only the TEST job's stale in-flight token, set AUTH_BLOCKED and leave permit unarmed. Preserve known auth/success timestamps and observations; do not label the unknown outcome as a confirmed 403. Restart guarded instances, inspect locally, then use the explicit STATUS permit if authorized. Never clear an active token while an instance can still send or finish its request. This recovery is intentionally not an automatic API reset.

## Rollback

Stop/disable TEST provider traffic before reverting an application release: Sprint 3L alone has no shared circuit guard. Restore the previously reviewed application artifact without deleting catalog, observations, access state or changing migration 020. Keep TEST traffic disabled until a guarded release is restored or a separately approved alternative is in place. No schema rollback is necessary. No rollback/deploy operation was performed here.

## Safety confirmation

No real Hotelbeds Content, Status, Availability, CheckRate, Booking, Cancellation or LIVE calls. No payment calls or weakened safety flags. No git add/commit/push/deploy, Render env changes or Secret Files changes. README.txt/docs untouched. Render acceptance PASS, quota exhaustion and exact reset time are **not claimed**.
