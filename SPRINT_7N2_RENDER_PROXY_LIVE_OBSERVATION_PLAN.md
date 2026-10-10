# Sprint 7N.2 — Live Render Proxy Topology Observation

2026-10-10, Asia/Qyzylorda. LIVE OBSERVATION PLAN: PASS. LIVE TOPOLOGY ACCEPTANCE: OPEN. TRUST_PROXY recommendation: NONE YET. No live acceptance request executed by this task.

## Baseline

develop; tracked tree clean at start. HEAD `db315ed docs: record Sprint 7N.1 Render proxy acceptance plan`; preceding `eb54567 docs: record Sprint 7N proxy and abuse hardening`, `94de420 feat: harden trusted proxy and abuse protection`. 7N.1 committed. Unrelated untracked owner files preserved. Inspected requested runtime/config/telemetry and 7N/7N.1 reports only. Log evidence is the inspected emission schema, not private live Render logs; no actual Render log export supplied or accessed.

LIVE TRUST_PROXY UNKNOWN. LIVE REVISION UNKNOWN. Owner's prior staging session/TLS/health evidence retained, not independently rechecked. No source change, diagnostic endpoint, deployment, Render change, DB connection, migration, provider request or abuse test.

## A. Owner inspects only TRUST_PROXY

Open Render → asedeliya-staging-api → Environment, read TRUST_PROXY without saving or changing anything. Report only that variable/category, not Environment screenshots, exports or other variables:

| Observed setting | Classification |
| --- | --- |
| Entry absent | absent; default trust disabled |
| Exact false | false; trust disabled |
| Exact0 | 0; trust disabled |
| Exact single digit1–8 | numeric; topology approval required |
| Exact loopback | loopback; intended local proxy provenance required |
| Valid literal IP/CIDR entries | IP/CIDR list; range provenance required; report category only initially |
| Empty/whitespace/true/other malformed value | invalid under 7N parser |

No trimming/case-folding. true/wildcard/explicit /0 rejected. CIDR parser does not evaluate union coverage; overbroad/equivalent universal lists are not automatically certified safe. Do not guess ranges. Stable Render proxy CIDRs are not present in supplied project evidence. Syntax acceptance is not deployment acceptance.

## B. Owner identifies the live deployed revision

In the staging service Deploys/Events view, inspect the currently serving successful deploy's commit/revision. Do not confuse the latest failed build with the live revision. No redeploy required. Share only commit hash and successful/live status.

Minimum 7N code commit is `94de420`. The live commit must include it, not merely have a similar deploy date or branch name. Owner may verify against existing local git history, substituting only a validated commit hash:

```powershell
$liveRevision = '<LIVE_DEPLOY_COMMIT_HASH>'
git merge-base --is-ancestor 94de420 $liveRevision
$LASTEXITCODE
```

0 means code commit is an ancestor (or identical), 1 means it is not, other/nonzero error means ancestry unverified. Unknown local commit object does not justify assuming success or automatically fetching/deploying. Compare available history first. Branch develop alone does not prove revision contains 7N.

## Existing observability — insufficient

requestTelemetry optionally emits HTTP request with requestId,method,route,statusCode,durationMs,userId when existing HTTP_ACCESS_LOG is enabled. For correlation use only requestId/method/route/statusCode/durationMs, never userId or credentials. Failure/slow event projection has requestId, route/method/status/duration and fixed metadata, but no proxy identity fields. Metrics record method/route/status/duration. Rate-limited responses bypass per-attempt access logs and DB-backed events after metrics recording.

Missing evidence: canonical socket-peer equality, canonical client identity equality across a normal/spoof pair, canonical source, immediate-peer trustedProxy result, accepted forwardedChainLength, Express req.ips length, and Express req.ip relation to the canonical helper result. None are currently logged. RateLimit/Retry-After/request-ID headers do not supply them; account bucket behavior can mask network identity errors.

Startup `startup_socket_bound` address/family/port describes the listening socket, not a request peer. `startup_self_probe` describes startup loopback health, not public forwarding. Existing log shapes do not expose raw XFF/Forwarded/X-Real-IP; do not turn on raw request/header logging to compensate. No actual live request/security log lines supplied, so no live field values are inferred.

## C. One normal low-risk smoke request

Selected request: **GET /health**, no credentials, token, fake header or body. In PowerShell, substitute only the known staging HTTPS origin:

```powershell
curl.exe --silent --show-error --max-time 10 --max-redirs 0 --output NUL --write-out "HTTP %{http_code}\n" --url "https://<STAGING_HOST>/health"
```

Run once, no retries and no redirect following. Expect HTTP200; do not treat connection failure/redirect as PASS. No DB/provider/PSP operation in this liveness path. Do not use root `/` instead: server root handler queries the DB.

/health is deliberately mounted before requestTelemetry and all abuse limiters. **No matching per-request application telemetry log is expected for this request.** It is a smoke check, not an observation of limiter identity or proxy topology. No inspected alternative endpoint provides the missing proxy fields, so moving the request to a telemetry-covered route would not solve acceptance and may enter auth/DB/event work. Do not generate a deliberate404/error just to produce a log.

Retain owner health acceptance requirements: /health200 and /api/health/ready ready/database.ok=true, unaffected by limiter. Readiness evidence may be the owner's existing evidence or a separately authorized normal owner check; readiness inherently checks application DB connectivity and is not run as part of this no-DB task. No health status is reclassified as new live PASS here.

## D. Exact safe observation fields and missing prerequisite

Existing correlation fields usable if already present: requestId,method,route,statusCode,durationMs. They alone are insufficient. Do not change HTTP_ACCESS_LOG or Render to obtain them during this task.

A future privately authorized observation needs only classifications/counts: `socketPeerEqualsCanonical`, `source`, `trustedProxy`, `forwardedChainLength`, `expressIpsLength`, `expressIpEqualsCanonical`, and whether canonical identity equals the one synthetic spoof value. Cross-request same-client stability needs a short-lived private equality mechanism scoped to the same observer/process, not a public or persistent limiter key. These are proposed evidence fields, not fields already implemented. Raw addresses/full chains are unnecessary in the report.

Prefer existing secure platform/support observation if the owner can obtain it. Otherwise report this exact gap before proposing a separately reviewed development-safe observer or admin-only diagnostic. No endpoint or logging patch added here. No public inspector, raw header logging, secret/token exposure or assumption that a Render shell/log viewer can introspect live request objects automatically.

## Expected candidate behavior, not live evidence

| Candidate setting/path | Expected Express/helper behavior |
| --- | --- |
| absent/false/0 | req.ip=socket peer; req.ips empty; canonical socket source, trustedProxy=false, accepted length0 |
| numeric1 with valid nonempty XFF | Express selects nearest forwarded address, req.ips length1; canonical forwarded source; trust of socket peer is positional |
| numeric N>1 | At most N forwarded addresses selected, depending on available chain; first address of accepted chain becomes req.ip |
| loopback/IP/CIDR, immediate peer untrusted | req.ip=socket peer, req.ips empty, canonical socket source, trustedProxy=false |
| loopback/IP/CIDR, immediate peer trusted | Resolve right-to-left through approved hops to first untrusted address; canonical forwarded source when valid chain exists |
| trusted peer, absent/malformed/overlong forwarding | Empty chain or conservative canonical socket fallback; not proof that trust is disabled |

For a normal request, socket-peer != canonical-client and accepted length1 can be consistent with one accepted forwarding hop. It does NOT prove there is exactly one physical proxy or that all ingress paths are safe. Stable socket identity with disabled trust can collapse many Render users into one quota bucket. Neither case is certified without owner evidence.

## E. Single spoof observation

Single spoof observation possible with current telemetry: **NO**. Exact safe spoof request for execution now: **NOT RUN**. There is no useful server-side canonical comparison, so an extra request would not establish the stated security property. A normal browser is not the proposed tool for setting forwarding headers; do not use DevTools header spoof instructions.

If a future separately authorized private observer becomes available, the maximum budget is one normal request plus ONE custom-client spoof request with a single documentation-address XFF value, without credentials/body/auth/provider/login activity, no retries or threshold exhaustion. Select an observed safe route first; compare canonical equality/classifications rather than merely status200. Do not run that conditional test before the observation prerequisite is met. This narrower 7N.2 budget supersedes 7N.1's broader optional pair budget for this phase.

## Direct bypass and decision matrix

Direct-bypass impossibility: **NOT PROVEN**. It cannot be established from a single owner public-client observation; architecture/access controls for all ingress paths are needed. No live Render architecture evidence supplied here, no direct/private port scan attempted. A finite successful spoof pair can falsify a configuration, but cannot prove absence of every shorter ingress path.

- absent/false/0: forwarded-header spoof resistance follows disabled trust; actual-user limiter separation behind Render remains incomplete until observed.
- numeric1: require authoritative one-hop/header/no-shorter-public-path evidence plus application observations; recommendation NONE YET.
- numeric>1: require matching evidence for that exact budget and all paths; no count guessed.
- loopback/IP/CIDR: require actual immediate-peer and range provenance; no inferred private-network trust or invented Render CIDRs.
- invalid or deployed revision without7N: record mismatch, stop acceptance and report; no automatic setting change or redeploy.

## F. Owner evidence to return and unchanged limits

Return only:

```text
LIVE TRUST_PROXY: <absent / false / 0 / exact numeric / loopback / IP-CIDR list / invalid>
LIVE DEPLOY REVISION: <commit hash>
CONTAINS 94de420: YES / NO / UNKNOWN
NORMAL GET /health: <HTTP status / NOT RUN>
EXISTING SAFE TOPOLOGY FIELDS: UNAVAILABLE / privately observed classifications
SPOOF OBSERVATION: NOT RUN
DIRECT-BYPASS EVIDENCE: NOT PROVEN / authoritative evidence reference
LIVE LOGIN 429 E2E: NOT RUN
```

No Environment screenshot/export, secrets, DATABASE_URL, actual proxy chains, raw IP/email, passwords or tokens. Do not repeat login, search or health traffic to force logs. Live login429 threshold E2E remains NOT RUN: default31 attempts exceeds owner budget10; no separate isolated test-safe mechanism established. Do not lower thresholds, brute-force existing accounts, switch identity to bypass quotas or perform load/DoS testing. No search is needed for this topology observation plan; provider threshold tests remain offline evidence.

Preserve session enforcement enabled, migration flags OFF, normal Build Command, internal DB TLS contract, reconciliation runtime/datasource disabled, production sales/payments/Hotelbeds Booking/LIVE OFF. No config rollback/change is performed or requested now. If future observation reveals unsafe behavior, stop and report for separately reviewed remediation; do not substitute guessed hops/CIDRs/trust-all.

## Scope and checks

Only this report created; runtime source unchanged. Full backend/focused suites NOT RUN (documentation only). Requested verifier,6A,021/022 preflights and diff-check each run once; results recorded below. Local migration preflights check execution-disabled defaults, not live session enforcement state.

Remote DB connections0; migrations0; staging requests0; Render changes0; deployments0; Hotelbeds0; PSP0; money0. All unstaged; no git add/commit/push. P1 FOUNDATION READY / STAGING TOPOLOGY ACCEPTANCE OPEN. No distributed or commercial production readiness claim.

Release checks: verifier PASS (282 backend syntax files,597 secret-scan files,findings empty);6A PASS;021 preflight PASS (DISABLED — SAFE);022 preflight PASS (execution/enforcement defaults disabled);diff-check PASS. Each requested check run once, exit0.
