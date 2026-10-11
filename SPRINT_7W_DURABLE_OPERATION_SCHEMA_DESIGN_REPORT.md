# Sprint 7W — Durable Commercial Operation Schema Design

## Subsequent 7X implementation evidence

2026-10-11. Authoritative7W design below retained historically. [7X proof](SPRINT_7X_MIGRATION_023_LOCAL_PROOF_REPORT.md) implements023 source and local41/41 upgrade/fresh/ledger/constraint/concurrency tests, preservingHYBRID and001–022. Proposed023 now exists; no staging migration, backfill or commercial runtime activation. P0 schema IMPLEMENTED LOCALLY; runtime OPEN. Future runtime/crash-test plan in section17 is now assigned to7Y by the explicit7X scope, not implemented in7X. Commercial ordering/retention decisions remain required; real external acceptance NOT RUN.

2026-10-11, Asia/Qyzylorda. **SCHEMA DESIGN: PASS. P0 COMMERCIAL ORCHESTRATION SCHEMA: DESIGN READY.** Proposed design only: migration NOT IMPLEMENTED, new durable orchestration runtime NOT IMPLEMENTED, external acceptance NOT RUN. This resolves the 7V prerequisite by design, not by implementation or production acceptance.

## 1. Baseline and current schema findings

develop, HEAD `c9ab18a docs: record Sprint 7V commercial orchestration schema gap`; tracked status returned no output. 7U.1 and 7V committed. Unrelated untracked owner files preserved. Repository migrations end at 022; no live schema or rows inspected. No AGENTS.md found in workspace search.

| Existing object | Checked-in durable primitives | Limit |
| --- | --- | --- |
| users, 002/022 | INTEGER id PK; session_version, is_active added by 022 | Account security, not execution ownership |
| checkout_sessions, 006 | VARCHAR(80) token PK, provider/offer identifiers, NUMERIC(14,2) total, currency, offer_snapshot, expires_at/used_at/created_at TIMESTAMP | No account FK or booking FK; opaque capability must not become operation owner authority |
| bookings, 002/004/006/007/008 | INTEGER id PK; user_id FK on initial CREATE; nullable tour_id; provider/reference/status, client reference, quoted/total money, snapshots, failure/reconciliation/cancellation timestamps | Provider and client-reference indexes are nonunique; no checkout FK, attempt journal, claim token or lease |
| payments, 002/010/011 | INTEGER id PK, booking FK with CASCADE, amount/status/paid_at/timestamps; gateway_provider/external_id/idempotency_key, refunded_amount/refund_status | Non-null idempotency_key has global partial UNIQUE; no external-ref uniqueness, immutable money enforcement or dispatch claim; currency currently drawn from booking/metadata |
| booking_events, 011 | BIGSERIAL PK; booking FK CASCADE, user FK SET NULL; UNIQUE(booking_id,event_key), occurred/created timestamps | Audit projection with free text/JSON; not execution authority |
| refund_requests, 011/012 | BIGSERIAL PK; booking FK CASCADE, payment/user FK SET NULL; amount/currency/status/provider/external_id; partial UNIQUE idempotency_key and one row per non-null payment_id | Full-refund-only sandbox intent is durable; no PSP attempt/unknown claim model |
| reconciliation_cases/observations, 021 | Case PK, correlation UNIQUE, version; observation PK, composite correlation FK, UNIQUE(provider_fingerprint,event_fingerprint); TIMESTAMPTZ | Payment-observation vocabulary; no operation FK or dispatch/reconciliation attempt journal |

Initial CREATE constraints and legacy ALTER ADD IF NOT EXISTS paths differ: existing installations may lack original FKs/NOT NULL constraints. Future preflight must inspect catalog constraints, not assume a migration filename proves them. No claim made about deployed catalog completeness.

## 2. Exact 7V gaps and current booking claim

`providerBookingController.confirmProviderBooking` reads/authorizes a booking, then conditionally UPDATEs the same row to provider_status=confirming, clears provider_last_error and updates updated_at, RETURNING the winning row. Predicate requires hotelbeds, no provider_booking_id, and status outside confirming/confirmation_unknown/confirmation_failed/RATE_EXPIRED. PostgreSQL row-update serialization makes this atomic across processes for that booking id. It does not deduplicate two distinct local bookings for one checkout. Persisted status survives restart; no worker/attempt identity or expiry exists. A stranded confirming returns BUSY. Both crash-before-call and success-before-persistence can leave confirming; they cannot be distinguished. confirmation_unknown triggers lookup; consistent persisted reference yields alreadyConfirmed; known failure uses confirmation_failed/RATE_EXPIRED.

`paymentGatewayService.prepareCheckoutIntent` returns PAYMENT_INTENT_READY but explicitly creates no row/reference/transaction. Existing sandbox payments do not represent durable live charge intent. Cancellation terminal check followed by simulate/cancel then UPDATE has no pre-call atomic claim. Refund requests already have useful uniqueness/locking but only simulated completion. 021 cannot replace a pre-dispatch operation ledger. These are the design gaps addressed below; no existing behavior changed.

## 3. Recommended model: HYBRID

Use one typed `commercial_operations` execution ledger, `commercial_operation_attempts`, `commercial_operation_evidence`, and `commercial_operation_reconciliation_attempts`, anchored to existing bookings/payments/refund_requests. Keep domain state/projections in their current tables. Use explicit nullable typed FKs with operation-specific CHECKs, not polymorphic resource_type/resource_id without integrity. The ledger is the future authoritative dispatch/replay boundary; domain projections update in the same outcome transaction.

Domain-specific four separate execution tables would improve local type readability, but duplicate claim, fencing, evidence and restart protocols four times. A fully generic JSON operation table is rejected: it hides money, ownership and resource constraints. This hybrid shares only execution mechanics and retains concrete domain relationships. No new generalized workflow engine, partial-refund feature or production adapter selector.

## 4. Resource anchors and minimal durable payment intent

All four operations anchor to a **local booking/order row**, which can exist before supplier confirmation. This does not choose whether money or supplier execution occurs first. PAYMENT_CHARGE additionally requires a local payments row; PAYMENT_REFUND requires that payment and an existing full-refund request. PROVIDER_CANCELLATION requires a confirmed supplier booking reference established by trusted evidence. PROVIDER_BOOKING binds the authoritative checkout.

Future booking/order creation must atomically bind a checkout to one server-owned local booking, without provider dispatch. Proposed nullable bookings.checkout_token references checkout_sessions(token), with UNIQUE on non-null checkout_token. No checkout token in logs or public operation metadata. Legacy bookings retain NULL. Future request handling locks checkout, validates signed/authoritative context, assigns authenticated owner, creates booking/payment as needed, links checkout and consumes it in one transaction. Existing used_at and expiry behavior remain unchanged for current routes. Retry looks up the authorized existing operation before evaluating permission for a *new* dispatch; an expired context permits result retrieval, not new execution.

The PAYMENT_CHARGE ledger row is the durable payment intent id; no separate duplicate payment-intent table. It freezes account, booking, payment, money/currency, PSP configuration identity and idempotency identity before any call. Local payments remains a projection and original-charge resource for refund policy.

## 5. Proposed columns and types — not current schema

All proposed timestamps TIMESTAMPTZ, generated by DB clock; UUID ids/tokens generated server-side without new dependency (existing Node crypto). No SQL file in this sprint.

| commercial_operations column | Type / nullability / purpose |
| --- | --- |
| operation_id | UUID PK, NOT NULL, internal durable intent identity |
| user_id, booking_id | INTEGER NOT NULL, owning account and local commercial resource |
| payment_id | INTEGER, required only for charge/refund |
| refund_request_id | BIGINT, required only for refund |
| operation_type | bounded TEXT NOT NULL: PROVIDER_BOOKING, PAYMENT_CHARGE, PROVIDER_CANCELLATION, PAYMENT_REFUND |
| execution_environment | bounded TEXT NOT NULL: synthetic, sandbox, live; declaration is not evidence or activation |
| adapter_id, adapter_account_scope | VARCHAR(64), VARCHAR(64) NOT NULL; approved server configuration identifiers, never credentials/merchant raw payload |
| idempotency_key | VARCHAR(128) NOT NULL, restricted ASCII identifier; server-generated or validated, no PII |
| payload_digest | CHAR(64) NOT NULL lowercase hex, digest of versioned canonical authoritative semantics |
| context_version | SMALLINT NOT NULL positive; freezes interpretation of canonical request and references |
| context_expires_at | TIMESTAMPTZ nullable; required for booking/charge dispatch authorization, not result replay |
| amount_minor, currency | BIGINT, VARCHAR(3), both required positive/exact uppercase for charge/refund; both NULL for supplier operations |
| state | bounded TEXT NOT NULL from section 9; initially REQUESTED |
| version | BIGINT NOT NULL positive, transaction/CAS revision |
| attempt_no | INTEGER NOT NULL >=0, current monotonically increasing attempt counter |
| claim_token, claimed_at | UUID and TIMESTAMPTZ, both present only in CLAIMED/DISPATCHING |
| external_reference | VARCHAR(255) nullable; normalized safe opaque result identity only from trusted adapter |
| safe_result_code | VARCHAR(80) nullable, allowlisted normalized outcome, no free-text error |
| created_at, updated_at, completed_at | creation/update NOT NULL; completion present only in SUCCEEDED/FAILED_FINAL |

Supplier input/reference comes from frozen domain context; canonical digest covers account/resource/type, adapter/environment/account scope, authoritative money where applicable, checkout/offer selection and cancellation/refund policy version. Do not copy traveller PII into ledger. Digest alone cannot reconstruct requests: booking rows already own offer_snapshot/travelers; immutable-by-transaction context and version checks must prevent editing after operation registration. If future product requires mutable bookings, introduce a separately reviewed versioned context store before execution; never silently use changed input. Hashes are not anonymization or authorization.

| Child table | Proposed columns |
| --- | --- |
| commercial_operation_attempts | operation_id UUID, attempt_no INTEGER composite PK; claim_token UUID UNIQUE; claimed_at NOT NULL, dispatch_authorized_at nullable, finished_at nullable; outcome TEXT enum CLAIMED/DISPATCHING/NOT_SENT/OUTCOME_UNKNOWN/SUCCEEDED/FAILED_FINAL; safe_code VARCHAR(80) nullable |
| commercial_operation_evidence | evidence_id UUID PK; operation_id UUID FK; adapter_id/account_scope/environment NOT NULL; event_identity_digest CHAR(64) NOT NULL; payload_digest CHAR(64) NOT NULL; evidence_level enum SYNTHETIC/SANDBOX/UNVERIFIED_PROVIDER/LIVE_VERIFIED; normalized_outcome enum PENDING/SUCCEEDED/FAILED_FINAL/NOT_SENT/OUTCOME_UNKNOWN; external_reference VARCHAR(255) nullable; amount_minor/currency paired nullable; observed_at/received_at NOT NULL; safe verification receipt identity UUID nullable |
| commercial_operation_reconciliation_attempts | reconciliation_id UUID PK; operation_id UUID FK; sequence_no INTEGER >0; actor_kind enum SERVER_LOOKUP/OPERATOR_REVIEW; started_at NOT NULL, finished_at nullable; outcome enum IN_PROGRESS/UNRESOLVED/CONFIRMED_SUCCESS/CONFIRMED_FAILURE/PROVEN_NOT_SENT/CONFLICT; evidence_id UUID nullable FK; safe_code VARCHAR(80) nullable |

Reconciliation sequence UNIQUE(operation_id,sequence_no); one unfinished reconciliation per operation via partial unique index. An unfinished lookup can be marked UNRESOLVED and replaced under lock; this authorizes lookup only, never a commercial side effect. Actor access and audit identifiers remain in protected existing audit facilities; no user-entered explanation text in these tables.

## 6. DB constraints, identity and foreign keys

1. Unique logical identity **UNIQUE(booking_id,operation_type)** for provider booking, charge and cancellation via partial indexes per type; refund **UNIQUE(payment_id)** where operation_type=PAYMENT_REFUND. This deliberately permits one charge intent and one full refund per payment, no multiple live charges/rebooking under random keys. A genuinely new purchase requires a new authorized local order/checkout. Retried safe attempts reuse the same operation row.
2. API idempotency **UNIQUE(user_id,booking_id,operation_type,idempotency_key)**. This tuple is distinct from logical-operation uniqueness: a changed/random key cannot bypass the latter. Losing insert reads winner and compares canonical digest; changed payload or key on already-bound logical resource returns conflict rather than minting another operation. No silent rebinding.
3. Required FK user_id→users(id), booking_id→bookings(id); payment/refund FKs when populated. Add candidate unique constraints bookings(id,user_id), payments(id,booking_id), refund_requests(id,payment_id,booking_id) for composite ledger FKs. Operation booking/user FK enforces ownership; operation payment/booking and refund/payment/booking FKs enforce resource linkage. Proposed CHECK: refund payment/user cannot be NULL for a new operation even though legacy refund rows permit NULL. Refund initiator admin can differ from customer; ledger user_id always booking owner, not requesting admin.
4. All new evidence/attempt/reconciliation FKs and ledger→domain FKs use NO ACTION, no CASCADE/SET NULL. Existing domain deletion cascades will be blocked when durable commercial evidence exists; this is an intentional future compatibility impact requiring controller acceptance tests. Legacy rows without operations keep existing behavior. Account deletion requires owner/legal anonymization workflow, not loss of financial evidence.
5. CHECK operation enum and FK shape: booking/cancellation payment_id/refund_request_id NULL; charge payment_id NOT NULL/refund_request_id NULL; refund both NOT NULL. CHECK money pair/type and amount in 1..9007199254740991 for charge/refund; version/attempt bounds, digest formats, identifier bounds and complete claim/timestamp pairs. Explicit NOT NULL prevents CHECK unknown/NULL loopholes.
6. Evidence UNIQUE(adapter_id,adapter_account_scope,execution_environment,event_identity_digest). Same event cannot attach to another operation; same identity/different payload conflicts. Event identity is provider's authenticated stable event identity normalized by adapter, not an attacker-selected digest. Adapter must establish scope for vendors whose ids are only unique per object before integration.
7. External reference uniqueness only for booking confirmation and charge, partial UNIQUE(adapter_id,adapter_account_scope,execution_environment,operation_type,external_reference) when reference is present and type is booking/charge. No universal uniqueness for cancellation/refund: a cancellation may share booking reference; refund evidence may report original charge id. A distinct refund id may be unique only after vendor semantics are established. Parent/child evidence reference consistency is transactional, not a generic text UNIQUE.
8. Index operations(state,updated_at,operation_id) for recovery queue, operations(user_id,created_at,operation_id) for protected lookup; attempts dispatch/outcome queue and evidence(operation_id,received_at,evidence_id); FK child columns indexed where not covered by PK/UNIQUE. No raw payload/free-text search indexes.

## 7. Database rule versus transaction rule

Unique/FK/CHECK constraints above enforce identity and row shape independently of application races. They do **not** enforce cross-row historical state transitions. Proposed future 023 must also include a narrow update-guard trigger on operations: owner/resource/type/key/digest/context/money/adapter/environment immutable after INSERT; version advances exactly once per material update; attempt_no cannot regress; allowed transitions per section 9; identical terminal state may be replayed without mutation, conflicting terminal transition rejected. No UPDATE/DELETE of evidence; attempt identity immutable and attempt final outcomes cannot be overwritten. Implement with reviewed DB guards/privileges in future migration, not application assertions alone. Existing domain context immutability, trusted money derivation, evidence provenance, claim ownership and multi-row result consistency are **application transaction rules**, tested with competing DB sessions. DB shape cannot prove merchant signature or real provider success.

Cross-table requirement that SUCCEEDED has committed valid evidence/current attempt is implemented by one repository transaction plus deferred constraint trigger validating the evidence link at commit. Proposed operations.result_evidence_id UUID nullable FK to evidence, paired with composite FK (result_evidence_id,operation_id) to evidence(evidence_id,operation_id), with matching candidate UNIQUE. SUCCEEDED/FAILED_FINAL require result_evidence_id (expiry/validation rejection uses a server-origin evidence receipt with UNVERIFIED_PROVIDER level and normalized FAILED_FINAL; it never confirms money). Evidence table additionally needs source_kind enum SERVER_DECISION/ADAPTER_EVENT/ADAPTER_LOOKUP; LIVE_VERIFIED forbidden for SERVER_DECISION. Source kind distinguishes known pre-dispatch failure from provider assertions. Trigger verifies matching normalized outcome, identity and money; authenticity still belongs to trusted adapter, not a DB boolean.

## 8. Atomic claim and dispatch fencing

No renewable execution lease is recommended. Time elapsed cannot prove an external effect did not occur. Use token fencing and two durable stages:

* Short transaction locks operation; REQUESTED/FAILED_RETRYABLE→CLAIMED, increments attempt_no/version, creates attempt with new claim_token, commits. Exactly one process wins conditional state/version UPDATE. Losing caller reads safe current result; never dispatches.
* Worker validates current server gates, context and token, then short transaction CAS CLAIMED→DISPATCHING and records dispatch_authorized_at. Commit **before** call. Only a worker receiving confirmed successful CAS/commit may send **one** request for that attempt. Ambiguous commit acknowledgement means no send; recovery reconciles. Transport auto-retry/redirect of mutations must be disabled unless separately proven vendor-safe.
* Recovery can revoke a stale CLAIMED token by CAS to FAILED_RETRYABLE with attempt NOT_SENT. A racing old worker either wins dispatch CAS first (recovery must then treat unknown), or loses token/state check and cannot send. Threshold is owner operational configuration, no interval invented here.
* Stale DISPATCHING→OUTCOME_UNKNOWN, revoke claim token, close attempt unknown; do not acquire another dispatch claim. A paused worker may still have passed its send authorization; therefore never infer NOT_SENT or redispatch from a timeout alone. Late authenticated result becomes evidence through reconciliation, not a stale-token unconditional UPDATE.

This avoids permanent BUSY without mistaking lease expiry for safe execution. Process-local locks/maps are irrelevant to correctness. DB recovery workers arbitrate through row locks/CAS and unique reconciliation claim; fairness/liveness needs operational monitoring, not exactly-once claims.

An additional boundary is mandatory: a lookup returning “not found” cannot prove a paused, previously authorized worker will never send later. OUTCOME_UNKNOWN→FAILED_RETRYABLE requires both definitive vendor no-effect evidence and proven quiescence of the old dispatch path, or a vendor-enforced idempotency/fencing contract covering both old and new sends with the same stable external key. A local token cannot revoke an already-authorized network request. Without that proof, remain OUTCOME_UNKNOWN/manual review even after a negative lookup. Vendor read-after-write lag also forbids treating one negative lookup as final absence. This requirement applies equally to all four operation classes.

## 9. Four state machines

New ledger vocabulary shared across all four types, without changing existing domain enums. Domain success mappings: PROVIDER_BOOKING→BOOKING_CONFIRMED; PAYMENT_CHARGE→PAYMENT_CAPTURED (future PAID only with live proof); PROVIDER_CANCELLATION→CANCELLATION_CONFIRMED; PAYMENT_REFUND→REFUND_CONFIRMED. Unknown maps to the matching *_OUTCOME_UNKNOWN; requested/claimed/dispatching to matching *_PENDING. Sandbox/synthetic projections never become commercial success.

| Ledger state, applies to each of four types | Allowed next states | Terminal | Retry / external call / reconciliation |
| --- | --- | --- | --- |
| REQUESTED | CLAIMED, FAILED_FINAL | No | Retry lookup/claim; no call before claim+dispatch; no reconciliation |
| CLAIMED | DISPATCHING, FAILED_RETRYABLE, FAILED_FINAL | No | Only matching token may authorize dispatch; no direct call; recovery may prove no dispatch |
| DISPATCHING | SUCCEEDED, FAILED_FINAL, FAILED_RETRYABLE, OUTCOME_UNKNOWN | No | One authorized send; FAILED_RETRYABLE only positively known no effect; no second send; reconcile ambiguity |
| FAILED_RETRYABLE | CLAIMED, FAILED_FINAL | No | Same operation/key; fresh context/gate checks; no call until new claim; NOT_SENT evidence required |
| OUTCOME_UNKNOWN | SUCCEEDED, FAILED_FINAL, FAILED_RETRYABLE | No | No automatic redispatch; authenticated authoritative lookup/evidence required; FAILED_RETRYABLE only definitive no-effect proof |
| SUCCEEDED | SUCCEEDED (read/replay only) | Yes | No dispatch, return committed result; conflicting evidence opens review, no downgrade |
| FAILED_FINAL | FAILED_FINAL (read/replay only) | Yes | No dispatch; different terminal evidence opens review, no rewriting history |

REQUESTED/CLAIMED may fail final on expiry or authorization/context rejection before dispatch. Success may arrive via event while DISPATCHING or OUTCOME_UNKNOWN; no success before any dispatch unless a separately authenticated reconciliation proves this exact external operation (otherwise conflict review). PENDING evidence leaves DISPATCHING/OUTCOME_UNKNOWN unchanged. Unknown can remain unresolved indefinitely under owner review; no timeout-to-failure rule. Server recovery/adapter ingestion may mark unknown; browsers cannot. Conflicting terminal event is retained as separately deduplicated evidence/reconciliation CONFLICT, never changes terminal state. This state machine specifies booking/payment/cancellation/refund execution independently; eligibility remains domain-specific.

## 10. Transaction and immutable result boundary

1. Validate types/allowlist and authenticated identity; load trusted domain context. Lock order always booking→payment→refund→operation; evidence uniqueness may require retrying a short failed transaction, never replaying external dispatch.
2. Lookup authorized logical operation/idempotency tuple first. Same payload replays safe state; changed payload conflicts. For a new intent validate owner/resource, money/terms, expiry and capabilities, insert domain anchors and ledger atomically. Persist request digest and stable provider idempotency/client reference derived from operation_id, never raw checkout or PII. Vendor length/character mapping is future adapter review; if mapping cannot preserve collision-free identity, integration is blocked.
3. Claim/commit then dispatch-authorize/commit as section 8. No network in an open DB transaction. Gates remain OFF in this design sprint.
4. Call future accepted adapter once, outside transaction. Outcome validation binds adapter/account/environment/resource/reference/money. Timeout after possible send→OUTCOME_UNKNOWN. Definitive rejected-before-effect→FAILED_FINAL or NOT_SENT/retryable according to adapter semantics, never just HTTP status classification.
5. Lock operation/domain, insert deduplicated evidence, update attempt and operation/result_evidence_id/domain projections in one short transaction. Same terminal replay returns existing evidence/result. Different terminal result creates review. Return only committed allowlisted outcome; lost commit acknowledgement returns unknown/query instruction, not a new operation.

Same amount/currency never recomputed from browser fields; parse exact decimal from authoritative context to minor units without floating-point rounding. Actual currency exponent/support remains selected-PSP contract; current foundation's cents assumption is not universal multi-currency support. Cancellation fee/accepted terms and refundable total must be frozen/checked server-side, not supplied expectedFee as final authority.

## 11. Crash matrix — all four operation types

| Window | Durable state | Client retry / second instance | Call allowed? / recovery |
| --- | --- | --- | --- |
| C1 before claim | Absent or REQUESTED | Atomic create/reuse same logical identity, then compete for claim | Only winner after dispatch authorization; none yet |
| C2 after claim before dispatch authorization | CLAIMED + attempt, no dispatch marker | Return pending; recovery revokes token CAS with NOT_SENT then safe same-op retry | Old token fenced; new claim may send |
| C2 after dispatch authorization before physical send | DISPATCHING + marker | Indistinguishable from C3; no retry call | Unknown/reconcile even if actually not sent |
| C3 possible external success before local persistence | DISPATCHING, eventually OUTCOME_UNKNOWN | Return unknown/reconciliation instruction, preserve key/ref | No blind send; trusted lookup/event resolves |
| C4 result committed before response | SUCCEEDED/FAILED_FINAL + evidence + domain projection | Return same safe outcome | No send; no reconciliation unless conflicting evidence |
| C5 retry after any window | As above | Reuse operation, digest conflict rejected; expiry cannot create replacement automatically | Follow corresponding row |
| C6 concurrent second process | One row by logical UNIQUE; one token by conditional update | Loser reads pending/terminal; no separate attempt | Only winning authorized attempt; no memory lock |

For cancellation/refund, already-terminal domain state without an operation is **legacy import/reconciliation required**, not permission to fabricate success or dispatch again. For existing confirming booking, migration creates no NOT_SENT inference. External and local storage cannot be atomic: duplicate external delivery remains a vendor idempotency/reconciliation concern. No true exactly-once guarantee.

## 12. Evidence, external references and security

Adapter-created references only. Event dedupe binds intended operation, owning user/order via FKs plus verified adapter lookup; a browser reference or echoed signed-looking object is insufficient. Mismatched account/environment/resource/money is rejected/quarantined with safe code, not attached as successful evidence. Original event digest is retained for conflict comparison; raw JSON, auth headers, PAN/CVV/card/PSP secrets never stored. Unrecognized/free-text provider references are not logged; bounds/format/vendor semantics reviewed before acceptance. Provider references are protected operational data, not declared universally non-sensitive.

LIVE_VERIFIED is a reserved future level: no runtime writer/verifier exists and no migration default/boolean may grant it. Future trusted adapter must independently verify authenticity, merchant binding and durable identity; synthetic/test ingress can write only SYNTHETIC in synthetic namespace. Stale events are deduped and reconciled by vendor sequence semantics once known; arrival timestamps alone never authorize terminal reversal. No new signature algorithm invented. IDOR checks use current authenticated account and permission; no mass assignment of state/token/attempt/money/owner/reference. Memory-only tests cannot establish DB integrity. PCI/legal/privacy compliance NOT CLAIMED.

## 13. Reconciliation 021: EXTEND REQUIRED

Reuse 021 unchanged as historical payment-observation store; do not rewrite its checks/enums or activate its disabled runtime. Proposed additive bridge `commercial_operation_reconciliation_cases`: operation_id UUID FK, case_family_id TEXT FK to reconciliation_cases, composite PK(operation_id,case_family_id). Payment-case correlation must be checked transactionally against operation/evidence identity; bridge is not authenticity proof. New operation reconciliation journal covers all four types, including non-payment cancellations/bookings, without coercing them into payment event enum. Queue derives from operations.OUTCOME_UNKNOWN and unresolved/conflict reconciliation attempts; 021 read API integration remains separately gated. Existing 021 cannot itself reference new operation ids, store dispatch attempts, capture lookup attempts, or distinguish four operation kinds. Its review/compensation vocabulary is useful; a bridge alone does not extend its API or guarantee recovery. New FK indexes and bridge created_at TIMESTAMPTZ are proposed in 023.

## 14. Ordering-independent core and owner decisions

Identity, claims, evidence, unknown outcomes, account/resource FKs and full refund uniqueness are **ORDER-INDEPENDENT** for the four scoped operations. Local order creation before execution is not supplier-booking-before-charge. No payment→booking or booking→payment dependency constraint added. Runtime eligibility/compensation coordinator waits for owner-approved workflow.

OWNER DECISIONS REQUIRED: commercial ordering; PSP authorization/capture/refund/account/currency model; supplier cancellation terms and penalty acceptance; refund eligibility and remaining/full amount policy; retention/legal access/deletion policy; operations review responsibility and recovery thresholds. If AUTHORIZE→BOOK→CAPTURE selected, add separately reviewed authorization/capture operation subtypes/evidence and uniqueness before implementation; PAYMENT_CHARGE is not an invented authorization+capture protocol. Proposed 023 core does not claim complete support for that undecided vendor model. No ordering-dependent columns or activated workflow invented now.

RETENTION POLICY: OWNER / LEGAL POLICY REQUIRED. No purge period or automatic deletion. Keep protected evidence through code rollback; account deletion semantics require explicit legal design.

## 15. Proposed migration plan — no SQL created

Repository maximum 022. Proposed next filename **023_durable_commercial_operations.sql**, reserved only by this document; recheck migration inventory before future creation.

Plan: additive bookings.checkout_token nullable FK/UNIQUE; candidate composite unique domain keys listed in section 6; create four ledger/attempt/evidence/reconciliation tables, bridge table, indexes, restrictive FKs, CHECKs, update/immutability guards and deferred result-integrity guard as sections 5–7. result_evidence_id is added after evidence table definition to resolve circular FK ordering. No default live state/evidence or automatic activation. Existing refund_requests UNIQUE(payment_id) and idempotency uniqueness retained; extend execution via ledger, no duplicate refund intent table. No changing historical migration files.

Preflight must validate exact target identity/TLS, ordered migration inventory, verified target backup and restore proof, schema constraint/catalog compatibility, existing checkout links (new column initially NULL), orphan/domain FK suitability and unique-index feasibility without exposing rows; all commerce/migration gates default OFF. Review DDL lock budget and transactional creation strategy on isolated local PostgreSQL. New migration execution needs its own explicit approval guard, integrity checks, mandatory-config/release-gate coverage and migration runner review; existing 021/022 approvals must not silently authorize 023. No live preflight/DB check here.

## 16. Backfill, compatibility and rollback

**Backfill: NONE** for additive ledger creation and nullable checkout link: do not invent attempts/evidence for historical records. Future adoption of existing booking/payment/refund state is **DATA AUDIT REQUIRED**, separately authorized, with unknown states kept unresolved and synthetic/sandbox never upgraded to live. Existing amount/status/reference strings are not charge proof. Composite unique indexes include original PKs, so introduce no new value-level dedupe assumption; catalog validity and locks still require preflight.

Schema remains inert until reviewed runtime uses it. Current disabled review/read-only behavior stays unchanged. Old code can run after additive migration with empty ledger; once operations exist, domain deletion restrictions and immutable context become deliberate compatibility requirements. Single-writer cutover is mandatory: old confirmation/cancellation paths must be gated off before a new runner can dispatch; old/new writers must never operate on the same commercial resource independently. Do not auto-import stranded confirming as safe to retry.

Rollback design READY: disable dispatch/recovery mutation consumers, roll back code, retain schema/evidence; do not DROP tables, reset terminal rows or release unknown operations for retry. Rollback of code after evidence exists requires gates preventing legacy execution/deletion bypass; monitoring/read-only investigation may continue. Destructive schema rollback requires separately approved retention/legal plan, not this rollout.

## 17. Future runtime sprint and synthetic plan (7X)

7X should implement reviewed repository/state contracts and synthetic adapters first, using isolated local DB only with separate authorization. No runtime crash tests implemented in 7W. Target backend/tests/durableCommercialOrchestration.test.cjs; deterministic fail-before-effect, timeout-after-effect, paused-worker and crash hooks stay test-only. Production dispatch remains unavailable.

Future exact test matrix: each of four operations × duplicate same key, changed payload conflict, random-key logical duplicate, concurrent same-key insert, concurrent claim, C1, C2 pre-authorization, C2 post-authorization, C3, C4 and terminal conflict = 44 cases. Add 20 cases: (1) wrong account FK; (2) wrong payment/booking FK; (3) wrong refund/payment FK; (4) NULL FK shape rejection; (5) money/currency immutability; (6) wrong claim token; (7) token revocation versus paused worker CAS race; (8) ambiguous dispatch-commit acknowledgement no-send; (9) event same identity/same digest replay; (10) event same identity/different digest conflict; (11) event wrong operation binding; (12) synthetic cannot become LIVE_VERIFIED; (13) stale pending after terminal no downgrade; (14) refund one-full-per-payment; (15) checkout unique owner/order binding; (16) expired context result replay versus new dispatch denial; (17) orphan evidence/result FK failure and atomic rollback; (18) bridge wrong correlation rejected; (19) both payment-first and supplier-first synthetic sequences without schema change; (20) code rollback gates retain evidence. Target 64 meaningful tests, no partial refunds or real adapters.

Concurrency uses Promise.all with independently connected DB sessions, plus separate OS worker processes for claim/restart tests. Kill process between committed markers; new process reads same durable rows. Assert one logical operation, no duplicate fixture effect, immutable payload, persisted unknown and no blind redispatch. A synthetic effect store should be independent of the killed worker; in-memory adapters prove local mechanics only. Constraint/trigger tests use actual isolated PostgreSQL, not mock SQL inspection as cross-process proof. Live PSP/Hotelbeds acceptance remains NOT RUN and requires later explicit authorization.

The C3 cases must include a paused authorized worker plus negative lookup: no-effect observation alone cannot authorize a second dispatch. Resume the old worker and assert that the operation remains unknown/reconcilable without duplicate execution. Also verify charge/refund/cancellation eligibility under the shared booking/payment locks; per-type uniqueness does not itself enforce cross-operation commercial ordering.

## 18. Remaining status and exact files

Booking schema gap RESOLVED BY DESIGN. Payment intent, cancellation/refund claim, DB idempotency, atomic claim, unknown/crash recovery, cross-process correctness and rollback design READY for the scoped four-operation model. Reconciliation 021 EXTEND REQUIRED. P0 schema DESIGN READY; C0-04 remains PARTIAL overall; migration/new runtime NOT IMPLEMENTED. Counts unchanged P0 4/P1 8/P2 5/OWNER 7/EXTERNAL 2. REAL BOOKING NO, REAL PAYMENT NO, COMMERCIAL PRODUCTION NO.

New: SPRINT_7W_DURABLE_OPERATION_SCHEMA_DESIGN_REPORT.md. Modified: SECURITY_PRODUCTION_GAP_CHECKLIST.md, SPRINT_7S_PRODUCTION_READINESS_REAUDIT_REPORT.md, SPRINT_7V_DURABLE_COMMERCIAL_ORCHESTRATION_REPORT.md. No runtime/frontend/config/dependency/migration file change. Everything unstaged; owner files preserved.

## 19. Checks and prohibited operations

Documentation/design review only; no full backend/frontend or crash-test execution. Verifier PASS (299 backend syntax files, 636 secret-scan files, findings empty); 6A PASS; 021 preflight PASS (DISABLED — SAFE); 022 preflight PASS (executionAllowed=false and enforcementActive=false in offline defaults, not staging observation). Each invoked once. Final diff-check result recorded in task response. Remote DB connections 0; SQL execution/schema mutation/migrations 0; Hotelbeds/PSP/money/booking/cancellation/refund/email calls 0; Render/deploy changes 0. Existing sales/charges/refunds/booking gates unchanged and disabled; no environment edited or live state inferred.
