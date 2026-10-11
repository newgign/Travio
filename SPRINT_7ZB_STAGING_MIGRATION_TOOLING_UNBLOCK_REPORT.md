# Sprint 7Z-B — Staging Migration Tooling Unblock

2026-10-11. **PASS — tooling staging path READY; staging execution NOT RUN.** Started on sprint-7za-tooling, HEAD=origin/develop7a683ca. fae6af3 is not an ancestor. Existing uncommitted7Z-A.1 tooling diff reused rather than reset or recreated; no7Y runtime inspected/restored/merged/cherry-picked. An unused pre-existing untracked synthetic helper remains excluded.

## Root cause and staging design

Base runner requires assertLocalExecutionAllowed even after legacy021/022 approval, before pool construction/connect. That permits only explicit disposable7X loopback targets with test environment and injected pool. No staging settings could satisfy it. The new assertStagingConfiguration/assertStagingPool/assertStagingLedger path remains inside the same normal runner; no generic executor.

Pending023 requires DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED=true and DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL=I_APPROVE_023_FOR_VERIFIED_STAGING_TARGET, exact staging/expected-staging environment, production Node runtime mode, target fingerprint equality with DURABLE_COMMERCIAL_OPERATIONS_EXPECTED_DB_IDENTITY and verified reconciliation identity, existing backup/restore attestation, accepted TLS, disabled commercial/payment/storage gates and old021/022 flags false. Render presence/NODE_ENV alone never grants permission. Existing require TLS exception remains confined to the already approved Render-internal contract; verify-full remains supported. No shared runtime/TLS configuration source was changed.

Exact ledger metadata is checked under advisory lock before any staging mutation:001–022 plus only pending023, or001–023 already applied. Unknown/duplicate/missing baseline/checksum/inventory reject. Production/unknown environment/unknown target identity fail closed. SQL/ledger INSERT transaction and rollback preserved; safe error codes/nonzero CLI exits preserved. Applied023 with flag=false and temporary approval removed is read-only/up-to-date, not reapplication. No schema/backfill/024 or7Y changes.

## Tests and checks

Current combined relevant migration suite **266/266 PASS**, comprising **49/49 authorization/tooling** and **217/217 adjacent**. Two7Z-B additions explicitly reject unknown environment and unknown database before connecting. Adjacent suites: durableCommercialOperationsMigration, reconciliationMigrationDesign, reconciliationMigrationActivationGuard, sessionSecuritySchema, renderInternalTls, stagingDeployment, databaseContinuity, preProductionReadiness. This task reran the complete relevant offline suite; dedicated real-DB integration suites were not contacted.

Inherited7Z-A.1 real disposable-local regression **41/41 PASS**, on a new isolated loopback cluster using only synthetic rows; cluster already stopped. Not rerun unnecessarily in7Z-B because implementation source is unchanged since that proof. Full backend/frontend NOT RUN: migration tooling only, no commercial/shared-runtime change.

Current verifier **PASS** (305 backend syntax files,653 secret-scan files,findings empty);6A **PASS**;021/022/023 preflights **PASS**;final diff-check **PASS**. Migration diff versus7a683ca is empty; ordered001–023 inventory and pinned checksums PASS; no024. Preflights are offline, not proof of applied staging schema.

## Exact combined tooling revision files

Modified: backend/scripts/migrate.js; backend/scripts/lib/durableCommercialOperationsMigrationGuard.cjs; SECURITY_PRODUCTION_GAP_CHECKLIST.md; SPRINT_7X_MIGRATION_023_LOCAL_PROOF_REPORT.md.

New: backend/tests/durableCommercialOperationsStagingMigration.test.cjs; SPRINT_7ZA1_STAGING_MIGRATION_TOOLING_REPORT.md; SPRINT_7Z_STAGING_MIGRATION_023_ROLLOUT_PLAN.md; this report.

The earlier7Z-A.1 report retains its historical unstaged/no-commit evidence.7Z-B requests a tooling revision and commit hash, so the final reviewed combined change is committed separately from7Y; full resulting hash is supplied in the task completion response/Git metadata. No push to origin/develop is performed. Remote remains7a683ca until a separately authorized publication. No root package.json exists; backend scripts remain authority.

## Next sprint only

Use the immutable tooling commit reported at completion, after separately authorized publication and confirming7Y absent remotely; never use unchanged7a683ca expecting this fix. [Exact owner runbook](SPRINT_7Z_STAGING_MIGRATION_023_ROLLOUT_PLAN.md) includes target/backup/TLS prerequisites, authorization table, restoration, log markers, schema verification limits and code rollback with schema preserved.

Migration command: `npm --prefix backend run migrate`.

Future temporary Build Command: `npm --prefix backend ci --omit=dev && npm --prefix backend run migrate`.

Restore: `npm --prefix backend ci --omit=dev`; flag=false; remove temporary023 approval; retain identity binding and accepted runtime TLS/session settings. Start Command stays `npm --prefix backend start`. No Render setting is changed here. Expected success markers remain023 applied and Travio database up to date, after commit; no such staging evidence is claimed now.

Staging DB connections0; mutations0; remote migrations0; Render/runtime/env/frontend changes0; Hotelbeds/PSP/money0.023 staging execution NO;7Y included NO. P0/staging schema/external acceptance remain OPEN; commercial production ready NO.
