# Sprint 7N.4 — Final Trusted Proxy Staging Acceptance

2026-10-10, Asia/Qyzylorda. STAGING ACCEPTANCE: PASS. TRUST_PROXY=1: STAGING ACCEPTED for CURRENT RENDER STAGING topology. COMMERCIAL PRODUCTION READY: NO. Documentation/acceptance only; no runtime changes or independent live probes.

## Baseline

develop; tracked tree clean at start; HEAD `6f76b28 docs: record Sprint 7N.3 proxy telemetry`, preceding `ae43220 feat: add privacy-safe proxy telemetry`, `22c9f75 docs: add Sprint 7N.2 Render proxy observation plan`. Unrelated untracked owner files preserved. Current evidence supplied by owner: Sprint7N deployed, backend LIVE, TRUST_PROXY=1, HTTP_ACCESS_LOG=true. No current live revision beyond supplied evidence is invented.

## Exact owner observations

| Safe field | Normal request | Exactly one bounded synthetic forwarding request |
| --- | --- | --- |
| method/path | GET /api/health/live | GET /api/health/live |
| statusCode | 200 | 200 |
| networkIdentitySource | forwarded | forwarded |
| trustedProxy | true | true |
| forwardedChainLength | 1 | 1 |
| socketPeerMatchesCanonical | false | false |

Normal forwarded observation PASS. Single spoof observation PASS within the stated acceptance scope. Safe telemetry PASS. Health PASS: owner previously confirmed /health200 and supplies successful liveness observations. No additional readiness result or address equality is inferred. Owner reports no login attempts, limiter exhaustion, credentials, Hotelbeds, PSP or money operation in this observation. No IP addresses, raw header content or synthetic forwarding value appear in this report.

## Acceptance basis and limits

Owner-supplied current Render platform facts: public web-service HTTP port is not directly reachable from the public internet; Render forwards inbound traffic through edge/load-balancing infrastructure; its load balancer terminates inbound TLS; current Express guidance uses app.set('trust proxy', 1) behind that load balancer. This context is accepted as supplied evidence, not a new independent online platform audit. No Render CIDRs invented or configured.

Public direct-to-Node bypass: **BLOCKED BY CURRENT RENDER PLATFORM CONTRACT**. The conclusion combines owner normal/spoof runtime observations, the supplied current platform contract/guidance and existing offline regression evidence. Equal safe telemetry fields alone do not prove cross-request canonical IP equality, that a particular spoof value was ignored, exactly one physical proxy, or universal ingress spoof resistance. No claim that telemetry independently proved the platform restriction.

Trusted proxy code boundary READY. Spoof-resistant public staging ingress STAGING ACCEPTED under this current contract. TRUST_PROXY=1 is not universally correct for other architectures or production deployment targets. Review acceptance again if another reverse proxy/CDN is introduced, topology changes, direct private-network callers are introduced, another ingress path exists, hosting provider changes or proxy hop count changes. Private ingress is outside this public staging acceptance.

## Abuse protection and logging

Auth network limiter READY; auth account-aware limiter READY; expensive endpoint protection READY in existing tested search/offers/checkout scope. Current in-memory limiter is suitable for the current single-process/single-instance foundation, resets on restart and is not shared across horizontally scaled instances. Distributed multi-instance limiter OPEN / FUTURE / NOT READY. Overall P1 TRUSTED PROXY / ABUSE: PARTIAL because distributed production protection remains unresolved; current staging proxy topology is accepted. P1 distributed abuse is not closed; no new429/exhaustion/load evidence claimed.

HTTP_ACCESS_LOG=true is the supplied current staging state. Safe proxy telemetry adds no raw client/socket IP or raw X-Forwarded-For/X-Real-IP/Forwarded content; canonical-vs-peer comparison is boolean and forwarded chain is length only. Existing generic path/user metadata policies remain outside this narrow privacy assertion. No access-log setting changed here. Future disabling is an operational decision, not an acceptance prerequisite.

## Validation and exact files

Historical offline evidence retained, not rerun: Sprint7N.3 focused26/26, adjacent90/90, aggregate1356/1370 with14 known DB-blocked and0 unexpected unresolved; Sprint7N.3A directly relevant26/26 PASS. No full backend or frontend rerun for this documentation-only update.

Current one-time checks: verifier PASS (283 backend syntax files,600 secret scan files, findings empty);6A PASS;021 preflight PASS;022 preflight PASS;diff-check PASS. Local preflights concern local defaults, not changes to deployed migration/session configuration.

Modified: SECURITY_PRODUCTION_GAP_CHECKLIST.md; SPRINT_7N2_RENDER_PROXY_LIVE_OBSERVATION_PLAN.md; SPRINT_7N3_SAFE_PROXY_TELEMETRY_REPORT.md.

New: SPRINT_7N4_TRUSTED_PROXY_STAGING_ACCEPTANCE_REPORT.md. Local check logs under .tmp/sprint7n4-*.log. All changes unstaged; owner files preserved.

Runtime files changed NO; TRUST_PROXY edits0; Render changes0; deployments0; additional spoof requests0; remote DB connections0; migrations0; Hotelbeds calls0; PSP calls0; money operations0. No git add/commit/push. Production sales/payment/booking gates unchanged. Commercial production readiness NO.
