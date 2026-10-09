# Sprint 7K.1 — Render Startup / Health Check Fix

SPRINT7K.1: PASS — code/offline reproduction and fix. Render deployment recovery NOT VERIFIED; no Render access/deployment or real DB inspection performed.

## Baseline

2026-10-09, Asia/Qyzylorda. develop, HEAD `5e2d975 docs: record Sprint 7K security hardening audit`; tracked tree clean. Prior7K committed. Unrelated owner untracked files untouched. Inspected only startup, health, middleware, relevant7K diff and focused test/release contracts. No configuration, dependencies, migration, storage activation, frontend or financial/provider change.

## Confirmed root cause and evidence limits

**Confirmed application defect: the configured Render `/health` liveness endpoint depended on PostgreSQL, returning503 on query failure instead of reporting process health.** It also passed through telemetry before the handler; a failed probe triggered a DB-backed system-event write. This violates the requested DB-independent process health contract.

Before-fix local reproduction ran actual backend/server.js with NODE_ENV=production,PORT=10000,all startup monitors/commercial operations disabled and DB mocked unavailable before imports:

```text
BEFORE_FIX_BIND={"address":"0.0.0.0","family":"IPv4","port":10000}
BEFORE_FIX_HEALTH=503 {"status":"unavailable","database":{"ok":false}} elapsed_ms=47
BEFORE_FIX_MOCK_IO={"type":"stats","queries":2,"connects":0}
CHILD_EXIT=0
```

The two fake queries were the health SELECT and telemetry error-event write; zero real DB calls. The process was listening while health failed. Evidence stored in `.tmp/sprint7k1-before.log`.

**Exact cause of the particular remote Render incident is not established by the supplied logs.** They do not show the response status/body, DB error, later process state or deployment revision. No claim that the remote DB was unavailable, that migration021 was missing, or that this fix alone proves remote recovery. The reproduced application failure mechanism is established; remote dependency/network/process failure cannot be distinguished without additional deployment evidence. No “likely” explanation substituted for missing evidence.

Git comparison against Sprint7J `5339375` confirms server.js,stagingHealth.js and routes/health.js did not change in7K. The DB-dependent probe therefore predates7K. In the relevant global path,7K only changed request-id acceptance from arbitrary bounded text to UUID/32hex with server-generated fallback. No evidence that7K introduced a binding/auth regression.

## Exact startup and binding

`npm --prefix backend start` → backend/package.json `node server.js` → dotenv/config/pool and router construction → `app.listen(PORT,"0.0.0.0",callback)` where `PORT=process.env.PORT || 5000`.

The application log “Server started on port …” is inside the listening callback, after the HTTP listener starts. Actual production-like socket address verified through exported server.address(): `{address:'0.0.0.0',family:'IPv4',port:10000}`. No localhost/127.0.0.1 bind, no omitted/ambiguous host. The local HTTP client uses127.0.0.1 to reach the all-interface listener; that is not the server bind address. No hardcoded10000 added to runtime. Binding and Render configuration left unchanged.

## Health and middleware fix

stagingHealth.healthHandler() now synchronously returns200 `{status:'ok'}` with no DB/pool/provider/auth dependency. Removed misleading database-ok field from process liveness response.

Registration now: disable x-powered-by → securityHeaders → GET /health → requestTelemetry → CORS → JSON parser → /api/health routes → API/auth rate limiters → protected application routes → notFound/error handler.

Process probe retains security headers while avoiding DB-backed slow/error telemetry altogether. It does not require/reflect caller correlation ID, Authorization, admin role, browser Origin or conventional Host value. No broad telemetry/auth weakening: all other API paths retain existing telemetry,CORS,body parsing,limits and server authorization.

`GET /api/health/ready` unchanged: checks databaseStatus and lifecycle.shuttingDown;503/not_ready for unavailable DB. `GET /api/health/live` remains process-level unauthenticated. No readiness success forged and no migration/schema problem hidden as dependency-ready. Render `/health` now certifies only responding process health; dependency readiness must be monitored separately.

## Production-like startup verification

New child harness imports real server.js with NODE_ENV=production,PORT=10000 and safe monitor/commercial/storage flags. Replaces backend/db.js before any application import; blocks direct pg import and HTTP/HTTPS/fetch calls from the server process. No Docker or DB. Monitors disabled,zero mock queries/connects at listening.

Ten new runtime tests verify actual env-port/all-interface socket; startup log; unauthenticated prompt200; missing/odd request IDs,Host and invalid Authorization; retained security headers;20 repeated probes with zero additional fake DB calls; /api/health/live; truthful mocked-DB readiness503; protected Admin401; health remains200 after readiness failure. One measured successful probe40ms; requests bounded by3s timeout. Readiness intentionally makes mock queries; health itself makes none. Timings are local regression evidence,not a production latency/SLA claim.

requestTelemetry blocks health: NO. Auth blocks health: NO. It was not globally authenticated before the fix either. The7K request-ID regex itself was not a probe blocker; no change made to it.

## Tests and release checks

Focused four-file final invocation: **98/98 PASS** (new startup10,securityHardening43,stagingDeployment6,preProductionReadiness39). Existing health assertions updated to the new liveness contract; dedicated runtime readiness tests preserve dependency-failure semantics.

Full backend exactly once after final source: **1069/1083 PASS**, failures14,cancelled/skipped0,exit1;58 files. Three dedicated real-DB integration files excluded: hotelbedsCatalog.integration,priceHistory.integration,stagingMigrations.integration. Known DB-blocked14: hotelbedsAccess1,hotelbedsCatalogPlan1,hotelbedsContent3,hotelbedsMultiDestination1,hotelbedsPublicSearch1,hotelbedsStagingTest6,stagingAcceptance1. Unexpected failures0. Aggregate preload blocks real pg connect/query and HTTPS; child startup uses its own stricter pre-import mock. No rerun to improve totals.

Final-source checks: verifier PASS (257 syntax files,552 secret scan files,findings empty);6A PASS;migration preflight PASS (DISABLED — SAFE);diff-check PASS. Each invoked once. Frontend tests/lint/build NOT RUN; unchanged.6B NOT RUN while intentionally dirty.

## Exact files

Modified:

- backend/server.js — health ahead of telemetry,retain security headers and existing bind.
- backend/routes/stagingHealth.js — synchronous DB-independent process liveness.
- backend/tests/stagingDeployment.test.js — liveness contract regression.
- backend/tests/preProductionReadiness.test.cjs — bounded DB-independent health regression.

New:

- backend/tests/helpers/startupHealthChild.cjs
- backend/tests/renderStartupHealth.test.cjs
- SPRINT_7K1_RENDER_STARTUP_HEALTH_FIX_REPORT.md

Generated local evidence: .tmp/sprint7k1-before.log,.tmp/sprint7k1-focused.log,.tmp/sprint7k1-backend.log,.tmp/sprint7k1-verifier.log,.tmp/sprint7k1-6a.log,.tmp/sprint7k1-preflight.log and .tmp/sprint7k1-offline.cjs. All files unstaged;no git add/commit/push.

## Safety and deployment status

Real PostgreSQL connections0,queries0,mutations0;migration executions0;Hotelbeds Availability0/CheckRate0/Booking0/Cancellation0;PSP0;money/refund/cancellation0. Migration021 unexecuted,activation OFF;reconciliation storage DISABLED;Admin datasource inactive. No DB/schema changes,external API calls or deployment. Render configuration unchanged.

Offline fix verified. Owner's next deployment/recheck must independently confirm `/health`200 and socket discovery on exact deployed revision; `/api/health/ready` must still expose dependency failures. This report does not authorize or claim deployment,DB repair or commercial readiness.
