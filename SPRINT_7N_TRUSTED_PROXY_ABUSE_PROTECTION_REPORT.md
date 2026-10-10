# Sprint 7N — Trusted Proxy & Abuse Protection Hardening

SPRINT 7N — CODE/OFFLINE: PASS. TRUSTED PROXY HARDENING: PASS in tested boundary. ABUSE PROTECTION: PARTIAL. Existing limiter architecture REUSED + HARDENED. Distributed protection NOT READY; Render proxy topology acceptance OPEN. P1 FOUNDATION READY / PARTIAL / OPEN; not closed.

## 1. Baseline and scope

2026-10-10, Asia/Qyzylorda. develop; tracked tree clean at start; HEAD `13a9c9c docs: finalize Sprint 7M.3 staging session acceptance`, prior `af7d739 docs: record Sprint 7M.3D enforcement decoupling`, `c3522fe fix: decouple runtime TLS from session enforcement`. Required 7M.3 final documentation committed. Unrelated untracked owner files preserved. Inspected bootstrap, auth, limiter, telemetry, public route/controller and release/test boundaries only; no repository-wide source audit. No env files opened or deployed environment read.

Owner's staging evidence remains: backend LIVE, 022 applied, session enforcement enabled, internal TLS require contract, normal build/migration flags OFF, reconciliation runtime disabled, real payments blocked, sales and Hotelbeds Booking/LIVE OFF. None remotely rechecked or modified in 7N. No DB, migration, deployment, Render change, Redis/WAF/dependency or frontend change.

## 2. Existing trust proxy behavior and threat model

Before this sprint server trimmed TRUST_PROXY, default false. Literal true selected numeric one-hop (it did not set Express boolean trust-all). Positive digit strings selected that many hops; false/0/unrecognized values silently left trust disabled. No malformed-value rejection or numeric bound. Checked-in Render blueprints use 1; actual deployed TRUST_PROXY UNKNOWN, not inferred from blueprint or owner health evidence.

Limiter used req.ip with socket fallback; Express req.ip was already influenced by configured trust. With default disabled, XFF ignored; with numeric mode any immediate peer is trusted within hop budget, so shorter/direct paths can allow attacker-chosen XFF. Auth limiter was IP-only for entire auth mount; all API routes shared broad bucket, health mounts bypassed it. Per-process Map had periodic expiry but no cardinality cap. No account-aware protection.

Threats: spoofed forwarding, IP rotation against a login identity, repeated public provider/quote work, arbitrary key memory growth and 429-driven logging/DB amplification. IP is an abuse signal only, never authentication, role, ownership or payment evidence. No changes to auth authority/current-account enforcement.

## 3. Strict proxy configuration

New trustedProxy parser used by server and preproduction check. Accepted exact string modes:

| TRUST_PROXY | Meaning |
| --- | --- |
| absent / false / 0 | Trust disabled (default, including production) |
| 1 through 8 | Express numeric trusted hop count |
| loopback | Express loopback addresses for explicitly selected local topology |
| comma-separated literal IP/CIDR, up to16 entries | Express address/range trust; no whitespace, aliases, /0 or malformed prefixes |

true, wildcard, invalid values and out-of-range counts fail configuration with fixed TRUST_PROXY_INVALID. No silent fallback for malformed input, no generic trust-all. Numeric hops remain an explicit topology contract: trust function accepts immediate peer at index0 and stops after configured hops; no source-address certification. Owner must prove fixed path length and absence of direct bypass. No guessed Render CIDRs or hostname trust classification. Preproduction check reports fixed INVALID_TRUST_PROXY without supplied values. Existing Render settings unchanged.

## 4. Canonical client identity and spoofing

getClientNetworkIdentity returns internal ip/source/trustedProxy/forwardedChainLength. Valid socket peer is authority by default. Forwarding may influence identity only if Express compiled trust function trusts the immediate socket address. Then Express req.ip/req.ips resolve right-to-left to first untrusted hop. X-Real-IP/Forwarded never used. Raw XFF bounded to2048 chars/16 entries for trusted peers; malformed accepted chain falls back to socket peer, a shared conservative bucket. No raw forwarding values returned/logged.

IPv4 validated by Node net.isIP. IPv6 canonicalized using Node URL semantics; mapped IPv6 reduced to equivalent IPv4, alternate IPv6 spellings share a bucket. Scoped/invalid addresses fail conservatively; unknown peer shares unknown bucket. No fragile colon splitting. IPv6 subnet aggregation is not implemented; address rotation remains a limitation.

Direct spoofed XFF cannot choose limiter identity with trust disabled or a peer outside configured ranges. This is proven by synthetic Express request semantics. It is not an unconditional guarantee for numeric-hop deployments with a direct bypass; live topology must be accepted separately. Synthetic trusted-range, multi-hop and numeric boundary tests PASS.

## 5. Auth account-aware protection and privacy

Existing auth network limiter remains30 requests/15min by default across auth mount, independently of success/account. Added POST /api/auth/login account bucket with same AUTH_RATE_LIMIT_MAX/WINDOW_MS defaults, after network limiter and JSON parsing, before controller. Input must be bounded typed body/email<=254/password<=1024UTF8 bytes and nonempty. Bad types/oversize return fixed400 before HMAC construction/DB; existing controller validation remains. Login email normalization matches trim/lowercase behavior. No DB lookup to choose a bucket; attempted unknown and known accounts treated alike. Existing wrong-email/wrong-password equivalence remains verified by adjacent security tests; pre-existing registration409 enumeration behavior unchanged.

Per-limiter random process-local HMAC-SHA256 secret maps normalized attempted email to a key. Map stores digest/count/resetAt, no raw email or password. Key never returned/logged; HMAC is not cryptographic anonymity. All login attempts, including successful responses, count until window expiry; no success reset that could race or bypass network protection. Targeted account bucket denial and account/IP rotation across many identities remain limitations.

429 uses fixed RATE_LIMITED response and Retry-After, no email/IP/key or internal state. Private account bucket omits RateLimit-Remaining; broad network quota headers may remain from prior middleware and describe network allowance, not account existence. Public reset/policy fields and retry interval are quota advice, not DB account status.

## 6. Expensive public routes

Inspected search controller calls searchService; offer detail/recheck invokes offerResolverService/signing; checkout review invokes offer resolution/token validation/checkrate/session preparation. These are unauthenticated provider/CPU/DB cost paths. Added one shared network bucket to GET /api/search, GET /api/offers/:provider/:hotelId, POST /api/offers/recheck and POST /api/checkout/review before validation/controller work. Default60/min vs broad API600/min; PUBLIC_RATE_LIMIT_MAX/WINDOW_MS allow explicit owner tuning. Four endpoint variants share quota so route switching does not create independent allowances. Normal consumer search/detail/review flow fits the default window; real UX acceptance remains owner work.

Catalog read/status routes remain under broad API limiter; they were not promoted to upstream provider execution paths. Existing root DB status route is outside /api and unchanged; no assertion of comprehensive per-endpoint cost protection. Authenticated booking/payment operations keep existing broad/auth/authorization gates; no new composite user bucket added because no proven need within this minimal public/login scope. Body/query/frontend user IDs never choose keys. No admin bypass: admin still traverses global API bucket. No provider calls on rejected requests; route stack and simulated upstream callback tests prove limiter placement/rejection.

## 7. Health, telemetry and memory

/health and /api/health (including /api/health/ready) remain mounted before API/auth/public limiters. Render probes unchanged. All API routes including admin keep broad limiter. Health DB-readiness semantics unchanged.

429 still records existing metrics status/duration, but telemetry returns before per-request access logs and DB-backed system events when limiter sets internal res.locals.rateLimited. This avoids event/log amplification and raw forwarding diagnostics. No new persistent event or logger introduced. Existing non429 telemetry behavior remains unchanged; general path/metadata privacy gaps remain in checklist.

Every store capped at10000 keys (factory maxKeys injectable for tests), at most four default stores. Expired keys removed on next request/at capacity, bounded Map retained during idle. Removed recurring cleanup timers; no unbounded key growth or active-key eviction. At capacity new identities get429; existing buckets retain protection. Capacity exhaustion can deny new identities until expiry, intentionally fail-closed. Cleanup scan bounded by cap, but sustained pressure still consumes CPU; this is not DoS immunity. Process restart resets all state; no cross-instance sharing/durability. RATE_LIMIT_ENABLED compatibility preserved, release check rejects disabling it.

## 8. Tests and checks

Focused **47/47 PASS**, one invocation. Covers config, default trust disabled, direct/untrusted spoof resistance, trusted and multi-hop/numeric semantics, IPv4/IPv6/mapped identities, malformed/oversized chain, network/account buckets, normalized casing/IP rotation, safe429, unknown account equivalence, success policy, bounded credentials, public placement/rejection, admin/no client user key, health order, capacity/expiry and telemetry minimization. Tests trap pg connect/query, HTTP(S), sockets and subprocess; synthetic request/stream only. No DB/provider/PSP operation used.

Adjacent final **249/249 PASS** across securityHardening, sessionRevocationAccountState, sessionSecuritySchema, adminReconciliationReadApi, stagingDeployment, preProductionReadiness, checkoutReadiness, checkRateReadiness and checkRateStagingDiagnostic. Preliminary adjacent248/249 exposed only VM bootstrap fixture missing new trustedProxy import; wired the real offline parser in that fixture, assertions unchanged. Relevant set rerun after fixture correction; no unrelated repeated tests.

Full backend invoked once: **1329/1344 PASS**, failures15, cancelled/skipped0, exit1. Known DB-blocked14: hotelbedsAccess1, hotelbedsCatalogPlan1, hotelbedsContent3, hotelbedsMultiDestination1, hotelbedsPublicSearch1, hotelbedsStagingTest6, stagingAcceptance1. One additional aggregate failure was Sprint2L's exact-source assertion for `code: "RATE_LIMITED"`: runtime response was correct, but new code used single quotes. Restored original double-quote spelling without changing semantics or weakening the assertion. Targeted Sprint2L follow-up **1/1 PASS**. Unexpected failures in aggregate1; unresolved unexpected failures0. No second aggregate run and no reconstructed full PASS total claimed. The sole post-aggregate source edit was this quote-format correction; final whole-tree aggregate result is therefore not independently rerun. Explicit real-DB integrations excluded: hotelbedsCatalog, priceHistory, stagingMigrations and sessionSecurity. pg/HTTPS safety preload used; no live DB test substituted with fake success.

Frontend tests/build NOT RUN (unchanged). Release checks once: verifier PASS (282 backend syntax files,594 secret-scan files,findings empty), 6A PASS, 021/022 preflights PASS disabled/safe, diff-check PASS. Verifier and release gates preceded the behavior-neutral quote correction; not rerun. Evidence `.tmp/sprint7n-focused.log`, `sprint7n-adjacent.log`, `sprint7n-adjacent-final.log`, `sprint7n-backend.log`, `sprint7n-2l-correction.log`, `sprint7n-verifier.log`, `sprint7n-6a.log`, `sprint7n-021.log`, `sprint7n-022.log`; existing offline preload unchanged.

## 9. Exact files

Modified:

- backend/server.js
- backend/middleware/rateLimit.js
- backend/middleware/requestTelemetry.js
- backend/routes/auth.js
- backend/routes/search.js
- backend/routes/offers.js
- backend/routes/checkoutRoutes.js
- backend/scripts/preProductionCheck.cjs
- backend/scripts/preProductionEnvSchema.cjs
- backend/tests/preProductionReadiness.test.cjs
- SECURITY_PRODUCTION_GAP_CHECKLIST.md

New:

- backend/config/trustedProxy.js
- backend/middleware/clientNetworkIdentity.js
- backend/tests/trustedProxyAbuseProtection.test.cjs
- SPRINT_7N_TRUSTED_PROXY_ABUSE_PROTECTION_REPORT.md

All unstaged. No auth controller/session/role/payment/schema/productionGate changes, dependencies or frontend changes. Remote DB connections0; migration executions0; Hotelbeds network0; PSP0; real money0. No deployment, Render change, abuse/load/credential traffic test, git add/commit/push.

## 10. Future owner acceptance only

After separately controlled deploy, owner verifies backend Live, /health, /api/health/ready, normal login and normal search. Privately confirm actual TRUST_PROXY and topology: actual immediate peer, sanitized canonical client behavior, expected hop boundary, edge stripping/appending rules and no shorter direct route. Do not share raw forwarded chains or credentials. If numeric topology cannot be proven, select explicitly approved ranges or disabled trust under a separately reviewed deployment choice; do not guess CIDRs.

Use only a bounded owner-approved synthetic invalid login sequence within configured staging thresholds to observe429 and Retry-After. Do not brute-force real accounts, test production or generate load/DoS. Confirm normal login after the window, no admin bypass and normal search/review UX. Do not lower release limits or trigger such tests automatically here. Distributed multi-instance protection and edge acceptance FUTURE/OPEN; no claim of production-wide abuse prevention.

COMMERCIAL PRODUCTION READY: NO. PRODUCTION SALES READY: NOT CLAIMED.
