# Staging release evidence — owner template

All results start NOT RUN. Complete only from actual evidence; never infer browser PASS
from offline tools. Use PASS / FAIL / NOT RUN / N/A (with reason) for applicable checks.
Follow `STAGING_DEPLOY_RUNBOOK.md` for scope classification and deployment order.

## Release

- Branch: ___
- Intended commit: ___
- Actual frontend/backend deployed commits, if applicable: ___
- Date/time and timezone completed by owner: ___
- Scope: frontend / backend / both / docs — select: ___

## Offline evidence

- 6A gate (required PASS): NOT RUN — evidence: ___
- 6B manifest (required PASS): NOT RUN — evidence: ___
- 6C smoke plan generated (required READY): NOT RUN — scope/evidence: ___

## Deployment

- Frontend deployed (YES / NO / N/A): ___
- Backend deployed (YES / NO / N/A): ___
- Docs-only: no runtime deployment/smoke required; record N/A with reason.

## Owner smoke

| Check | Result | Evidence / scope limitation |
| --- | --- | --- |
| Home/header/navigation | NOT RUN | |
| No blank lazy route or raw error | NOT RUN | |
| Auth/session, existing account | NOT RUN | |
| Profile | NOT RUN | |
| Favorites | NOT RUN | |
| My Bookings | NOT RUN | |
| Help/legal | NOT RUN | |
| Changed feature / relevant read-only endpoint | NOT RUN | |
| Mobile 320/390 if layout changed | NOT RUN | |
| Backend /health and /api/health/ready if relevant | NOT RUN | |
| No unexpected production gate failure | NOT RUN | |

DB reachability evidence must come only from deployed health/readiness, not direct DB access.
For both scope, verify backend before frontend. No fresh provider search required by default.
Do not create accounts, change passwords, create bookings or invoke payment/refund/email
operations for evidence. Empty account views do not establish booking READY/Details acceptance.

## Safety

- TEST/read-only and truthful TEST wording: NOT RUN — evidence: ___
- Hotelbeds LIVE remains OFF: NOT RUN — evidence: ___
- Real booking remains OFF: NOT RUN — evidence: ___
- Payments remain OFF: NOT RUN — evidence: ___
- Refunds/email remain OFF; production infrastructure PAUSED: NOT RUN — evidence: ___

Browser observations are not an independent server-side traffic audit. Do not include tokens,
passwords, credentials, Authorization headers or private account data in the evidence pack.

## Final owner decision

STAGING ACCEPTANCE: NOT RUN — owner selects PASS / FAIL after applicable checks.
Tested scope: ___; omitted checks and reasons: ___; blockers: ___
Docs-only may be recorded N/A, not browser PASS. Production sales ready: NOT CLAIMED.
