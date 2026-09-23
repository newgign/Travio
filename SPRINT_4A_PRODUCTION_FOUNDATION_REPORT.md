# Sprint 4A — Production Foundation / Environment Separation & Launch Readiness

Date: 2026-09-23. Foundation only; no production launch or activation.

CODE / OFFLINE: PASS.
PRODUCTION FOUNDATION: PASS — offline implementation and synthetic contract verification.
PRODUCTION CONFIG: OWNER CONFIGURATION REQUIRED — actual local gate BLOCKED without operator snapshot/artifact identity.
PRODUCTION DATABASE: NOT PROVISIONED BY THIS SPRINT.
PRODUCTION MIGRATION: NOT RUN.
PRODUCTION DEPLOY: NOT RUN.
PRODUCTION HOTELBEDS LIVE: NOT ENABLED.
PRODUCTION SALES: DISABLED.
REAL PAYMENTS: DISABLED.
REAL RENDER DB MUTATIONS: 0.

## 1. Initial git state and scope

First commands, in strict order: git status --short, git diff --stat, git diff. Tracked tree clean. Branch verified as develop. Sprint 3Z/3Z.1 tracked baseline was already committed; no old sprint implementation was restarted or rewritten.

Existing unrelated untracked README.txt, docs/ and SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md remain untouched. An additional pre-existing untracked file with `record final staging release candidate acceptance` in its name was also left untouched. No reset/checkout/restore/clean/add/commit/push/deploy occurred.

No runtime/frontend/3Y/3Z source, package, lockfile, existing blueprint or env file was changed. All eight deliverables below are new files. Earlier 3Z owner staging acceptance and 3Y backup/local restore evidence remain attributed to those reports; they are not production acceptance or new 4A execution evidence.

## 2. Architecture audit

Existing backend uses Express, shared pg pool and databaseConfig; server starts existing env-gated monitors and does not invoke the migration runner. Graceful shutdown and health contracts remain unchanged. /health and /api/health/ready establish reachability/draining state, not schema correctness or deployed revision. No new endpoint or logging framework was introduced.

productionGateService.state hard-disables production sales, real charges and refunds even when requested. Hotelbeds buildConfig selects TEST/LIVE from HOTELBEDS_ENV, not NODE_ENV or APP_ENV; exact booking/read-only/staging-test flags remain separate. Payment readiness consumes the production gate; disabled/none remains the required contract. No runtime APP_ENV or release revision source was found in the audited server/config path. A new operator-only expected-environment contract does not pretend to change runtime behavior.

Frontend API_URL uses explicit VITE_API_URL and removes a trailing slash, with DEV localhost and production /api fallback. Existing public build validator requires HTTPS /api. 4A requires explicit target values, not fallback. Vite config has no sourcemap enablement; existing SPA wildcard and static rewrite remain. No UI redesign or TEST label removal.

## 3. Environment separation

New productionFoundationCheck.cjs calls existing preProductionCheck.configuration on a supplied snapshot, preserves all checks except the staging-only APP_ENV assertion, and replaces that single assertion with exact staging/production plus EXPECTED_APP_ENV equality. It does not mutate the snapshot, process.env or the 3Z module. The 3Z CLI remains staging-only and passes its unchanged 39-test suite.

NODE_ENV=production in both contexts. Both still require Hotelbeds TEST/read-only, disabled booking/LIVE booking/sales/real charges/refunds, payments disabled/none, monitors/content sync disabled and email disabled/absent. Existing provider parser, CORS parser, DB parser, strong-secret validation and 3Y migration inventory are reused. No second provider/security parsing framework was created.

STAGING_API_URL / PRODUCTION_API_URL and STAGING_WEB_ORIGIN / PRODUCTION_WEB_ORIGIN are explicit reviewed operator declarations. Corresponding hostnames must be distinct, target VITE_API_URL must match the chosen environment and CORS must contain exactly its frontend origin. This is comparison of declared targets, not hostname heuristics, DNS resolution or proof of ownership. Unknown aliases and multi-origin deployments require future explicit review.

## 4. Exact environment contract

Machine-readable: backend/scripts/productionFoundationEnvSchema.cjs and its inherited preProductionEnvSchema.cjs, accessible with --contract. Required identity, rollback and operator-attestation fields are separate from application runtime settings.

| Group | Required contract |
| --- | --- |
| Application identity | APP_ENV exact staging/production; EXPECTED_APP_ENV equal; NODE_ENV production |
| DB/secrets | DATABASE_URL valid according to unchanged runtime parser; strong JWT_SECRET; effective OFFER_TOKEN_SECRET/JWT fallback |
| TLS | Verified TLS by default; only existing exact 3Z.1 internal-network assertion permits disable in preflight; require remains unsupported |
| API/CORS | Four explicit staging/production target inputs; VITE_API_URL / CORS_ORIGINS exactly selected target |
| Revision | RELEASE_SHA and EXPECTED_RELEASE_SHA equal, lowercase full 40-hex; RELEASE_REVISION_ATTESTED=I_VERIFIED_SOURCE_AND_BACKEND_REVISION |
| Previous revision | PREVIOUS_RELEASE_SHA full 40-hex and different from candidate |
| Rollback | ROLLBACK_READY_ATTESTED=I_VERIFIED_ROLLBACK_AND_DATA_RECOVERY_PLAN |
| Production DB | PRODUCTION_DATABASE_TARGET_ATTESTED=I_VERIFIED_SEPARATE_DURABLE_PRODUCTION_DATABASE |
| Production recovery | BACKUP_RESTORE_READY_ATTESTED=I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET |
| Provider/money/jobs | Inherited 3Z safe TEST/read-only/disabled settings, credential presence only if reads enabled, matched TEST disclosure |

DATABASE_URL and actual secret values never appear in checker output. Operator assertions are local and temporary; they do not belong in Render/.env/frontend settings. The existing internal-network assertion and the new durable-production-target assertion attest different facts and neither replaces the other. Exact values/procedure and full inherited settings are documented in PRODUCTION_FOUNDATION_RUNBOOK.md.

## 5. DB target / expiry and continuity

No DB was provisioned, queried or changed for foundation validation. The checker cannot identify a production database from a hostname or from APP_ENV. Owner must verify actual target identity privately, distinctness from staging, ownership, region/network, non-expiring/durable lifecycle and backup/recovery provision. No raw identity or second URL is persisted by the new tools.

The staging suspension date supplied earlier was 2026-10-11; account/plan/deadline were not rechecked. Existing 3Y staging dump/manifest and local restore PASS remain historical staging continuity evidence, not automatic recovery attestation for a new production DB. The production-target and recovery assertions intentionally block until separately established.

## 6. Release identity and build artifact

No undocumented Render runtime metadata is assumed. RELEASE_SHA is an explicit public-safe contract from a reviewed backend/build snapshot, compared to independently expected revision and owner attestation. The application does not start reading it or expose a new endpoint. Actual backend binary/deployment identity must still be checked by the owner; merely copying identical strings cannot prove deployed revision.

createFoundationRelease.cjs is a separate explicit build-step writer, not the checker. It writes frontend/dist/release.json only with exclusive creation after a fresh build. It records environment, revision, TEST disclosure declaration, API hash and digest of all other assets. It checks public artifact filenames, links, index/JS presence, API literal and sourcemaps before writing. It does not invoke Vite, git, a shell, DB or network. No real build receipt was generated in this sprint; writer execution was tested only on temporary synthetic build directories.

productionFoundationCheck is read-only: no dotenv load, DB client, subprocess or network. It checks receipt equality/digest, correct embedded API, absence of opposite environment API, source maps, known env secret values/server-secret markers, source startup/backup boundaries and deployment template. Output contains fixed IDs/codes/summary, not supplied URLs, credentials or revision values. --contract prints metadata only. Missing config/artifact results in BLOCKED/exit 1; FOUNDATION_PASS with warnings exits 0 and always includes OWNER_ACCEPTANCE_REQUIRED.

Receipt is not signed, not remote attestation and not proof of compilation from a commit; owner/trusted pipeline supplies that provenance. Static scanning is bounded: exact URL literals and known secret patterns do not prove every possible runtime target or unknown secret absent. Tests exercise stale/tampered assets, wrong env/revision, missing metadata and accidental staging URLs, not a malicious build producer.

## 7. Migration readiness and backup prerequisite

Source inventory remains 001–020, 20 unique sequential filenames, 23 tables, 72 explicit indexes. Existing runner uses dedicated-client advisory lock 319003, _migrations ledger and individual BEGIN/COMMIT transactions with rollback per failed file, unlock/release/end in finally. Ledger creation is outside per-file transactions; an earlier committed migration does not roll back with a later failure. No reverse SQL migration series exists.

Migrations are not uniformly losslessly reversible: 002/004/008 contain backfills and 020 replaces catalog uniqueness constraints with environment-scoped indexes while preserving rows. Versions, roles/extensions, ledger gaps/unknown names, data compatibility and aggregate counts need owner review before real execution. Startup/build remains migration-free; npm migrate stays an explicit operator command. The new blueprint has no preDeploy migration hook.

Runbook sequence: verified protected backup + isolated restore evidence; maintenance/write boundary preparation; read-only ledger/schema review; only separately approved pending migrations; ledger/schema/counts plus health/readiness; own-app smoke; explicit rollback/traffic decision. No stage was performed against Render or a real application schema. The sole local SQL execution was the previously authorized existing regression runner's temporary test-schema contract.

## 8. Rollback readiness

Application rollback needs previous known-good backend/frontend revisions and privately retained config/build settings, and compatibility with the current schema/data. No automatic deployment rollback is implemented. Missing previous revision/plan blocks the new gate, including a first deployment without a reviewed fallback candidate.

Database recovery is an owner forward-fix versus backup/restore/cutover decision, not automatic reverse SQL. After new writes, reverting to an older DB risks loss; freeze/preserve current state and decide reconciliation/RPO with owner. Runbook states STOP on missing recovery evidence, unknown target, incompatible old app/schema or unacceptable loss.

Existing 3Y restore intentionally blocks production/LIVE-like targets/env. 4A does not bypass or rename targets to evade that policy. Isolated non-production restore evidence remains supported; production recovery requires its own separately reviewed authorized operational plan. A recovery attestation asserts plan/evidence review, not that a production restore was executed or is automatically available.

## 9. Blueprint audit

render.yaml unchanged; develop staging preserved. New render.production.yaml is an intentionally JSON-form YAML template with two separate future production service names, branch main, autoDeployTrigger off, Node24, backend root build/start and /health, frontend root/dist/SPA rewrite. Owner must establish/review main policy separately; no branch created. DB and secrets use sync:false; no credential hardcoding, provider keys, DB creation, plan or region change. Production template defaults Hotelbeds reads off, TEST/read-only, money/booking/jobs/email off. Static build appends the public receipt generator after the existing validator/build.

No template import or remote validation occurred. Service plan/region, network/TLS/proxy settings, distinct domains and database lifecycle remain owner decisions before any deployment. No assertion that a local template alone makes Render production provisioned or launch-ready.

## 10. Frontend safety / build audit

Frontend source changed: NO. Existing full consumer 3Z acceptance was not repeated. Safe temporary fixture/build tests cover API target separation, disclosure declaration mismatch, source maps, server-secret leakage, receipt/asset integrity and >500kB warning. No dependency install or network build.

Read-only inspection of existing frontend/dist: build present=true; sourcemaps=false; largeChunk=true; releaseReceiptPresent=false. No files there were changed or receipt fabricated. Without real production inputs and a fresh bound artifact the new gate stays blocked. TEST labels and disabled booking/payment UI source remain intact; browser proof on a future production foundation target is still an owner step.

## 11. Tests and regression

| Command / check | Result |
| --- | --- |
| productionFoundation.test.cjs with offlineNetwork, concurrency=1, force-exit | PASS 32/32 |
| preProductionReadiness.test.cjs, same flags | PASS 39/39 |
| databaseContinuity.test.cjs, same flags | PASS 20/20 |
| sprint3mRegression.cjs | PASS 101/101, 12 suites, exit 0 |
| sprint3mVerify.cjs | PASS — 199 backend syntax files, 403 secret-scan files, findings=[] |
| git -c core.safecrlf=false diff --check | PASS; new untracked deliverables also checked separately |

The foundation suite additionally blocks all HTTP/HTTPS/TCP/TLS/fetch/child execution and reports zero attempts. Runtime payment readiness is tested under a VM with DB/event stubs, not by importing its DB singleton. Existing runtime policies are unchanged; 3Y/3Z suites retain their original assertions. First 4A focused run passed, then receipt TEST disclosure binding was added and all 32 passed again. No failure was hidden or existing test weakened.

Before the single existing backend regression run: safe local configuration preflight returned localOnly=true and databaseUrlAbsent=true, with no PG service/hostaddr/options/servicefile or NODE_OPTIONS override. Runner unchanged; each suite got its own random sprint3m_reg_* schema, migrations/fixtures applied only there, RESET and DROP of its own schema in finally; pool closed. No persistent DB created and no owner/application schema test writes. LOCAL TEMPORARY TEST SCHEMA MUTATIONS: EXPECTED / PASS / CLEANED BY EXISTING REGRESSION CONTRACT.

Real operator CLI without a supplied production snapshot ran once: BLOCKED, exit 1, 24 PASS / 0 WARN / 26 BLOCKED. These are missing local configuration/artifact/identity evidence, not a claim that deployed staging settings are wrong. It queried no database/deployment and authorized no sales. Complete synthetic staging and future-production fixtures both produce FOUNDATION_PASS.

## 12. Exact changed files

All new; no pre-existing tracked file edited:

1. backend/scripts/productionFoundationCheck.cjs
2. backend/scripts/productionFoundationEnvSchema.cjs
3. backend/scripts/lib/foundationBuild.cjs
4. backend/scripts/createFoundationRelease.cjs
5. backend/tests/productionFoundation.test.cjs
6. render.production.yaml
7. PRODUCTION_FOUNDATION_RUNBOOK.md
8. SPRINT_4A_PRODUCTION_FOUNDATION_REPORT.md

Runtime DB behavior changed: NO. productionGate behavior changed: NO. Hotelbeds behavior changed: NO. Payment behavior changed: NO. Frontend source changed: NO. Existing render.yaml changed: NO. 3Y and 3Z tooling changed: NO. No package/env/dependency changes. Temporary test filesystem fixtures were removed only from their own verified generated directories; regression logs remain under the existing .tmp/3m convention.

## 13. Warnings, blockers and limitations

Known >500kB frontend main chunk remains non-blocking. Receipt lacks authentication and revision declarations require independent provenance review. Source/build checks are conservative bounded assertions, not a universal SQL/YAML/JavaScript analyzer or remote security audit. No DNS resolution or provider/payment/email readiness probes, dependency advisory lookup, browser automation or Render API verification.

Actual production configuration, target provisioning/ownership/lifecycle, fresh backup/restore evidence, previous revision compatibility, migration acceptance, final artifact receipt and deployed identity are not supplied or executed. Those are owner launch blockers, independent from offline CODE PASS. No production sales activation contract was added.

Owner next actions are documented in PRODUCTION_FOUNDATION_RUNBOOK.md: review target/branch/plan/network choices and evidence privately, separately authorize required operations, build with public settings only, create receipt, run gate on actual snapshot, then separately authorize deployment and verify DB/schema/revision/browser acceptance. Do not use fixtures or old staging acceptance to attest production.

REAL Hotelbeds status/content/availability/checkrate/booking/cancellation=0; payments=0; email=0; Render API=0; Render DB=0; remote PostgreSQL=0. Backup/restore/production migrations=0. REAL DB MUTATIONS=0; only authorized isolated local regression schema mutations occurred. No git add/commit/push/deploy or Render/env/plan changes.

## 14. Final audit and status

Final ordered git status --short, git diff --stat, git diff and git -c core.safecrlf=false diff --check completed. Tracked diff remains empty: all eight 4A deliverables are untracked pending owner review and were inspected separately, including whitespace checks. No files were staged. Existing unrelated untracked paths are unchanged.

CODE / OFFLINE: PASS.
PRODUCTION FOUNDATION: PASS — offline contract/tooling scope.
PRODUCTION CONFIG: OWNER CONFIGURATION REQUIRED.
PRODUCTION DATABASE: NOT PROVISIONED BY THIS SPRINT.
PRODUCTION MIGRATION: NOT RUN.
PRODUCTION DEPLOY: NOT RUN.
PRODUCTION HOTELBEDS LIVE: NOT ENABLED.
PRODUCTION SALES: DISABLED.
REAL PAYMENTS: DISABLED.
REAL RENDER DB MUTATIONS: 0.
OWNER PRODUCTION ACCEPTANCE: NOT RUN.
