# Sprint 6A — Release Integrity & Staging Safety Gate

Status: CODE / OFFLINE PASS. RELEASE GATE PASS. SAFE STAGING RELEASE BASELINE PASS — repository/config scope only. Runtime unchanged. PRODUCTION SALES READY: NOT CLAIMED.

## 1. Baseline

develop, HEAD 5fd1d36 (`docs: record Sprint 5K owner browser acceptance`). Required status/branch/log confirmed clean tracked baseline and committed final 5K owner report. Prior focused 28/28, frontend 752/752, consumer RC READY in tested scope. Preserved unrelated README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md, `tatus --short` and unusual historical acceptance filename.

## 2. Release gate purpose

NEW standalone Node script, reusing current source/config contracts; no dependency. Reads Git-tracked working-tree files, not Git history or deployed state. Does not require/import application modules, load dotenv, call network or connect to DB. No root package.json exists; no package restructuring or command alias added.

This release gate verifies repository/config invariants offline. It does NOT certify production readiness and does NOT verify external services or real credentials.

## 3. Invariants checked

23 checks: required config/RC evidence; unambiguous current staging Blueprint/developer-template formats; eleven explicit safe staging values (TEST, provider off, read-only, booking/live-booking/sales/charges/refunds/email off, payments disabled/provider none); runtime TEST and opt-in booking defaults; staging TEST read-only/unsafe-config guard; hard production safety gate; payment/email defaults; health/readiness source and mounts; frontend build/URL validator; thirteen lazy route declarations and boundaries; warning suppression absent; limited credential-literal scan.

Blueprint reader deliberately supports the current API service/envVars format only. Required missing/duplicate/unsupported values fail; harmless template changes may require gate review. Developer example blank Hotelbeds environment/read-only is handled as existing runtime fallback, NOT a claim that ordinary development TEST always defaults read-only. Staging Blueprint explicitly requires read-only. Source guards are structural signatures, not arbitrary JavaScript semantic proofs. Health/readiness endpoints are never invoked.

## 4. Secret-safety behavior

Scans current tracked JS/JSX/CJS/MJS/JSON/YAML/example/env text only. Untracked owner files and untracked real .env files excluded; no history or online audit. Detects PEM private-key literals, selected high-confidence provider formats, credential database URLs with password length >=20 outside localhost/reserved example hosts, and selected named quoted/env/YAML secret literals >=24 non-whitespace characters. Output is path/category only; exceptions emit a fixed safe failure, never error.message/body/value. Missing tracked text fails; symlinks/out-of-root paths rejected.

Explicit synthetic/example/replacement prefixes and repeated-character placeholders are excluded; tests additionally allow literals marked test/fixture/synthetic. Short values, arbitrary variable names, split/encoded values and unsupported credential formats may be missed. This is deliberately NOT a security scanner or proof of absence of secrets. Early broad patterns flagged schema prose and existing synthetic test fixtures; refined/documented heuristics distinguish those, without printing their values. No actual credential validation or env-file changes.

## 5. Tests

Focused **22/22 PASS**, zero failures/skips/todo. Safe baseline; unsafe LIVE/booking/payment/sales/charge/refund/email/read-only mutations; runtime fallbacks/guards; required reports/tests/readiness; warning suppression; eager import regression; duplicate/missing staging values; redacted synthetic literals; private-key/provider/DB categories; CLI success and sanitized failure/exit codes. Fixtures mutate in-memory snapshots only, not repository config. Initial duplicate-key test assumed LF; corrected to handle CRLF. Gate execution **PASS**, exit 0; unsafe fixtures return FAIL. No DB or application-runtime import. offlineNetwork.cjs preload in focused tests.

## 6. Build/verifier

Lint PASS, zero errors and three inherited admin hook warnings (BookingsTable, NotificationsTable, RefundsTable). Build PASS: entry index-KV1Xsuef.js **245.78 kB / gzip 76.65 kB**, **26 JS chunks**, >500 kB warning **REMOVED**. Verifier PASS: 210 backend syntax files, 451 scanned files, findings=[]. Diff-check PASS. These checks ran once after final source. New untracked tooling/report reviewed separately.

Full frontend not rerun: frontend runtime/config unchanged, previous 752/752 historical only. Full backend not rerun: only standalone tooling/tests added, backend runtime unchanged. Build TEST flag process-only. No deployment.

## 7. Exact files

Modified tracked files: NONE.

New: backend/scripts/sprint6aReleaseGate.cjs; backend/tests/sprint6aReleaseGate.test.cjs; SPRINT_6A_RELEASE_INTEGRITY_STAGING_SAFETY_GATE_REPORT.md.

Frontend/backend runtime, DB/schema, Hotelbeds behavior, booking/payments/refunds/email unchanged. Dependencies unchanged. External calls 0; Hotelbeds calls 0; real DB mutations 0. No git add/commit/push; files left unstaged.

## 8. Known limitations

PASS means SAFE STAGING RELEASE BASELINE in repository/config scope only. Process environment, Render dashboard overrides, actual services, credentials, runtime behavior and deployed artifact identity are not verified. Structural checks may miss semantically unsafe rewrites; existing regression/verifier remain separate gates. Tracked-only scanning cannot certify unstaged untracked new source before it is tracked; review such files separately. This gate checks report/test presence, not that tests ran or owner acceptance occurred.

Production infrastructure PAUSED; LIVE Hotelbeds NOT ENABLED; real booking, payments, refunds and email DISABLED. PRODUCTION SALES READY: NOT CLAIMED. No consumer/browser acceptance upgraded.

## 9. Usage command

From repository root: `node backend/scripts/sprint6aReleaseGate.cjs`.

Focused: `node --test --test-concurrency=1 backend/tests/sprint6aReleaseGate.test.cjs`.

Exit 0 = PASS; nonzero = FAIL. No deployment or service probe is performed.
