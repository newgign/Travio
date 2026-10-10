# Sprint 7M.1 — Session Security Schema & Backward-Compatible Rollout Foundation

SPRINT 7M.1 — CODE / OFFLINE: PASS in tested foundation scope.
SESSION SECURITY SCHEMA / REVOCATION FOUNDATION / ACCOUNT-STATE FOUNDATION: PASS — offline/static and mocked runtime only.
Existing auth architecture: REUSED + HARDENED. P1 SESSION REVOCATION: FOUNDATION READY in offline scope; acceptance OPEN.
Enforcement runtime active now: NO. Migration executed: NO. DB/schema actually changed: NO.
COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.

## 1. Baseline and scope

2026-10-10, Asia/Qyzylorda. develop, clean tracked tree at start; HEAD
`29dda90 docs: record Sprint 7M session revocation schema blocker`. Required start commands passed.
7M report committed. Unrelated untracked owner files preserved. No staging/commit/push/deploy or reset/restore/clean.
Only auth/account-state, migration ordering/guards/inventory, relevant tests and security checklist touched.
Existing 7K HS256/expiry/identity/purpose hardening, 7L payment boundary and 7K.2 socket diagnostics preserved.

## 2. Exact schema design

Inventory confirmed 001–021; next migration is `database/migrations/022_session_security_state.sql`.
Two additive users columns, no new table:

- session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version >= 1).
- is_active BOOLEAN NOT NULL DEFAULT TRUE.

PostgreSQL defaults initialize existing users; inserts use defaults. No runtime/browser write path for these fields.
No unrelated mutation, DROP/TRUNCATE/backfill DML or transaction wrapper; existing runner owns transactions.
updated_at remains an ordinary profile timestamp and is not a revocation marker.
IF NOT EXISTS permits repeat application; owner must verify types/defaults/nullability/checks, including any preexisting
same-name column collision, before activation. SQL not executed/validated against a real PostgreSQL instance here.

## 3. Runtime seam and backward compatibility

`SESSION_STATE_ENFORCEMENT` accepts exactly disabled/enabled, default disabled. Unknown/empty/case-variant values fail closed
with a fixed configuration error. No environment files or Render settings changed. Schema presence never activates enforcement.
Config selects a verification path, never supplies a user, role, active flag or session version.
Disabled middleware remains synchronous and performs zero account-state queries; it accepts existing valid legacy JWTs.
Disabled login issues the existing JWT shape. Disabled password update uses the existing columns and behavior.
This deliberate compatibility mode preserves current stale-account/role/password-revocation limitations; it is not security acceptance.

## 4. Enabled account-state enforcement

After existing JWT verification, accountSecurityState queries the existing users table by signed id using a bound parameter:
id, role, session_version, is_active only. One security lookup per protected request; no cache or second session model.
Endpoint-specific profile/credential business reads remain separate, not repeated security lookups.
Missing/deleted/inactive account or absent/stale/invalid version yields 401. Missing schema, malformed server state or lookup
failure yields fixed 503, without logging SQL/raw errors, token, DB URL, stack or credentials. Never falls back to JWT authority.
req.user is rebuilt from current server id/role/version; untrusted body/query identity and JWT role snapshots cannot override it.
Preexisting req.user is cleared before authentication so failed validation cannot retain stale authority.
JWT sessionVersion is bounded to the PostgreSQL positive INTEGER range; malformed string/boolean claims rejected.

## 5. Login and legacy JWT policy

Enabled login reads existing server user, requires valid version/current role and is_active=true, verifies bcrypt, and signs
current sessionVersion plus current server identity/role. Expiry and HS256 verification preserved. No password hash/active state
in public user projection; no browser-supplied version or role used. Inactive login returns the existing generic invalid credentials
message; enabled configuration/schema/DB errors are safe 503 with no token. No silent auto-login introduced.

Final policy after activation: REJECT JWTs without sessionVersion. There is no permanent grace exception.
All legacy tokens, including current browser sessions, intentionally require re-login when enabled.
New versioned JWTs can only come from enabled login; simply applying columns does not change token issuance.

## 6. Password change, concurrency and freshness

Enabled password change checks server active/version against authenticated request, verifies current password and creates the new hash.
A single parameterized UPDATE writes password and session_version=session_version+1 atomically, guarded by id, previous password hash,
previous version and is_active=true; RETURNING id confirms actual update. No bump before password verification, no partial version write.
Concurrent password/version/disable changes causing zero rows yield 401, never false success. SQL failure rolls back the statement
and returns safe 503. Version overflow fails closed; no wrapping/reset behavior.
Success returns reauthenticationRequired=true with the existing message and no new token. Every previous session, including
the initiating browser, fails its next protected request. Explicit login issues the new current version.
In-flight requests that already passed the lookup are not retroactively cancelled; this is request-boundary enforcement.
Ordinary profile updates do not bump version or invalidate sessions.

## 7. Role, deletion and disable semantics

Enabled middleware uses current DB role even if a still-valid JWT was signed as admin. Demotion immediately removes admin authority
on the next lookup even without a version bump. Deleted users and is_active=false are denied. These behaviors were tested with mock rows.
Inspected userController/routes provide list/delete, not role-change or disable mutation paths. No new endpoint or UI invented.
Future role/disable/re-enable/security mutations must use server-only atomic version increments to prevent token resurrection;
is_active alone denies access while false but re-enabling without a bump could revive a matching-version token.
Per-session logout revocation and bounded admin session policy remain additional P1 work; frontend logout remains local invalidation.

## 8. Migration ordering and guard safety

Existing runner enumerates all .sql filenames, sorts them and applies unapplied files in separate transactions under its advisory lock.
It has NO selective migration option. Applying 022 through normal runner requires accepting 021 first/as part of the ordered pending set
when 021 is pending. If 022 fails, already committed 021 is not rolled back as a batch. Inspect the actual target ledger privately later.
No claim about target ledger from this offline inventory. Migration 021 SQL/checksum unchanged; still unexecuted in this work.

New sessionSecurityMigrationGuard wraps/reuses 7I's 021 guard: all existing verified-target/environment/TLS/backup/disabled-money
requirements remain mandatory. Additional 022 requirements:

- SESSION_SECURITY_MIGRATION_ENABLED=true.
- SESSION_SECURITY_MIGRATION_APPROVAL=I_APPROVE_022_WITH_ORDERED_PENDING_MIGRATIONS.
- SESSION_SECURITY_EXPECTED_DB_IDENTITY matches the already-validated RECONCILIATION_EXPECTED_DB_IDENTITY.
- Enforcement remains disabled during migration and normalized 022 SQL checksum/inventory are intact.

These are owner acknowledgements, not automatic validation of backup contents or approval obtained in this sprint.
021 authorization alone cannot reach pool construction/connect/ledger mutation in the general runner anymore.
Normal npm start and Render deploy have no migration hook. No migrate command run; mock runner tests stop at the guard
or at a simulated ledger error before any 021/022 migration SQL can execute.
Offline sessionSecurityMigrationPreflight reports only fixed statuses; activation/execution defaults OFF.
Existing reconciliation guard/preproduction/database-continuity inventory expectations now explicitly include exactly 22 migrations;
table/index expectations and 021 integrity constraints remain unchanged. Preproduction foundation gate also blocks session activation.

## 9. Frontend compatibility

Frontend source unchanged. Inspected existing authFetch/session code: 401 clears the matching current local session; restoration
401/404 clears local state, while late responses cannot clear a different/new session. Targeted authSessionSecurityQuality
regression: 70/70 PASS, including own-API 401/no-retry/notice and late-response protections, all network mocked.
Full frontend/lint/build NOT RUN. Future activation UX should explicitly request re-login immediately after password success;
current UI clears on the next 401. No redesign introduced while enforcement remains disabled.

## 10. Tests and checks

Focused: 48/48 PASS (16 schema/rollout/guard, 32 runtime account/session cases), one invocation.
Runtime tests use mock pool queries and bcrypt; DB connect, PSP/payment/refund/Hotelbeds, logger and HTTP/HTTPS/fetch/net/tls operations trapped.
Fake auth UPDATEs test atomic predicates/version changes; no real SQL execution. Schema tests validate guard only under synthetic
approval fixtures; rejected runner paths stop before connection. Neither 021 nor 022 is executed by these tests.

Adjacent backend: 209/209 PASS, one invocation across securityHardening, adminReconciliationReadApi, paymentIntentFoundation,
preProductionReadiness, reconciliationMigrationActivationGuard, reconciliationMigrationDesign and databaseContinuity.
Existing auth assertions unchanged; two inventory fixtures updated from 21 to 22 with explicit 021-before-022 assertions.
Frontend targeted: 70/70 PASS, separate invocation as above.
Full backend, exactly one aggregate on final runtime source: **1167/1182 PASS**, 62 files, failures 15, cancelled/skipped 0, exit 1.
Known DB-blocked 14: hotelbedsAccess 1, hotelbedsCatalogPlan 1, hotelbedsContent 3, hotelbedsMultiDestination 1,
hotelbedsPublicSearch 1, hotelbedsStagingTest 6, stagingAcceptance 1. Real pg query/connect and HTTPS blocked by safety preload.
Three dedicated real-DB integration files excluded: hotelbedsCatalog.integration.test.js, priceHistory.integration.test.js,
stagingMigrations.integration.test.js. Full backend PASS is not claimed and totals are not retroactively changed.

One additional aggregate failure: stagingDeployment advisory-lock mock fixture supplied only 021 approval, so the stronger
022 guard correctly refused before reaching lock. Updated this fixture with explicit synthetic 022/target approval, retaining
all lock/unlock/release assertions. Corrective stagingDeployment invocation: **6/6 PASS**; runtime source unchanged.
Unexpected failures in the aggregate: 1; unresolved unexpected failures after corrective verification: **0**.
No repeat aggregate or claim of an observed 1168/1182 result. Two inventory fixtures and one runner-approval fixture updated;
no existing security/assertion weakened. Final test fixture change verified by executing its complete six-case suite.

Release checks, each one invocation: verifier PASS (267 backend syntax files, 571 secret-scan files, findings empty),
6A PASS, reconciliation migration preflight PASS (DISABLED — SAFE), session migration preflight PASS
(executionAllowed=false, enforcementActive=false). Verifier preceded the final test-only fixture correction;
that corrected JavaScript was parsed/executed by the successful corrective suite. Final diff-check PASS, one invocation.
6B NOT RUN while tracked work intentionally dirty.

## 11. Exact files

Modified:

- backend/controllers/authController.js
- backend/middleware/authMiddleware.js
- backend/scripts/migrate.js
- backend/scripts/lib/reconciliationMigrationGuard.cjs
- backend/scripts/preProductionCheck.cjs
- backend/tests/reconciliationMigrationActivationGuard.test.cjs
- backend/tests/databaseContinuity.test.cjs
- backend/tests/stagingDeployment.test.js
- SECURITY_PRODUCTION_GAP_CHECKLIST.md

New:

- database/migrations/022_session_security_state.sql
- backend/config/sessionSecurity.js
- backend/services/accountSecurityState.js
- backend/scripts/lib/sessionSecurityMigrationGuard.cjs
- backend/scripts/sessionSecurityMigrationPreflight.cjs
- backend/tests/sessionSecuritySchema.test.cjs
- backend/tests/sessionRevocationAccountState.test.cjs
- SPRINT_7M1_SESSION_SECURITY_SCHEMA_ROLLOUT_REPORT.md

Local logs under .tmp/sprint7m1-*.log. Existing .tmp/sprint7k2-offline.cjs aggregate pg/HTTPS safety preload reused unchanged.
All changes unstaged. No dependencies, frontend source, startup, money/booking gates, 021 SQL or DB targets changed.

## 12. Future activation plan — documentation only

1. Owner approves schema/legacy-token/security mutation rollout and verified target.
2. Back up target and establish restore evidence.
3. Inspect actual ledger and explicitly accept pending set, including 021 and 022; no selective runner support.
4. Run offline preflights, review checksums and exact ordered inventory; separately verify target schema/identity.
5. Explicitly provide both existing 021 approvals and new 022 migration acknowledgements for that target.
6. Run migrations only under separate execution authorization; never via normal deploy.
7. Verify column types/defaults/non-null/positive constraint, version initialization and actual applied ledger.
8. Keep enforcement disabled initially; schema alone changes no authorization or token behavior.
9. Deploy compatible code to all instances if needed, plan cutover and user re-login communication.
10. Enable session-state enforcement consistently across every instance after schema acceptance.
11. Reject every legacy JWT without version; users explicitly re-login for current-version JWTs.
12. Verify demotion, password change/concurrent update, deletion, disable/re-enable version bump and DB outage fail-closed in staging.
13. Verify frontend re-login flow and record owner/security acceptance; only then reassess P1 closure.

After activation, disabling enforcement is NOT a safe security rollback: it restores acceptance of legacy/stale JWTs and
password changes during disabled mode do not bump version. Prefer a compatible enforced-code fix or separately reviewed
access/key-rotation plan; never silently toggle disabled across a mixed fleet. No rollback/activation performed here.

## 13. Remaining acceptance and zero real IO

P1 SESSION REVOCATION: FOUNDATION READY offline, commercial/staging acceptance OPEN. Checklist P0:1/P1:6/P2:3 unchanged.
Enforcement not active now; existing deleted/stale-role/password-session gaps remain in default compatibility mode.
Real DB connections/queries/mutations 0; migration executions 0; real PSP/Hotelbeds/charge/refund/cancellation 0.
Reconciliation storage/Admin datasource DISABLED. Real payments BLOCKED; production sales OFF.
No security certification, PCI or commercial production readiness claim.
