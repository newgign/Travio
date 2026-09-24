# Production infrastructure — owner checklist and dry run (Sprint 4B)

This is a checklist, not an env file or permission to provision. Planned logical names: `asedeliya-production-api`, `asedeliya-production-web`, `asedeliya-production-db`. REMOTE RESOURCES NOT CREATED. Keep all real values in the owner's private configuration system. Do not fill this document with URLs, database identities, credentials, tokens or backup contents.

The version 1 `production.infrastructure.json` is a closed metadata contract: resource names, env/secret **names**, relationships, release policy, ordered gates. It is not an executable Render Blueprint. `render.production.yaml` remains the reviewed 4A template; importing it is a separately authorized remote operation. It intentionally contains no database provisioning declaration. Main branch, plan, durable storage, region, networking, ownership, retention, proxy and TLS need owner review. No current Render state is inferred.

## Local gate modes

From repository root:

```powershell
node backend/scripts/productionInfrastructureCheck.cjs --plan
node backend/scripts/productionInfrastructureCheck.cjs --contract
# Only after privately supplying an independently reviewed operator snapshot and 4A build receipt:
node backend/scripts/productionFoundationCheck.cjs
node backend/scripts/productionInfrastructureCheck.cjs
# Future migration preparation, after actual evidence and separate authorization exist:
node backend/scripts/productionInfrastructureCheck.cjs --migration-readiness
```

`--plan` checks only metadata and repository source/template boundaries. PASS is a provisioning PLAN PASS, never an operator snapshot, build, remote resource or production readiness attestation. Default mode validates the full private 4A snapshot/build plus 4B production identity and safety. `--migration-readiness` additionally requires target-specific backup, schema/ledger and separate authorization assertions. It cannot execute or authorize a migration. Missing inputs fail closed; PASS/WARN exit 0, BLOCKED exit 1; unsupported/combined options block. Output uses fixed codes only; `--contract` intentionally lists env names and allowed assertion phrases, never supplied values. No dotenv autoload, URL lookup, DNS, connection, subprocess or file writes.

4A requires a local candidate build and recovery evidence even on the first snapshot pass. Prepare those locally before step 7; repeat steps 7–8 after later backup/schema/config changes and step 17 after the final frontend build. Early incomplete snapshots are expected to BLOCK. Never fabricate evidence to make the sequence pass. Step 9 obtains/revalidates the fresh migration-specific prerequisite, distinct from general 4A recovery readiness. The final frontend build is repeated with the confirmed target after backend acceptance.

## Private operator contract

Inherit all inputs and exact assertion phrases from [4A runbook](PRODUCTION_FOUNDATION_RUNBOOK.md), including backend `RELEASE_SHA`, independently reviewed `EXPECTED_RELEASE_SHA`, previous known-good revision, rollback and recovery evidence. Backend and the existing `frontend/dist/release.json` must agree on production environment and revision; version 1 receipt, API hash and all artifact bytes are verified by 4A. A declaration is not a signature or remote revision lookup.

Additional operator-only fields, never save in `.env`, Render Environment or frontend build env:

| Name | Required evidence / exact assertion |
| --- | --- |
| STAGING_DATABASE_LOGICAL_NAME | Owner-reviewed resource label from explicit project inventory; lowercase letter then 2–79 lowercase letters/digits/hyphens. No URL, hostname, username or credential. Existing repo has no staging DB declaration; do not invent one from its hostname. |
| PRODUCTION_DATABASE_LOGICAL_NAME | Must match the reviewed manifest's planned production DB label. A label alone is insufficient. |
| PRODUCTION_DATABASE_TARGET_ATTESTED | `I_VERIFIED_SEPARATE_DURABLE_PRODUCTION_DATABASE` (same 4A contract) |
| STAGING_DATABASE_IDENTITY_ATTESTED | `I_VERIFIED_STAGING_DATABASE_IDENTITY` |
| PRODUCTION_DATABASE_IDENTITY_ATTESTED | `I_VERIFIED_PRODUCTION_DATABASE_IDENTITY` |
| DATABASES_CONFIRMED_DISTINCT | `I_VERIFIED_STAGING_AND_PRODUCTION_DATABASES_ARE_DISTINCT` |
| PRODUCTION_BACKUP_VERIFIED | Migration readiness only: `I_VERIFIED_TARGET_BACKUP_CHECKSUM_AND_ISOLATED_RESTORE_EVIDENCE` |
| PRODUCTION_SCHEMA_LEDGER_REVIEWED | Migration readiness only: `I_REVIEWED_TARGET_SCHEMA_AND_MIGRATION_LEDGER` |
| PRODUCTION_MIGRATION_AUTHORIZATION | Migration readiness only: `I_RECORDED_SEPARATE_OWNER_MIGRATION_AUTHORIZATION` |

Verify actual selected resource identities privately using the provider resource inventory and intended DB identity, then confirm they are distinct; never infer environment from dpg prefixes, onrender domains, IP ranges or usernames. No raw DB identity is collected by 4B. Assertions are owner evidence, not independently proven by the tool. Clear them from the controlled operator process after checking; they expire logically when target, source data, configuration or release changes. Never auto-fill assertions from this checklist.

`PRODUCTION_API_URL`, `STAGING_API_URL`, `PRODUCTION_WEB_ORIGIN`, `STAGING_WEB_ORIGIN` remain explicit 4A operator target metadata. Production API is public HTTPS `/api`; VITE_API_URL must match it. CORS contains exactly the intended public HTTPS production frontend origin, without credentials/path/query/hash/wildcard. Explicit staging targets must differ. No DNS/ownership/alias attestation is produced by string comparison. Build must have no sourcemaps or server secrets. When Hotelbeds TEST reads are enabled under separate authorization, both backend TEST opt-in and frontend TEST disclosure must be true; preserve browser-visible TEST labels and disabled booking/payment actions. Template defaults keep provider reads disabled.

## Provisioning order — future owner actions only

4B narrows API/frontend targets to DNS names: all IP literals, including mapped IPv6 and public IPs, are rejected. This keeps private/special address handling fail-closed without changing 3Z/4A URL parsers. It is syntax validation only; DNS is never resolved and a supplied domain's ownership or routing remains owner evidence.

Each manifest step records its required gate. Complete each gate before advancing; an offline PASS never substitutes for a remote acceptance gate or separate execution authorization.

1. Review production manifest, names, main branch and rollback plan.
2. Separately authorize and provision the production PostgreSQL resource.
3. Verify intended production database identity privately.
4. Verify staging identity and confirm the two resources/databases are distinct.
5. Record temporary target and distinctness attestations.
6. Configure backend environment privately with all safe gates below.
7. Run 4A foundation check on the reviewed snapshot and locally prepared candidate artifact.
8. Run 4B snapshot check; stop on BLOCKED.
9. Obtain/revalidate verified backup and isolated restore evidence for the intended source/target using [3Y continuity procedure](DATABASE_CONTINUITY_RUNBOOK.md).
10. Separately inspect schema/migration ledger; record safe evidence, never rows/credentials.
11. Record separate migration authorization and run 4B migration-readiness; actual migration is a separately authorized future manual action. Verify resulting ledger/schema before deployment.
12. Separately authorize and deploy backend.
13. Owner checks `/health`.
14. Owner checks `/api/health/ready`. Health is not full schema/ledger validation.
15. Configure frontend public VITE_API_URL for the confirmed production backend.
16. Build frontend and generate the existing 4A release receipt from the same reviewed release.
17. Repeat 4A build preflight and 4B snapshot checks on the final artifacts/configuration.
18. Separately authorize and deploy frontend.
19. Owner browser acceptance: release/target identity, TEST disclosure, disabled booking/payments, consumer routes, mobile widths, CORS, SPA fallback, cache/headers, errors and secret boundary. Provider calls and registration/profile/favorite writes require their own scope.
20. Keep booking, sales, charges, refunds and payments disabled.

## Checklist — no action is claimed completed

- [ ] Production backend created under separate authorization.
- [ ] Production frontend created under separate authorization.
- [ ] Production durable PostgreSQL created under separate authorization.
- [ ] Production DB identity verified.
- [ ] Staging DB identity verified.
- [ ] Databases confirmed distinct; labels and owner assertions independently reviewed.
- [ ] DATABASE_URL configured privately; supported TLS policy reviewed.
- [ ] JWT_SECRET configured privately.
- [ ] OFFER_TOKEN_SECRET configured privately (4A retains runtime JWT fallback).
- [ ] Conditional Hotelbeds credential names reviewed; no real provider calls authorized here.
- [ ] CORS and frontend API targets reviewed.
- [ ] Release SHA, existing 4A receipt, previous revision and artifact provenance reviewed.
- [ ] Fresh relevant backup/checksum/protected copy and isolated restore evidence verified.
- [ ] Schema/ledger reviewed; migration separately authorized, outside startup.
- [ ] APP_ENV=production and NODE_ENV=production; ACTIVE_PROVIDER=hotelbeds.
- [ ] HOTELBEDS_ENV=test; HOTELBEDS_READ_ONLY=true; TEST disclosure retained.
- [ ] HOTELBEDS_BOOKING_ENABLED=false; HOTELBEDS_LIVE_BOOKING_ENABLED=false.
- [ ] PRODUCTION_SALES_ENABLED=false; REAL_CHARGES_ENABLED=false; REAL_REFUNDS_ENABLED=false.
- [ ] PAYMENTS_MODE=disabled; PAYMENTS_PROVIDER=none.
- [ ] HOT_DEALS_MONITOR_ENABLED=false; HOTELBEDS_CONTENT_SYNC_ENABLED=false.
- [ ] EMAIL_ENABLED=false; DB_BACKUP_AUTO_ENABLED=false.
- [ ] HEALTH_MONITOR_ENABLED=false; RELIABILITY_MONITOR_ENABLED=false.
- [ ] Rollback plan reviewed, including schema compatibility, accepted write boundary, recovery point/window and preservation of newly accepted writes.

## Backup, migration and rollback boundaries

Use 3Y principles: fresh target-relevant evidence, checksum/manifest, protected independent copy and successful isolated restore drill; archive listing alone is insufficient. Existing staging backup is not automatic evidence for future production. For an empty new target, privately document empty schema/ledger state and the protected source recovery path. Do not assert a backup exists when it does not. Missing evidence blocks migration readiness.

The 3Y restore production/LIVE guards remain intact. Never relabel production or bypass guards; actual recovery/cutover needs its own approved procedure. Preserve old artifacts, compatible previous revision, config versions and data. See 4A rollback section for partial migration commit semantics, failed deployment handling, forward fix versus recovery and write-loss decisions. No reverse migration or automatic rollback is promised. Runtime never consumes the new assertions and never migrates on startup. All 4B modes leave migration NOT RUN, database NOT_QUERIED and acceptance NOT_RUN.
