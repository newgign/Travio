# Sprint 6B — Deployment Manifest & Staging Runbook

## 1. Baseline

Started on develop, HEAD 636e8dd (`docs: record Sprint 6A release gate verification`).
Tracked baseline clean; final 6A report committed. Historical unrelated untracked owner
files preserved. No prior partial 6B work existed.

## 2. Manifest behavior

`node backend/scripts/sprint6bReleaseManifest.cjs` uses local git metadata and reuses
6A `collect/evaluate`. Requires develop, valid commit SHA, clean tracked tree, 6A PASS
and nonempty 5K Consumer RC report. Human output and optional `--json` contain only
whitelisted metadata, a 12-character SHA, STAGING target and production NOT CLAIMED.
Unexpected branch names and exceptions are not echoed. Exit 0 means PASS; 1 means FAIL.

## 3. Tracked/untracked policy

CLEAN TRACKED REQUIRED / UNTRACKED ALLOWED. Staged additions/modifications/deletions,
renames, conflicts and unstaged tracked changes fail. Untracked presence is reported
without filenames and does not fail. Intended new release files still require owner
review and commit; manifest PASS does not certify untracked contents or their inclusion.

## 4. Deployment classification

Owner compares intended committed release against the actual deployed commit for each
service. Frontend runtime only: frontend deploy; backend runtime only: backend deploy;
both: backend first, health/readiness verification, then frontend. Docs/tests/offline
scripts only: no runtime deploy. No remote-history inference or deployment automation.

## 5. Staging runbook

`STAGING_DEPLOY_RUNBOOK.md` documents prechecks, classification, ordered owner actions
and post-deploy feature/auth/health checks. This sprint needs no runtime deployment.

## 6. Tests

Focused suite covers clean/dirty/staged/untracked states, branch, gate and RC failures,
rename parsing, SHA validation, exit semantics, output privacy, JSON and runbook contracts.
Synthetic fixtures only; no DB or network. Final verification:

| Check | Result |
| --- | --- |
| Focused 6B | PASS 16/16; zero failed/skipped/todo |
| 6A release gate | PASS; 23 checks, exit 0 |
| 6B manifest execution | PASS; develop, 636e8dd85acf, tracked CLEAN, untracked PRESENT; exit 0 |
| Verifier | PASS; 212 backend syntax files, 455 scanned files, findings=[] |
| diff-check | PASS |

SPRINT 6B CODE / OFFLINE: PASS. DEPLOYMENT MANIFEST: PASS.
SAFE STAGING RELEASE MANIFEST: PASS — local repository/config scope only.

Full frontend/backend and build intentionally not rerun: runtime/config unchanged.

## 7. Safety

Frontend/backend runtime, DB/schema, Hotelbeds behavior, booking/payments/refunds/email
and dependencies unchanged. TEST/read-only retained; LIVE/real booking/payments/refunds/
email disabled; production infrastructure paused. External calls 0; Hotelbeds calls 0;
real DB mutations 0. No env/Render changes, git add/commit/push or deploy.

## 8. Exact files

Existing files modified: none. New files:

- `backend/scripts/sprint6bReleaseManifest.cjs`
- `backend/tests/sprint6bReleaseManifest.test.cjs`
- `STAGING_DEPLOY_RUNBOOK.md`
- `SPRINT_6B_DEPLOYMENT_MANIFEST_STAGING_RUNBOOK_REPORT.md`

All new files left unstaged for owner review.

## 9. Limitations

Manifest is offline release metadata/safety validation. It does not deploy, inspect Render
deployed env, validate real external credentials, or certify production readiness.
RC evidence presence is not fresh browser acceptance. Inherits 6A's source-signature and
limited credential-scan coverage. Local checks are a snapshot, not an atomic attestation
against concurrent edits. Untracked files are not covered as a committed release.
PRODUCTION SALES READY: NOT CLAIMED.
