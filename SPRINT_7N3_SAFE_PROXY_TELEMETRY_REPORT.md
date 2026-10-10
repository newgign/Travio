# Sprint 7N.3 — Safe Proxy Telemetry for Render Topology Acceptance

2026-10-10, Asia/Qyzylorda. CODE/OFFLINE: PASS. Safe proxy telemetry READY in tested repository scope. Existing telemetry architecture REUSED. Render topology acceptance OPEN; TRUST_PROXY recommendation NONE YET. No deploy or live observation performed.

## Sprint 7N.4 acceptance update

Current Render staging topology **STAGING ACCEPTED**, TRUST_PROXY=1, HTTP_ACCESS_LOG=true, backend LIVE; health PASS per owner. Normal GET /api/health/live and exactly one bounded synthetic forwarding request each yielded statusCode200, networkIdentitySource=forwarded, trustedProxy=true, forwardedChainLength=1, socketPeerMatchesCanonical=false. Normal observation PASS; single spoof observation PASS within this bounded acceptance. No raw addresses/headers or synthetic value recorded here.

Public direct-to-Node bypass BLOCKED BY CURRENT RENDER PLATFORM CONTRACT. This acceptance combines owner observations, owner-supplied Render platform guidance/contract and prior offline regressions; equal classification projections alone do not prove canonical IP equality or rejection of a specific supplied address. See SPRINT_7N4_TRUSTED_PROXY_STAGING_ACCEPTANCE_REPORT.md. Earlier OPEN and NOT PROVEN statements below describe the 7N.3 evidence state, superseded only for the current staging contract.

Re-acceptance required after proxy/CDN, topology/hop, ingress-path or hosting-provider changes, or direct private-network callers. Distributed multi-instance protection remains OPEN / FUTURE / NOT READY; overall abuse P1 PARTIAL. HTTP_ACCESS_LOG unchanged by this documentation task; any later disable decision is operational, not required for acceptance. No runtime change, deploy or additional spoof request.

## Baseline and evidence boundary

develop; tracked tree clean at start; HEAD `22c9f75 docs: add Sprint 7N.2 Render proxy observation plan`. Unrelated untracked owner files preserved. Owner supplied live TRUST_PROXY=1, live revision22c9f75, ancestry check against94de420 exit0, /health200 and backend LIVE. These are owner evidence, not independent agent checks. They do not certify topology. Scope inspected narrowly: telemetry, canonical identity helper, proxy config, startup mounts, direct tests, prior reports and directly referenced health handlers.

7N.2 lacked privacy-safe network interpretation observations. This patch adds four scalar fields to the existing optional structured `HTTP request` access log. No diagnostic endpoint, dependency, proxy configuration, limiter key, canonical identity calculation, auth/session authority, health response or commercial gate changed. No new metadata goes into responses, metrics labels or DB-backed system events.

## Fields and privacy

| Field | Exact meaning |
| --- | --- |
| networkIdentitySource | `forwarded` if the existing helper accepts valid nonempty forwarded state with trusted immediate peer; `direct` for valid canonical socket fallback; `unknown` if observation cannot determine valid peer/client |
| trustedProxy | True only when that valid nonempty forwarding interpretation was used; configuration alone, or trusted peer without forwarding, is false |
| forwardedChainLength | Existing helper's accepted Express chain length, integer0..16; direct/unknown0; never an array, raw chain length or claim about physical proxies |
| socketPeerMatchesCanonical | Internal canonical address equality projected as boolean only; unknown is false and must be interpreted with source |

Uses unchanged getClientNetworkIdentity and canonicalIp. The projection adds no raw-header parsing. The existing helper's own bounds/validation remain unchanged. Both addresses are transient comparison inputs only. No raw req.ip/req.ips/socket peer, forwarding/header content, hostname, email, token, cookie, IP hash or persistent network identifier is added. Existing requestId/method/route/status/duration/userId fields retain their existing policy; this is not a claim that arbitrary pre-existing routes or all metadata constitute a universal PII sanitizer.

Classification exceptions yield fixed unknown/false/0/false. Access-log writer exceptions are suppressed locally so this observation does not fail the request. No raw error is emitted. Existing rate-limited response behavior still records metrics without per-attempt access logs or DB events. HTTP_ACCESS_LOG remains opt-in; no env changes performed.

## Owner observation

Use existing **GET /api/health/live**, mounted after telemetry and before API limiting. Its successful handler requires no auth, DB query, mutation, provider or private data. /health stays before telemetry; readiness is not the observation endpoint. Existing generic slow/error event handling is unchanged: no new DB work is introduced; a slow request can still enter the pre-existing event path.

After a separately authorized normal deployment, owner confirms backend LIVE, /health200, normal readiness, then performs the one normal request in the updated 7N.2 plan and privately correlates its UUID requestId with the HTTP access log. Access logging must already be enabled; otherwise observation is unavailable. Report only safe correlation and these four fields. No private log export required.

With TRUST_PROXY=1, forwarded/true/1/false is consistent with an accepted nearest forwarded address different from the socket. It does not establish exactly one physical proxy or authentic client provenance. Direct/false/0/true can mean disabled/unapplied trust or conservative malformed-chain fallback; it is not automatic failure or proof of ingress safety.

Only after meaningful Phase A, owner may send exactly one optional unauthenticated synthetic X-Forwarded-For request from the updated plan: no cookies, credentials, repeated requests, redirects, load or quota exhaustion. Ingress appending a valid nearest address may leave the same classifications. Equal four-field projections cannot prove canonical identity remained unchanged or that the fake value was ignored; there is deliberately no address equality across requests or fingerprint. Review anomalies and ingress-path evidence before any trust recommendation. Direct/shorter bypass impossibility NOT PROVEN. No normal/spoof request executed here; no Render settings changed.

## Verification

Final focused/adjacent invocation: 116/116 PASS: new safeProxyTelemetry26/26 plus existing adjacent90/90 across trustedProxyAbuseProtection, securityHardening and stagingDeployment. Synthetic requests only in the new suite, with real pg/connect/query, HTTP(S), socket connect and child-process traps. Covers IPv4/IPv6/mapped addresses, all forbidden headers, bounded counts, direct/trusted/untrusted/malformed states, unknown fallback, logger failure, unchanged identity/user/correlation, opt-in logging,429 policy and existing liveness handler. Preliminary focused run failed in setup because t.mock.env is unavailable; replaced with explicit env restoration. No assertion weakened.

Full backend once on final source: **1356/1370 PASS**, fail14, cancelled/skipped0,69 files, exit1. Known DB-blocked14: hotelbedsAccess1, hotelbedsCatalogPlan1, hotelbedsContent3, hotelbedsMultiDestination1, hotelbedsPublicSearch1, hotelbedsStagingTest6, stagingAcceptance1. Unexpected unresolved0; no historical exact-string failure. Full backend PASS not claimed. Four dedicated real-DB integration files excluded (hotelbedsCatalog, priceHistory, stagingMigrations, sessionSecurity). Existing offline preload blocks real pg connect/query and HTTPS; localhost harnesses in adjacent suites are permitted. No full rerun.

Release checks once: verifier PASS (283 backend syntax files,599 secret scan files, findings empty);6A PASS;021 preflight PASS;022 preflight PASS (local execution/enforcement disabled);diff-check PASS. Local preflight defaults do not reclassify the owner's deployed session enforcement state. No frontend checks because frontend unchanged. No real DB connection, migration, backup, restore, external/provider/Hotelbeds/PSP network, money operation, Render change, deploy, git add/commit/push. Blocked DB attempts in existing aggregate suites are not connections or queries against a real DB. Runtime payment/booking/session/reconciliation settings unchanged.

## Exact files

Modified: backend/middleware/requestTelemetry.js; SPRINT_7N2_RENDER_PROXY_LIVE_OBSERVATION_PLAN.md.

New: backend/tests/safeProxyTelemetry.test.cjs; SPRINT_7N3_SAFE_PROXY_TELEMETRY_REPORT.md.

Local evidence: .tmp/sprint7n3-focused.log, .tmp/sprint7n3-backend.log and release-check logs. Reused .tmp/sprint7k2-offline.cjs safety preload. Everything remains unstaged; unrelated owner files untouched.
