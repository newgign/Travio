# Sprint 7R.1 — Residual PII Exposure Hardening

## Sprint 7R.2 — current owner staging acceptance

2026-10-10. Authoritative owner confirms combined7R+7R.1 staging backend deployment LIVE; health/readiness PASS with database.ok=true; login/admin/profile/account/bookings PASS. PII code controls STAGING RUNTIME ACCEPTED; admin query PII logging and controlled redaction STAGING ACCEPTED in controlled application sinks. Normal owner activity showed no visible raw password/token/email/phone or request-body dump: NOT OBSERVED, not an exhaustive leakage guarantee. API response minimization PARTIAL; traveller/free-text residual risk DOCUMENTED. Platform logging/access not newly reviewed; retention OWNER POLICY REQUIRED, operational access evidence OPEN, legal/privacy compliance NOT CLAIMED. P1 PII CODE CONTROLS STAGING ACCEPTED; P1 PII OVERALL PARTIAL and remains open. Backup failure/metadata edge tests below remain offline evidence. Earlier acceptance-NOT-RUN statements describe7R.1 itself. See SPRINT_7R2_PII_STAGING_ACCEPTANCE_REPORT.md. No runtime/Render/deploy/DB action in this documentation task; COMMERCIAL PRODUCTION READY NO.

2026-10-10, Asia/Qyzylorda. CODE/OFFLINE PASS in tested scope. P1 PII CODE CONTROLS READY in controlled boundaries; P1 PII OVERALL PARTIAL. COMMERCIAL PRODUCTION READY NO. Legal/privacy compliance NOT CLAIMED.

## Baseline and original residual gaps

develop, HEAD `41c1727 feat: implement Sprint 7R PII operational controls`; tracked tree clean. Previous blocker resolved by owner commit; unrelated untracked owner files preserved. Inspected only7R-identified logger/metadata/telemetry/admin response/backup command paths, their direct consumers/helpers/tests and reports/checklist. No repeat whole-repository inventory or actual user/archive-content inspection.

7R gaps: admin GET q could contain PII; regex-shaped operational labels could retain arbitrary names/capabilities; generic event messages/free context could persist diagnostic text; historical admin metadata could be serialized; legacy backup CLI catch paths printed error.message and success summaries included absolute paths. Existing auth sessionStorage allowlisted profile is a justified consumer contract, not a newly discovered unexplained copy.

## Exact hardening

Admin query application logging RESOLVED: requestTelemetry already uses code route templates or /unmatched and omits query/body/auth headers/raw IP. Logger now also redacts q/query/queryString/search/searchValue/params and note/reason/description/details/context values recursively, even unrecognizable personal names. Existing admin GET filtering remains parameterized, page/limit behavior retained; no browser query endpoint redesign. Filter values still travel to the intended SQL filter, never to tested application telemetry. **Edge/proxy access logs can still receive GET q**; platform log configuration was not inspected/changed. Source-code controlled logging acceptance must not be mistaken for eliminating PII from HTTP URLs everywhere.

Operational metadata retains typed counters/flags and existing finite diagnostic labels; arbitrary identifier-shaped strings now dropped. Incident keys restricted to current reliability component families; failed-check strings restricted to known categories. Unknown nested keys/payloads not retained; existing entry/depth bounds remain. Internal callers must extend explicit vocabulary when a new diagnostic category is introduced; no generic debug passthrough. Numeric values are operationally typed, not a claim of semantic PII recognition.

System-event message storage uses a fixed label derived from known event code (HTTP status, slow request, health, backup, incident, self-test), or System event. Free supplied event text is no longer copied. Existing category/code/status/duration/correlation columns remain for operations. Historical event read projection likewise replaces arbitrary message text and filters metadata. No existing rows changed/deleted.

Incident title/summary/resolution are operational diagnostic prose required by the current incident UI, not a user-note ingestion API. Retained text gets control-character removal, maximum1000 characters (title255/resolution120 at response projection), secret/auth/email/international-phone redaction and structured JSON/object dump suppression. Plain business comments/refund reasons remain business records, not repurposed for generic diagnostics. No regex can recognize every personal name or unusual phone: unlabelled text limitation remains explicit. Logger diagnostics use the same layered bounds/redaction; safe fixed event/category/status correlation retained.

Admin action, event and incident read models explicitly project consumer-required fields, reduce legacy metadata through the finite helper and omit unknown/security/provider raw additions. Action actor display/email remains intentionally available to authorized admin UI; event user identity context and incident acknowledgement display remain existing authorized operational data. Safe projected diagnostic counters/flags remain, rather than raw internal objects. API response minimization overall PARTIAL, not an all-endpoint certification or a claim all operational fields removed. Incident acknowledgement mutation response and other pre-existing business mutation paths were not redesigned; normal auth/role/permissions remain server decisions.

Browser persistence NO CHANGE REQUIRED:7R inspection found accepted token+allowlisted user sessionStorage supporting profile restoration/editing; no unexplained traveller/contact/DOB/provider payload browser cache. No new email/phone copies, localStorage auth or capability persistence added. Frontend files unchanged. Existing active-token XSS exposure and profile-data storage policy remain documented7P boundaries.

Email/outbox NO CHANGE REQUIRED:7R content-free console logging and fixed EMAIL_DELIVERY_FAILED retained. Error objects suppress raw config/response; provider client logs fixed categories/status, not payload. No email/provider/PSP action. Business email content is not copied to diagnostic logs by this change.

## Backup diagnostic boundary

New backupDiagnostics helper never reads Error.message/code/stack/args/stdout/stderr/environment to construct failures. Legacy create/verify/restore/cleanup/scheduled command catch handlers print only fixed stage and BACKUP_*_FAILED, preserving nonzero failure behavior. No actual commands run in tests; VM injects synthetic failures/services. Summary helper allowlists booleans, nonnegative integer counts, fixed mode/release, validated ISO timestamp, checksum prefix and generated travio archive basename. Arbitrary basenames, absolute home paths, directory, row payloads/unknown fields are omitted. Restore/cleanup/scheduled no longer print entire result objects; create/verify summaries also project safe fields. No raw subprocess forwarding introduced; custom continuity tooling already classifies subprocess failures and remains unchanged.

Scope is handled operation failure/summary output. CLI module bootstrap/import failures are not a universal sanitized-process exception handler; platform/Node diagnostics and arbitrary dependency failures remain outside this helper. No application/public backup endpoint added. No archive contents opened, backup/retry/restore/cleanup/migration executed, retention or encryption settings changed.

## Intentional retained data and limitations

Required business/profile/admin contact display retained under existing ownership/admin checks. Numeric ids, request correlation, fixed status/permission categories, operational counters and incident prose remain useful. Historical DB rows are untouched; response projection is not data erasure. Generic free message content is bounded, not perfectly classified. Retention, deletion, backup/log/business-record periods and staff/DB/Render/operator ACL evidence remain OWNER POLICY REQUIRED / OPEN. No compliance or all-PII-removal claim.

## Exact files

Modified:

- backend/utils/logger.js
- backend/utils/operationalMetadata.js
- backend/controllers/adminOperationsController.js
- backend/services/systemEventService.js
- backend/services/incidentService.js
- backend/scripts/backupDatabase.js
- backend/scripts/verifyBackup.js
- backend/scripts/restoreDatabase.js
- backend/scripts/cleanupBackups.js
- backend/scripts/runScheduledBackup.js
- SECURITY_PRODUCTION_GAP_CHECKLIST.md
- SPRINT_7R_PII_OPERATIONAL_CONTROLS_REPORT.md

New:

- backend/utils/operationalPublic.js
- backend/scripts/lib/backupDiagnostics.cjs
- backend/tests/piiResidualHardening.test.cjs
- SPRINT_7R1_RESIDUAL_PII_HARDENING_REPORT.md

Everything unstaged; unrelated owner files untouched. No schema/dependency/frontend/config/Render change. No git add/commit/push. Evidence `.tmp/sprint7r1-*.log`, reused offline preload `.tmp/sprint7k2-offline.cjs`.

## Verification and acceptance

Focused **41/41 PASS**. Adjacent **207/207 PASS** on final source: piiOperationalControls,securityHardening,adminReconciliationReadApi,databaseContinuity,backupFinalize,backupTargetBinding,backupUniqueConstraint,sprint2m,sprint2j,sprint3a. An earlier development adjacent subset also passed before final system/read-model changes; only final invocation counts here. No assertion weakened. Coverage: controlled email/phone/name query omission, actual fake-executor filter/pagination, free-context suppression, finite metadata, controls/bounds/JSON dumps/credentials, fixed event messages, five legacy CLI paths with malicious synthetic errors in VM, basename/summary allowlists, admin projection and role checks. Tests do not run backup/restore/cleanup or inspect real archives.

Full backend **1588/1602 PASS**, one completed final-source invocation,74 files,14 known DB-blocked failures,cancelled/skipped0,unexpected unresolved0. Known blocked: hotelbedsAccess1,hotelbedsCatalogPlan1,hotelbedsContent3,hotelbedsMultiDestination1,hotelbedsPublicSearch1,hotelbedsStagingTest6,stagingAcceptance1. Four dedicated real-DB integration suites excluded: hotelbedsCatalog.integration,priceHistory.integration,stagingMigrations.integration,sessionSecurity.integration. Real pg Pool/Client calls and external HTTPS blocked by offline preload. Full backend PASS not claimed; aggregate not rerun.

Verifier **PASS**,293 backend syntax files,621 secret-scan files,findings empty.6A **PASS**.021 preflight **PASS**, DISABLED—SAFE.022 preflight **PASS**, local executionAllowed=false. Final diff-check **PASS**. Each release check once; local defaults are not staging configuration evidence. Frontend tests/lint/build NOT RUN: runtime unchanged. Remote DB connections0,migrations0,Hotelbeds0,PSP0,email send0,money0. Fake executors/local HTTP regression harnesses are not real DB/provider calls.

After eventual separately authorized deploy, owner checks LIVE/health/readiness/login/admin/profile/account/bookings and normal application logs for visible raw email/phone/name/body dumps using PRESENT/ABSENT only. Never paste PII-containing lines or secrets. Staging acceptance NOT RUN in this task; platform query logging/access policies remain open. P1 overall PARTIAL until owner/ops evidence exists; COMMERCIAL PRODUCTION READY NO.
