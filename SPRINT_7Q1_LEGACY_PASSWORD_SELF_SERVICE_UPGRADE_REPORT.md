# Sprint 7Q.1 — Legacy Password Self-Service Upgrade

## 7Q.2 owner staging acceptance — current status

2026-10-10: authoritative owner evidence confirms combined7Q+7Q.1 staging deployment. Backend LIVE; health/readiness PASS with database.ok=true; normal<=72-byte login and admin access PASS. Frontend deployed successfully; ordinary login UI works with no new auth/storage errors observed. Normal auth regression PASS; legacy password upgrade foundation STAGING RUNTIME READY; logged-out self-service upgrade READY; session revocation PRESERVED; schema UNCHANGED. Legacy>72 owner E2E NOT RUN because no safe known legacy account was used and no fake staging account was created solely for acceptance. Capability/purpose/replay/revocation assertions below remain offline evidence, not newly observed staging edge-case results. P1 LEGACY BCRYPT STAGING RUNTIME ACCEPTED / LEGACY EDGE E2E NOT RUN. Historical original-length identification remains IMPOSSIBLE BY DESIGN; effective-prefix ambiguity is not fully remediated. Prior staging-acceptance-pending wording below is historical. See [7Q.2 report](SPRINT_7Q2_LEGACY_PASSWORD_STAGING_ACCEPTANCE_REPORT.md). No runtime/Render/deploy/DB/password action in this documentation task; COMMERCIAL PRODUCTION READY NO.

2026-10-10, Asia/Qyzylorda. CODE/OFFLINE PASS. Logged-out self-service upgrade READY in tested scope. P1 LEGACY BCRYPT FOUNDATION READY / overall PARTIAL. COMMERCIAL PRODUCTION READY NO.

## Baseline and scope

develop, HEAD `5d6d5f7 docs: finalize Sprint7P browser security acceptance`.7Q changes were already unstaged at start and deliberately continued; unrelated owner files preserved.7Q alone was not deployed because verified long-input login denied a general session without offering logged-out self-service remediation. This continuation closes that repository flow, without deploying it or claiming staging acceptance. No dependency/schema/config/Render change, DB connection, migration, provider operation, real account/password/hash inspection, git add/commit/push.

## Capability and trust boundary

Only a successful bounded legacy bcrypt comparison of supplied input>72UTF8bytes reaches409 PASSWORD_UPDATE_REQUIRED with passwordUpdateToken. Unknown/wrong credentials keep existing failure behavior. Active-account checks and valid current security state are required before capability issuance. No normal JWT, public user/role metadata, password length/hash or login-side mutation is returned.

The dedicated token uses JWT_SECRET, HS256, exact purpose `legacy_password_update`, positive safe id and schema-valid sessionVersion, iat and exp. TTL exactly **300 seconds**. No new mandatory secret; OFFER_TOKEN_SECRET is never used for this capability. Verification pins HS256, checks integer timestamps/short expiry and rejects unknown claims, including role. Auth middleware rejects any purpose-bearing token before account lookup; the offer verifier requires its own distinct purpose. The capability supplies no normal/admin authentication or booking/payment authority. Normal session and offer JWTs cannot authorize this endpoint.

POST `/api/auth/legacy-password-update` accepts only body passwordUpdateToken/newPassword; query-only authentication and extra fields are rejected. Invalid/expired/malformed/wrong-purpose tokens return fixed401 PASSWORD_UPDATE_INVALID before DB access. New password follows existing minimum8 JavaScript code units and maximum72UTF8bytes, without trimming/truncation. Invalid input returns fixed400 AUTH_INPUT_INVALID.

Current account is read server-side and must exist, remain active and match token id/version. Invalid current authority returns the same fixed401. Missing/malformed account-state or DB failures fail closed with fixed503 PASSWORD_UPDATE_UNAVAILABLE, without logging raw errors. Runtime bcrypt cost remains12.

One parameterized UPDATE checks id, old hash, session_version and active state, replaces password and increments version atomically. A competing change cannot report success; replay after successful update fails the current-version check. No token-use table/column or migration. Existing deployed022 state is reused. All capabilities for the previous version become stale. Prior ordinary sessions are rejected by existing7M checks **when enforcement is enabled**; no claim of revocation under disabled enforcement. Success returns only PASSWORD_UPDATED and reauthenticationRequired=true, never a normal JWT. Fresh ordinary login uses the new version.

The route inherits the existing server API and auth rate-limit buckets. It requires a narrow verified capability rather than normal bearer middleware. No unlimited alternate endpoint, raw-body logging, token telemetry or provider operation is added.

## Browser flow

The capability lives only in a private auth-store closure, absent from renderable snapshots. No localStorage/sessionStorage/URL/query/hash/history/console/telemetry persistence. Reload discards it; user may repeat legacy login. The old password is cleared on409. The upgrade form asks only new password and confirmation and validates matching/minimum/UTF8 bounds locally.

Success clears token and password fields, returns to ordinary login and displays “Пароль обновлён. Войдите снова.” Cancel, invalid/expired401 and unmount discard the capability. Network/5xx errors use fixed presentation and clear password fields; capability may remain only in memory for a user-initiated retry until cancellation/expiry. Duplicate pending submit shares one request. Generation/abort handling suppresses late results after cancellation/unmount. No session or navigation authority is established by an upgrade response.

## Verification

Final focused backend **204/204 PASS**: new capability tests40/40, extended7Q legacy tests39/39, adjacent securityHardening/sessionRevocationAccountState/mandatoryConfigSecretContract125/125. Covers short exact claims, signature/algorithm/expiry/purpose confusion, account disappearance/inactivity/version mismatch, ASCII/multibyte limits, fixed errors, replay, atomic race refusal, old-session rejection and fresh login in a synthetic account flow. Existing7Q tests include real installed bcrypt truncation/equivalence proof. Capability endpoint tests use fake SQL executors/hash hooks; they do not claim a new real PostgreSQL integration run. DB/socket/provider/log hooks prohibit accidental IO or credential logging. First development focused run203/204 had a test-helper default argument turning explicit undefined into a valid token; helper corrected, no runtime assertion weakened.

Frontend **82/82 PASS**, one invocation of legacyPasswordUpgrade, authUx, profileUx and browserAuthSecurityPolicy. Covers transient409 flow, no capability in storage/snapshot/DOM/URL, local mismatch/UTF8 bounds,72byte acceptance, success/relogin, cancel/expiry/network/503, duplicate submit/late result and unmount; adjacent normal auth/profile/browser policies retained.

Lint **PASS**,0 errors and3 existing admin hook-dependency warnings. Production build **PASS**, once, Vite reports successful build. Both npm wrapper logs contain PowerShell NativeCommandError for npm update-notice stderr; this is not a lint/compiler failure. No install/update performed and neither check rerun.

Full backend **1485/1499 PASS**, once on final runtime/test source,72 files,14 failures,cancelled/skipped0. Four dedicated real-DB integration files excluded: hotelbedsCatalog.integration,priceHistory.integration,stagingMigrations.integration,sessionSecurity.integration. Known DB-blocked14: hotelbedsAccess1,hotelbedsCatalogPlan1,hotelbedsContent3,hotelbedsMultiDestination1,hotelbedsPublicSearch1,hotelbedsStagingTest6,stagingAcceptance1. Unexpected unresolved0. Offline preload blocks real pg Pool/Client connect/query and external HTTPS; local HTTP regression harnesses and fake executors remain allowed. Full backend PASS is not claimed.

Verifier **PASS**,288 backend syntax files,612 secret-scan files,findings empty.6A **PASS**.021 preflight **PASS**, DISABLED—SAFE.022 preflight **PASS**, executionAllowed=false in local offline configuration. These local default results do not supersede supplied staging enforcement evidence. Final diff-check **PASS**. Each release check once. Evidence logs `.tmp/sprint7q1-*`; safety preload `.tmp/sprint7k2-offline.cjs` reused. Real remote DB connections0, migration executions0, Hotelbeds0, PSP0, money operations0.

## Remaining limitations and owner acceptance

Legacy hash cannot prove historical original password length or authenticate ignored suffix bytes. Effective72byte-prefix equivalence remains; a compliant supplied prefix matching an ambiguous historical hash cannot be distinguished from a legitimate compliant credential. No global legacy-account identification, automatic rehash, mass reset or claim all historical credentials repaired. Purpose-limited replacement is authorized by bcrypt's effective credential proof, not by proof of ignored bytes. Password replacement always increments version; enforcement must remain enabled for ordinary-session revocation.

Staging deployment/acceptance NOT RUN. After eventual authorized combined7Q+7Q.1 deploy, owner should verify normal login, same-tab frontend auth, admin access and unchanged ordinary password-change behavior. Legacy>72 staging E2E **NOT RUN** unless a safe existing test account already exists. Do not create a fake long-password account or reset owner/admin solely for this check. Offline synthetic evidence is separate from owner staging evidence. P1 foundation READY, production acceptance/historical ambiguity remain PARTIAL. Sales/payments/booking remain disabled/blocked.

## Exact files

Modified tracked files (combined unstaged7Q+7Q.1):

- SECURITY_PRODUCTION_GAP_CHECKLIST.md
- backend/controllers/authController.js
- backend/routes/auth.js
- frontend/src/components/AuthPage.jsx
- frontend/src/services/authFormStore.js
- frontend/src/utils/authPresentation.js (carried from7Q)
- frontend/tests/authUx.test.mjs (carried from7Q)

New files:

- backend/services/legacyPasswordUpgrade.js
- backend/tests/legacyPasswordUpgrade.test.cjs
- frontend/tests/legacyPasswordUpgrade.test.mjs
- SPRINT_7Q1_LEGACY_PASSWORD_SELF_SERVICE_UPGRADE_REPORT.md

Existing untracked7Q files retained: backend/tests/legacyBcryptPasswordHandling.test.cjs (updated capability assertions), SPRINT_7Q_LEGACY_BCRYPT_PASSWORD_HANDLING_REPORT.md (updated continuation notice). Temporary evidence remains untracked under .tmp. Everything unstaged; unrelated owner files untouched.
