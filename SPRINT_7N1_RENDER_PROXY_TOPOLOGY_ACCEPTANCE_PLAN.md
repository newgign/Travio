# Sprint 7N.1 — Render Proxy Topology & Staging Configuration Acceptance

2026-10-10, Asia/Qyzylorda. TOPOLOGY PRE-ACCEPTANCE: PASS (diagnostic/plan scope). LIVE TOPOLOGY ACCEPTANCE: OPEN. No trusted numeric hop value or Render proxy CIDR recommended. A safe bounded owner procedure is prepared; identity/topology acceptance depends on evidence not presently available.

## Baseline and evidence boundary

develop, tracked tree clean at start. HEAD `eb54567 docs: record Sprint 7N proxy and abuse hardening`; preceding `94de420 feat: harden trusted proxy and abuse protection`, `13a9c9c docs: finalize Sprint 7M.3 staging session acceptance`. Sprint 7N committed. Unrelated untracked owner files preserved. Inspected only requested config/helper/limiter/bootstrap/preproduction/tests/blueprint/report. No live environment read, external documentation lookup, DB connection, migration, deployment or Render change. This report is the only new file; runtime source unchanged.

CHECKED-IN TRUST_PROXY: `1` in render.yaml. LIVE RENDER TRUST_PROXY: UNKNOWN. The blueprint does not prove applied Environment settings, deployed revision, routing path or number of trusted proxies. Owner-supplied prior health/session/TLS evidence does not provide proxy topology evidence. TLS database approval has no authority over HTTP forwarding trust.

## Exact implemented TRUST_PROXY contract

Parser uses `env.TRUST_PROXY ?? 'false'`; no trimming or case folding. Accepted values are strings only. No function-valued env mode, arbitrary named subnet mode, boolean true, implicit Render mode or hostname trust mode exists.

| Accepted input | Express semantics | Production parser accepts | Staging parser accepts | Forwarded headers affect client identity | Evidence needed before deployment acceptance |
| --- | --- | --- | --- | --- | --- |
| absent, `false`, `0` | Express trust proxy false | YES | YES | NO | No proxy trust evidence needed; assess shared-peer quota impact behind reverse proxy |
| `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8` | Trust addresses at hop indices less than the selected number, starting with socket peer index0 | YES | YES | YES, within numeric boundary | Fixed approved proxy path, no shorter/direct bypass, edge header behavior and req.ip/req.ips observations |
| `loopback` | Express named loopback range trust | YES | YES | Only through trusted loopback peer | Prove intended local topology and header provenance; not a Render recommendation |
| Literal IPv4 or IPv6 address | Trust that address through Express range compilation | YES | YES | Only through approved immediate peer; chain resolved right-to-left | Independently documented approved proxy addresses and path/header controls |
| Literal IP/CIDR list, comma separated | Express IP/subnet trust, first untrusted hop terminates chain | YES | YES | Only within configured trusted boundary | Approved range provenance, no overbroad coverage, chain/header acceptance |

Parser acceptance is syntactic, not production/topology certification. Literal/list entries must have Node net.isIP-valid address. No whitespace around entries. Optional prefix is 1–32 for IPv4 or 1–128 for IPv6, written as 1–3 decimal digits; a slash may occur once per entry. At most16 entries and total input length<=1024. A single address is treated as a one-entry list. Example syntax only: `192.0.2.0/24,2001:db8::/32` (documentation addresses, NEVER Render proxy ranges).

Empty string, whitespace, `true`, `TRUE`, wildcard, numeric values outside1–8 (except disabled0), decimal hop forms, aliases other than loopback, malformed IP/prefix, `/0`, >16 entries and oversized list reject with TRUST_PROXY_INVALID. Validation applies identically regardless of NODE_ENV/APP_ENV. Default production trust-all is impossible through the absent setting.

### Trust-all qualification

Literal `TRUST_PROXY=true`, wildcard and explicit IPv4/IPv6 `/0` are BLOCKED by parser and production preproduction validation. No Express boolean trust-all mode is exposed. However, the parser validates each CIDR separately and does not calculate the union of a list. Individually valid ranges can collectively cover an entire address family. Therefore arbitrary CIDR lists are NOT certified trust-all-free: owner review must reject equivalent universal/overbroad lists. Do not claim all mathematically equivalent trust-all configurations are automatically blocked. This configuration-review limitation is recorded without changing runtime in this diagnostic sprint; no CIDR configuration is recommended or accepted here.

## Unset versus empty behavior

Unset: parser returns false and bootstrap sets Express trust proxy false. Express req.ip is the direct socket peer; X-Forwarded-For does not select client IP. Canonical abuse helper independently checks compiled trust function, sees an untrusted immediate peer, and returns socket identity with source=socket, trustedProxy=false and forwardedChainLength=0. Mapped IPv6 canonicalizes to IPv4. X-Real-IP and Forwarded never select identity. Invalid socket address yields shared unknown identity.

Empty string: rejected with TRUST_PROXY_INVALID during bootstrap configuration; no healthy request path or default req.ip semantics should be claimed for that failed startup. It is not equivalent to unset.

Disabled trust is the conservative code fallback against forwarded-address spoofing. It does not recover real client IP behind a proxy: many users may share a proxy peer bucket, causing availability/UX restrictions. It is not an evidence-based recommendation to change current Render settings blindly.

## Required topology proof

Before recommending any numeric value, obtain both structural infrastructure evidence and bounded application observations:

1. Owner privately records actual live TRUST_PROXY, deployed revision, request entrypoints (default service URL/custom domain/any other ingress) and relevant limit/window settings. Record only safe configuration/statuses; no tokens, secrets or DB connection details.
2. Obtain authoritative infrastructure/service routing evidence for exact trusted hop count on every reachable path, including alternate/shorter paths and direct app port reachability. Repository code and a few successful requests cannot prove absence of a bypass.
3. Establish the edge rule for incoming spoofed XFF: overwrite or trusted append order, and which nodes can add trustworthy hops. Verify that no untrusted client-controlled address falls inside the selected trusted budget. Do not infer trust from a private-looking IP or hostname.
4. Observe Express req.ip/req.ips and canonical helper result privately on the selected configured path; confirm stable expected client identity and correct first-untrusted-hop behavior under a bounded spoofed-header pair. Capture only equality/classification and counts in the acceptance record, not raw IP chains.

Risk: with numeric trust N, a client reaching the app through fewer proxies than expected may cause an untrusted forwarded address to become req.ip. Numeric trust accepts the immediate peer by position, not by source-address proof. Synthetic offline boundary tests establish Express behavior; they do not establish Render topology. Stable documented Render CIDRs are NOT present in inspected project evidence, so CIDR mode cannot yet be recommended either.

## NEXT OWNER OBSERVATION and diagnostic decision

ONE NEXT OWNER OBSERVATION: privately read the staging backend's current TRUST_PROXY and deployed revision, without changing anything, then obtain authoritative routing/header/no-direct-bypass evidence for that actual service path. Do not select1 merely because it is in render.yaml.

Existing inspected responses do not expose canonical client identity/source/trust/chain length. The 7N telemetry contract records HTTP metrics and suppresses per-attempt limiter429 logs/events; it does not supply topology proof. RateLimit/Retry-After/request-ID headers cannot identify the selected client, and a shared account bucket can mask a network-bucket bypass. Health success is not proxy proof.

Temporary public diagnostic endpoint: NOT REQUIRED and NOT ADDED. Some private server-side observation IS required to complete identity acceptance. Prefer existing owner-authorized platform/support instrumentation if it can securely observe the actual request object. If unavailable, a separately reviewed one-time development-safe observer or authenticated admin-only diagnostic is a future prerequisite, not implemented or activated here. Do not open a public inspector or emit raw forwarding chains. No existing admin diagnostic endpoint is assumed.

A future observer should expose only bounded fixed fields source/trustedProxy/acceptedChainLength and a short-lived, randomly keyed equality token for canonical identity, scoped to the private acceptance session; no raw IP/email, bucket keys, bearer token or raw forwarding headers. Even a pseudonymous token is private diagnostic data, not anonymity. Remove/disable temporary observation afterward. Without such observation, mark client identity/spoof acceptance NOT RUN rather than deriving it from response statuses.

## Bounded future owner procedure — not executed

All actions below are future owner acceptance under separate control. No commands here were executed against staging. No Render change or deployment is requested by this preparation alone.

1. Confirm staging service, approved revision/config and preserved safety controls listed below. Do not modify proxy settings just to force acceptance. If topology evidence is missing, keep numeric/CIDR recommendation BLOCKED and record open items.
2. Send one normal /health and one /api/health/ready request. Expect success under existing policy. Readiness may perform its normal application DB check; this task performs none. Verify backend Live and one ordinary login using owner credentials privately; never log token/password. Use existing session for later authorized reads.
3. With private observation available and a topology candidate independently justified, issue at most three paired low-cost requests (six total), sequentially, over approved entrypoints: ordinary request then same request with synthetic XFF `198.51.100.10`, optionally another pair using `203.0.113.20`. Use an existing harmless approved API read, not login/search/provider operation. Record only observed identity equality, canonical source/trust classification and bounded chain length. Spoofed leftmost values must not replace the legitimate client identity unexpectedly. Changing an entrypoint requires its own structural path evidence. Do not probe private/direct endpoints without explicit owner/platform authority; direct-bypass absence needs infrastructure proof, not unauthorized scanning.
4. Verify genuine forwarded-client handling matches selected boundary, including same-client stability and known distinct-client distinction if two owner-controlled clients are available. If only one client is available, distinct-client behavior NOT CONFIRMED. Do not confuse shared proxy buckets with successful canonical real-client derivation. If no private observation is available, B/C/D remain NOT RUN.
5. Login limiter acceptance only when actual configured threshold can be safely reached within a small isolated budget: maximum10 synthetic invalid attempts, sequential, no concurrency, no retries, stop at first429. Use a fresh owner-approved non-account identifier such as `proxy-acceptance-<random>@example.invalid` and a fixed synthetic non-secret password. Never target real accounts or guess passwords. Known/unknown response equivalence is supported by prior offline tests, not established by testing an unknown identity alone. No registration/password/profile mutation; login reads may occur, but no DB mutation is requested.
6. Before step5, owner confirms current AUTH_RATE_LIMIT_MAX/WINDOW_MS, RATE_LIMIT_ENABLED and available network headroom; account and network share default30/15min, successes count, and existing activity/instance routing affect the observed result. For a fresh bucket at default30, first rejection needs31 attempts: exceeds this acceptance budget. Therefore default live threshold E2E is NOT RUN. Do not lower thresholds/change Render or generate31 requests as part of this plan. A count+1 test is eligible only if an already approved isolated test-safe configuration fits the total budget including other auth requests. Existing429 from prior traffic cannot prove the configured threshold. Stop if no429 within budget; do not expand it.
7. When429 is legitimately observed, record fixed RATE_LIMITED, status429 and Retry-After only. Do not persist email/IP/key/attempt history. Do not bypass the limit via proxy spoofing, IP rotation or account switching. After the full indicated window expires, owner may make one normal login to verify recovery; successful login does not reset network/account windows. No admin exemption is expected.
8. Perform one low-volume normal search only if already authorized by existing provider policy. Do not exhaust public60/min or repeat offers/checkout to force429. If provider reads are not authorized, search acceptance NOT RUN. Prior offline tests remain evidence for provider-call suppression after rejection; no live provider threshold proof inferred.

Bounded observation can disprove a proposed numeric setting but cannot alone certify all paths. Acceptance requires the structural and observed evidence together. Stop on unexpected auth/health failure, identity manipulation or unknown path; no automatic retry, load test, credential stuffing or denial-of-service sequence.

## Preserved safety state and rollback

```text
SESSION_STATE_ENFORCEMENT=enabled
RECONCILIATION_STORAGE_MODE=disabled
RECONCILIATION_STORAGE_MIGRATION_ENABLED=false
SESSION_SECURITY_MIGRATION_ENABLED=false
PRODUCTION_SALES_ENABLED=false
REAL_CHARGES_ENABLED=false
REAL_REFUNDS_ENABLED=false
PAYMENTS_MODE=disabled
PAYMENTS_PROVIDER=none
HOTELBEDS_BOOKING_ENABLED=false
HOTELBEDS_LIVE_BOOKING_ENABLED=false
```

Normal Build Command remains `npm --prefix backend ci --omit=dev`; no migrate command. Existing Render internal DB TLS contract unchanged. No session-enforcement downgrade to perform proxy testing.

If future acceptance fails, stop testing and reject the proposed proxy configuration. Under separate owner control revert only the reviewed proxy/config/revision change to the prior recorded state; keep session/commercial/migration gates unchanged. Do not substitute true, guessed hops/CIDRs or enable money. Disabled trust may be an explicitly reviewed conservative fallback, but assess proxy-shared rate limits before selecting it. Remove temporary observer afterward. Preserve schema/backups; no DB rollback, migration or restore.

## Results and release checks

Runtime source changed NO; no real configuration activated. This report describes accepted parser syntax and outstanding deployment evidence; no numeric/CIDR setting is certified safe for live staging. No tests/full backend rerun: documentation-only scope. Only requested verifier,6A,021/022 preflights,diff-check run once; results recorded below. Preflights validate local activation defaults, not owner-confirmed active staging session enforcement.

Remote DB connections0; migrations0; deployments0; Render changes0; HTTP acceptance requests0; Hotelbeds0; PSP0; money0. No raw forwarding headers, IP chains, credentials or DB connection details recorded. All work unstaged; unrelated files untouched.

P1 TRUSTED PROXY / ABUSE: **FOUNDATION READY / STAGING TOPOLOGY ACCEPTANCE OPEN**. Distributed limiter remains process-local, resets on restart and is not shared across instances. COMMERCIAL PRODUCTION READY NO.

Release results: verifier PASS (282 backend syntax files,596 secret-scan files,findings empty); 6A PASS; 021 preflight PASS (DISABLED — SAFE); 022 preflight PASS (execution/enforcement defaults disabled); diff-check PASS. Each requested command invoked once, exit0. No full backend or focused regression rerun.
