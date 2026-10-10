# Sprint 7O — Mandatory Config & Secret Contract Hardening

2026-10-10, Asia/Qyzylorda. CODE/OFFLINE: PASS in tested scope. Mandatory configuration foundation READY. P1 MANDATORY CONFIG / SECRET: FOUNDATION READY; operational evidence OPEN. COMMERCIAL PRODUCTION READY: NO.

## Baseline and scope

develop, tracked tree clean; HEAD `6626613 docs: finalize Sprint 7N trusted proxy staging acceptance`. Sprint7N.4 committed; unrelated untracked files preserved. Inspected relevant config/startup, JWT and offer signing, DB/Render TLS, provider activation, production gate, preproduction schemas/checks, release/verifier boundaries, Render blueprint, relevant tests and security checklist/report evidence. No real env file/value inspection or live secret/config validation performed. Supplied owner staging state retained: backend LIVE, session enforcement enabled,001..022 applied, migration flags OFF, approved Render internal require TLS, reconciliation disabled, sales/payments/Hotelbeds LIVE/Booking disabled, TRUST_PROXY1 and HTTP_ACCESS_LOG=true. This task does not reverify those live facts.

## Classified inventory

| Names | Classification and boundary |
| --- | --- |
| JWT_SECRET | MANDATORY NOW for staging/production backend; no hardcoded signing fallback |
| OFFER_TOKEN_SECRET | MANDATORY NOW independently in production-like environments; equal JWT key blocked; LEGACY FALLBACK to JWT only in development/test without staging/production authority |
| DATABASE_URL | MANDATORY NOW for production-like backend; private credentials; valid supported scheme/host/user/database and supported TLS required; local DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME fallback remains development-only under this startup contract |
| HOTELBEDS_API_KEY, HOTELBEDS_API_SECRET | MANDATORY WHEN TEST provider enabled; HOTELBEDS_SECRET remains LEGACY FALLBACK for TEST only |
| HOTELBEDS_LIVE_API_KEY, HOTELBEDS_LIVE_API_SECRET | MANDATORY WHEN LIVE provider enabled; never inherit TEST keys; live booking/sales acceptance remains separate |
| HOTELBEDS_MTLS_KEY_PATH / HOTELBEDS_LIVE_MTLS_KEY_PATH | NOT A SECRET as a path; referenced private-key material is feature-conditional secret, never read/output by this contract |
| HOTELBEDS_MTLS_CERT_PATH / HOTELBEDS_LIVE_MTLS_CERT_PATH | Certificate-path configuration required with enabled provider; certificate/key usability remains existing provider validation/owner evidence |
| HOTELBEDS_MTLS_KEY_PASSPHRASE / HOTELBEDS_LIVE_MTLS_KEY_PASSPHRASE | OPTIONAL secret unless configured key needs it; no invented universal passphrase requirement |
| HOTELBEDS_MTLS_CA_PATH / HOTELBEDS_LIVE_MTLS_CA_PATH, DB_SSL_CA_PATH | OPTIONAL trusted public CA-path configuration, NOT A SECRET; existing readable-file/TLS handling retained |
| GOOGLE_API_KEY, FOURSQUARE_API_KEY, GEOAPIFY_API_KEY | MANDATORY WHEN corresponding provider flag enabled; operationally optional while disabled |
| RESEND_API_KEY | MANDATORY WHEN EMAIL_ENABLED=true and EMAIL_PROVIDER=resend; EMAIL_FROM is required sender configuration, not an authentication secret; email remains disabled in current release |
| PSP credential / webhook signing secret | Future feature-conditional secrets; no selected real PSP or authoritative env names exist to invent. NOT REQUIRED while payments disabled; all requested live payment capability blocked even if pretend credentials supplied |
| CORS_ORIGINS, TRUST_PROXY, DB_SSL_MODE, APP_ENV, EXPECTED_APP_ENV, SESSION_STATE_ENFORCEMENT | NOT SECRETS; config authority/validation required as applicable |
| Migration approvals, Render internal TLS approval, expected DB identities | NOT authentication/signing secrets; owner target/approval metadata, retained existing contracts; never substituted for real credential or certificate proof |
| VITE_API_URL and approved VITE disclosure/support names | PUBLIC browser configuration, never private secrets |

Inventory COMPLETE for the inspected config/signing scope, not a whole-repository or third-party secret discovery claim. Process-local account limiter HMAC material is ephemeral internal generated state, not an owner-configured persistent key; no new key config introduced. No encryption key discovered in inspected config. OFFER_SECRET remains unused, not an alias.

## Runtime and release behavior

New config/mandatoryConfig.js is offline, accepts injected env and emits fixed name/code checks only. Production-like means any APP_ENV/EXPECTED_APP_ENV/NODE_ENV indicates staging or production (case/whitespace normalization is conservative for validation only). NODE_ENV=test cannot suppress strict validation when target authority says staging. Development/test alone skip this startup contract; their existing parsers/auth missing-secret behavior still apply.

JWT and offer keys: string,32..4096 characters, no whitespace, at least10 distinct characters; bounded placeholder-token rules. This is deterministic minimum configuration quality, not entropy estimation or proof of secure generation. Ordinary dictionary substrings inside otherwise acceptable material are not automatically rejected. Owner must use cryptographically generated independent keys. Comparison is memory-only; no values, lengths, prefixes, hashes/fingerprints or secret-derived identifiers emitted/persisted.

Server validates immediately after dotenv and before DB/client/route imports/listening. Failure prints only fixed MANDATORY_CONFIG_BLOCKED and name/code checks, then exits1. No DB/network needed. Offer service additionally rejects production-like fallback/weak/equal keys at signing lookup. Auth/JWT algorithm, payload, expiry and session logic unchanged. Offline preproduction reuses the validator and requires independent offer secret. Existing release checks still validate source/blueprints; synthetic checks cannot attest actual Render values.

DATABASE_URL validation uses existing databaseConfig. Generic remote disable blocked; verify-full default retained. require allowed only through unchanged explicit approved Render internal TLS/target-binding contract, including expected identities and safety settings. Session enforcement enabled remains compatible with normal runtime. No generic rejectUnauthorized=false path added. URL SSL overrides rejected. Existing CA file handling may read public trust material but never connects; errors sanitized. DB username/password validity and database existence not proven. The old operator plaintext attestation may still appear in legacy diagnostic fields, but cannot make the overall mandatory release/startup contract pass.

Enabled Hotelbeds requires credentials plus mTLS path configuration; disabled integration does not block startup. TEST disclosure intent alone with provider disabled does not imply network activation. Existing provider checks remain responsible for file/key correctness and request-level fail-closed behavior. No credential-content policy designed for third-party vendor keys. Current PSP capability gate rejects live activation before execution; no PSP adapter/secret names invented. No booking or payment gate enabled. Normal startup rejects migration-enabled flags; migration guards themselves unchanged.

Frontend boundary reuses existing public VITE-name allowlist and release source/build secret scans. Public variables are not secrets; operators must not put private values even under approved public names. Semantic detection of every accidentally pasted secret is not claimed. Frontend runtime untouched; targeted build guard regressions only, no full frontend run.

## Validation

Final focused/adjacent invocation **445/445 PASS**: new contract **50/50**, adjacent **395/395** across securityHardening, preProductionReadiness, renderInternalTls, sessionSecuritySchema, trustedProxyAbuseProtection, stagingDeployment, renderStartupHealth, productionFoundation, productionInfrastructure and productionDatabaseProvisioning. Network/pg traps and synthetic env/keys only; real startup harness uses fake DB and loopback health. Invalid startup VM proves no DB/provider import before failure. Render approved require+enforcement enabled and wrong approval tested. Preliminary invocations exposed compatibility assertions for plaintext attestation and enabled provider without mTLS paths; expectations updated for intended stricter contract, positive secure cases retained. No full aggregate run before final source.

Full backend ONCE on frozen runtime source: **1405/1420 PASS**,15 failures, cancelled/skipped0,70 files, exit1. Known DB-blocked14: hotelbedsAccess1, hotelbedsCatalogPlan1, hotelbedsContent3, hotelbedsMultiDestination1, hotelbedsPublicSearch1, hotelbedsStagingTest6, stagingAcceptance1. Additional failure: hotelbedsIsolation TEST signed offer case had a production fixture with OFFER_TOKEN_SECRET but no JWT_SECRET, correctly rejected by the new signing contract. Added an independent synthetic JWT key to that fixture only; directly reran hotelbedsIsolation **6/6 PASS**. Aggregate NOT rerun, and its15 failures are not rewritten as14. Unexpected unresolved0 after the focused resolution; full backend PASS not claimed. Final adjacent evidence395/395 plus this6/6 resolution. Dedicated real-DB integration files excluded (hotelbedsCatalog, priceHistory, stagingMigrations, sessionSecurity); existing offline preload blocks pg and HTTPS. No real DB connection/query/mutation, migration, Hotelbeds/PSP/external network or money operation performed.

One-time checks: verifier PASS (285 backend syntax files,603 secret scan files, findings empty);6A PASS;021 preflight PASS;022 preflight PASS;diff-check PASS. Verifier/6A/preflights preceded the final one-line synthetic JWT fixture correction; runtime source was unchanged afterward. No repeat of release gates or aggregate to improve totals. Local migration preflight defaults do not reclassify deployed session state.

## Owner evidence and rollout limits

Before separately deploying: privately classify JWT_SECRET and OFFER_TOKEN_SECRET PRESENT/ABSENT; minimum contract PASS/FAIL; independent YES/NO/UNKNOWN. Do not paste values, lengths, prefixes, hashes or DATABASE_URL. Confirm DATABASE_URL PRESENT and supported TLS contract VALID/INVALID, with existing Render require approval/target evidence if applicable; credentials valid UNKNOWN until separately authorized connectivity evidence. Confirm disabled features do not require unused credentials; keep migration flags OFF and money/booking gates closed. Offline CLI `node backend/scripts/preProductionCheck.cjs` reports fixed classifications on owner-prepared env; its legacy rollout preflight is deliberately migration/enforcement-disabled and is not a replacement for already-active session rollout acceptance.

New startup can reject a formerly running deployment with missing/weak/shared keys. Current Render key presence/independence UNKNOWN; no automatic rotation or compatibility bypass added. Owner must resolve privately before deployment; separate key change may invalidate existing offers/sessions depending on which key changes. No rotation, account access/security, staff least privilege, secret-manager compliance, credential validity or production readiness certification claimed. Operational rotation and access-control evidence OPEN; no P1 operational requirement closed by offline tests.

## Exact files

Modified runtime: backend/server.js; backend/services/offerTokenService.js.

Modified release contract: backend/scripts/preProductionCheck.cjs; backend/scripts/preProductionEnvSchema.cjs.

Modified synthetic fixtures/expectations: backend/tests/helpers/startupHealthChild.cjs; backend/tests/preProductionReadiness.test.cjs; backend/tests/productionFoundation.test.cjs; backend/tests/productionInfrastructure.test.cjs; backend/tests/hotelbedsIsolation.test.js.

Modified docs: SECURITY_PRODUCTION_GAP_CHECKLIST.md.

New: backend/config/mandatoryConfig.js; backend/tests/mandatoryConfigSecretContract.test.cjs; SPRINT_7O_MANDATORY_CONFIG_SECRET_CONTRACT_REPORT.md.

Evidence logs .tmp/sprint7o-focused.log, .tmp/sprint7o-backend.log, .tmp/sprint7o-*.log; reused offline preload. Everything unstaged; no git add/commit/push; owner files untouched. No Render/env/deploy changes. COMMERCIAL PRODUCTION READY NO.
