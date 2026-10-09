# Sprint 7K — Security Hardening & Trust Boundary Audit

SPRINT7K — CODE/OFFLINE: PASS. SECURITY HARDENING: PASS. TRUST BOUNDARY AUDIT: PASS (inspected repository scope). Existing security architecture: REUSED + HARDENED.

SECURITY HARDENING != penetration test. SECURITY HARDENING != security certification. PCI compliance NOT claimed. Commercial production readiness NOT claimed.

## 1. Baseline

2026-10-09, Asia/Qyzylorda; develop; HEAD `5339375 docs: record Sprint 7J operational alerting verification`. Tracked tree clean;7J committed. Unrelated untracked owner files preserved. Scope restricted to requested auth/authorization/token/error/logging/input/API/frontend/config boundaries. No dependencies, DB, Render, external monitoring, deployment, git add/commit/push.

Consumer/lifecycle RC scope preserved. Real payment/booking/sales gates OFF; Hotelbeds LIVE OFF;021 unexecuted; reconciliation storage/Admin datasource DISABLED. Migration/source activation code untouched.

## 2. Threat/trust boundaries

Browser state, role/user ids, price/currency, Authorization/query/header contents and provider payloads are untrusted. JWT verification establishes a signed identity snapshot, not current account status. Resource ownership/permissions remain server decisions. Signed offer and server checkout session, not client money/rateKey, govern intent. External PSP evidence needs a future authenticated account-bound durable ingestion boundary; current mock webhook cannot substitute for it.

Scoped security invariants and actionable remaining requirements are recorded in SECURITY_PRODUCTION_GAP_CHECKLIST.md. No exhaustive endpoint/infra penetration assessment or assertion that all repository paths are safe.

## 3. Authentication

authController login queries normalized email with `$1`, bcrypt.compare verifies password, and login signs server-row id/email/role. Registration uses bcrypt.hash cost12 and INSERT without browser role. Unknown email/wrong password responses match; registration409 still reveals existing email (existing product behavior, not redesigned). Profile/change-password use req.user.id.

Hardened login/register rejects arrays/null/non-string credentials and bounds email/input sizes before SQL/hash. Registration name<=255,phone<=50; new password byte limit72 prevents bcrypt truncation on new writes; existing minimum8 retained. Login/current-password allow up to1024 bytes for bounded compatibility with legacy accounts. Password change validates types/new-password byte bound before DB access. Unknown extra role/id fields remain ignored according to existing contract. Legacy potentially truncated hashes are not retroactively fixed; no accounts inspected.

No account disable/status check found in inspected auth path. Runtime protected endpoints validate tokens, not frontend status. /auth/profile checks actual account presence for restoration, but server JWT revocation/deletion/demotion enforcement remains open.

## 4. Authorization

Inspected route mounts: users/dashboard/admin operations require auth + admin role; Admin operations additionally requires permissions. Favorites/travelers/notifications use auth and user scope. Booking/payment/provider/refund/voucher routes use auth plus owner/admin checks in controller/service paths. Booking administrative list/update/delete require admin. Sampled IDOR regression proves userA cannot read userB booking; profile ignores browser identity. Traveler UPDATE/DELETE include id AND user_id; favorites include user_id. No proven cross-user bypass found in these inspected paths, not a whole-app authorization certification.

Checkout review is intentionally public quote/session preparation, not an account read or commercial execution endpoint. High-value booking/payment intent endpoints are authenticated. Existing read-only provider diagnostic/control endpoints keep server role/permission gates; their external operations were not invoked.

## 5. Admin security

Admin reconciliation router applies auth→requireRole(admin)→admin.operations.read. Guest401,normal-user403,admin read200 tested against a local harness. Default source unavailable. Non-GET405, bounded filters/case-id validation and fixed response codes; no reconciliation HTTP mutation route. Browser role is not trusted by backend. Existing operational Admin mutations are separately permission-protected and not activated by this work.

## 6. JWT/session

Prior verifier accepted any library-default symmetric JWT/payload without requiring session shape or exp. Now pins HS256 and requires positive safe-integer id, known user/admin role, finite exp, and absence of other-purpose type. Library verifies signature/expiry/nbf. Offer-purpose token cannot authenticate even if keys are shared and token includes fake session fields. Production login already emits expiry (default7d), so existing server-issued sessions remain compatible; synthetic fixtures lacking exp were corrected. Non-HS256/unexpiring handcrafted tokens intentionally stop working.

Tokens accepted only from Authorization Bearer, not body/query/cookie. No insecure hardcoded secret fallback; missing JWT_SECRET fails closed with configuration500. JWT secret strength is validated by offline release checks, not comprehensively at every runtime startup. No issuer/audience added without a concrete consumer threat model. Logout is local invalidation only; password change/role change do not revoke existing JWTs. These remain P1 requirements, not hidden by focused PASS.

## 7. Offer token

Existing offer tokens carry type=travio_provider_offer and compact allowlisted offer data, default20min expiry, OFFER_TOKEN_SECRET with legacy JWT_SECRET fallback. Hardened verify pins HS256, requires string/purpose/finite expiry and retains fixed invalid/expired errors. Tamper/expiry/algorithm tests pass. JWT payload is signed, not encrypted; client can inspect selected offer data. It is not an authentication session.

Checkout verifies provider/hotel/environment consistency and signed price/currency/rateKey. CheckoutSessionService validates UUID capability, authoritative stored offer, expiry/used status/environment; booking/payment intent validators compare trusted identity/money/selection and strictly bound traveller fields. Reuses6E–6I behavior and focused regressions without Hotelbeds calls. Offer tokens can be reused within TTL; they are not single-use payment authorizations. Future transactional replay/idempotency and user binding need separate commercial acceptance.

## 8. CORS

allowedOrigins uses explicit HTTP(S) origins only, rejects wildcard/credentials/path/malformed values. Production defaults no allowed browser origins; development localhost5173 retained. server uses this config with credentials=true and rejects unexpected Origin. Frontend cannot supply CORS authority. CORS is a browser boundary, not authentication; requests without Origin still require endpoint auth where applicable. Approved/unexpected origins and malformed config tested in a local Express harness. Real deployed origins not inspected.

## 9. Headers

Existing API headers: nosniff,DENY,no-referrer,Permissions-Policy camera/microphone/geolocation off,CORP same-site,API CSP default-src none/frame-ancestors none/base-uri none/form-action none. HSTS production on secure/HTTPS proxy context. No strict app CSP imposed on Vite. Header status PARTIAL overall: backend API ready in tested context; static frontend CSP/HSTS/edge behavior needs deployment rollout/acceptance. Proxy topology must validate trusted forwarding/IP behavior. Headers unchanged.

## 10. Rate limiting/abuse

Existing per-process in-memory limiter: API600/min,auth30/15min defaults; limiter emits429/Retry-After. All /api auth/admin/intent routes pass API limiter,auth routes also auth bucket. /health and /api/health bypass limiting. Limiters configurable; release gate forbids disabled limiter. Restart/multi-instance behavior, trusted proxyIP, credential/account-aware controls and public quote abuse protection are not production-grade distributed coverage. Rate limiting PARTIAL; no Redis/WAF redesign. No live webhook exists to claim rate protection.

## 11. Input/body limits

Global Express JSON limit defaults1mb; preproduction contract allows positive explicit sizes<=1mb. Local harness tests equivalent parser behavior using smaller1kb limit: oversized413 and malformed400 never echo input. No upload/raw-body webhook activation. Unknown future webhook must use bounded exact raw bytes before signature verification; global parsed JSON is unsuitable signature evidence.

Auth bounds hardened; Admin reconciliation strict filter keys/enums/string booleans,page1..100000,limit1..100; caseId64hex and no detail query. Repository sort allowlist/limit/offset numeric bounds. Booking intent rejects unknown fields, validates true boolean review, authenticated server checkout authority and traveller types/names/dates/occupancy; payment intent rejects unknown fields and non-boolean review. Legacy saved profile validation is weaker and remains checklistP2. No global uniform query/path size limit introduced; deployment HTTP limits need evidence.

## 12. SQL/repository safety

Inspected auth/profile/ownership lookups use bound values. PostgreSQL reconciliation adapter has explicit injected executor, strict filter/sort mappings and numbered parameters; values/IDs/JSON are parameterized. No user-provided SQL identifier or order expression. Mock regression validates WHERE priority=$1 and bound pagination; malicious filter/sort rejected before executor. Hardcoded priority labels in ORDER BY are intentional SQL literals, not user interpolation. Adapter inactive; no real SQL validation/DB query. SQL parameterization PASS in inspected scope, not a claim about every query in repository.

## 13. Error/log/PII safety

Production errorHandler suppresses5xx messages/stacks/codes and logs reduced Error metadata. Controller ApiResponse helpers suppress internal messages; publicCode previously suppressed arbitrary code only for500. Now suppresses arbitrary>=500 codes while explicitly preserving existing public HOTELBEDS_UNAVAILABLE503 contract. Existing validation4xx messages/status unchanged. Checkout/provider diagnostics use fixed allowlists. No raw stack/SQL disclosed by tested production paths after fixes; development stacks remain intentional local behavior.

requestTelemetry previously echoed/stored arbitrary caller x-request-id<=80 including PII-like values. Now only UUID/32hex preserved; other text replaced with server UUID before header/log/event. Query excluded from route telemetry. Arbitrary path and generic metadata minimization remain openP2. Logger masks sensitive keys/configured secret values/auth/URLs/JWT/private keys and reduces Error detail; not a full PII sanitizer. Scoped auth/traveller/payment errors do not log credential/request bodies. Provider operational logs include booking reference/status, so zero PII everywhere is NOT claimed.

Secret leakage found: no actual secret exposure identified in inspected final production paths; potential arbitrary5xx-code echo fixed. Critical PII leakage found: no demonstrated critical cross-user/public disclosure in inspected scope; unsafe request-id echo/event persistence fixed. These statements do not certify all logs, stored metadata or deployed responses.

## 14. Frontend token/XSS/CSRF posture

Frontend unchanged. session.js stores token/user in localStorage, validates restoration against /auth/profile before authenticated UI, ignores stale session responses and clears storage on logout/401/404. ProtectedRoute admin check is UI only; server authorization separately enforced. authFetch rejects absolute/escaping API paths and sets redirect:error before bearer fetch; auth errors have generic presentation. Tokens are attached via Authorization, not intentionally placed in URLs. authReturnPath uses exact internal path allowlist; arbitrary external return URL not accepted.

Repository search across frontend/src for dangerouslySetInnerHTML,innerHTML assignment,insertAdjacentHTML,document.write: NOT FOUND. No manual review of every component or browser pentest. React escaping reduces injection risk; localStorage remains XSS-readable. Cookie auth not used in inspected flow; classic ambient-cookie auth CSRF does not apply to bearer-only endpoints. This does not protect against XSS/token theft or all unauthenticated cross-origin abuse. No blind cookie/CSRF middleware migration. CORS credentials=true alone does not create auth cookies.

## 15. Secret configuration

| Contract | Classification |
| --- | --- |
| JWT_SECRET | Required private strong owner-provided value; no hardcoded default; release validator checks strength. |
| OFFER_TOKEN_SECRET | Optional effective fallback to JWT_SECRET; separate strong owner value recommended/provisioned independently for production. |
| DATABASE_URL | Required for deployed backend DB; private owner action; verified TLS/recovery/identity contracts. Not printed/read for live connection here. |
| Hotelbeds API key/secret/mTLS | Optional while provider disabled; required owner configuration only for separately approved reads/operations; no credential use now. |
| PSP credentials/webhook signing secret | Disabled/future selected-provider owner action; mock contract is not a live credential/verification solution. |

Validators detect weak secrets,TLS bypass,unsafe sales/payment/migration config and frontend secret boundary. Actual secret rotation/storage/access/deployed env remains owner/infra evidence. No values printed; no env files opened or mutated.

## 16. Dependency findings

Dependency audit NOT RUN. No registry/network npm audit or advisory lookup; runtime dependency risk UNKNOWN,dev-only advisory risk UNKNOWN. Local package manifest shows existing Express/cors/jsonwebtoken/bcryptjs/pg stack; no versions changed or dependencies added. No npm audit fix. Verifier syntax/secret scan is not dependency vulnerability assessment. A current online SCA review is still release evidence; no vulnerability count/exploitability claim invented.

## 17. Hardening changes

Five runtime files changed: authMiddleware session algorithm/claims/expiry; offerTokenService algorithm/purpose/expiry; authController credential types/bounds/new-password byte cap; requestTelemetry safe caller correlation format; apiResponse narrow production5xx-code handling. Existing architecture retained. Six existing test files only add expiry to synthetic JWT fixtures to match real login contract. No auth redesign/OAuth/cookies/WAF/Redis/schema/frontend change.

Compatibility: handcrafted nonexpiring/wrong-purpose/non-HS256 tokens rejected; invalid typed/unbounded auth input now400; arbitrary custom correlation headers replaced. Legacy >72-byte bcrypt login remains bounded-compatible, not retroactively corrected. Safe unavailable search contract preserved.

## 18. Tests

Final focused invocation: **185/185 PASS**, comprising **43/43 new security tests** and **142/142 adjacent regressions** across adminReconciliationReadApi,paymentIntentFoundation,bookingIntentFoundation,preProductionReadiness,checkRateReadiness. Covers JWT/role/body/query boundaries,CORS/headers/rate/JSON limits,filters/methods/IDOR/SQL,offer tamper,errors/logger/correlation and disabled commercial/migration state. DB/provider/refund hooks trapped; authorized SQL assertions use fake executors only; local HTTP harness allowed.

Development first new-file run42/43: assertion incorrectly rejected a hardcoded ORDER BY priority label; corrected to inspect parameterized WHERE clause. First adjacent run184/185 exposed existing HOTELBEDS_UNAVAILABLE contract; preserved it explicitly rather than weakening adjacent assertion. Final source frozen before aggregate.

Full backend once after final source: **1059/1073 PASS**, failures14,cancelled/skipped0,exit1,57 files. Three dedicated realDB integration files excluded: hotelbedsCatalog.integration,priceHistory.integration,stagingMigrations.integration. Known DB-blocked14: hotelbedsAccess1,hotelbedsCatalogPlan1,hotelbedsContent3,hotelbedsMultiDestination1,hotelbedsPublicSearch1,hotelbedsStagingTest6,stagingAcceptance1. Unexpected failures0. Aggregate safety preload blocks actual pg Pool/Client connect/query and HTTPS. No rerun to improve totals; full PASS not claimed.

Final-source checks once: verifier PASS (255 backend syntax files,547 secret scan files,findings empty);6A PASS;migration preflight PASS (DISABLED — SAFE);diff-check PASS. 6B NOT RUN while dirty. Frontend focused/full/lint/build NOT RUN because no frontend change.

Real PostgreSQL connections0,queries0,DB mutations0,migration executions0,PSP0,Hotelbeds Availability0/CheckRate0/Booking0/Cancellation0,refund/cancellation0. No real money operation,DB/schema change or external alert delivery.

## 19. P0/P1/P2 gaps

Remaining checklist requirements **P0:1,P1:6,P2:3**, excluding resolved hardening items. P0 live payment evidence boundary; P1 session revocation,distributed abuse/proxy,localStorage/frontend policy,mandatory config/secret evidence,legacy bcrypt password handling,PII operational controls; P2 saved-profile validation,route/metadata minimization,separate token-key rotation. Unknown infrastructure evidence is not presented as a proven vulnerability. Dependency advisories unassessed separately.

## 20. Exact files

Modified runtime:

- backend/controllers/authController.js
- backend/middleware/authMiddleware.js
- backend/middleware/requestTelemetry.js
- backend/services/offerTokenService.js
- backend/utils/apiResponse.js

Modified synthetic expiry fixtures:

- backend/tests/adminReconciliationReadApi.test.cjs
- backend/tests/hotelbedsAccess.test.js
- backend/tests/hotelbedsCatalogPlan.test.js
- backend/tests/hotelbedsContent.test.js
- backend/tests/hotelbedsMultiDestination.test.js
- backend/tests/paymentIntentFoundation.test.cjs

New:

- backend/tests/securityHardening.test.cjs
- SECURITY_PRODUCTION_GAP_CHECKLIST.md
- SPRINT_7K_SECURITY_HARDENING_TRUST_BOUNDARY_REPORT.md

Local evidence: .tmp/sprint7k-focused.log,.tmp/sprint7k-backend.log,.tmp/sprint7k-verifier.log,.tmp/sprint7k-6a.log,.tmp/sprint7k-preflight.log and .tmp/sprint7k-offline.cjs safety preload. All unstaged; unrelated owner files untouched.

## 21. Remaining production security requirements

Close identified requirements with target-specific evidence, current dependency advisories, independent security testing and owner/ops acceptance. Validate real deploy TLS/proxy/origins/headers and session/permission lifecycle under controlled conditions. None performed now. No secret strength or infrastructure security certification follows from offline source PASS.

Admin server-side authorization PASS;normal user denied reconciliation YES;JWT/session validation PASS within current stateless contract;CORS PASS;security headers PARTIAL;rate limiting PARTIAL;body/input limits PASS in tested boundaries;SQL parameterization PASS in inspected scope. Migration021 executed NO;storage DISABLED;Admin datasource active NO;real DB IO0;real money0;DB/schema changed NO. SECURITY CERTIFIED NO;PENETRATION TESTED NO;PCI COMPLIANT NOT CLAIMED;COMMERCIAL PRODUCTION READY NO;PRODUCTION SALES READY NOT CLAIMED.
