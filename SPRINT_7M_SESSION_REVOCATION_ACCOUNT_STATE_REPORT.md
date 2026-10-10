# Sprint 7M — Session Revocation & Account-State Enforcement

SPRINT 7M — CODE / OFFLINE: NOT IMPLEMENTED — required schema decision stop.
SESSION REVOCATION: BLOCKED. ACCOUNT-STATE ENFORCEMENT: NOT IMPLEMENTED.
SESSION REVOCATION REQUIRES SCHEMA CHANGE for the requested dedicated durable freshness/version mechanism.
Existing auth architecture: REUSED, unchanged. S-P1-01: OPEN.

## Baseline and mandatory stop

2026-10-10, Asia/Qyzylorda. Required commands confirmed develop, clean tracked tree and
HEAD `6906c66 docs: record Sprint 7L payment evidence boundary`. Sprint 7L committed.
Unrelated untracked owner files preserved. No reset/restore/clean/staging/commit/push/deploy.

The task explicitly requires stopping before creating a migration if correct session revocation needs schema support.
This report records that stop; it does not claim that any requested runtime protection was implemented.
No new migration or session system created. Repository schema evidence only; no real database inspected.

## Existing account-state source and schema findings

`database/migrations/002_core_schema.sql` defines users with id, full_name, email, password, phone, role,
created_at and updated_at. `009_sprint2g_customer_cabinet.sql` adds language/notification preferences.
Targeted searches of checked-in migrations found no users password_changed_at, token_version, session_version,
role_updated_at, disabled, is_active or account-status column.

`authController.updateProfile` writes updated_at for ordinary profile/preference changes.
`authController.changePassword` also writes updated_at. Therefore updated_at cannot safely be reused as the
requested password/session freshness marker without revoking sessions on ordinary profile edits, explicitly forbidden here.
created_at is account creation time, not a revocation marker. The existing password hash remains a private credential;
no raw hash or ad hoc credential-derived JWT revocation claim was introduced to bypass the schema decision.

## JWT and account behavior, unchanged

Login reads users by parameterized normalized email, checks bcrypt and signs id/email/role with expiry.
authMiddleware verifies HS256/signature/expiry/session shape, then assigns the JWT snapshot to req.user.
It does not fetch current account state. /auth/profile independently checks account presence; this does not
invalidate the same token on other protected routes. The auth router has no server logout endpoint.

Before/after this audit are identical:

- Deleted/nonexistent account: old valid JWT can still pass authMiddleware; individual controllers may reject missing resources.
- Demoted admin: old JWT still contains admin role; current database role is not checked by authMiddleware.
- Browser role is not directly trusted by backend, but the signed JWT role remains a stale authority snapshot.
- Password change: old JWT remains valid until expiration/key change; no version/freshness claim or server revocation.
- No account disabled/status field exists in checked-in schema; disabled-account enforcement is not supported by that schema.
- No new post-password-change session, auto-login or logout behavior introduced.
- Account lookup fail-closed behavior cannot be claimed: no new middleware lookup was implemented.

Admin userController contains user list/delete operations, including self-delete protection; no role-change endpoint
was found in the inspected user routes/controller. External/server-side role changes remain a stale-JWT risk.
Existing admin requireRole/permission guards are unchanged.

## What could be done without a schema change

A single parameterized current-user lookup per protected request could deny deleted users and enforce current roles
without migration. That would be partial account-state hardening, not full password/session revocation.
It has not been implemented because the requested stop condition was reached during the schema audit.
No new Redis/cache/parallel user model, global token blacklist or unrelated timestamp workaround.

## Required next decision and remaining limits

Separately authorize a schema design for a dedicated durable user session_version/token_version (or a correctly scoped
password/session invalidation marker), legacy-token rollout and password-change/session semantics before implementation.
Design must atomically change the marker on relevant account mutations, verify it alongside current account/role on
protected requests, fail closed on lookup errors and reject stale/missing claims under an explicit rollout policy.
Account disabling requires its own supported schema/product policy. Server logout/revocation scope and bounded admin
sessions also remain design/acceptance requirements. No design or migration is automatically approved by this report.

S-P1-01 remains OPEN; security requirement counts unchanged: P0:1, P1:6, P2:3.
No frontend changes required or performed for this diagnostic stop. Existing frontend handling was not re-audited.

## Verification and exact files

Focused 7M / adjacent / full backend: NOT RUN — runtime/tests unchanged; stopped before implementation.
No sessionRevocationAccountState.test.cjs created; no unimplemented security assertions presented as passing tests.
Known DB-blocked / unexpected test failures: NOT MEASURED in this sprint; previous sprint counts are not new evidence.
Offline release checks, each run once: verifier PASS (261 backend syntax files, 561 secret-scan files, findings empty),
6A PASS, migration preflight PASS (OFFLINE_ONLY / DISABLED — SAFE). These do not validate session revocation.
Final diff-check: PASS, one invocation after documentation edits.

Modified:

- SECURITY_PRODUCTION_GAP_CHECKLIST.md

New:

- SPRINT_7M_SESSION_REVOCATION_ACCOUNT_STATE_REPORT.md

Backend/frontend source, dependencies, DB/schema and migration files changed: NO.
Migration created: NO. Migration 021 executed: NO. Storage/Admin datasource activation: NO.
Real DB/PSP/Hotelbeds calls and real money operations: 0. No network, provisioning or deployment.
Existing payment/booking safety gates unchanged. COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.
Everything left unstaged.
