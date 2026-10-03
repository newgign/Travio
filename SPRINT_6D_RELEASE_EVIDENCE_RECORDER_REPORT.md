# Sprint 6D — Release Evidence Recorder

## 1. Baseline

- Branch: develop; committed Sprint 6C baseline: 6e2e2fe (6e2e2febb028).
- Tracked baseline clean. Unrelated owner untracked files preserved.
- Recorder, focused test and example already existed as untracked drafts; inspected and completed in place. No staging, commit, push or deployment.

## 2. Recorder purpose

Offline validation and classification of explicit owner staging results. Reuses 6B collection/manifest (including 6A evaluation) and 6C plan logic without duplicating their implementations.

## 3. Input/status model

`node backend/scripts/sprint6dEvidenceRecorder.cjs --input STAGING_RELEASE_EVIDENCE_EXAMPLE.json`

Optional: `--output <new markdown-file.md>` creates a file exclusively; existing files are never overwritten. Without this option Markdown is printed only.

Scopes: frontend/backend/both/docs. Statuses: exact PASS/FAIL/NOT_RUN/N_A. Unknown fields, unknown statuses and malformed input are rejected. Input must be a regular non-symlink file, at most 64 KiB. Notes are accepted but omitted from output for privacy.

## 4. Acceptance rules

- Frontend requires home, authSession, profile, favorites, myBookings, helpLegal, changedFeature.
- Backend requires health, readiness, changedEndpoint; both requires both sets.
- Failed offline prerequisites or any required FAIL yields FAIL.
- Missing/NOT_RUN evidence never becomes PASS. Required N_A also yields INCOMPLETE; only checks outside scope are waivable.
- All required explicit PASS with valid prerequisites yields PASS.
- Docs with valid prerequisites yields N/A — DOCS ONLY.
- Exit codes: 0 PASS/docs N/A; 1 FAIL or invalid input/output; 2 INCOMPLETE.

## 5. Generated evidence

Markdown contains safe branch/short commit, scope, 6A/6B/6C prerequisites, explicit owner status table, safety posture and final classification. Local commit is not proof of deployed commit. Template supplies owner timestamps, deployed commits and supporting evidence. Example scope is both and all ten checks default to NOT_RUN; template remains safe and unchanged.

## 6. Tests

Requested verification sequence executed once:

- Focused 6D: 18/18 PASS, including optional output and overwrite refusal.
- 6A gate: PASS.
- 6B manifest: PASS, tracked tree CLEAN.
- 6C frontend smoke plan: READY.
- NOT_RUN example: STAGING ACCEPTANCE: INCOMPLETE (exit 2).
- sprint3mVerify: PASS; 216 backend syntax files, 462 scanned files, findings [].
- `git -c core.safecrlf=false diff --check`: PASS.

No frontend build/tests or full backend regression executed.

## 7. Safety

6D does not perform deployment/browser/network checks. Owner browser evidence remains human-supplied. No application imports or environment loading in the recorder; arbitrary notes, errors, input paths and branch values are not echoed. Safety OFF labels describe repository/config posture, not an independent audit of staging traffic.

External calls: 0; Hotelbeds calls: 0; real DB mutations: 0. Runtime, DB/schema, Hotelbeds behavior, booking/payments and dependencies unchanged. Production readiness is not claimed. PRODUCTION SALES READY: NOT CLAIMED.

## 8. Exact files

Tracked modified files: none.

New/untracked Sprint 6D deliverables:

- backend/scripts/sprint6dEvidenceRecorder.cjs
- backend/tests/sprint6dEvidenceRecorder.test.cjs
- STAGING_RELEASE_EVIDENCE_EXAMPLE.json
- SPRINT_6D_RELEASE_EVIDENCE_RECORDER_REPORT.md

The first three were present at start; example retained unchanged. All deliverables remain unstaged.

## 9. Limitations

Recorder validates supplied statuses, not their truth or completeness against actual deployed behavior. Owner must correlate local metadata with deployed commits and maintain supporting evidence in the existing template. No default Hotelbeds search requirement. Dirty tracked changes fail the existing manifest prerequisite. Optional output needs an existing parent directory and a new .md path; file creation errors fail safely without printing private details.
