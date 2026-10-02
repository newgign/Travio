# Asedeliya staging deployment runbook

## Before deploy

Run locally from the repository root:

```sh
git status --short
git branch --show-current
node backend/scripts/sprint6aReleaseGate.cjs
node backend/scripts/sprint6bReleaseManifest.cjs
```

Require a CLEAN TRACKED TREE, branch `develop`, 6A gate PASS and 6B manifest PASS.
Staged additions, changes, deletions and unstaged tracked changes block release.
Unrelated untracked owner files are allowed; they are not part of the committed release.
New intended release files must be reviewed and committed by the owner before deployment.
The manifest permits untracked files; PASS does not certify their contents or inclusion.

## Determine what changed

Owner identifies the commit actually deployed to the relevant staging service and compares
it with the intended committed release using `git diff --name-status <deployed-sha> HEAD`.
Use each service's own deployed baseline if they differ. Do not guess from remote history.
Review file contents where classification is uncertain; the manifest does not select services.

| Change class | Owner deployment action |
| --- | --- |
| Frontend runtime: `frontend/src`, frontend runtime/build config or dependencies | Deploy staging frontend only |
| Backend runtime: backend runtime source/config or dependencies | Deploy staging backend only |
| Both frontend and backend runtime | Backend first; verify health/readiness; then frontend |
| Docs, tests and offline scripts only | No runtime deploy required |

Deployment/build scripts and configuration affecting runtime are not automatically classified
as offline scripts. Inspect their effect. This Sprint 6B is docs/tests/offline tooling only.
Deployment remains an explicit owner action; these commands do not deploy or contact Render.

## Post-deploy owner checks

- Frontend opens; relevant auth/session and changed routes/features work.
- No blank screen or raw technical error is visible.
- If backend changed, owner verifies `/health` and `/api/health/ready` before frontend rollout.
- Hotelbeds remains TEST/read-only; LIVE and real booking remain off.
- Payments, refunds and email remain off; production infrastructure remains paused.
- Booking/payments remain disabled unless a future explicitly authorized milestone changes them.

Do not change env files or Render settings as part of this runbook. Do not paste secrets into
evidence. The offline manifest validates local release metadata and repository safety contracts;
it does not inspect deployed environment values, validate real credentials, or certify production
sales readiness. Production sales ready: NOT CLAIMED.
