# Sprint 7Q — Legacy bcrypt Password Handling & Password Policy Migration

## 7Q.2 owner staging acceptance — current status

2026-10-10: combined7Q+7Q.1 deployed to staging per authoritative owner evidence. Backend LIVE; /health and /api/health/ready PASS, database.ok=true; normal<=72-byte login and admin PASS. Frontend deployed, ordinary login UI works, no new auth/storage errors observed. Normal auth regression PASS; legacy password upgrade foundation STAGING RUNTIME READY; logged-out self-service upgrade READY; schema UNCHANGED; session revocation PRESERVED. Legacy>72 owner E2E NOT RUN: no safe known legacy account used and no fake staging account created solely for acceptance. P1 LEGACY BCRYPT STAGING RUNTIME ACCEPTED / LEGACY EDGE E2E NOT RUN. Original-length identification remains IMPOSSIBLE BY DESIGN; no full historical bcrypt remediation claimed. Earlier deployment/acceptance-unknown statements describe prior sprint work. See [7Q.2 acceptance report](SPRINT_7Q2_LEGACY_PASSWORD_STAGING_ACCEPTANCE_REPORT.md). This documentation task performs no deployment, DB connection or password change; commercial production readiness remains NO.

## 7Q.1 continuation — supersedes the recovery limitation below

7Q alone was not deployed: a logged-out user supplying a successfully verified >72-byte credential had no self-service replacement path. Sprint 7Q.1 adds a purpose-specific, HS256, 300-second passwordUpdateToken to the existing409 response, without issuing a general session. POST /api/auth/legacy-password-update validates that capability and current active account/version, then atomically replaces the password and increments session_version. Replay becomes stale; fresh ordinary login is required. The frontend keeps the capability only in an auth-store closure and clears it on success, cancel, invalid/expired response or unmount. No schema or mandatory-secret addition. The earlier fixed-code-only response and absent-recovery descriptions below record the original7Q state, not the combined implementation. See [7Q.1 report](SPRINT_7Q1_LEGACY_PASSWORD_SELF_SERVICE_UPGRADE_REPORT.md) for final-source verification and remaining limitations. No staging acceptance or deployment performed. Original password length remains impossible to infer from a legacy hash; effective-prefix equivalence remains unresolved for unidentified historical accounts.

2026-10-10, Asia/Qyzylorda. CODE/OFFLINE PASS in tested scope. P1 LEGACY BCRYPT PARTIAL / FOUNDATION READY. COMMERCIAL PRODUCTION READY NO. No real accounts/passwords/hashes inspected.

## Baseline and installed library proof

develop, tracked clean; HEAD5d6d5f7 docs: finalize Sprint7P browser security acceptance.7P committed, owner untracked files preserved. Supplied staging security baseline retained; no deployment/config/DB evidence newly obtained. Inspected auth controller, account-security/password-change contract, directly relevant frontend presentation/tests and installed bcryptjs source/package; no unrelated business scan.

Installed bcryptjs **3.0.3**. Its truncates() uses UTF8 byte length>72. _hash encodes password to UTF8 and feeds bcrypt; finish serializes revision/cost/salt/digest with no original-length field. Synthetic tests verify71/72ASCII not truncated,73truncated;36 two-byte characters and24 three-byte characters fit72,37 two-byte and19 four-byte exceed. Same first72bytes/different suffix compare equivalent for ASCII and multibyte inputs. Same salt produces exactly identical hashes for72-byte prefix and longer credential, proving original length IMPOSSIBLE to recover from hash alone. No real digest or password printed. Cost4 used only for fast library-behavior fixtures; runtime cost12 unchanged.

## Selected transition and limitation

Policy A from the task: retain bounded<=1024byte login input and actual bcrypt verification, but after successful comparison reject observed>72byte input with HTTP409 and exactly {code:PASSWORD_UPDATE_REQUIRED}. No general JWT, public user metadata, password mutation, rehash, stored flag or new privilege. Unknown/wrong/inactive accounts retain prior error behavior and receive no legacy signal. Successful compare establishes only bcrypt effective-prefix proof, not proof of the ignored suffix; wording does not imply original suffix authentication.

Existing valid authenticated sessions can use password-change with bounded long current password to explicitly set compliant new password. This preserves compatibility where safe existing authority exists. Users with no active session cannot obtain a normal JWT through the ambiguous long-input path; there is no existing self-service reset capability to reuse. Frontend gives a fixed update/support message, clears password fields and performs no session commit/navigation on this state. It does not pretend that a recovery endpoint or support identity-verification process has been implemented. Independent recovery design/owner procedure remains OPEN; lockout/recovery impact for such users must be reviewed before deployment. No automatic password replacement and no instruction to shorten an existing password as a workaround.

Crucial residual risk: hash alone cannot identify long-origin accounts; a<=72byte prefix matching such a hash remains indistinguishable from a legitimate compliant credential and retains normal login semantics. This sprint blocks observed long-input login from continuing as a general session, not all historical equivalence classes. Two>72byte inputs with same prefix still compare equivalently inside bcrypt but neither receives a normal login JWT. No claim all legacy passwords repaired, length globally inferred or ambiguity mathematically eliminated. No mass reset or speculative legacy flag.

## Registration, replacement and sessions

Existing registration/new-password limit uses Buffer.byteLength UTF8<=72, existing minimum8 JavaScript code units retained. No trimming or silent truncation. Current-password compatibility<=1024 retained. Existing same-password behavior unchanged: no new inequality rule invented; explicit user-approved replacement is hashed cost12. Under enabled session enforcement, one UPDATE checks old hash/version/active account and increments session_version atomically, returns reauthenticationRequired; stale/raced update fails. Prior sessions become stale under7M checks. Disabled rollout retains existing weaker legacy contract; no claim version revocation where enforcement disabled. Supplied staging enforcement remains enabled; not altered here.

Opportunistic lower-cost rehash not implemented: library getRounds can inspect cost, but a login-side write adds concurrency/version policy and cannot solve unknown original length. Runtime cost12 for new writes unchanged; legacy cost distribution UNKNOWN. No algorithm switch, schema change, migration or reset-token architecture required/added.

## Exact changes

Modified backend/controllers/authController.js: post-compare long-input gate before public user/JWT. Existing registration/change-password logic unchanged.

Modified frontend/src/services/authFormStore.js: allowlists only PASSWORD_UPDATE_REQUIRED from login409, suppresses raw response details; no session commit, passwords cleared. Modified frontend/src/utils/authPresentation.js: fixed update/support message. Modified frontend/tests/authUx.test.mjs: dedicated signal/no token/no navigation/no password retention regression. Backend auth extraction and frontend token storage unchanged.

Modified SECURITY_PRODUCTION_GAP_CHECKLIST.md. New backend/tests/legacyBcryptPasswordHandling.test.cjs and SPRINT_7Q_LEGACY_BCRYPT_PASSWORD_HANDLING_REPORT.md. All files unstaged; owner files preserved.

## Verification

Focused backend **39/39 PASS**; adjacent **164/164 PASS**, combined203/203 across securityHardening, sessionRevocationAccountState, mandatoryConfigSecretContract and preProductionReadiness. Coverage: real installed-library truncation/hash equivalence; byte/type boundaries; registration before query/hash; ordinary login; successful long proof fixed409/noJWT/nohashwrite; unknown/wrong equivalence; inactive rejection; legacy current replacement/new byte limits; session version/active/stale/race/fresh-auth contract; no password/hash/account metadata in remediation output. Real pg/network trapped, DB assertions use fake pool only. Preliminary test setup omitted JWT_SECRET for normal login; fixed synthetic secret with restoration; no runtime assertion weakened.

Frontend targeted authUx/profileUx **21/21 PASS** including dedicated fixed-message flow. Earlier20/20 before adding the new regression. No full frontend run, no dependency change. Full backend ONCE on final source: **1445/1459 PASS**,14 failures, cancelled/skipped0,71 files, exit1. Known DB-blocked14: hotelbedsAccess1, hotelbedsCatalogPlan1, hotelbedsContent3, hotelbedsMultiDestination1, hotelbedsPublicSearch1, hotelbedsStagingTest6, stagingAcceptance1. Unexpected unresolved0; full backend PASS not claimed. Existing offline preload blocks actual pg and HTTPS; dedicated realDB integrations excluded (hotelbedsCatalog, priceHistory, stagingMigrations, sessionSecurity). Local HTTP harnesses may run, no external/provider transport.

One-time release checks: verifier PASS (286 backend syntax files,609 secret scan files, findings empty);6A PASS;021 preflight PASS;022 preflight PASS;diff-check PASS. Preflights validate local safe defaults, not deployed migration/session settings. Evidence .tmp/sprint7q-focused.log, sprint7q-frontend.log, sprint7q-backend.log and sprint7q release-check logs.

## Owner staging acceptance plan

After separately authorized deployment, owner checks normal fresh login and admin access. Compliant password change/fresh login/old-session revocation only if owner chooses a safe existing account and explicitly accepts that change. Do not create or seek a real long-password account solely for this sprint. Legacy>72 account E2E NOT RUN; all new evidence offline/synthetic. No recovery/account reset performed; no normal staging login result invented. If a legacy long user is encountered, use separately approved recovery/identity controls; do not request plaintext credentials or suggest prefix login.

Remote DB connections0; migrations0; Hotelbeds0; PSP0; money operations0; Render changes0; deployment0; git add/commit/push0. No secret values or real row data output. Commercial gates unchanged. Operational recovery and legacy-risk inventory limitations remain OPEN.
