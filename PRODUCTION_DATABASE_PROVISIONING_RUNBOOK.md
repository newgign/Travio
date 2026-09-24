# Sprint 4C.1 — production PostgreSQL owner provisioning

Scope A prepares local tools and this procedure only. Scope B is a later manual owner action. Codex has not created, connected to or inspected a production DB. This procedure stops at READ_ONLY_INSPECTION_PENDING. No migration, restore, import, seed, backend connection or deployment is authorized here.

## Phase 1 — before create

1. Privately verify the intended Render account/workspace and existing staging database service label `asedeliya-staging-db`. This label comes from the owner's Sprint 4C.1 instruction, not discovery or a hostname. Confirm the existing staging backend is still attached to its existing DB. Do not edit it.
2. Review the planned production label `asedeliya-production-db` in `production.infrastructure.json`. Confirm that the intended new resource is separate; do not rename/repurpose staging. If a resource with that label already exists, STOP and verify its history/identity; do not create a duplicate or assume it is empty.
3. Review ownership, durable plan/lifecycle, budget, PostgreSQL version, capacity, retention and region/network compatibility with the future backend. Record any actual resource IDs, DB names and access details privately, never in this repository/report/chat. Current Render UI, availability, pricing and resource state were not queried by Codex; owner must review them before confirming creation.
4. Preserve HOTELBEDS_ENV=test, HOTELBEDS_READ_ONLY=true, all booking/LIVE/sales/charges/refunds flags false, PAYMENTS_MODE=disabled, PAYMENTS_PROVIDER=none. Monitors/content sync/email/automatic backup remain disabled under 4B. APP_ENV=production never authorizes sales. No app environment is edited in this phase.
5. Confirm migrationAuthorized=false and migrationRun=false. Do not run migration/backup/restore scripts, start the app against the target, import a Blueprint or configure a connection yet.

## Phase 2 — owner manually creates one PostgreSQL resource

After separate owner approval, open the intended Render workspace and use its new PostgreSQL resource workflow. Enter the planned service label `asedeliya-production-db`, review the chosen plan/region/version/network and cost, then create exactly one new resource. Do not use a restore/clone/import flow. Wait for the service to be available and privately verify it is the resource just created. Record only `productionDatabaseCreated=true` in a private copy of the safe snapshot after this occurs.

Do not modify, link to or reconnect staging. Do not configure DATABASE_URL on any backend, apply render.production.yaml, deploy services or run application startup. The intended new DB is UNMIGRATED / NOT INITIALIZED; catalog emptiness is still NOT VERIFIED offline. Service provisioning may create provider-managed system objects, which are not application migrations.

## Phase 3 — collect URLs privately

From the new resource's connection details, privately collect its Internal Database URL and External Database URL. Confirm in the resource UI that both belong to the same selected new resource. Internal access is intended for an eligible related Render backend environment/private network. External access is for separately authorized, restricted owner administrative/local inspection. Do not infer identity, eligibility or TLS from a hostname pattern; review resource/network information directly.

Store URLs in the owner's private secret store. Never put them in git, this snapshot, a report, chat, screenshots, command arguments, shell history or logs. Do not change existing `.env`, Render environment, DATABASE_URL or staging. Restrict any future external access to the intended owner source; do not enable broad public access for this task.

The comparison helper does not need a connection, network access or access-list change. It rejects query/fragment options, surrounding whitespace, invalid encoding and unsupported URL shapes rather than silently discarding connection overrides. If a copied URL is rejected, privately review its format/options; do not edit the actual deployed URL/TLS policy merely to obtain PASS.

## Phase 4 — local distinctness comparison

Privately obtain the existing staging URL from its own verified resource. Compare like-for-like: staging Internal versus production Internal, or staging External versus production External. **Do not compare one DB's Internal URL with its External URL to claim two databases.** Different endpoints/DNS aliases/proxies/ports can reach the same DB. Remote resource ownership and distinctness require independent owner review even when the strings differ.

In a fresh, non-transcribed local PowerShell, from repository root, use masked prompts. No secrets appear in the command text/history; environment values still exist temporarily in process memory and are not protected from other privileged local processes. Do not run this inside a session that automatically captures sensitive prompt input. These are future OWNER commands, not executed by Codex:

```powershell
function Read-PrivateDatabaseUrl([string]$Prompt) {
  $privateInput = Read-Host $Prompt -AsSecureString
  $privatePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($privateInput)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($privatePointer) }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($privatePointer)
    $privateInput.Dispose()
  }
}
try {
  $env:STAGING_DATABASE_URL = Read-PrivateDatabaseUrl 'Verified staging URL (same connection type)'
  $env:PRODUCTION_DATABASE_URL = Read-PrivateDatabaseUrl 'Verified NEW production URL'
  node backend/scripts/compareDatabaseTargets.cjs
  $comparisonExitCode = $LASTEXITCODE
  # Review only the fixed output and booleans. Exit 0 still requires owner identity attestation.
} finally {
  Remove-Item Env:STAGING_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PRODUCTION_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Function:Read-PrivateDatabaseUrl -ErrorAction SilentlyContinue
}
```

Expected valid distinct candidates: both URL_VALID=true, SAME_DATABASE_IDENTITY=false, DATABASES_DISTINCT=true, status=PASS. The `comparison` object has only eight booleans and may be copied to the safe metadata snapshot. Do not copy input URLs. Nonzero exit, invalid URL or SAME_DATABASE_IDENTITY=true means STOP.

HOST_EQUAL/PORT_EQUAL/DATABASE_EQUAL/USER_EQUAL compare parsed characteristics. SAME_DATABASE_IDENTITY uses host+effective port+decoded database, **ignoring user/password**: alternate credentials do not create a different DB. PostgreSQL default port is 5432; omitted/explicit default, normalized host case/trailing dot and equivalent IP spelling compare consistently. Database/user case is preserved; percent encoding is decoded. Different usernames alone block as the same DB. Password values are not compared or retained. DATABASES_DISTINCT means distinct parsed endpoint/database candidates only, not proven distinct remote servers or owner resources. Invalid URL flags make distinctness false; false equality flags in that case are not evidence.

## Phase 5 — temporary safe snapshot and canonical attestations

Copy `PRODUCTION_DATABASE_OWNER_SNAPSHOT.example.json` into an owner-controlled local location **outside the repository**. Keep the tracked example at false/null. It is metadata only; checker rejects extra fields and raw values. It accepts UTF-8 JSON (including a PowerShell UTF-8 BOM), at most 16 KiB, regular file only, no symlink path.

1. Keep schemaVersion=1, environment=production and the two reviewed logical service labels. These are project metadata, not database names parsed from URLs. If the actual intended staging label differs, STOP for a reviewed metadata contract update; never relabel a resource to bypass the gate.
2. Set productionDatabaseCreated=true only after manual provisioning. Copy only the helper's eight-boolean `comparison` object from the reviewed same-type pair.
3. Independently review resource ownership, intended identity and distinctness in the Render workspace. Both endpoints of the new resource must refer to that resource; a helper PASS alone is insufficient.
4. Replace null attestations only after that review with these existing 4B phrases (no new synonyms or boolean env attestations):

| Canonical 4B name | Exact phrase |
| --- | --- |
| STAGING_DATABASE_IDENTITY_ATTESTED | I_VERIFIED_STAGING_DATABASE_IDENTITY |
| PRODUCTION_DATABASE_IDENTITY_ATTESTED | I_VERIFIED_PRODUCTION_DATABASE_IDENTITY |
| DATABASES_CONFIRMED_DISTINCT | I_VERIFIED_STAGING_AND_PRODUCTION_DATABASES_ARE_DISTINCT |
| PRODUCTION_DATABASE_TARGET_ATTESTED | I_VERIFIED_SEPARATE_DURABLE_PRODUCTION_DATABASE |

5. Keep migrationAuthorized=false and migrationRun=false. Do not add PRODUCTION_MIGRATION_AUTHORIZATION or backup evidence to this narrow 4C.1 snapshot; future 4B migration gates still apply separately.
6. Run the offline companion checker using only the private **metadata file path**, never a URL argument:

```powershell
node backend/scripts/productionDatabaseProvisioningCheck.cjs --contract
# Replace the placeholder with the private METADATA file path, not a database URL:
node backend/scripts/productionDatabaseProvisioningCheck.cjs --snapshot '<private metadata JSON path>'
```

Without arguments it checks the safe example and must BLOCK at NOT_PROVISIONED. A fully attested, consistent snapshot may PASS only at READ_ONLY_INSPECTION_PENDING, with databaseState=NOT_QUERIED and emptyDatabase=NOT_VERIFIED. The checker does not persist/export env vars or remotely verify the snapshot. False/forged/stale assertions cannot prove resources exist; repeat private review after identity/config changes. Keep the snapshot temporary/local, not Render runtime or frontend configuration.

This companion calls the unchanged 4B **plan** gate and imports the canonical four 4B attestation values. It deliberately does not require a backend build/receipt or authorize the later full 4B snapshot/migration workflow. 4B default and --migration-readiness requirements remain unchanged; a 4C.1 PASS cannot replace them.

## Phase 6 — future read-only inspection (separate authorization, NOT RUN)

**Stop at INSPECTION_PENDING in the current handoff.** The following is prepared for a later explicitly authorized owner inspection after provisioning/identity review. Do not run it as part of Codex scope A or automatically after a checker PASS.

Audit of existing 3Y tools: `dbInventory.cjs` uses a read-only transaction but emits the actual database name and inspects only public schema application inventory; keep any use/output private. `dbSchemaCheck.cjs` checks the fully migrated expected schema and therefore should fail on a new unmigrated DB. Neither result alone proves an empty new target. Do not run restoreGuard/assertEmpty through dbRestore: restore execution is prohibited. No 3Y semantics are changed.

After separate approval, owner may use a private administrative SQL session to the reviewed **production External** target with verified TLS, bounded timeouts, startup scripts disabled and read-only transactions. Do not use an app startup or migration client. Connection configuration/credentials must remain outside command arguments, history and shared output. Inspect actual target identity privately before SQL; never change DATABASE_URL or link staging. On any certificate/permission/identity failure STOP; do not downgrade or grant privileges to force a successful inspection.

Prepared SQL (not executed here):

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '3s';

SELECT current_setting('transaction_read_only') = 'on' AS read_only,
       current_schema() = 'public' AS current_schema_is_public;

SELECT count(*) AS non_system_schema_count,
       count(*) FILTER (WHERE nspname <> 'public') AS non_public_schema_count
FROM pg_catalog.pg_namespace
WHERE nspname <> 'information_schema' AND nspname !~ '^pg_';

SELECT count(*) FILTER (WHERE c.relkind IN ('r','p','f')) AS user_table_count,
       count(*) AS user_relation_count,
       count(*) FILTER (WHERE c.relname = '_migrations') AS migration_ledger_object_count
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_';

SELECT count(*) AS non_extension_routine_count
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d
    WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e');

SELECT count(*) AS non_extension_type_count
FROM pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
  AND t.typrelid = 0 AND t.typelem = 0
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d
    WHERE d.classid = 'pg_catalog.pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e');

SELECT count(*) FILTER (WHERE extname <> 'plpgsql') AS additional_extension_count
FROM pg_catalog.pg_extension;
SELECT count(*) AS event_trigger_count FROM pg_catalog.pg_event_trigger;
SELECT count(*) AS foreign_server_count FROM pg_catalog.pg_foreign_server;
SELECT count(*) AS publication_count FROM pg_catalog.pg_publication;
SELECT count(*) AS subscription_count FROM pg_catalog.pg_subscription;
SELECT count(*) AS large_object_count FROM pg_catalog.pg_largeobject_metadata;
ROLLBACK;
```

Expected ordinary fresh target: read_only=true, current_schema_is_public=true; one non-system schema (public), no other schemas, tables/relations/ledger, non-extension routines/types, event triggers, foreign servers, publications/subscriptions or large objects. Provider-managed extensions/objects may differ: any nonzero/unexpected result requires private inventory review and STOP, not deletion, reset or a fabricated empty PASS. Zero tables alone is insufficient. If catalog visibility/permissions are incomplete, emptiness remains UNVERIFIED. Counts are a bounded catalog check, not a forensic proof of all possible state; independently review extension/provider baseline and role visibility. Never paste arbitrary object definitions, rows, connection details or error messages into the report. If privately investigating a flagged object, keep its actual names/definitions outside tracked evidence.

If a command fails, roll back/close the session and do not proceed. Do not create a migration ledger to test absence. Do not run SELECT functions with application side effects, nextval, DDL, DML, seed, restore or application smoke writes. No inspection result is set by the offline checker. After any separately authorized inspection, return evidence to the owner review process; this 4C.1 gate does not advance beyond INSPECTION_PENDING.

## TLS/SSL plan — no changes in 4C.1

| Connection purpose | Existing contract and boundary |
| --- | --- |
| Future application Internal connection | database.js supports disable or verify-full; a URL defaults to verify-full with rejectUnauthorized=true. Optional trusted CA path is supported. The existing 3Z.1 local preflight exception for disable requires independently matching the intended Internal URL and its exact owner attestation. It does not change runtime TLS or prove that disabling TLS is appropriate for this future resource. Do not carry a staging exception forward automatically. |
| Future owner External administration | Use verified TLS/hostname identity. 3Y inventory/inspect requires verify-full for non-loopback targets; optional DB_SSL_CA_PATH is read privately. Review the provider's current certificate chain and trusted CA before connecting; compatibility is not established by offline parsing. |
| Source backup-only historical exception | 3Y pg_dump has a narrowly attested require exception (encrypted without certificate identity verification). It does not apply to inventory, restore, runtime or this inspection. No backup is run in 4C.1. |

Runtime rejects unsupported require and URL SSL query overrides. 3Y has its own stricter URL/no-query policy. The compare helper is identity syntax only and neither evaluates nor changes actual TLS. Never disable certificate validation globally or silently downgrade to resolve an error; missing trust/compatibility evidence is a STOP. Internal vs External is owner-reviewed connection metadata, not a hostname classifier.

## State model and phase 7 — STOP

| State | Evidence/transition |
| --- | --- |
| NOT_PROVISIONED | Default example; BLOCKED. No resource creation claim. |
| PROVISIONED_UNVERIFIED | Owner says created, but identity/comparison/distinctness evidence incomplete; BLOCKED. Collision also blocks here. |
| PROVISIONED_DISTINCTNESS_VERIFIED | Both canonical identity assertions, valid distinct candidate comparison and independent owner distinctness assertion; missing target still BLOCKED. This is owner-reported, not remote attestation by the tool. |
| TARGET_ATTESTED | Canonical 4B production target assertion added. |
| READ_ONLY_INSPECTION_PENDING | Highest 4C.1 PASS; stop here. No emptiness/migration/deploy authorization. |
| READY_FOR_MIGRATION_AUTHORIZATION | Future scope only, after reviewed real inspection and recovery prerequisites. Not produced by this checker. |
| MIGRATION_AUTHORIZED | Future separate owner authorization. 4C.1 snapshot true is BLOCKED_OUT_OF_SCOPE. |
| MIGRATED | Future separately authorized execution and verified ledger. 4C.1 migrationRun=true is BLOCKED_OUT_OF_SCOPE, even if authorization also true. |

Malformed/inconsistent/secret-bearing snapshots BLOCK as INVALID_SNAPSHOT. A copied boolean transcript is not cryptographic evidence. PASS means only that the supplied safe assertions and repository plan satisfy the pre-migration contract.

**STOP:** leave the new DB unlinked and unmigrated. Do not configure backend DATABASE_URL, deploy backend/frontend, run migrations/backup/restore or touch staging. Owner and ChatGPT coordinate manual provisioning separately; a later inspection, migration authorization and deployment require separate scopes.
