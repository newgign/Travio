# Reconciliation Persistence Schema Design — Sprint 7F

DESIGN / CONTRACT ONLY. No SQL migration, table, PostgreSQL adapter, DB query or datasource activation.
DURABLE POSTGRESQL IMPLEMENTATION: FUTURE REQUIREMENT.
CROSS-INSTANCE CONCURRENCY SAFETY: FUTURE DB REQUIREMENT.

## Existing conventions and scope

The repository uses pg Pool plus parameterized queries; providerCatalogRepository supports an explicit query executor for transaction clients. Some services/controllers still use pool directly. Numbered descriptive .sql files are tracked by _migrations.name; the runner sorts files, takes a database advisory lock and wraps each migration in BEGIN/COMMIT/ROLLBACK. Inspected paths do not expose a shared application transaction helper; future reconciliation transactions can use the existing client/executor convention without introducing an ORM.

Existing catalog/incident/admin tables use created_at/updated_at, NOW(), JSONB, ON CONFLICT and unique/partial indexes. Existing incident resolution and audit semantics must not be reused to resolve money cases implicitly. This design introduces no operational delete/resolve status. UTC-aware timestamptz is proposed for new observation timestamps, subject to future schema review rather than copying timezone-naive timestamps blindly.

## Entity model

Two future entities are justified: one stable payment-correlation case and its normalized observations. An observation holds an immutable 7C evaluation plus optional corresponding normalized provider evidence. This combines evidence/history/7C identity aliases without a third table or arbitrary metadata blob. Observations without an incoming provider event still have a unique 7C evaluation identity.

The in-memory contract returns one case record with snapshots and evidence arrays; a future PostgreSQL adapter assembles that record from these two entities. Those arrays are bounded to 1,000 in the fixture; production capacity, pagination and overflow handling need explicit review, not silent history eviction.

### Proposed case fields — no executable DDL

| Field | Proposed type / purpose |
| --- | --- |
| case_family_id | 64-hex text primary key; existing 7D hash of request/provider/payment fingerprints |
| request_id | 32-hex server checkout correlation, not arbitrary incoming HTTP x-request-id |
| provider_fingerprint | 64-hex safe provider namespace fingerprint |
| payment_fingerprint | 64-hex provider payment reference fingerprint |
| latest_case_id | 64-hex 7C evaluation identity of latest committed distinct observation; not queue resolution |
| version | positive bigint; optimistic compare-and-swap, increment only on new committed observation |
| first_observed_at / last_observed_at | trusted server observation times; duplicate delivery does not change them |
| created_at / updated_at | UTC-aware server/database timestamps; no browser clock authority |

The latest observation does not automatically replace the unresolved queue classification. 7D conservatively aggregates supplied unresolved snapshots and retains conflict/compensation risk. Category, priority, queue status and review flags are derived by the existing read model; they are not independent repository business decisions. A future query cache may materialize them only through the reviewed same projection, if actual list/filter patterns justify it.

### Proposed observation/evidence fields — no executable DDL

| Field | Proposed type / purpose |
| --- | --- |
| observation_id | 64-hex 7C caseId primary key, preserving exact evaluator identity |
| case_family_id | foreign key to stable case; all observations stay linked |
| observed_at | trusted server evaluation acceptance time, not vendor ordering proof |
| result | JSONB of strictly validated 7C scalar/diagnostic/manual-review schema; not arbitrary provider JSON |
| snapshot_digest | canonical SHA-256 result digest; detects same identity with inconsistent contents |
| provider_fingerprint / event_fingerprint | provider namespace and provider event-id fingerprint; event may be null for observation without incoming event |
| evidence_digest | canonical SHA-256 normalized provider event, null only when no event supplied |
| event_type / normalized_state | finite existing 7B event/state enums |
| amount_minor / currency | positive exact safe-integer observed event cents / uppercase currency; not authoritative intent money |
| reconciled | normalized adapter observation flag; not a receipt, permission or completion |

Provider/payment/request references of incoming evidence must bind to the case and to the evaluation's exact event/evidence fingerprints. Case results can contain money mismatch observations; stored event money must stay labelled as provider-observed money and must never rewrite trusted intent price. Trusted intent amount/currency and lifecycleStatus are not supplied by current 7C outputs; do not invent case money or lifecycle columns. A future immutable-intent reference/contract extension must be reviewed before financial persistence activation.

The stored 7C result schema includes status/reason/action, observed payment/booking states, consistency/review flags, correlation and bounded evidence fingerprints. commercialSuccess remains false; applicationPaymentState remains PAYMENTS_DISABLED; all operation flags remain false. Current queue states are unresolved/awaiting/review/compensation only. PAID/REFUNDED/CANCELLED/RESOLVED must not be introduced as repository outcomes.

## Unique constraints and index plan

- Primary key case_family_id plus UNIQUE(request_id, provider_fingerprint, payment_fingerprint) protect stable correlation, independent of hash collision assumptions.
- Primary key observation_id enforces exact 7C identity uniqueness across case families.
- UNIQUE(provider_fingerprint, event_fingerprint) for incoming events prevents duplicate canonical evidence globally within the provider namespace; null event ids represent event-free reevaluations, not webhook replay protection.
- Foreign-key/composite checks bind observation provider/case identity to the owning case and prohibit dangling or cross-correlation attachment.
- Index observations(case_family_id, observed_at, observation_id) supports case history lookup. Time ordering here is retrieval order only; it never decides valid provider transitions.

No status/priority/category/manual-review indexes proposed yet: current UI filters supplied safe arrays and no DB query exists. Add only after a genuine server list/pagination contract and measured query pattern justify a read-model cache/index. No blanket JSONB GIN indexes.

Provider namespace currently means the synthetic normalized provider name. A chosen PSP may scope event ids per merchant/account/environment. Before activation define that trusted namespace and consistently include it in correlation/replay keys. The synthetic UNIQUE(provider,event-id) assumption is not vendor acceptance.

## Transactional upsert strategy

Future adapter uses one pg client and one transaction for upsertCase: validate/copy trusted input before opening transaction; establish/load the unique correlation row; lock it or use version-guarded update; check existing observation/event digest; insert immutable observation/evidence; update latest observation/version/times; commit. Never split case and event into independent best-effort writes.

Exact duplicate snapshot/event returns a no-effect duplicate result before stale expectedVersion rejection, allowing crash/retry idempotence without bumping version/times. Same event id with a different digest returns RECONCILIATION_EVIDENCE_CONFLICT/STATE_CONFLICT and preserves original evidence. Same snapshot id with inconsistent safe content is invalid. New evidence requires expectedVersion equal current version (zero for creation). Version conflict leaves case/evidence untouched. Insert/version/race uniqueness errors are mapped to fixed contract codes without SQL text, connection strings or raw DB exceptions.

The current fixture rejects a conflicting candidate atomically; it does not implement a durable rejected-event journal or force an updated conflict case. Future conflict-observation retention requires a separately reviewed trusted contract, using safe candidate fingerprints/observations while never overwriting the canonical event. Cross-correlation candidates are rejected by this seam; a genuine correlation-mismatch journal also remains future work. Neither gap is claimed closed by this design.

If commit response is lost, retry identical input; do not retry a charge/refund/booking. Future connection failures after commit require storage-outcome reconciliation rather than treating failure as proof of rollback. No charge/refund/cancel operation is part of the transaction.

## Concurrency and ordering

In-memory fixture uses synchronous validated commit inside an async-compatible method. It demonstrates local version and duplicate behavior only. Two instances/restarts share no records or replay guard. No distributed lock or DB transaction is implemented. CROSS-INSTANCE CONCURRENCY SAFETY: FUTURE DB REQUIREMENT.

Fixture requires canonical UTC observedAt and rejects older timestamps for new snapshots; production needs an authoritative server/database clock plus lock/version policy. Timestamps must not resolve payment unknown, override provider sequence rules or manufacture reconciliation evidence. Vendor ordering/replay windows/key rotation remain chosen-PSP work.

## Retention and operator audit boundary

PRODUCTION RETENTION POLICY: OWNER / LEGAL / OPERATIONS DECISION REQUIRED. No period, automatic deletion, archive job or soft-delete flag implemented. Stable keys/immutable observations permit future reviewed archival APIs. Archival/deletion must preserve required replay/uniqueness protection and audit obligations; it must not silently make old provider event ids acceptable again. Fingerprints are pseudonymous correlation aids, not encryption or proof of provenance.

OPERATOR AUDIT TRAIL: FUTURE REQUIREMENT. Future authorized actions must record actor identity/permissions, action, case identity/version, before/after state, safe reason, timestamp, idempotency key and actual execution/evidence result. Existing admin_actions may support that architecture after review, but arbitrary metadata and generic success/resolved labels cannot authorize money outcomes. No audit rows, mutation routes or controls created now.

## Security/data minimization

RAW WEBHOOK STORAGE: NOT REQUIRED / PROHIBITED BY CURRENT CONTRACT. Reject unknown properties at write envelope, case, diagnostic, manual-review and evidence boundaries. Reject accessors/custom serialization and non-normalized enum values. Only explicit safe metadata fields survive; no arbitrary metadata object.

No signatures/secrets/Authorization/API keys/JWT/DB URLs/offer tokens/full provider payload/unnecessary traveller PII. Never persist PAN, CVV/CVC, track data, PIN or full card details. Current architecture collects no card data and this design introduces no PCI-sensitive schema. Shape validation is not authentication; the server must supply actual verified card-free normalized evidence and trusted evaluator outputs. There is no browser write boundary.

## Future migration/activation plan

After explicit owner approval and DB provisioning, review provider namespace/trusted intent integration, storage-outcome/conflict-journal/retention decisions, schema constraints and authenticated read API. Create a separately reviewed numbered migration following existing conventions, test with isolated PostgreSQL, prove transaction uniqueness and crash/restart behavior across instances, then wire the repository into runtime under explicit promotion gates.

Future GET admin list/detail endpoints require backend admin authentication/permissions and existing 7D list/detail projection. Convert disabled read `{ source: 'unavailable', records: [] }` to the 7E unavailable envelope without fake rows; active adapter records feed 7D through stored snapshots, never persistence internals. 7F does not expose routes or activate frontend datasource. No automatic reconciliation, operator execution, real PSP or production-sales acceptance.
