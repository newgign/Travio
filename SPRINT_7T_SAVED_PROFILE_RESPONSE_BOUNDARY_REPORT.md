# Sprint 7T — Saved Profile Validation & Response Boundary Hardening

2026-10-10, Asia/Qyzylorda. CODE/OFFLINE: PASS in tested scope; staging acceptance NOT RUN. Commercial production ready NO. Existing account/auth/storage architecture reused; no schema migration.

## Baseline and inspected scope

develop; HEAD `18202c1 docs: record Sprint 7S production readiness reaudit`. Required git status commands confirmed tracked tree clean,7S committed; unrelated untracked owner files allowed/preserved. No git add/commit/push. Inspected auth/profile/user/traveller controllers/routes, profile account/auth storage/presentation/services and direct consumers/tests, relevant existing column declarations,7S report and security checklist. No unrelated provider/payment audit or real user data inspection.

## Exact current shapes and authority

| Shape | Actual fields / classification |
| --- | --- |
| Public own user (registration/login/profile/update) | id READ ONLY/server identity; full_name,phone,preferred_language,email_notifications,booking_reminders CLIENT EDITABLE through profile; email READ ONLY on profile (registration identity, not editable here); role SERVER CONTROLLED/read-only UI routing/display; created_at READ ONLY. |
| Profile stats | total,confirmed,cancelled,attention from server aggregate SQL, READ ONLY; not editable or persisted to browser user. |
| Internal account | password (existing hash column), session_version,is_active INTERNAL / NEVER SERIALIZE through these projections. Unknown future/password_hash/permissions/provider/operational fields NEVER automatically serialized. No new DB fields introduced. |
| Admin user list | id,full_name,email,phone,role,created_at only, intentional existing admin display. Admin route remains auth→server admin role. No role/account-state mutation endpoint added. |
| Saved traveller | id READ ONLY; user_id SERVER CONTROLLED, never serialized; label,traveler_type,first_name,last_name,birth_date CLIENT EDITABLE; created_at,updated_at READ ONLY. No gender/nationality/passport/document fields exist in this contract or were added. |
| Browser persisted user | id,full_name,email,role only in sessionStorage; detailed optional profile preferences/contact and traveller data not copied there. Token remains sessionStorage. Full validated profile can remain memory for current profile page/restoration. |

## Validation and compatibility contract

Unknown keys are **IGNORED** consistently by explicit allowlists; no object spread into SQL. Client role/id/user_id/is_active/session_version/permissions/created_at/password_hash/nested metadata never alter protected authority. Profile email input ignored; no email-change/verification redesign. Existing registration/login credential rules and password/session revocation architecture unchanged.

| Editable field | Type / normalization / bound / empty semantics |
| --- | --- |
| full_name | Required string; Unicode unrestricted by alphabet; reject C0/C1 controls; max255 Unicode code points before trimming; trim; whitespace-only rejected. |
| phone | Optional string/null/absent; max50 code points before trim; controls rejected; trim, blank→null. International formatting preserved; no E.164 conversion. |
| preferred_language | Existing ru/en/kk only; absent/null→ru, other values rejected. No new vocabulary. |
| email_notifications,booking_reminders | Boolean if supplied; omission→true as before; string/number/null rejected. |
| label | Optional string/null/absent, max80; trim; blank→existing Турист default. Previously silent truncation replaced by fixed validation400. |
| first_name,last_name | Required strings, Unicode, max120 code points matching existing columns; trim, reject controls/empty. |
| traveler_type | Existing AD/CH only, lowercase accepted and uppercased; absent/null→AD. Unknown values rejected instead of silently becoming AD. |
| birth_date | Optional null/absent/empty→null; otherwise exact YYYY-MM-DD, Gregorian month/day/leap validation, year0001–9999. No JS Date rollover/parser ambiguity; no age/future-age policy invented. |

Existing camelCase traveller aliases remain accepted. Conflicting snake/camel values rejected rather than choosing inconsistent data. Request body must be a non-array object; no arbitrary coercion. PUT profile retains existing defaults/full-name requirement, not a new PATCH contract.

Validation fails before any SQL/logger call with fixed PROFILE_INPUT_INVALID, field name and fixed message; input/object/SQL never echoed. Existing storage/500 error handling and7R logger controls retained. No new logging.

## Implementation and response boundaries

New pure backend/utils/profileBoundary.js provides input validation and publicUser/adminUser/publicTraveler serializers. Own profile/login/register public serializer remains an explicit consumer allowlist; admin list reuses a smaller deliberate projection. Traveller list/create/update now serialize rows instead of passing them through. Future row columns cannot leak merely by being present. Existing SQL remains parameterized with fixed columns; create owner req.user.id, updates/deletes id AND user_id, profile reads/updates req.user.id. Twelve-traveller cap preserved, including its existing nontransactional concurrent-create limitation; no concurrency/schema redesign.

Response string values are bounded and controls suppressed; invalid optional phone/date/timestamp become null, names can fall back to empty display text, language/type to existing defaults. Valid pg Date timestamps become ISO; no raw object rendering. This does not repair historical rows or erase PII. Invalid essential frontend identity fails to existing error state, not an invented authenticated session.

Frontend profilePresentation normalizes required identity and optional bounded fields, provides matching form validation and small editable payload allowlists. profileService strips protected extras before profile/traveller submissions and normalizes traveller responses. authStorage minimizes user writes to four required identity/display fields; storage mechanism/token policy unchanged. Existing profile service/store safe fixed error presentation preserved. UI role remains display/routing only; backend role guard remains authoritative. Existing authSuccess retains strict auth-response checks; malformed auth authority fails closed. No new framework/dependency or UI business flow.

## Tests and execution accounting

Focused backend: **55/55 PASS**; synthetic profile/Unicode/controls/bounds/types, every protected key, read-only email, owner SQL, dates/type/aliases, future columns/serializers, traveller cap and guest/admin guards. Every case traps real DB connect/unmocked query, HTTP/HTTPS and logger; actual calls0. Mocked query assertions are not DB IO.

Adjacent backend: **180/180 PASS**, one invocation of securityHardening,sessionRevocationAccountState,piiOperationalControls,piiResidualHardening,sprint2g,sprint2h. Tests preserve old assertions. Offline preload blocks real pg Pool/Client connect/query and HTTPS; adjacent blocked-attempt counter0.

Frontend relevant invocation: **100/100 PASS**, profileBoundary,profileUx,accountUx,browserAuthSecurityPolicy,authUx. New profileBoundary contains18 subcases plus enclosing test; **19/19 PASS** rerun after the equivalent regex lint correction. Preliminary frontend run96/100 exposed encoding corruption in newly written Russian strings; fixed implementation, no assertion weakening. Backend validation diagnostic strings fixed similarly before aggregate. Corrected frontend100/100 then final boundary19/19 are separate evidence, not119 distinct cases.

Lint final **PASS**, zero errors, three existing exhaustive-deps warnings in unchanged admin BookingsTable/NotificationsTable/RefundsTable. Preliminary lint found new no-control-regex error; equivalent Unicode Cc regex fixes it without disabling lint. Production build final **PASS**. Execution accounting: two actual lint invocations and two actual builds (initial build preceded lint correction; final build covers final source), not a claim of one total build. Initial npm.ps1 attempts were blocked by local PowerShell execution policy before npm ran; npm.cmd used without changing policy or installing/updating packages.

Full backend ONCE on frozen backend runtime/test source: **1643/1657 PASS**,75 files,14 known DB-blocked failures, cancelled/skipped0, exit1. Known blocked suites: hotelbedsAccess1,hotelbedsCatalogPlan1,hotelbedsContent3,hotelbedsMultiDestination1,hotelbedsPublicSearch1,hotelbedsStagingTest6,stagingAcceptance1. Unexpected unresolved0; full backend PASS not claimed. Four dedicated realDB integration files excluded (hotelbedsCatalog,priceHistory,stagingMigrations,sessionSecurity); running them would require forbidden real DB/migration work. Full aggregate safety preload used, no rerun to improve totals. Frontend full suite NOT RUN; only relevant suites, lint/build. Release checks recorded below; no real integration/staging/Render action.

## Classification and remaining limitations

Release checks once each: verifier **PASS** (295 backend syntax files,627 secret-scan files,findings empty);6A **PASS**;021 preflight **PASS** OFFLINE_ONLY/DISABLED—SAFE;022 preflight **PASS** OFFLINE_ONLY/executionAllowed=false;diff-check **PASS**, no output. These local defaults are not staging configuration evidence. Only this results sentence finalized afterward; no runtime changes after checks. Git staged-name list empty; changes left unstaged.

Saved profile validation READY; mass assignment resistance READY; profile response allowlist READY; traveller validation READY; profile authorization READY; frontend persisted user minimization READY; unknown fields IGNORED; internal future DB fields auto-leak NO; PII logging regression NO identified in tested scope; schema UNCHANGED. **P2 Q2-01/S-P2-01 RESOLVED code/offline.** Current P0/P1/P2=4/8/5; owner7/external2 unchanged. Overall R1-03 API response minimization/PII remains PARTIAL; retention/access/legal policies not closed. Staging acceptance remains pending for this change; no automatic extension of older owner acceptance to7T.

No historical records inspected/fixed; no global PII recognition, per-session logout, email ownership verification, new enums/passport handling, SQL cap concurrency redesign or broad admin serializer certification. Consumer display bounds intentionally replace malformed oversized values with safe defaults instead of preserving arbitrary objects.

## Exact files

Modified runtime: backend/controllers/authController.js; backend/controllers/travelerProfileController.js; backend/controllers/userController.js; frontend/src/services/authStorage.js; frontend/src/services/profileService.js; frontend/src/utils/profilePresentation.js.

Modified docs: SECURITY_PRODUCTION_GAP_CHECKLIST.md; SPRINT_7S_PRODUCTION_READINESS_REAUDIT_REPORT.md.

New: backend/utils/profileBoundary.js; backend/tests/savedProfileResponseBoundary.test.cjs; frontend/tests/profileBoundary.test.mjs; SPRINT_7T_SAVED_PROFILE_RESPONSE_BOUNDARY_REPORT.md. Local generated check logs under .tmp/sprint7t-*; existing owner files/preload untouched. Build output generated only through existing ignored frontend/dist.

## Owner staging acceptance plan — not executed

After separately authorized deployment, owner verifies normal login, profile load/edit using ordinary safe values, reload and admin access; saved traveller list/create/update only if already used; controlled logs show no raw PII; profile network/UI exposes no internal fields. Do not manipulate role/session_version/is_active/password_hash through staging UI or create attack accounts. Mass-assignment evidence remains synthetic/offline. No request for real PII values.

Runtime changed backend YES/frontend YES. Schema/migration NONE. Render changes/deployments/remote DB connections/real queries/migrations/Hotelbeds/PSP/email/money0. Commercial production ready NO. Everything unstaged; unrelated owner files preserved.
