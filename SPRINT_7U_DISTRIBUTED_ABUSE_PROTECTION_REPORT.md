# Sprint 7U — Distributed Abuse Protection Contract & Local Fleet Proof

## Sprint 7U.1 — current staging acceptance

2026-10-11. Authoritative owner confirms7U deployed to staging backend: LIVE; /health and /api/health/ready PASS, database.ok=true; normal login/admin/search PASS; unexpected429 NOT OBSERVED under ordinary owner use. PROCESS-LOCAL / MEMORY limiter STAGING ACCEPTED; normal-use regression PASS. No live limiter exhaustion, brute force, load test or DoS; no separate failed-login test result supplied. New runtime acceptance supersedes staging-pending text below only for this bounded normal-use scope.

Distributed store/atomic contracts READY; synthetic A/B fleet proof, separate-memory negative control and auth-network/account/public aggregation PASS remain offline7U evidence, not staging fleet acceptance. No real distributed provider configured or implemented. Production multi-instance protection OPEN, silent fallback BLOCKED. **P1 DISTRIBUTED ABUSE PROTECTION: STAGING FOUNDATION ACCEPTED / PRODUCTION DISTRIBUTED PROVIDER OPEN**, not fully resolved. Counts4/8/5, owner7/external2 unchanged; commercial production ready NO. See [7U.1 report](SPRINT_7U1_ABUSE_PROTECTION_STAGING_ACCEPTANCE_REPORT.md). Documentation-only finalization; no runtime/Render/deploy/DB/KV/migration/provider/money action or full test rerun here. Historical7U execution/check results below retained.

2026-10-11, Asia/Qyzylorda. **CODE/OFFLINE PASS — tested foundation scope. P1 DISTRIBUTED ABUSE PROTECTION: FOUNDATION READY / overall PARTIAL. Production multi-instance protection OPEN. Real distributed provider NOT IMPLEMENTED. COMMERCIAL PRODUCTION READY NO.**

## 1. Baseline and scope

develop; HEAD `bcc148f docs: finalize Sprint 7T profile staging acceptance`. Required status/branch/log commands confirmed tracked-only status NO OUTPUT,7T.1 committed. Unrelated untracked owner files allowed/preserved; no git add/commit/push/clean/reset. Inspected limiter/canonical identity/proxy, auth/search/offers/checkout mounts, startup ordering, preproduction schema/checker and direct security/config tests;7N/7N.1/7N.4, current security checklist/7S report. No unrelated booking/payment implementation audit. No env values/real PII inspected.

## 2. Current architecture and the ten primary questions

1. Before7U each createRateLimiter closure owned a Map; now each default instance owns one bounded createMemoryStore closure. Neither is distributed.
2. API, auth network, login account and public-expensive categories consume this storage boundary. Search, offers/recheck and checkout review intentionally share the existing public-expensive bucket rather than receive new independent quotas.
3. Every Node process independently instantiates maps; separate limiter factories also have separate default adapters. Two hosting instances therefore enforce independent quotas, not one aggregate limit.
4. Process restart loses memory counters. Creating a new default adapter demonstrates this negative boundary.
5. Two Render instances using memory would independently permit quota. Neither WEB_CONCURRENCY=1 nor accepted TRUST_PROXY=1 proves total fleet size.
6. For one namespaced key, counter/window lookup, expired-window reset or insertion, increment, allowed/blocked decision, remaining/reset/retry metadata and capacity/expiry updates must be one atomic decision. Concurrent deployments must agree on namespace and policy.
7. One consume(key,{limit,windowMs,now}) returning the decision below suffices as the narrow seam; callers have no Redis/Postgres vocabulary. Future shared implementation must be linearizable at the shared owner, not compose get/increment/setExpiry operations.
8. Current memory behavior remains synchronous and defaults unchanged; no required new staging setting. New runtime version still requires normal owner acceptance.
9. Explicit unavailable topology/store declarations fail closed at mandatory startup/preproduction and default limiter construction. Undeclared actual fleet size cannot be discovered by this validator and remains owner/operations evidence.
10. External work remains provider selection/atomic implementation, private key management, TLS/access/clock/TTL/capacity/failure guarantees and target-specific fleet acceptance. No subscription or external adapter was introduced.

## 3. Store and atomicity contract

New backend/services/limiterStore.js exports createMemoryStore,validateInput,validateDecision. consume accepts a64-lowercase-hex opaque namespaced key, positive safe-integer limit/windowMs, nonnegative safe-integer time and safe reset arithmetic. It returns only:

```
{ allowed: boolean, remaining: integer, retryAfterMs: integer,
  resetAt: integer, capacity: boolean }
```

Remaining is0..limit, blocked receipts have0 remaining; retryAfterMs is1..windowMs. Extra result fields/accessors/custom prototypes rejected; no raw key/error/identity in diagnostics. Structural validation is not proof that a future provider actually enforced atomicity. Store descriptors expose storage/scope/capacity/count only, never keys.

Memory consume validates policy consistency for a live key and performs all operations synchronously without await. Future real store must own authoritative time/expiry and coherent policy/version/namespace across callers; now is a trusted server clock input/hint, never browser time. Caller-clock skew must not let different workers reset the shared window. Provider must define bounded retention/TTL cleanup, capacity behavior, outages/ambiguous outcomes and account-key rotation semantics. No actual external TTL/persistence/durability guarantee claimed.

Middleware hashes category name plus existing private bucket into an opaque store key, avoiding category collisions. A named policy remains consistent across instances; supplied factory stores are an internal test/future-adapter seam, not HTTP/environment authority or an active provider registry. Runtime default descriptors still storage=memory; injected seam reports injected-contract, never distributed=true.

## 4. Process-local memory preservation

Default maxKeys10000 per limiter; expired cleanup on consume and capacity pressure, no recurring timer. Live buckets are not evicted to accept new attacker keys; full capacity returns429 with existing window retry behavior. Existing limit defaults/windows preserved: API600/min; auth network30/15min; account30/15min; public-expensive60/min. Existing env limit overrides and enable/skip behavior retained. Validating adapter parameters does not introduce a new abuse policy.

Counter increments include blocked and successful attempts; no success reset. Exact expiry resets window. Retry seconds remain max(1,ceil(retryAfterMs/1000)); RateLimit-Policy/Limit/Reset, private account Remaining omission and fixed429 response retained. Memory adapter factory accepts bounded maxKeys1..100000; normal defaults unchanged. IPv4/IPv6 canonical identity helper/proxy policy unchanged, no browser role/admin unlimited bypass. Health/readiness mounts and handlers unchanged and still precede applicable limiters.

## 5. Synthetic shared owner and A/B evidence

backend/tests/helpers/syntheticSharedLimiterStore.cjs creates a deterministic local owner using the same memory contract, with serialized asynchronous consume queue and two independent adapter objects. Each test creates logically independent limiter/application factories A/B sharing that owner. A consumes quota visible to B and vice versa;20 concurrent consumptions with limit5 permit exactly5; shared reset/retry metadata consistent; replacing a client adapter does not erase owner quota. Queue rejection does not poison subsequent queue operation.

Auth network, normalized account across IP rotation/casing and existing public search/offers/checkout category aggregation PASS. Spoofed direct forwarding does not change canonical key; mapped IPv6 shares IPv4 bucket. Distinct category namespaces stay independent. Negative control: two separate memory adapters do not aggregate and new memory owner loses counters.

This is **single-process synthetic shared-owner proof of logical instance semantics**, not a real multi-process fleet, network store, crash durability, provider performance or production linearizability test. No local HTTP/load/brute-force/live-exhaustion activity. Fixture cannot be selected by runtime env and no runtime imports tests.

## 6. Account key privacy and fleet prerequisite

Default account key remains random per-process HMAC of bounded trim/lowercase attempted email; no account DB existence lookup. Unknown and existing-looking attempted identities get the same fixed throttling response. Password validation and account enumeration behavior unchanged. Raw email/IP/phone/token/keys not logged or returned. Network digest retains existing identity-hashing semantics; hashing is not asserted irreversible anonymization against low-entropy IP dictionaries.

Important negative evidence: merely sharing counters with independent random account HMAC keys **does not aggregate account quotas**. createLoginAccountLimiter now accepts an optional internal32-byte Buffer accountKeySecret for deterministic shared derivation; synthetic tests supply explicitly synthetic bytes to two factories. Default still generates ephemeral key; no new production secret env name, persistent credential, stable cross-system identifier or real key deployment introduced. Future provider integration must arrange deployment-private shared derivation/namespace and reviewed custody/rotation; never use a public constant or raw-email shared key. Contract readiness does not close that requirement.

## 7. Configuration and fail-closed behavior

New config/abuseProtection.js accepts exact strings only:

| Environment name | Default / only currently allowed value | Other declarations |
| --- | --- | --- |
| ABUSE_PROTECTION_TOPOLOGY | single_instance | BLOCKED, including distributed/multi_instance |
| RATE_LIMIT_STORE | memory | BLOCKED, including distributed/redis/synthetic |

Defaults are compatibility choices, not discovery/attestation of actual hosting scale. No WEB_CONCURRENCY fleet inference. Current accepted7N.4 staging proxy/process-local foundation remains appropriately classified; not horizontally safe. Startup mandatoryConfig validates production-like declarations before DB/client/listener; preProductionCheck adds fixed topology check and schema documents both names; default limiter factory also rejects unavailable settings. No Render env/template change, no synthetic production backend selector, no silent fallback.

Synchronous consume throw, async rejection, malformed result or deadline timeout returns fixed503 ABUSE_PROTECTION_UNAVAILABLE, Retry-After1, downstream not invoked. No retry, alternate store or error/key logging. Async deadline default1000ms, internal factory bound1..3000ms; only async branch creates one cleared request-local timer. Late completion is ignored and cannot release blocked request. An ambiguous timed-out future provider may have consumed quota; middleware never compensates/reset/retries it. Existing rateLimited telemetry marker suppresses attacker-driven log/DB event amplification. Normal downstream errors propagate instead of being misclassified as store fallback. Real provider transport must additionally enforce its own bounded in-flight resource/cancellation policy; synthetic timeout is not remote cancellation proof.

## 8. Tests and execution accounting

Final focused **60/60 PASS**; earlier focused58/58 PASS before adding accessor/downstream regressions and strengthening late-timeout observation. Final source/tests frozen before aggregate. Coverage: atomic shape/input, cleanup/capacity/expiry/policy consistency, concurrent A/B, memory negative control/restart, network/account/public aggregation, enumeration/privacy, default secret isolation, proxy/IPv6, no admin bypass, store exception/rejection/timeout/late result, malformed/accessor receipts, config/startup/preproduction guards and unchanged health mounts. Every case traps pg connect/query, HTTP/HTTPS, net connect, fetch and logger; forbidden actual IO0. Synthetic keys/requests only.

Adjacent **282/282 PASS**, one final invocation of trustedProxyAbuseProtection,securityHardening,preProductionReadiness,mandatoryConfigSecretContract,piiOperationalControls,piiResidualHardening. Preliminary trustedProxyAbuseProtection47/47 development check also passed; not hidden or counted as distinct cases. No existing assertion weakened.

Full backend ONCE after final runtime/test source: **1703/1717 PASS**,76 files,14 known DB-blocked,unexpected unresolved0,cancelled/skipped0,exit1. Known blocked suites: hotelbedsAccess1,hotelbedsCatalogPlan1,hotelbedsContent3,hotelbedsMultiDestination1,hotelbedsPublicSearch1,hotelbedsStagingTest6,stagingAcceptance1. Dedicated real-DB integration files excluded (hotelbedsCatalog,priceHistory,stagingMigrations,sessionSecurity); no prohibited DB/migration execution. Existing unmodified offline pg/HTTPS preload used. Full backend PASS not claimed; no aggregate rerun. Frontend runtime unchanged: frontend tests/lint/build NOT RUN. No dependency upgrade/install/npm audit/provider call.

## 9. Classifications and exact changes

Release checks once each: verifier **PASS**,299 backend syntax files/633 secret-scan files/findings empty;6A **PASS**;021 preflight **PASS**,OFFLINE_ONLY/DISABLED—SAFE;022 preflight **PASS**,OFFLINE_ONLY/executionAllowed=false/enforcementActive=false;diff-check **PASS**,no output. Local preflight defaults do not reclassify active deployed staging enforcement. Only this results sentence finalized afterward. Staged-name list empty; no runtime/test change after aggregate/checks.

Process-local limiter READY / STAGING READY (historical current staging scope). Distributed store/atomic consume contracts READY. Synthetic fleet/negative control/auth-network/auth-account/public aggregation PASS. Health endpoints unchanged YES. Current staging memory mode ALLOWED; declared distributed without provider BLOCKED; silent fallback BLOCKED. Real distributed provider NOT IMPLEMENTED; production multi-instance protection OPEN; privacy regression NO in tested scope; schema migration NONE. P1 FOUNDATION READY / overall PARTIAL, not resolved; counts4/8/5, owner7/external2 unchanged.

Modified runtime: backend/middleware/rateLimit.js; backend/config/mandatoryConfig.js. Modified operator config: backend/scripts/preProductionCheck.cjs; backend/scripts/preProductionEnvSchema.cjs. Modified docs: SECURITY_PRODUCTION_GAP_CHECKLIST.md; SPRINT_7S_PRODUCTION_READINESS_REAUDIT_REPORT.md.

New: backend/config/abuseProtection.js; backend/services/limiterStore.js; backend/tests/helpers/syntheticSharedLimiterStore.cjs; backend/tests/distributedAbuseProtection.test.cjs; SPRINT_7U_DISTRIBUTED_ABUSE_PROTECTION_REPORT.md. Local check logs .tmp/sprint7u-*.log; owner files and existing offline preload preserved. Everything unstaged.

## 10. Remaining external work and owner plan

Select/review real shared atomic store and implementation; approve resource/access/transport model, authoritative clock/TTL/capacity, policy/version and private account derivation; test process/network failures, ambiguous outcomes and actual fleet linearizability/scale; accept real production topology. No particular vendor, paid plan/cost, Redis/Postgres adapter or unverified retention guarantee proposed as fact. Useful foundation required no paid production service.

After eventual separately authorized deployment, owner checks backend LIVE, health/ready, login/admin and normal search; no unexpected429 under ordinary use; one ordinary failed login does not throttle unexpectedly. Do not exhaust live buckets, brute-force or load test. Distributed fleet stays OFFLINE SYNTHETIC until real shared provider/target acceptance.7U deploy/staging acceptance NOT RUN;7N.4 topology evidence retained with its original public-ingress limits.

Backend runtime changed YES; frontend NO. DB/Redis/external KV connections/calls0; migrations0; Render changes/deploy0; Hotelbeds/PSP/email/money0. No actual production service provisioning or activation. Commercial production ready NO.
