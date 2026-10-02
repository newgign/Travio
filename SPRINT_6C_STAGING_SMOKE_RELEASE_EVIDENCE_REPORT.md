# Sprint 6C — Staging Smoke Plan & Release Evidence Pack

## 1. Baseline

Develop, HEAD 5ec7a70 (`docs: record Sprint 6B deployment manifest verification`).
Tracked baseline clean; Sprint 6B committed. Historical unrelated untracked owner paths
preserved. Existing 6A/6B tools and staging runbook reused without modification.

## 2. Smoke-plan purpose

Offline checklist generator, not browser automation. Reuses 6B collect/manifest and its
6A evaluation, without duplicating gate logic or performing a second scan per generation.
Both prerequisites must pass. Output says SMOKE PLAN READY; browser acceptance remains
NOT RUN. Invalid scope/prerequisite failures return exit 1; ready plan returns 0.
Exceptions and arbitrary arguments/metadata are not printed. No JSON mode or dependencies.

## 3. Supported scopes

Classification follows `STAGING_DEPLOY_RUNBOOK.md`: frontend, backend, both, docs.
Use `node backend/scripts/sprint6cSmokePlan.cjs --scope frontend` (or another scope).
No arguments defaults to both, explicitly displayed; it does not infer what was deployed.
Frontend covers consumer routes/auth/feedback/mobile and changed feature. Backend covers
health/readiness, read-only changed endpoint evidence and production gate behavior.
Both orders backend verification before frontend. Docs says NO RUNTIME SMOKE DEPLOY REQUIRED.

## 4. Owner evidence rules

6C does not execute browser smoke tests. Owner must perform browser acceptance after an
actual runtime deploy, recording only tested scope and limitations. No fresh Hotelbeds
search by default. Provider search is optional only after deliberately changed provider
code in a future authorized sprint. No accounts/passwords/bookings created for acceptance.
Empty history does not establish READY/Details acceptance. No offline automatic browser PASS.

## 5. Release evidence template

`STAGING_RELEASE_EVIDENCE_TEMPLATE.md` contains branch/commit/time/scope, offline evidence,
deployment selection, pending owner checks, safety and final owner decision. Every check
starts NOT RUN. Docs-only can be N/A with reason, not browser PASS. No secret evidence.

## 6. Tests

Focused fixtures cover all scopes, ordering, prerequisites, safe errors/arguments, default
scope, exit semantics, no browser PASS, provider safety and pending template fields.
Final verification (each requested command run once):

| Check | Result |
| --- | --- |
| Focused 6C | PASS 15/15; zero failures/skipped/todo |
| 6A release gate | PASS; exit 0 |
| 6B release manifest | PASS; exit 0; commit 5ec7a70b9a56, tracked CLEAN |
| 6C frontend plan | PASS; SMOKE PLAN READY; exit 0 |
| 6C backend plan | PASS; SMOKE PLAN READY; exit 0 |
| Verifier | PASS; 214 backend syntax files, 459 scanned files, findings=[] |
| diff-check | PASS |

SPRINT 6C CODE / OFFLINE: PASS. STAGING SMOKE PLAN READY: PASS.
No full frontend/backend regression or frontend build: runtime unchanged.

## 7. Safety

6C does not deploy or call Render/Hotelbeds/DB. External calls 0; Hotelbeds calls 0;
real DB mutations 0. Frontend/backend runtime, DB/schema, Hotelbeds behavior, booking,
payments/refunds/email, env/config and dependencies unchanged. TEST/read-only retained;
LIVE/real booking/payments/refunds/email off; production infrastructure paused.
No git add/commit/push/deploy. All new files left unstaged.

## 8. Exact files

Existing modified files: none. New files:

- `backend/scripts/sprint6cSmokePlan.cjs`
- `backend/tests/sprint6cSmokePlan.test.cjs`
- `STAGING_RELEASE_EVIDENCE_TEMPLATE.md`
- `SPRINT_6C_STAGING_SMOKE_RELEASE_EVIDENCE_REPORT.md`

## 9. Limitations

Local metadata/source prerequisites inherit 6A/6B coverage and untracked-file policy.
Scope is owner-selected using the actual deployed delta. This is not deployed environment
validation, credential validation, a server-side traffic audit or completed staging acceptance.
OWNER BROWSER ACCEPTANCE: NOT RUN. PRODUCTION SALES READY: NOT CLAIMED.
