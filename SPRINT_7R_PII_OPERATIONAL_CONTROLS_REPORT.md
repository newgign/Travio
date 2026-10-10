# Sprint 7R — PII Operational Controls & Data Minimization

## Sprint 7R.1 continuation — current code boundary

7R.1 supersedes the identified raw legacy backup CLI error boundary and permissive operational-label handling. Controlled admin-query logging now additionally redacts query/free-context keys; existing route-template telemetry still omits values, with admin filtering preserved. Operational labels use a finite vocabulary rather than accepting arbitrary identifier-shaped strings. System-event messages are fixed categories; historical action/event/incident API data is projected/minimized. Free diagnostic incident text remains bounded/control-cleaned/credential-redacted, with no perfect PII detection claim. Legacy backup CLI failures use fixed stage/code and summary allowlists, without raw parser/subprocess/error text or absolute paths. SessionStorage profile contract remains justified and unchanged; platform query logging, historical stored content, retention and operational access remain owner/ops boundaries. See SPRINT_7R1_RESIDUAL_PII_HARDENING_REPORT.md for exact scope, tests and limitations. No deploy or staging acceptance performed by7R.1.

2026-10-10, Asia/Qyzylorda. CODE/OFFLINE PASS in tested scope. P1 PII OPERATIONAL CONTROLS FOUNDATION READY / overall PARTIAL. Legal/privacy compliance NOT CLAIMED. COMMERCIAL PRODUCTION READY NO.

## 1. Baseline and scope

develop, HEAD `f8c771b feat: add legacy password self-service upgrade`; tracked tree clean at start.7Q runtime/tests committed; owner confirms backend/frontend LIVE, health/readiness/normal login/admin PASS and7Q.2 revalidated. Legacy>72 staging E2E remains NOT RUN. Unrelated untracked owner files preserved. Earlier clean-tree blocker resolved before work.

Inspected application source, migrations001–022, relevant frontend services/UI consumers, backup code/config and synthetic fixtures/tests. No production user data, real password/hash, backup contents, env file or DB inspected. Source metadata and archive filenames are not backup-content inspection. No dependency/schema/migration/config/Render/deploy changes; no real DB/provider/email/payment action or destructive cleanup. Commercial sales/charges/refunds/Hotelbeds booking gates remain off; reconciliation runtime disabled. No new tracing/analytics or deletion scheduler.

## 2. Engineering inventory and source → sink map

Inventory COMPLETE for the required classes in inspected repository scope; not an exhaustive forensic/legal data register. Categories below are internal engineering labels. PUBLIC means intended public product/support data, not an assertion that account identifiers are public.

| Class / actual fields | Classification | Source → persistent sinks → authorized consumers |
| --- | --- | --- |
| users.id,role,preferred_language,email_notifications,booking_reminders,created_at;022 session_version,is_active | ACCOUNT DATA; id also OPERATIONAL IDENTIFIER | Auth/profile body and server account state → users DB → public user allowlist/profile and admin listing. Security version/active state stays server-side; JWT version is a signed auth claim, not public profile metadata. |
| users.full_name,email,phone | PERSONAL DATA | Auth/profile body → users DB → own profile/login user, admin users/CRM, sessionStorage user, profile memory; notifications recipient/test greeting; DB backup. |
| first_name,last_name,birth_date in traveler_profiles; booking lead first_name,last_name,birth_date; travelers JSON firstName,lastName,type,age,birthDate,roomId,order | PERSONAL DATA | Saved-traveller/checkout body → user-scoped profiles/bookings → own saved-traveller UI and checkout memory; authorized voucher/contact model; Hotelbeds holder/paxes mapping when separately enabled; backups. No nationality/gender/passport/document-number production schema/input found in inspected paths; document-like redaction is defensive, not an invented stored field. |
| bookings.email,phone,comment,travelers | PERSONAL DATA / BUSINESS RECORD | Booking body → bookings → authorized legacy admin lead/contact table, voucher and intended notification recipient. Ordinary account history excludes lead/contact/traveller details; raw provider-response storage may also contain such data. No separate special_requests column found; comment is existing free text. |
| provider_booking_id,provider_client_reference,provider_offer_id,offer_snapshot,provider_response/provider error snapshots | BUSINESS RECORD / OPERATIONAL IDENTIFIER; raw response may contain PERSONAL DATA | Server/provider boundary → bookings/checkout sessions → reduced history/voucher/admin views; references/status in operational logs; full response not in account history or legacy admin summary. Provider booking execution remains disabled. |
| payments.external_id,idempotency_key,status,metadata; refund_requests.id,external_id,reason,metadata; booking_events | BUSINESS RECORD / OPERATIONAL IDENTIFIER | Existing payment/refund/lifecycle paths → DB → owner/admin operational consumers and reduced account history. Reconciliation projections use fingerprints/fixed states, strict input/field projection; durable runtime disabled. No card-data collection or live PSP added. |
| network IP/forwarded identity,requestId,userId,route/status/duration | OPERATIONAL IDENTIFIER | Socket/proxy/request → canonical limiter identity in bounded process memory; requestId/log/metrics/events. No raw IP in safe proxy telemetry. Internal numeric userId retained for necessary incident/account correlation, never email/name/phone. Route template replaces raw path; query/body/Authorization omitted. |
| password,password hash,JWT,passwordUpdateToken,checkout capability,provider keys | HIGH-SENSITIVITY AUTH DATA | Request/server auth → hash only in users DB; accepted JWT in sessionStorage; password-upgrade token only auth-store closure; checkout token in DB/current checkout flow. No raw password/token operational logging in inspected hardened sinks. DB backups can contain password hashes. |
| Hotel/country/city/offer presentation and published support contact | PUBLIC / BUSINESS RECORD | Catalog/product configuration → public UI/API. Public support fixture values are not treated as evidence of customer PII. |

## 3. Logging sinks and hardening

Existing logger redacts secret-key variants, configured secret values, auth/URLs/JWT/bcrypt/private keys and reduces Error objects to class/code. Extended nested key coverage for actual email/phone/recipient, first/last/full names, birth-date aliases, traveller/contact/holder/paxes/age/comment and raw request/response/config/body/payload/html/text envelopes. Arrays/objects cycle-safe, capped50 entries and depth6; binary represented without contents. Email patterns and international +phone patterns minimized in messages/string metadata. Fixed codes, requestId, necessary numeric ids and provider references/status remain available. This is not a universal free-text name/phone detector; unlabelled names, unusual formats and adversarial strings can remain.

Proven console-email leak removed: even enabled console mode emits only fixed EMAIL CONSOLE with provider/messageId, never recipient/subject/body/html. Disabled email path rejects before delivery/logging. Resend is not invoked; no email sent. Delivery exceptions now persist/return fixed EMAIL_DELIVERY_FAILED instead of raw provider message. Content still legitimately exists in notification delivery/outbox where product requires it; historical last_error/payload rows are not purged.

System events, incident writes and admin-action metadata now use a bounded typed allowlist: counters, flags, known operational labels, component data, transitions and failed-check names. Arbitrary PII/unknown object keys are omitted, including deleted-user email formerly copied into audit metadata. Target/admin/booking ids remain in dedicated audit columns for lookup; business data remains in its business record. Label fields are internal short identifiers, not an authority for accepting arbitrary browser metadata. Existing Russian booking-status diagnostics preserved. System/incident text uses secret/email/international-phone sanitizer. Free text, historical records, generic booking_events metadata and reliability snapshot business diagnostics are not comprehensively classified; overall operational minimization remains PARTIAL.

Request telemetry now records Express baseUrl+route.path template after dispatch, or /unmatched. Caller path parameters and arbitrary404 paths cannot enter metrics/access logs/new HTTP event messages. Existing proxy summaries remain no-raw-IP; fixed UUID/32hex correlation rules retained. No readiness/lifecycle/auth behavior changed.

Provider client logs inspected: environment/category/status/duration/errorCategory, not full request/response; booking-controller logs reference/status/fee/application id. Auth/controller errors pass Error objects rather than request bodies; auth missing-secret console message is fixed. Production middleware/public helpers suppress internal5xx details. Existing validation strings identify fields, not submitted values in tested routes. Arbitrary externally supplied4xx/error text and malformed legacy/provider records are not certified safe everywhere.

## 4. API and admin boundaries

Profile uses buildPublicUser; public fields include required display name/role, contact/profile/preferences and created_at. Security internals/hash excluded. Frontend publicProfile allowlist strips unknown fields; these fields support profile restoration/editing and UI, so no blind removal or auth-storage redesign. User admin listing now explicitly projects id/full_name/email/phone/role/created_at after SQL selection, preventing future returned-row metadata from automatically leaking.

Existing publicBooking/publicDetails already allowlist stored booking summary/offer and event id/type/time, excluding contacts/travellers/provider responses/payment metadata. Owner or current admin is required before detail/event lookup. Saved-traveller SQL explicitly selects needed fields and scopes reads/updates/deletes to req.user.id. No unrelated traveller lookup introduced.

Legacy admin booking list/status response previously serialized broad booking rows. New adminBooking projection preserves table-required lead names/contact/hotel/price/status and summary fields, dropping travellers/raw provider/payment blobs and unknown fields. CRM booking SQL is already explicit. Admin refund listing replaces r.* with explicit consumer fields and removes free-text reason/metadata/external identifier automatic expansion; existing search/pagination/status behavior remains. Some authorized admin queries still return retained operational metadata and identity context, so full response minimization is PARTIAL rather than all-routes certification.

Users/admin booking lists require auth→admin role. Admin operations (bookings/refunds/notifications/incidents/events) require auth→admin→admin.operations.read, with system/read/selftest/incidents permissions where registered. Reconciliation router independently applies auth/admin/read permission and non-GET rejection. Current permission model grants intended admin access; no new RBAC or browser-role authority. Guest/user/admin checks and IDOR regressions tested synthetically. Staff account provisioning/access approvals and actual deployed log/DB/backup permissions remain OPEN.

## 5. Browser, URLs, export/download and artifacts

Only authStorage uses browser persistent storage in inspected frontend source. localStorage only removes old token/user; sessionStorage stores accepted JWT and allowlisted profile. Saved-account/booking/checkout detail stores are process memory, not localStorage/IndexedDB/Cache Storage. SessionStorage contact/profile persistence remains a deliberate current profile-restoration contract, so browser minimization PARTIAL rather than minimal-identity-only. Active bearer remains JavaScript-readable by design; upgrade capability closure policy preserved.

Return paths use fixed internal allowlists. No intentional auth-token/email/name URL navigation found in inspected auth helpers. **Admin GET search is an exception:** adminService serializes q and admin booking/refund/notification search permits email/name/recipient criteria. Those queries can carry PII to backend/edge logs even though application telemetry drops query. Existing signed offer token/search URL flow can include business capabilities, not customer credentials; full URL privacy is not claimed. Follow-up needs a separately reviewed search transport/ingress policy; no frontend runtime edit here.

Bulk user/booking CSV/XLSX export or backup-download HTTP route NONE FOUND in inspected routes/UI. Per-booking voucher JSON/PDF exists: server auth plus owner/admin check; PDF private,no-store and generated from explicit model with necessary lead/contact/traveller data. CONTROLLED resource download, not bulk export. CLI backups are privileged local DB exports, never public product exports.

Backup audit only code/config: no express.static registration for archive paths; backend/backups ignored, no tracked archives there; root backups and *.dump/*.dump.* now also ignored to reduce accidental staging. No existing untracked file removed. Custom continuity tool uses guarded output directory and safe error/summary manifest verification; legacy JSON verifier prints integrity/count summary, not rows. Legacy backup writer supports optional AES-256-GCM+scrypt encryption and0600 file mode; these code capabilities do not prove deployed encryption or Windows ACL/staff access. Custom pg_dump archives are not claimed encrypted at rest. Real archive contents untouched. Report/test data synthetic; inspected fixtures include public support configuration and example/synthetic credentials. No complete PII scanner or all-history scan claimed; secret scanner is not a PII scanner.

## 6. Engineering retention matrix

No legal periods invented. “Deletable” describes code capability, not authorization or a recommendation to delete.

| Data class / storage | Current retention | Technically deletable / boundary | Owner/policy decision |
| --- | --- | --- | --- |
| users DB/profile | UNBOUNDED / POLICY NOT DEFINED | Existing admin DELETE, self-admin deletion blocked; no own-account erasure flow. bookings FK can block deletion; no verified universal cascade. | Account lifecycle, linked business records, legal basis/access; no deletion executed. |
| traveler_profiles DB | UNBOUNDED / POLICY NOT DEFINED | User-scoped delete; user FK cascade exists. | Saved-profile retention and deletion expectations. |
| bookings/contact/travellers/provider_response | UNBOUNDED / POLICY NOT DEFINED | Existing restricted admin booking delete; related payment/event/outbox FKs differ. | Business record/PII minimization policy before any purge. |
| payment/refund/reconciliation/event records | UNBOUNDED / POLICY NOT DEFINED | Relational cascades/SET NULL exist; no generic accepted retention purge; reconciliation disabled. | Financial/audit obligations and correlation preservation. |
| application logs / platform logs | Runtime code has no retention; platform UNKNOWN | Logger emits, platform deletion/access not inspected. | Collection, access, rotation, retention, incident support policy. |
| notification_outbox recipient/payload/error | UNBOUNDED / POLICY NOT DEFINED | No accepted application retention job; user FK SET NULL may leave recipient/payload. | Recipient/content retention, retry history, data subject handling. |
| system_events,admin_actions,incidents,reliability snapshots | UNBOUNDED / POLICY NOT DEFINED | Generic metadata writes now minimized; existing values retained; user/admin FK SET NULL can leave text. | Historical records, access and retention/cleanup approval. |
| JWT/profile browser sessionStorage; upgrade memory | Browser page-session semantics; closure cleared on cancel/success/unmount; capability300s | Logout removes auth storage; expiry is authority rejection, not proof of immediate memory erasure. | Accepted7P policy; shared-device/XSS exposure remains. |
| checkout_sessions DB | Default authority TTL20min,min5; expired row deletion not demonstrated | Expiry rejects reuse, not a storage-retention policy. | Stale-row cleanup policy separate from capability expiry. |
| metrics/health process memory | Metrics recent<=5000,15min samples; durations1000/routes100; health samples120 | Bounded/evicted in process, reset on restart. | Operational observation needs; no extra analytics. |
| backup files | Existing legacy count retention default10, optional DB_BACKUP_MAX_AGE_DAYS; createBackup applies it; optional auto scheduler unchanged/off by default. Custom continuity archive policy not defined. | Existing explicitly invoked cleanup capability only; no new destructive action/scheduler. | Backup access/encryption/retention/restore evidence; no deployed policy assertion. |

Automatic PII deletion NOT IMPLEMENTED. Automatic destructive retention introduced by this sprint NO. Existing backup-retention capability remains unchanged; no cleanup/backup run.

## 7. Exact changes

Modified:

- .gitignore
- backend/utils/logger.js
- backend/middleware/requestTelemetry.js
- backend/services/systemEventService.js
- backend/services/incidentService.js
- backend/services/adminAuditService.js
- backend/services/emailProviderService.js
- backend/services/notificationService.js
- backend/services/bookingHistoryPublic.js
- backend/controllers/bookingController.js
- backend/controllers/userController.js
- backend/controllers/adminOperationsController.js
- SECURITY_PRODUCTION_GAP_CHECKLIST.md

New:

- backend/utils/operationalMetadata.js
- backend/tests/piiOperationalControls.test.cjs
- SPRINT_7R_PII_OPERATIONAL_CONTROLS_REPORT.md

Frontend/runtime config/dependencies/schema unchanged. All unstaged; owner files untouched. Temporary evidence under .tmp/sprint7r-*.log only.

## 8. Verification

Focused62/62 PASS; adjacent229/229 PASS in one final invocation (291/291): securityHardening,sessionRevocationAccountState,adminReconciliationReadApi,bookingHistoryQuality,bookingLifecycleConsistency,mandatoryConfigSecretContract,safeProxyTelemetry,sprint2j,sprint3a. Covers key variants, nested/cyclic/binary/Error envelopes, typed metadata writes via fake executor, profile/admin/booking projection, ownership/admin permission, disabled/console email and fixed failure code, route templates/unmatched path, browser source policy, provider and backup boundaries. First focused development run61/62 failed because test called nonexistent getProfile export; next run290/291 failed because fake profile query returned a user row for aggregate stats too. Corrected fixture dispatch/export, no existing assertion weakened. Final source frozen before full backend.

Full backend **1547/1561 PASS**, one final-source run of73 files;14 known DB-blocked failures,cancelled/skipped0,unexpected unresolved0. Blocked suites: hotelbedsAccess1,hotelbedsCatalogPlan1,hotelbedsContent3,hotelbedsMultiDestination1,hotelbedsPublicSearch1,hotelbedsStagingTest6,stagingAcceptance1. Dedicated real-DB hotelbedsCatalog.integration,priceHistory.integration,stagingMigrations.integration and sessionSecurity.integration excluded. Reused .tmp/sprint7k2-offline.cjs preload blocks actual pg Pool/Client connections/queries and external HTTPS; blocked attempts in known suites are not successful DB calls. Full backend PASS not claimed.

Verifier **PASS** (290 backend syntax files,617 secret-scan files,findings empty);6A **PASS**;021 preflight **PASS**, DISABLED—SAFE;022 preflight **PASS**, local executionAllowed=false/enforcementActive=false. These offline defaults do not override supplied staging enforcement evidence. Final diff-check **PASS**. Each release check once. Frontend tests/lint/build NOT RUN: frontend runtime unchanged. Real remote DB connections0, migration executions0, Hotelbeds0, PSP0, email delivery0, money0. Fake SQL assertions and local HTTP regression harnesses are not real DB/provider calls.

## 9. Remaining owner/operational policy and staging acceptance

Owner must define retention/account deletion/business-record preservation, least-privilege staff DB/log/backup access, backup encryption/access/restore policy and safe incident/support handling. Review historical free-form operational records and admin-query transport without pasting real data. Legacy verifyBackup.js still prints error.message on parse failure; its summary success path is not proof that arbitrary corrupt-file parser diagnostics cannot contain payload fragments. Prefer the fixed-code continuity tooling; this legacy CLI error boundary remains an explicit follow-up, not a reason to inspect actual backup contents. No destructive scheduler or legal/privacy compliance claim.

After eventual authorized deployment, owner checks backend LIVE, health/readiness, normal login/admin/profile and booking/account pages, no PII in normal navigation URLs, no raw email/phone/name/request bodies in application logs. Admin search query exception requires explicit follow-up; do not treat normal navigation observation as proof it is resolved. Provide only behavior/classification; never paste real emails/phones/passwords/tokens. This sprint performs no deployment/staging observation. P1 foundation ready, operational acceptance OPEN; COMMERCIAL PRODUCTION READY NO.
