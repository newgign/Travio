# Sprint 7M.2 — Local PostgreSQL Migration & Session Revocation Integration Proof

SPRINT 7M.2 — LOCAL INTEGRATION: PASS.
P1 SESSION REVOCATION: LOCAL INTEGRATION READY. STAGING ACCEPTANCE: OPEN.
COMMERCIAL PRODUCTION READY: NO. P1 is not fully closed.

2026-10-10, Asia/Qyzylorda. develop, HEAD `80b3b45 docs: record Sprint 7M.1 session security rollout design`; tracked tree clean at start, 7M.1 committed. Unrelated untracked owner files preserved. Everything from this sprint remains unstaged.

## Isolation and execution

Docker Engine 29.6.2 and existing local postgres:16 image used; no image download. Each invocation creates its own random-suffixed `asedeliya_session_security_test_*` container and database `asedeliya_session_security_test`. PostgreSQL published only to 127.0.0.1 on a Docker-assigned ephemeral port. The test checks the actual Docker binding before constructing the local connection; it never reads an inherited DATABASE_URL or imports dotenv/application startup. Credentials and JWT key are generated in memory and never printed. PostgreSQL readiness checks use loopback TCP, excluding the Docker entrypoint's temporary initialization Unix socket.

The Node socket guard permits only the proved local PostgreSQL port and its own loopback HTTP harness port. Final forbidden socket attempts: 0. Docker control uses the local Engine; no registry pull or external application request. Local PostgreSQL connections, queries and test mutations intentionally occurred. Remote DB connections: 0. Render/staging/production DB touched: NO. PSP calls: 0. Hotelbeds calls: 0. Real money: 0. Deployment: NO.

## Guard and migration chain

The existing runner is used unchanged, including advisory lock, ordered inventory, real `_migrations` ledger and per-migration transactions. Existing integrity checks validate all 22 filenames and normalized SHA-256 for 021/022. No new checksum ledger convention invented; the existing database ledger records filenames/timestamps.

A narrow local approval branch was added to reconciliationMigrationGuard: exact disposable-local approval string, NODE_ENV=test, APP_ENV=EXPECTED_APP_ENV=test, loopback connection, exact disposable database name and matching sourceIdentity fingerprint. Existing inventory, money/storage-disabled checks and 022 approval/disabled-enforcement checks still apply. Staging/production approval path is unchanged. Tests reject remote hosts, unrelated database, wrong environment, missing approval and wrong identity before connection. Explicit approval exists only in the integration harness's local env object, never project env files. This branch is an explicit local capability, not container ownership authentication; the harness separately creates and proves its own binding.

The runner executes 001–020 from normal SQL history and stops at a harness boundary before 021. A representative admin user is then inserted with existing schema conventions. Next invocation applies 021 and executes the actual 022 SQL; a harness exception immediately before inserting the 022 ledger row forces the runner's ROLLBACK. Both new columns and the 022 ledger entry are absent afterward; 021 remains committed, as expected for separate migration transactions. No checked-in SQL was modified. Final invocation commits 022. Ledger order: 021 -> 022 YES; all 22 versions present.

021 verification: both reconciliation tables, four explicit indexes and validated composite correlation foreign key present. No reconciliation records inserted or runtime activated.

022 verification: existing row retains identity/name/password hash and receives session_version=1/is_active=true. Both columns NOT NULL; defaults 1/true. A new user receives the same defaults. Version zero and NULL version/active updates are rejected by actual PostgreSQL constraints. No user data loss observed.

Runner rerun: all migrations skipped as already applied; ledger rows/timestamps unchanged. Idempotency/status: PASS. Migration transaction rollback: PASS.

## Session evidence

Actual Express auth router mounted only in a loopback test server; login/profile/password HTTP requests use real controllers, JWT verification, bcrypt and local PostgreSQL. A local admin harness route uses the actual auth middleware and requireRole guard. Additional direct middleware assertions exercise the same real account lookup.

- Active login signs server version 1 and current admin role; protected profile/admin requests succeed.
- Failed password change does not bump version. Successful password update atomically changes hash and version to 2; old JWT is rejected with 401, including actual HTTP profile request. New-password login signs version 2 and protected HTTP profile succeeds.
- Controlled harness-only SQL demotion changes role to user; old admin JWT gets 403 at the admin HTTP harness route. No proper role mutation service was introduced.
- Controlled local is_active=false rejects existing session and new HTTP login. Deleting the local user rejects the old JWT.
- Signed legacy JWT without sessionVersion is rejected when enabled. Disabled rollout retains the deliberately documented compatibility; final enabled policy remains REJECT.
- Temporarily renaming the local users table causes genuine SQL lookup failure. Middleware and HTTP profile both fail closed with 503 and exactly ACCOUNT_SECURITY_STATE_UNAVAILABLE; no SQL, stack or credentials returned. Table restored in finally.

Enforcement enabled only inside this test process after schema migration. Reconciliation storage runtime DISABLED; Admin datasource not activated or mounted. No frontend/browser or staging acceptance performed.

## Validation and cleanup

Final focused integration: **18/18 PASS**, zero skipped/cancelled (17 subtests plus parent). Adjacent: **121/121 PASS** across sessionSecuritySchema, sessionRevocationAccountState, securityHardening and adminReconciliationReadApi; offline DB trap attempts 0.

Full backend: **1168/1182 PASS**, 14 failures, zero skipped/cancelled, exit 1; exactly one aggregate invocation after final guard source. Four dedicated real-DB integration files excluded, including the new suite executed separately against Docker. Known DB-blocked: hotelbedsAccess 1, hotelbedsCatalogPlan 1, hotelbedsContent 3, hotelbedsMultiDestination 1, hotelbedsPublicSearch 1, hotelbedsStagingTest 6, stagingAcceptance 1. Unexpected failures: 0. Full backend PASS is not claimed. Offline preload blocks actual PostgreSQL connect/query and HTTPS; aggregate does not use the local integration DB. Later edits affected only the separately run integration test, not aggregate inputs or runtime source.

Development harness corrections: first socket guard missed numeric pg Socket.connect arguments and required targeted process termination and explicit cleanup of its own container/volume. Subsequent middleware/DB integration runs passed. HTTP extension exposed a PostgreSQL initialization readiness race and normalized-array HTTP Socket.connect arguments; corrected to TCP readiness and strict host/port checking for all used argument forms. Final HTTP suite passed without lowering any expected security result. These were test harness failures, not migration/runtime fixes.

Verifier PASS; 6A PASS; normal 021 preflight PASS (execution/storage disabled); normal 022 preflight PASS (execution/enforcement disabled); diff-check PASS. Verifier repeated after final integration-test/report edits to cover final files; other release checks run once. No full aggregate rerun. Frontend tests/build not run: unchanged.

Each completed harness invocation closes its HTTP server and pool, removes only its own named container with --volumes, then confirms no matching container remains. The interrupted first invocation's exact container/volume was explicitly removed. Final Docker label-filter audit confirms no Sprint 7M.2 container remains. No unrelated Docker resources removed.

Modified: `backend/scripts/lib/reconciliationMigrationGuard.cjs`.
New: `backend/tests/sessionSecurity.integration.test.js`, `SPRINT_7M2_LOCAL_SESSION_SECURITY_INTEGRATION_REPORT.md`.
Migration SQL, business/auth runtime source, dependencies, project env files, Render settings and frontend unchanged. Migration execution occurred only in disposable local PostgreSQL. Local evidence: `.tmp/sprint7m2-integration-http-final.log`, `.tmp/sprint7m2-adjacent.log`, `.tmp/sprint7m2-backend.log`, `.tmp/sprint7m2-verifier.log`, `.tmp/sprint7m2-6a.log`, `.tmp/sprint7m2-021-preflight.log`, `.tmp/sprint7m2-022-preflight.log`.

P1 remains open for separately authorized staging 021/022 application, enforcement activation and browser/API acceptance. Local proof does not authorize remote migration or production enforcement.
