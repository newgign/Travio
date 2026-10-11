# Sprint 7Z-B — Migration 023 Staging Rollout Plan

2026-10-11. **TOOLING STAGING PATH READY — not published or executed.** Based on origin/develop7a683ca on sprint-7za-tooling. Local7Y fae6af3 is not an ancestor, and no7Y runtime file is included. This task continues the existing unstaged7Z-A.1 tooling diff; it does not merge/cherry-pick another revision. [Implementation report](SPRINT_7ZA1_STAGING_MIGRATION_TOOLING_REPORT.md) records the design and exact file list.

## A. Revision and owner prerequisites

**Required revision:** the immutable migration-tooling-only commit created at completion of7Z-B on sprint-7za-tooling, based on7a683ca and excluding7Y. Its full hash is supplied in the task completion response/Git metadata; pin that hash, never a moving branch alone. **Do not execute this procedure on unchanged7a683ca**. Before a future rollout, separately publish and record that full tooling commit and confirm Render deploy details select exactly it. Do not use local7Y fae6af3, merge it, or push develop with7Y included. No git push/deployment is performed in this task.

Existing manually created service: asedeliya-staging-api. No Blueprint, Shell, new service/database or frontend deploy required. Confirm actual dashboard Build/Start settings; checked-in render.yaml does not reconcile a manual service. Retain repository-root checkout layout so database/migrations is available.

Owner must privately reconfirm the actual staging target,001–022 applied/023 pending, matching verified backup and restore evidence, accepted secure TLS and disabled commercial/reconciliation/Admin runtime. Do not send credentials or connection details. This task neither refreshes backup evidence nor queries staging.

## B. Exact authorization

The old blocker was assertLocalExecutionAllowed() being mandatory even after legacy021/022 approval. The new staging path uses the same runner, with separate narrow configuration/target checks before connect and exact ledger checks under advisory lock before migration SQL. No generic run-anywhere switch.

| Variable | Normal | Temporary023 rollout | Restore |
| --- | --- | --- | --- |
| DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED | false/absent | true | false |
| DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL | absent | I_APPROVE_023_FOR_VERIFIED_STAGING_TARGET | remove |
| DURABLE_COMMERCIAL_OPERATIONS_EXPECTED_DB_IDENTITY | privately establish verified target binding | equal to the verified RECONCILIATION_EXPECTED_DB_IDENTITY for this actual connection | retain binding |
| APP_ENV / EXPECTED_APP_ENV | staging / staging | unchanged | unchanged |
| NODE_ENV | production | production | production |
| RECONCILIATION_STORAGE_MIGRATION_ENABLED | false | false | false |
| SESSION_SECURITY_MIGRATION_ENABLED | false | false | false |
| SESSION_STATE_ENFORCEMENT | accepted runtime mode | unchanged | unchanged |
| RECONCILIATION_STORAGE_MODE | disabled | disabled | disabled |
| PRODUCTION_SALES_ENABLED / REAL_CHARGES_ENABLED / REAL_REFUNDS_ENABLED | false / false / false | unchanged | unchanged |
| HOTELBEDS_BOOKING_ENABLED / HOTELBEDS_LIVE_BOOKING_ENABLED | false / false | unchanged | unchanged |
| PAYMENTS_MODE / PAYMENTS_PROVIDER | disabled / none | unchanged | unchanged |
| LOCAL_COMMERCIAL_MIGRATION_APPROVAL | absent | absent | absent |

Required existing backup attestation: BACKUP_RESTORE_READY_ATTESTED=I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET. The new fingerprint must match the existing privately verified target; internal/external connection identities are not interchangeable.

TLS stays at the accepted secure setting. verify-full uses existing certificate trust and CA readability rules. require is allowed only through the existing explicit Render internal contract: RENDER_INTERNAL_TLS_REQUIRE_APPROVAL=I_APPROVE_RENDER_INTERNAL_TLS_REQUIRE_FOR_VERIFIED_STAGING_TARGET; existing reconciliation/session fingerprints match the actual target; DB_SSL_CA_PATH absent; backup attestation present; commercial/storage off. NODE_TLS_REJECT_UNAUTHORIZED=0 forbidden. No generic verification bypass is added. Do not disable session enforcement or re-enable021/022 flags to authorize023.

## C. Commands — future authorized sprint only

Exact migration command, from repository root:

```sh
npm --prefix backend run migrate
```

Temporary Build Command on the **published tooling revision**:

```sh
npm --prefix backend ci --omit=dev && npm --prefix backend run migrate
```

Normal Build Command to restore:

```sh
npm --prefix backend ci --omit=dev
```

Unchanged Start Command:

```sh
npm --prefix backend start
```

No errors swallowed; failed install or migration produces a failed build. No raw SQL, manual ledger update or migration in Start Command.

## D. Future owner sequence

1. Separately review/commit/publish only tooling/tests/docs based on7a683ca. Record exact commit and prove7Y excluded remotely; do not publish7Y.
2. Confirm existing backend normal deployment remains healthy if publication triggers one. No frontend action.
3. Privately reconfirm identity, ledger baseline and backup/restore evidence. Configure new target binding and explicit temporary023 authorization above; keep old migration flags false and all commercial gates off.
4. Prepare temporary Build Command and env as one controlled change; avoid an unintended intermediate deploy. Verify saved settings, then manually deploy the exact approved tooling commit on the existing service.
5. Capture success evidence below. Stop on any unexpected migration or error.
6. Restore normal Build Command, set023 flag=false and remove temporary023 approval. Keep target binding and accepted TLS/session settings. No021/022 flag needs restoration because neither was enabled.
7. Successful migration build proceeds to unchanged Start Command. If restoring settings requires a normal deploy/restart, confirm exact approved commit, normal Build Command and disabled migration flags first; do not repeat a migration build blindly.
8. Owner checks backend LIVE, /health200, /api/health/ready ready/database.ok=true, normal login/admin/search PASS. Commercial operations stay disabled. No booking, payment, cancellation, refund or limiter exhaustion.
9. Document actual staging ledger/catalog acceptance in a later acceptance step. Do not automatically push/deploy7Y after migration.

## E. Success and STOP markers

Expected safe log markers:

```text
✓ 021_reconciliation_storage.sql already applied
✓ 022_session_security_state.sql already applied
→ applying 023_durable_commercial_operations.sql
✓ 023_durable_commercial_operations.sql applied
✓ Travio database is up to date
```

001–020 should also be already applied.023 applied marker follows COMMIT of SQL and ledger INSERT. Applying alone does not prove commit. Expected exit0; only023 newly applied. Rerun after023 with flag=false and removed temporary approval performs read-only ledger/skips, no destructive reapply; target/TLS binding still required. Default pending023 remains blocked.

STOP: DURABLE_COMMERCIAL_MIGRATION_BLOCKED or other guard rejection, checksum/inventory mismatch, missing/duplicate/unknown ledger entry, missing022, unexpected024, SQL/constraint/connection/TLS failure, rollback, nonzero exit, ambiguous commit or wrong deployed revision. No blind retry, manual ledger insertion, partial SQL,023 edit, schema drops or7Y push.

## F. Schema verification scope

Runner acquires advisory lock319003 and validates exactly001–022 or001–023 in existing public._migrations before executing migration SQL. Missing ledger is blocked, not auto-created on staging. Only023 can be pending; SQL plus ledger share one transaction, with rollback on failure. Default source checks never prove actual DB state.

Offline command:

```sh
node backend/scripts/durableCommercialOperationsMigrationPreflight.cjs
```

With explicit temporary authorization it validates configuration/source only, reports executionAllowed=false and pendingState=NOT_QUERIED. It never connects. Default offline disabled-mode checks may differ from active staging session settings; do not change live session policy merely for an offline PASS.

Existing independently guarded future owner read-only ledger command:

```sh
node backend/scripts/stagingMigrationInventory.cjs --staging-read-only
```

This is NOT executed here. It requires a separate safely configured operator process (NODE_ENV=test, APP_ENV/EXPECTED_APP_ENV=staging, private verified target identity/URL, disabled commercial gates and verify-full trust). It cannot reuse the Render-internal require exception; solve operator trust without disabling verification. Desired future result: expectedTargetMatch=true,23 applied,023 once,pending empty. This verifies ledger history, not every trigger/function body. Any further schema/catalog acceptance must explicitly state its scope; do not inspect customer rows or infer success from /health alone.

## G. Rollback and boundaries

Before confirmed commit: migration FAILED or UNKNOWN; safely verify ledger before retry. After proven023 commit but unhealthy application: SCHEMA SUCCEEDED / APPLICATION FAILED. Preferred rollback **CODE ROLLBACK / SCHEMA PRESERVED**; do not drop durable tables or restore automatically.023 is additive/inert, with no backfill or startup operation creation; old7X runtime remains expected-compatible. Historical adoption DATA AUDIT REQUIRED, deferred.

Current result: staging tooling READY in local source; publication/actual staging schema acceptance OPEN. Migration023 unchanged;024 NONE;7Y excluded. Staging connections0,staging mutations0,remote migration0,Render/build/start/env changes0,frontend0,Hotelbeds0,PSP0,money0. No staging success claimed.
