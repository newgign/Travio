# Sprint 7M.3C — Render Internal TLS Migration Guard

SPRINT 7M.3C — CODE/OFFLINE: PASS. Render internal TLS contract READY in tested code scope. Runtime TLS acceptance NOT RUN. Migration phase NOT RUN. NEXT OWNER PHASE: NORMAL TLS REQUIRE DEPLOY — NOT MIGRATION.

## Baseline and infrastructure evidence

2026-10-10, Asia/Qyzylorda. develop; tracked tree clean at start. HEAD `90f6167 docs: record Sprint 7M.3B.3 verified staging backup`; previous `086fa3e feat: add verified backup finalization and restore proof`, `96b5ae1 docs: record Sprint 7M.3B.2 archive verification fix`. Unrelated untracked owner files preserved. All changes unstaged; no git add/commit/push.

Owner confirms staging backend uses Render INTERNAL Database URL. Owner-supplied infrastructure contract states internal TLS certificates are self-signed, verify-ca/verify-full unsupported, and require is supported. No independent infrastructure/network verification was performed here. Former remote-only verify-full guard correctly stopped execution before connection, but did not support this operator-confirmed internal target. Owner reports ledger POST-021/PRE-022, verified backup/local restore, enforcement and reconciliation/Admin datasource OFF. These live facts were not rechecked remotely.

## Narrow explicit contract

New shared helper `backend/config/renderInternalTls.cjs` permits require only with all of:

```text
APP_ENV=staging
EXPECTED_APP_ENV=staging
DB_SSL_MODE=require
RENDER_INTERNAL_TLS_REQUIRE_APPROVAL=I_APPROVE_RENDER_INTERNAL_TLS_REQUIRE_FOR_VERIFIED_STAGING_TARGET
BACKUP_RESTORE_READY_ATTESTED=I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET
RECONCILIATION_EXPECTED_DB_IDENTITY=<valid preverified configured target fingerprint>
SESSION_SECURITY_EXPECTED_DB_IDENTITY=<same fingerprint>
SESSION_STATE_ENFORCEMENT=disabled
RECONCILIATION_STORAGE_MODE=disabled
```

Existing default-disabled semantics are retained for enforcement/storage/commercial flags. Both fingerprints must be identical lowercase 64-hex and match configured host/port/database. URL must pass strict PostgreSQL target validation, have no query/hash, and be non-loopback. DB_SSL_CA_PATH must be absent for this path; global NODE_TLS_REJECT_UNAUTHORIZED=0 rejected. Commercial sales/charges/refunds/Hotelbeds booking flags remain false or absent; payments disabled/none. Production APP_ENV/EXPECTED_APP_ENV rejected. No classification based on NODE_ENV, hostname substring or suffix. The operator is the authority for internal network provenance; any operator falsely attesting an arbitrary target is outside the guarantee. Generic unapproved remote require remains blocked.

Fingerprint hashing is byte-compatible with existing sourceIdentity. It is a configured target binding, not a database/server certificate proof. Hostname is included: an external URL fingerprint cannot automatically be reused for the internal URL. Owner must supply the previously verified fingerprint for the actual configured internal target; do not manufacture trust by computing and approving an unverified new target hash during deploy.

## Runtime and guard implementation

databaseConfig validates the contract before accepting require and returns SSL object `{ rejectUnauthorized: false }` only for that path. TLS encryption YES; plaintext fallback NO; certificate identity verification NO. Installed pg connection code negotiates TLS and terminates on server response N; a mock-stream regression proves no plaintext continuation. This is not equivalent to verify-full. Private Render networking is an infrastructure assumption, not cryptographic identity. No TLS handshake or live connectivity acceptance claimed.

General continuity connection() remains unchanged: remote verify-full only. sourceIdentity delegates to the shared hash helper without changing output. Reconciliation migration guard selects approvedTarget only for require; all original integrity, environment, backup, migration approval and enable checks remain mandatory. Session guard inherits the path through reconciliation and still independently checks 022 integrity, enablement, acknowledgement, matching identities and enforcement OFF. Its source needs no direct change.

Migration additionally requires:

```text
RECONCILIATION_STORAGE_MIGRATION_ENABLED=true
SESSION_SECURITY_MIGRATION_ENABLED=true
RECONCILIATION_MIGRATION_APPROVAL=I_APPROVE_021_FOR_VERIFIED_TARGET
SESSION_SECURITY_MIGRATION_APPROVAL=I_APPROVE_022_WITH_ORDERED_PENDING_MIGRATIONS
```

These migration flags/approvals are deliberately NOT prerequisites for normal runtime TLS. Thus runtime can be validated first with migrations OFF. Preproduction DATABASE_URL check recognizes only the require config already validated by databaseConfig; its existing owner-attested legacy disable handling is unchanged. Backup-only require uses its separate DB_ALLOW_TLS_REQUIRE acknowledgement and original target binding; not merged with the new approval. Backup binding regressions PASS.

## Mandatory owner rollout and rollback

1. Deploy this patch with both migration flags false and normal Build Command `npm --prefix backend ci --omit=dev`. Keep current URL and all application gates unchanged. Do not run migration in this first patch deploy.
2. After confirming the internal configured target fingerprint and valid backup/restore attestation, set require plus the explicit internal acknowledgement and runtime contract above. Keep migration flags false and migration approval variables absent. DB_SSL_CA_PATH absent; no global TLS bypass.
3. Perform normal backend deploy using only `npm --prefix backend ci --omit=dev`; Start Command unchanged. Verify `/health` and `/api/health/ready`, including existing readiness requirements. A passing process liveness alone is not proof of DB connectivity.
4. Only after runtime TLS PASS and separate owner approval proceed to controlled migration deploy: enable both migration flags and exact migration approvals above; use `npm --prefix backend ci --omit=dev && npm --prefix backend run migrate`. Guard checks precede pool construction; runner still processes the whole pending set, not an isolated 022 selector. With authoritative ledger unchanged, 001–021 already applied and only 022 applies.
5. Restore normal Build Command immediately after the controlled attempt; set both migration flags false and remove migration-specific approvals. Keep the internal TLS contract/backup attestation/fingerprint values required by runtime. Enforcement, reconciliation runtime and Admin datasource stay OFF. No Phase B approval follows from this patch.

On TLS runtime failure stop before migration. Roll back to the previous known-working application/config under owner control; do not add automatic plaintext fallback or globally disable certificate verification. A rollback to previous disable config is a documented reduction in transport protection, not a secure acceptance. Preserve additive schema and backups; no drop, restore or migration retry is automatic. This patch deliberately blocks enabling session enforcement on the require contract; a future separately reviewed rollout must address that condition before Phase B.

## Verification

Final-source focused/adjacent invocation once: **159/159 PASS**, comprising **29/29 new tests** plus **130/130 adjacent** across reconciliationMigrationActivationGuard, sessionSecuritySchema, databaseContinuity, stagingDeployment, preProductionReadiness and backupTargetBinding. Tests trap real pg connect/query, socket/TLS connect and subprocess spawn. Valid migration contract reaches only an injected pool.connect that throws before any SQL. Invalid contracts never reach pool or migration activity. Cases cover absent/wrong approval, backup-only approval isolation, fingerprints, production/wrong environments, backup/enforcement/storage/charge gates, URL override, CA ambiguity, TLS bypass, general remote verify-full/local behavior, runtime-first and installed pg TLS refusal. No assertion weakened.

Full backend once after final runtime source: **1280/1294 PASS**, fail14, cancelled/skipped0, exit1. Four explicit real-DB integration files excluded by `.integration.test.`: hotelbedsCatalog, priceHistory, stagingMigrations, sessionSecurity. Known DB-blocked14: hotelbedsAccess1, hotelbedsCatalogPlan1, hotelbedsContent3, hotelbedsMultiDestination1, hotelbedsPublicSearch1, hotelbedsStagingTest6, stagingAcceptance1. Unexpected failures0. Safety preload prevents actual pg Pool/Client queries/connections and external HTTPS; blocked test attempts are not real connections. Full backend PASS not claimed.

Release checks once: verifier PASS (279 syntax files, 588 secret-scan files, findings empty); 6A PASS; 021 preflight PASS disabled/safe; 022 preflight PASS execution/enforcement disabled; diff-check PASS. Frontend unchanged, no frontend build/tests. Evidence: `.tmp/sprint7m3c-focused.log`, `sprint7m3c-backend.log`, `sprint7m3c-verifier.log`, `sprint7m3c-6a.log`, `sprint7m3c-021.log`, `sprint7m3c-022.log`; existing `.tmp/sprint7k2-offline.cjs` preload reused unchanged.

## Exact files and safety totals

Modified:

- backend/config/database.js
- backend/scripts/lib/dbContinuity.cjs
- backend/scripts/lib/reconciliationMigrationGuard.cjs
- backend/scripts/preProductionCheck.cjs
- SPRINT_7M3_STAGING_SESSION_SECURITY_ROLLOUT_REPORT.md

New:

- backend/config/renderInternalTls.cjs
- backend/tests/renderInternalTls.test.cjs
- SPRINT_7M3C_RENDER_INTERNAL_TLS_MIGRATION_GUARD_REPORT.md

Remote DB connections0; migration executions0; 022 executed NO; staging schema changed NO. No backup, restore, Render changes/deploy, production access, enforcement activation, PSP/Hotelbeds operation or money action. No secrets/URLs/credentials printed. Runtime DB require support READY in code only; production/security certification and commercial readiness not claimed.
