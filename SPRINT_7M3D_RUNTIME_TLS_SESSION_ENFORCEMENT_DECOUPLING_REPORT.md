# Sprint 7M.3D — Runtime TLS / Session Enforcement Decoupling

SPRINT 7M.3D — CODE/OFFLINE: PASS. Runtime TLS and session enforcement decoupled. Phase B staging acceptance PENDING; no live acceptance performed here.

## Baseline and authoritative state

2026-10-10, Asia/Qyzylorda. develop; tracked tree clean at start. HEAD `a3593f9 docs: record Sprint 7M.3C Render internal TLS hardening`; prior `393c213 fix: support verified Render internal TLS contract`, `90f6167 docs: record Sprint 7M.3B.3 verified staging backup`. Unrelated untracked owner files preserved. No git add/commit/push.

Owner confirms staging ledger 001–022 APPLIED, including 022; verified backup/local restore evidence; healthy internal require runtime with enforcement disabled; migration flags OFF and normal Build Command restored. Changing only enforcement to enabled produced RENDER_INTERNAL_TLS_BLOCKED before connection. These infrastructure facts are owner evidence, not a remote recheck by this task.

## Root cause and exact fix

7M.3C shared approvedTarget() required enforcementMode(env) === disabled. databaseConfig calls this helper for runtime require, so valid session enforcement activation rejected runtime TLS configuration before DB connection. That migration-time safety requirement was incorrectly applied to normal runtime.

Removed only the enforcement OFF condition from the shared TLS helper. Reconciliation storage/commercial gates and every target/TLS approval requirement remain unchanged. Added an explicit enforcementMode(env) OFF check directly at the start of reconciliation migration execution authorization, including its local integration branch. Session migration guard retains its own existing OFF check and calls reconciliation first. Consequently both guard entrypoints reject enabled/invalid enforcement before pool/SQL. Session config validation is unchanged: disabled/enabled valid; invalid values still raise SESSION_SECURITY_CONFIG_INVALID through the existing session config contract. Auth/session flow is not redesigned.

Normal require runtime accepts disabled or enabled with the full existing Render internal staging contract. TLS remains enabled with rejectUnauthorized=false only after explicit approval, exact configured target fingerprint matching and all existing contract checks. General continuity remote require/disable still blocked; verify-full and localhost behavior unchanged. No generic remote require relaxation, no global certificate bypass, no plaintext fallback. Certificate identity verification for approved internal require remains NO; configured target binding YES. Operator internal-network provenance remains an infrastructure assumption.

Migration safety remains distinct from runtime: enforcement must be OFF even if schema is already applied. In the enabled case reconciliation rejects first with RECONCILIATION_MIGRATION_BLOCKED, and the session guard propagates that failure. Both guards retain migration-specific approvals, enable flags, integrity and identity requirements. No migration runner CLI or SQL execution was used in this sprint.

## Tests and release checks

One final-source focused/adjacent invocation: **147/147 PASS**, comprising **32/32 renderInternalTls focused cases** and **115/115 adjacent** across reconciliationMigrationActivationGuard, sessionSecuritySchema, databaseContinuity, stagingDeployment and preProductionReadiness.

Split the former incorrect runtime-enforcement rejection into runtime disabled/enabled success cases with migration flags OFF. Added both migration guard rejection under require and verify-full, runner rejection before pool.connect with query count0, enabled-mode missing/wrong approval and missing/wrong fingerprint checks, and unchanged invalid enforcement validation. Existing exact migration contract reaches only injected pool.connect that throws before any SQL. Real pg, socket/TLS connect and subprocess calls trapped by focused suite. Existing no-plaintext-fallback pg mock-stream case retained. Other approval, production, changed target, loopback, URL TLS override, CA and global TLS bypass cases retained.

Full backend once after final runtime source: **1283/1297 PASS**, failures14, cancelled/skipped0, exit1. Known DB-blocked14: hotelbedsAccess1, hotelbedsCatalogPlan1, hotelbedsContent3, hotelbedsMultiDestination1, hotelbedsPublicSearch1, hotelbedsStagingTest6, stagingAcceptance1. Unexpected failures0. Four explicit real-DB integration files excluded: hotelbedsCatalog.integration, priceHistory.integration, stagingMigrations.integration, sessionSecurity.integration. Existing safety preload blocks real pg Pool/Client connect/query and external HTTPS. Blocked DB attempts are not actual connections. Full backend PASS not claimed; aggregate not rerun.

Release checks once: verifier PASS (279 backend syntax files, 589 secret-scan files, findings empty); 6A PASS; reconciliation 021 preflight PASS disabled/safe; session 022 preflight PASS execution/enforcement disabled; diff-check PASS. No frontend changes/tests/build. Evidence: `.tmp/sprint7m3d-focused.log`, `.tmp/sprint7m3d-backend.log`, `.tmp/sprint7m3d-verifier.log`, `.tmp/sprint7m3d-6a.log`, `.tmp/sprint7m3d-021.log`, `.tmp/sprint7m3d-022.log`; existing `.tmp/sprint7k2-offline.cjs` safety preload reused unchanged.

## Owner next phase and rollback

NEXT OWNER PHASE: NORMAL DEPLOY WITH ENFORCEMENT DISABLED, THEN ENABLE ENFORCEMENT.

1. Deploy the reviewed patch with SESSION_STATE_ENFORCEMENT=disabled, both migration flags OFF and normal Build Command `npm --prefix backend ci --omit=dev`. Keep existing internal URL/TLS acknowledgement/target bindings/backup attestation and commercial/reconciliation/Admin gates unchanged. No migrate command.
2. Verify `/health` and `/api/health/ready` after normal deployment. Only after healthy runtime, owner enables enforcement and performs a second normal deploy with migration flags still OFF.
3. Verify health/readiness, fresh login/profile, old-session rejection and normal/admin authorization under the existing Phase B runbook. No tokens/PII printed. Phase B acceptance remains pending until owner evidence is obtained.

If enabled runtime/auth acceptance fails, owner returns enforcement to disabled and redeploys the known-working normal configuration; no migration retry, schema rollback or automatic restore. This availability rollback restores legacy JWT behavior and reduces session security until the issue is resolved. Preserve additive schema and verified backup. No deployment or activation performed by this task.

## Exact files and safety totals

Modified:

- backend/config/renderInternalTls.cjs
- backend/scripts/lib/reconciliationMigrationGuard.cjs
- backend/tests/renderInternalTls.test.cjs
- SPRINT_7M3_STAGING_SESSION_SECURITY_ROLLOUT_REPORT.md

New:

- SPRINT_7M3D_RUNTIME_TLS_SESSION_ENFORCEMENT_DECOUPLING_REPORT.md

database.js, sessionSecurity.js and sessionSecurityMigrationGuard.cjs require no change. No dependencies or schema changes. 022 already applied YES (owner evidence); executed here NO. Remote DB connections0; migration executions0; DB/schema changed in 7M.3D NO; Render changes0; deploy0; session enforcement activation0; PSP/Hotelbeds/money operations0. All work unstaged; unrelated owner files untouched.
