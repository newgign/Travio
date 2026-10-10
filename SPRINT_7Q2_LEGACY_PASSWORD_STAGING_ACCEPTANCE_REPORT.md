# Sprint 7Q.2 — Legacy Password Staging Runtime Acceptance

2026-10-10, Asia/Qyzylorda. STAGING ACCEPTANCE PASS within the evidence below. Documentation/acceptance only. P1 LEGACY BCRYPT: STAGING RUNTIME ACCEPTED / LEGACY EDGE E2E NOT RUN. COMMERCIAL PRODUCTION READY NO.

## Authoritative owner evidence

Combined Sprint7Q+7Q.1 deployed to staging. Backend deploy LIVE; /health PASS; /api/health/ready PASS, database.ok=true. Normal<=72-byte login PASS; admin access PASS. Frontend deployed successfully, ordinary login UI works, no new auth/storage errors observed. Normal auth regression PASS. These are owner observations, not probes run in this task.

Legacy>72-byte owner staging E2E NOT RUN. No safe known legacy account was used and no fake staging account was created solely for acceptance. Do not infer that the capability exchange/password replacement/replay was exercised on staging. Ordinary password-change staging E2E was not supplied in this evidence.

## Separate offline evidence and classification

Prior7Q/7Q.1 offline evidence: installed bcryptjs3.0.3 >72-byte semantics proven; new>72-byte passwords blocked; successful bounded legacy-long credential comparison returns PASSWORD_UPDATE_REQUIRED with no normal JWT before replacement. Dedicated HS256 capability TTL300seconds, frontend memory only, purpose isolation PASS. Successful replacement atomically increments session_version; previous sessions revoked with enforcement enabled; capability replay BLOCKED; fresh ordinary login required. Schema migration NONE. Prior focused/backend/frontend/lint/build verification is documented in7Q.1 and was not rerun here.

Legacy password upgrade foundation STAGING RUNTIME READY. Logged-out self-service upgrade READY. Schema UNCHANGED. Session revocation PRESERVED. Legacy hash original-length identification IMPOSSIBLE BY DESIGN: bcrypt cannot recover original input length or authenticate ignored suffix bytes. Effective-prefix equivalence remains for unidentified historical hashes; runtime acceptance does not claim full remediation of all historical ambiguity. No all-accounts repair or commercial readiness claim.

## This task and checks

Only SECURITY_PRODUCTION_GAP_CHECKLIST.md, SPRINT_7Q_LEGACY_BCRYPT_PASSWORD_HANDLING_REPORT.md and SPRINT_7Q1_LEGACY_PASSWORD_SELF_SERVICE_UPGRADE_REPORT.md updated; this report created. Existing unrelated/runtime working-tree changes preserved; no runtime edit in this task. Everything unstaged.

Checks: sprint3mVerify PASS; sprint6aReleaseGate PASS; reconciliationMigrationPreflight PASS; sessionSecurityMigrationPreflight PASS; diff-check PASS. Each run once. Offline preflights describe local disabled migration configuration, not a new staging observation. No full backend/frontend rerun. Evidence: .tmp/sprint7q2-*.log.

Runtime files changed NO; Render changed in this task NO; deploy NO; DB connections0; migrations0; real password changes0. No Hotelbeds, PSP or money operations. Production sales/payment readiness not enabled or claimed.
