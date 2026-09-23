# Asedeliya production foundation — owner procedure (Sprint 4A)

This prepares a future deployment with sales disabled. Nothing here authorizes production launch, provisioning, migration, provider calls or deployment. Obtain separate owner authorization for each operational phase. The offline checker cannot establish remote identity, current data, backup freshness or actual deployed revision.

## 1. Environment and deployment separation

| Contract | Staging | Future production foundation |
| --- | --- | --- |
| APP_ENV | staging, explicit | production, explicit |
| NODE_ENV | production | production |
| API/web targets | Independently reviewed staging URLs | Independently reviewed distinct production URLs |
| Database | Existing staging instance | Separate owner-confirmed durable instance; never inferred from host/name |
| Blueprint | Existing render.yaml, develop | Prepared render.production.yaml, main; not imported |
| Hotelbeds | TEST/read-only | TEST/read-only; blueprint disables reads by default |
| Sales/booking/charges/refunds | Disabled | Disabled |
| Payments | disabled / none | disabled / none |

APP_ENV is an operator deployment label in this sprint, not an application switch. Changing it never authorizes LIVE or money. Existing runtime gates remain unchanged. A future deployment must pass the checker before promotion; this gate is not automatically wired into server startup or existing staging build scripts.

The new production blueprint is valid JSON-form YAML so the offline gate can parse its exact template without a new dependency. Both services use branch main and manual deployment. Branch main is the proposed future release policy, not an assertion that it already exists or is deployed. Review/establish that branch separately; no branch is created here. Backend build runs at repository root, start remains node server.js through npm; no pre-deploy migration hook. Frontend has its own build/root/dist and SPA fallback. No database, plan or region is declared: selecting paid/durable resources, region, service names and private networking remains an explicit owner decision before import. Do not import this template as part of 4A. It is not remote Render schema validation.

Keep existing render.yaml unchanged. Its staging env may not yet explicitly declare APP_ENV; collect an accurate private snapshot and intentionally establish the future target settings later. Do not reinterpret existing NODE_ENV=production staging as a production destination.

## 2. Exact operator snapshot contract

From root, `node backend/scripts/productionFoundationCheck.cjs --contract` prints safe metadata only. Never paste the real snapshot into logs, git, tickets, screenshots or chat. The checker does not load .env or modify process/remote settings.

All 3Z safety settings remain required: NODE_ENV=production, ACTIVE_PROVIDER=hotelbeds, HOTELBEDS_ENV=test, HOTELBEDS_READ_ONLY=true, PAYMENTS_MODE=disabled, PAYMENTS_PROVIDER=none. HOTELBEDS_BOOKING_ENABLED, HOTELBEDS_LIVE_BOOKING_ENABLED, PRODUCTION_SALES_ENABLED, REAL_CHARGES_ENABLED, REAL_REFUNDS_ENABLED, HOT_DEALS_MONITOR_ENABLED and HOTELBEDS_CONTENT_SYNC_ENABLED must be exactly false. Health/reliability jobs explicitly false; email and automatic DB backup false/absent. Keep read retries 0 for the established baseline (inherited parser permits 0..3). TEST search authorization remains separate. If TEST disclosure opt-in is used, backend staging-test and frontend disclosure flags must match; do not hide TEST inventory labels.

Inherited DATABASE_URL, JWT_SECRET, effective OFFER_TOKEN_SECRET/JWT fallback, explicit public HTTPS API/CORS, provider credential presence, limits, TLS and secret-boundary checks are unchanged. All supplied data stays private. Production snapshots may use verified TLS or the already reviewed 3Z.1 preflight-only internal-DB attestation procedure; the latter is separate from confirming a production DB. Runtime supports disable/verify-full, not require. No current runtime DB_SSL_MODE changes are performed or requested by running the checker.

Additional inputs:

| Name | Required meaning |
| --- | --- |
| APP_ENV, EXPECTED_APP_ENV | Exact staging or production; actual backend snapshot and independently reviewed intended target must match |
| RELEASE_SHA, EXPECTED_RELEASE_SHA | Full lowercase 40-hex backend revision and independently reviewed candidate revision must match |
| STAGING_API_URL, PRODUCTION_API_URL | Explicit public HTTPS /api URLs; distinct hostnames; VITE_API_URL must equal selected target after trailing-slash normalization |
| STAGING_WEB_ORIGIN, PRODUCTION_WEB_ORIGIN | Explicit public HTTPS origins with distinct hostnames; CORS_ORIGINS must contain exactly selected frontend origin in this narrow foundation contract |
| RELEASE_REVISION_ATTESTED | I_VERIFIED_SOURCE_AND_BACKEND_REVISION |
| PREVIOUS_RELEASE_SHA | Full lowercase 40-hex previous known-good revision, different from candidate |
| ROLLBACK_READY_ATTESTED | I_VERIFIED_ROLLBACK_AND_DATA_RECOVERY_PLAN |
| PRODUCTION_DATABASE_TARGET_ATTESTED | Production only: I_VERIFIED_SEPARATE_DURABLE_PRODUCTION_DATABASE |
| BACKUP_RESTORE_READY_ATTESTED | Production only: I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET |

Attestations are temporary controlled operator assertions, not runtime configuration or automatic discovery. Never set them automatically just to clear a blocker. Do not save them in Render, .env or frontend env. Verify DB identity privately (host, port, database, user), distinctness from staging, ownership, region/network, retention/backups and lifecycle; no second DB URL is needed by the tool. The staging suspension date previously supplied by the owner was 2026-10-11; current plan/deadline is unverified in 4A. Existing 3Y staging backup is valuable historical evidence, not blanket proof for an as-yet-unprovisioned production target. First deployment also needs a reviewed known-good fallback candidate; lack of one correctly blocks the gate.

Known explicit target comparisons prevent mixing supplied staging/production endpoints. They are not hostname heuristics or DNS/ownership checks; an operator can supply false assertions, so independent review remains necessary. Additional domains/aliases require a reviewed future contract; do not weaken exact CORS to bypass the check.

## 3. Build and release identity

No reliable project runtime git revision source was found. 4A does not invent Render metadata: RELEASE_SHA is a new explicit public-safe build/deployment contract. No runtime endpoint reads it. Owner must independently verify backend deployment revision/settings and compare with EXPECTED_RELEASE_SHA and APP_ENV before asserting. A matching env string alone does not attest the running binary.

Use a clean reviewed checkout/artifact at the candidate commit. Privately load only public build settings into the frontend build process (VITE_API_URL, APP_ENV, RELEASE_SHA and intended TEST disclosure), never backend secrets. Use the existing build, then the explicit local writer:

```powershell
# Future owner procedure; no build/deploy is run by the checker.
npm.cmd --prefix frontend run build
node backend/scripts/createFoundationRelease.cjs
# In a separate controlled shell with reviewed backend + build + operator snapshot:
node backend/scripts/productionFoundationCheck.cjs
```

The writer uses installed source and Node built-ins, no DB/network. It creates only frontend/dist/release.json (exclusive write; fresh Vite build clears previous output). It stores version, environment, revision, TEST disclosure declaration, API SHA-256 and asset digest. It never stores raw API/DB URLs, usernames, credentials or a second DB identity. It does not collect secrets or infer source revision. A safe declaration is insufficient by itself: the checker also requires an exact API literal in JS, rejects the opposite target, sourcemaps, public backups and known secret values/server markers; the receipt binds all build files to their digest.

The receipt is public-safe and can be inspected from the deployed static site by the owner after separate deploy authorization. It is not a signature: anyone who can replace the bundle/receipt can recompute it. Preserve trusted build provenance. TEST disclosure in the receipt records build intent; browser acceptance must still confirm the displayed labels and disabled booking/payment actions. No frontend source or UI was changed.

Checker default includes source and build checks; missing artifacts/config/identity are BLOCKED (exit 1), never a foundation PASS. FOUNDATION_PASS exits 0, even with the known >500kB WARN; OWNER_ACCEPTANCE_REQUIRED always remains. Other states include CONFIG_BLOCKED, DATABASE_TARGET_NOT_ATTESTED, BUILD_TARGET_MISMATCH, SALES_GATES_UNSAFE, REVISION_NOT_ATTESTED and ROLLBACK_NOT_READY. Output contains fixed identifiers/statuses, no supplied URLs/revisions/secrets. Inspection can read large builds and is a manual local operation, not an HTTP endpoint.

## 4. Database migration readiness — plan only

Do not execute the following operational phases in 4A. Provisioning, backups, read-only DB checks and migrations all need separate authorization and a confirmed destination.

1. **Verified backup and recovery prerequisite.** Before any mutation, create a fresh protected backup appropriate to the actual data source, retain manifest/checksum and independently stored copy; confirm compatible PostgreSQL client/server versions and a successful isolated restore drill. Reuse the existing 3Y runbook; never treat readable archive TOC as restored-data proof. No blanket validity is assigned to an old staging dump for future production data. For a newly provisioned empty target, record the empty ledger/data evidence and preserve the source recovery path; do not fabricate a backup of nonexistent production data.
2. **Preparation and write boundary.** Confirm selected target, owner, release/rollback revisions, maintenance window, acceptable recovery loss/window and target isolation. Stop writes/background jobs as needed under authorization; sales disabled alone does not prevent registration/profile/favorites writes. Keep old app/DB and backups. Do not let the runtime pick an operator migration target implicitly.
3. **Read-only ledger/schema review.** Separately use owner-authorized 3Y inventory/schema tools with privately supplied appropriate URLs. Compare current ledger against the matching repo revision: files 001–020, unique ordered names, no unknown/applied-gap state. Expected final inventory is 23 tables, 72 explicit indexes, 20 ledger entries; current deployed ledger is not queried by 4A. Inspect extensions/roles/permissions/version and backfills as well. STOP on unknown state or failed checks; SELECT 1 health alone is insufficient.
4. **Explicit migration execution, if pending and approved.** Existing command is `npm.cmd --prefix backend run migrate`; run only in the separately reviewed target shell, never via startup/build. Runner takes session advisory lock 319003 on its dedicated client, creates/checks _migrations, runs each pending file and ledger insert in BEGIN/COMMIT, ROLLBACK on error, then unlock/release/end. Prior files committed before a later failure remain applied; the batch is not atomic. The ledger CREATE is outside per-file transactions. No reverse migrations exist. Backfills in 002/004/008 and schema/data evolution (including 020 replacing uniqueness constraints with environment indexes) require compatibility review; do not replay all files after restore.
5. **Verify before traffic.** Owner verifies ledger/pending=0/unknown=0, required schema/constraints/sequences and aggregate counts with no real values printed. Then /health and /api/health/ready, revision/environment/API identity and own-app smoke. These health endpoints do not replace schema checks. No Hotelbeds/payment probe is necessary or implicitly authorized.
6. **Rollback decision point.** Before reopening writes, compare acceptance with recovery objectives. Failed ledger/schema/build identity or unknown side effects means STOP; retain evidence and data. Only owner authorizes traffic/deployment advancement. Never clear a ledger, reset data or disable constraints to force PASS.

3Y restore deliberately blocks production/LIVE-like target/env and requires a separate confirmed empty target. 4A does not bypass those guards. Current supported recovery evidence is a restore drill into an isolated approved non-production target. A real production recovery/cutover procedure requires a separately reviewed and authorized plan; until it exists, do not claim operational production restore readiness. Application rollback and data recovery are different decisions.

## 5. Rollback contract

Nothing rolls back automatically in 4A. Reverting code may be mechanically possible only when the old revision is compatible with the current schema and data semantics. Preserve previous backend AND frontend artifacts/commit, exact public build target, privately managed config versions, health evidence and known-good schema contract. Owner selects the previous revision and authorizes deploy, then checks identity/health/smoke; no reset or automatic destructive script is provided.

Database rollback is not reverse SQL promised by this repo. If a migration fails, only the current transaction rolls back; investigate already committed prior files. Choose an approved forward fix or backup restore into a separately isolated recovery target, validate it, then separately plan cutover. Never restore over existing production/staging data or mislabel a production target to bypass 3Y guards.

After new writes, returning to an older DB can lose accepted user changes. Freeze writes, preserve current state, decide reconciliation/recovery point with the owner, and document the loss/window before proceeding. If backup/drill evidence is missing, previous app/schema is incompatible, target identity is uncertain, or recovery cannot meet agreed objectives: STOP. ROLLBACK_READY_ATTESTED is a statement that this decision plan has been reviewed, not execution/proof of a reversible migration.

## 6. Future owner acceptance (NOT RUN)

Privately configure distinct durable production DB and API/web target, independently verify source/backend/frontend revision and environment, run the offline gate on the actual artifact/snapshot, and review warning output. Do not use synthetic test fixtures as real production evidence. Before any separately authorized deploy, review template main branch, region/plan/TLS/proxy and secret settings; attestations remain local only.

After authorized deployment: verify public release receipt against approved artifact, backend revision from owner deployment evidence, APP_ENV, API and exact CORS; health/readiness and separate DB ledger evidence; Home/Results/Details/Favorites/Profile/Help/Contacts/404 at 1440/768/390/320; TEST labeling and disabled money/booking; no unexpected jobs, errors, exposed secrets or sourcemaps; SPA fallback and cache behavior. Provider searches, registrations and all writes need their own scope. Foundation PASS is never authorization to enable LIVE, sales, charges, refunds or launch production.
