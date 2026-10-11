-- Sprint 7X. Additive inert schema; no historical adoption or commercial activation.
-- Transaction and once-only ledger are controlled by scripts/migrate.js.
ALTER TABLE bookings ADD COLUMN checkout_token VARCHAR(80);
ALTER TABLE bookings ADD CONSTRAINT commercial_booking_checkout_fk FOREIGN KEY (checkout_token) REFERENCES checkout_sessions(token) ON DELETE NO ACTION;
CREATE UNIQUE INDEX commercial_booking_checkout_unique ON bookings(checkout_token) WHERE checkout_token IS NOT NULL;
ALTER TABLE bookings ADD CONSTRAINT commercial_booking_owner_unique UNIQUE(id,user_id);
ALTER TABLE payments ADD CONSTRAINT commercial_payment_booking_unique UNIQUE(id,booking_id);
ALTER TABLE refund_requests ADD CONSTRAINT commercial_refund_payment_booking_unique UNIQUE(id,payment_id,booking_id);

CREATE TABLE commercial_operations (
 operation_id UUID PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
 booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE NO ACTION,
 payment_id INTEGER REFERENCES payments(id) ON DELETE NO ACTION,
 refund_request_id BIGINT REFERENCES refund_requests(id) ON DELETE NO ACTION,
 operation_type TEXT NOT NULL CHECK(operation_type IN ('PROVIDER_BOOKING','PAYMENT_CHARGE','PROVIDER_CANCELLATION','PAYMENT_REFUND')),
 execution_environment TEXT NOT NULL CHECK(execution_environment IN ('synthetic','sandbox','live')),
 adapter_id VARCHAR(64) NOT NULL CHECK(adapter_id ~ '^[A-Za-z0-9_-]{1,64}$'),
 adapter_account_scope VARCHAR(64) NOT NULL CHECK(adapter_account_scope ~ '^[A-Za-z0-9_-]{1,64}$'),
 idempotency_key VARCHAR(128) NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9_-]{1,128}$'),
 payload_digest CHAR(64) NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
 context_version SMALLINT NOT NULL CHECK(context_version > 0),
 context_expires_at TIMESTAMPTZ,
 amount_minor BIGINT,
 currency VARCHAR(3),
 state TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(state IN ('REQUESTED','CLAIMED','DISPATCHING','FAILED_RETRYABLE','OUTCOME_UNKNOWN','SUCCEEDED','FAILED_FINAL')),
 version BIGINT NOT NULL DEFAULT 1 CHECK(version > 0),
 attempt_no INTEGER NOT NULL DEFAULT 0 CHECK(attempt_no >= 0),
 claim_token UUID,
 claimed_at TIMESTAMPTZ,
 external_reference VARCHAR(255) CHECK(external_reference IS NULL OR length(external_reference) BETWEEN 1 AND 255),
 safe_result_code VARCHAR(80) CHECK(safe_result_code IS NULL OR safe_result_code ~ '^[A-Z0-9_]{1,80}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 CONSTRAINT commercial_operation_owner_fk FOREIGN KEY(booking_id,user_id) REFERENCES bookings(id,user_id) ON DELETE NO ACTION,
 CONSTRAINT commercial_operation_payment_fk FOREIGN KEY(payment_id,booking_id) REFERENCES payments(id,booking_id) ON DELETE NO ACTION,
 CONSTRAINT commercial_operation_refund_fk FOREIGN KEY(refund_request_id,payment_id,booking_id) REFERENCES refund_requests(id,payment_id,booking_id) ON DELETE NO ACTION,
 CONSTRAINT commercial_operation_scope_unique UNIQUE(user_id,booking_id,operation_type,idempotency_key),
 CONSTRAINT commercial_operation_resource_shape CHECK(
  (operation_type IN ('PROVIDER_BOOKING','PROVIDER_CANCELLATION') AND payment_id IS NULL AND refund_request_id IS NULL)
  OR (operation_type='PAYMENT_CHARGE' AND payment_id IS NOT NULL AND refund_request_id IS NULL)
  OR (operation_type='PAYMENT_REFUND' AND payment_id IS NOT NULL AND refund_request_id IS NOT NULL)),
 CONSTRAINT commercial_operation_money CHECK(
  (operation_type IN ('PROVIDER_BOOKING','PROVIDER_CANCELLATION') AND amount_minor IS NULL AND currency IS NULL)
  OR (operation_type IN ('PAYMENT_CHARGE','PAYMENT_REFUND') AND amount_minor IS NOT NULL AND currency IS NOT NULL
   AND amount_minor BETWEEN 1 AND 9007199254740991 AND currency ~ '^[A-Z]{3}$')),
 CONSTRAINT commercial_operation_claim_shape CHECK(
  (state IN ('CLAIMED','DISPATCHING') AND claim_token IS NOT NULL AND claimed_at IS NOT NULL AND attempt_no > 0)
  OR (state NOT IN ('CLAIMED','DISPATCHING') AND claim_token IS NULL AND claimed_at IS NULL)),
 CONSTRAINT commercial_operation_completion_shape CHECK(
  (state IN ('SUCCEEDED','FAILED_FINAL') AND completed_at IS NOT NULL)
  OR (state NOT IN ('SUCCEEDED','FAILED_FINAL') AND completed_at IS NULL)),
 CONSTRAINT commercial_operation_time_order CHECK(updated_at >= created_at AND (completed_at IS NULL OR completed_at >= created_at))
);
CREATE UNIQUE INDEX commercial_operation_booking_unique ON commercial_operations(booking_id,operation_type) WHERE operation_type='PROVIDER_BOOKING';
CREATE UNIQUE INDEX commercial_operation_charge_unique ON commercial_operations(booking_id,operation_type) WHERE operation_type='PAYMENT_CHARGE';
CREATE UNIQUE INDEX commercial_operation_cancellation_unique ON commercial_operations(booking_id,operation_type) WHERE operation_type='PROVIDER_CANCELLATION';
CREATE UNIQUE INDEX commercial_operation_full_refund_unique ON commercial_operations(payment_id) WHERE operation_type='PAYMENT_REFUND';
CREATE UNIQUE INDEX commercial_operation_external_unique ON commercial_operations(adapter_id,adapter_account_scope,execution_environment,operation_type,external_reference)
 WHERE external_reference IS NOT NULL AND operation_type IN ('PROVIDER_BOOKING','PAYMENT_CHARGE');
CREATE INDEX commercial_operation_recovery_idx ON commercial_operations(state,updated_at,operation_id);
CREATE INDEX commercial_operation_account_idx ON commercial_operations(user_id,created_at,operation_id);
CREATE INDEX commercial_operation_payment_idx ON commercial_operations(payment_id);
CREATE INDEX commercial_operation_refund_idx ON commercial_operations(refund_request_id);

CREATE TABLE commercial_operation_attempts (
 operation_id UUID NOT NULL REFERENCES commercial_operations(operation_id) ON DELETE NO ACTION,
 attempt_no INTEGER NOT NULL CHECK(attempt_no > 0),
 claim_token UUID NOT NULL UNIQUE,
 claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 dispatch_authorized_at TIMESTAMPTZ,
 finished_at TIMESTAMPTZ,
 outcome TEXT NOT NULL CHECK(outcome IN ('CLAIMED','DISPATCHING','NOT_SENT','OUTCOME_UNKNOWN','SUCCEEDED','FAILED_FINAL')),
 safe_code VARCHAR(80) CHECK(safe_code IS NULL OR safe_code ~ '^[A-Z0-9_]{1,80}$'),
 PRIMARY KEY(operation_id,attempt_no),
 CHECK((outcome IN ('CLAIMED','DISPATCHING') AND finished_at IS NULL) OR (outcome NOT IN ('CLAIMED','DISPATCHING') AND finished_at IS NOT NULL)),
 CHECK(outcome <> 'DISPATCHING' OR dispatch_authorized_at IS NOT NULL),
 CHECK(dispatch_authorized_at IS NULL OR dispatch_authorized_at >= claimed_at),
 CHECK(finished_at IS NULL OR finished_at >= claimed_at)
);
CREATE UNIQUE INDEX commercial_operation_attempt_active_unique ON commercial_operation_attempts(operation_id) WHERE finished_at IS NULL;
CREATE INDEX commercial_operation_attempt_recovery_idx ON commercial_operation_attempts(outcome,dispatch_authorized_at,operation_id);

CREATE TABLE commercial_operation_evidence (
 evidence_id UUID PRIMARY KEY,
 operation_id UUID NOT NULL REFERENCES commercial_operations(operation_id) ON DELETE NO ACTION,
 adapter_id VARCHAR(64) NOT NULL CHECK(adapter_id ~ '^[A-Za-z0-9_-]{1,64}$'),
 adapter_account_scope VARCHAR(64) NOT NULL CHECK(adapter_account_scope ~ '^[A-Za-z0-9_-]{1,64}$'),
 execution_environment TEXT NOT NULL CHECK(execution_environment IN ('synthetic','sandbox','live')),
 event_identity_digest CHAR(64) NOT NULL CHECK(event_identity_digest ~ '^[a-f0-9]{64}$'),
 payload_digest CHAR(64) NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
 evidence_level TEXT NOT NULL CHECK(evidence_level IN ('SYNTHETIC','SANDBOX','UNVERIFIED_PROVIDER','LIVE_VERIFIED')),
 source_kind TEXT NOT NULL CHECK(source_kind IN ('SERVER_DECISION','ADAPTER_EVENT','ADAPTER_LOOKUP')),
 normalized_outcome TEXT NOT NULL CHECK(normalized_outcome IN ('PENDING','SUCCEEDED','FAILED_FINAL','NOT_SENT','OUTCOME_UNKNOWN')),
 external_reference VARCHAR(255) CHECK(external_reference IS NULL OR length(external_reference) BETWEEN 1 AND 255),
 amount_minor BIGINT,
 currency VARCHAR(3),
 observed_at TIMESTAMPTZ NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 verification_receipt_id UUID,
 UNIQUE(evidence_id,operation_id),
 UNIQUE(adapter_id,adapter_account_scope,execution_environment,event_identity_digest),
 CHECK((amount_minor IS NULL AND currency IS NULL) OR (amount_minor IS NOT NULL AND currency IS NOT NULL
  AND amount_minor BETWEEN 1 AND 9007199254740991 AND currency ~ '^[A-Z]{3}$')),
 CHECK(evidence_level <> 'LIVE_VERIFIED' OR (execution_environment='live' AND source_kind <> 'SERVER_DECISION' AND verification_receipt_id IS NOT NULL)),
 CHECK(execution_environment <> 'synthetic' OR evidence_level='SYNTHETIC'),
 CHECK(execution_environment <> 'sandbox' OR evidence_level IN ('SANDBOX','UNVERIFIED_PROVIDER'))
);
CREATE INDEX commercial_operation_evidence_history_idx ON commercial_operation_evidence(operation_id,received_at,evidence_id);
ALTER TABLE commercial_operations ADD COLUMN result_evidence_id UUID;
ALTER TABLE commercial_operations ADD CONSTRAINT commercial_operation_result_fk FOREIGN KEY(result_evidence_id,operation_id)
 REFERENCES commercial_operation_evidence(evidence_id,operation_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE commercial_operations ADD CONSTRAINT commercial_operation_result_shape CHECK(
 (state IN ('SUCCEEDED','FAILED_FINAL') AND result_evidence_id IS NOT NULL) OR (state NOT IN ('SUCCEEDED','FAILED_FINAL') AND result_evidence_id IS NULL));
CREATE INDEX commercial_operation_result_idx ON commercial_operations(result_evidence_id,operation_id);

CREATE TABLE commercial_operation_reconciliation_attempts (
 reconciliation_id UUID PRIMARY KEY,
 operation_id UUID NOT NULL REFERENCES commercial_operations(operation_id) ON DELETE NO ACTION,
 sequence_no INTEGER NOT NULL CHECK(sequence_no > 0),
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('SERVER_LOOKUP','OPERATOR_REVIEW')),
 started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 finished_at TIMESTAMPTZ,
 outcome TEXT NOT NULL CHECK(outcome IN ('IN_PROGRESS','UNRESOLVED','CONFIRMED_SUCCESS','CONFIRMED_FAILURE','PROVEN_NOT_SENT','CONFLICT')),
 evidence_id UUID,
 safe_code VARCHAR(80) CHECK(safe_code IS NULL OR safe_code ~ '^[A-Z0-9_]{1,80}$'),
 UNIQUE(operation_id,sequence_no),
 CONSTRAINT commercial_reconciliation_receipt_fk FOREIGN KEY(evidence_id,operation_id) REFERENCES commercial_operation_evidence(evidence_id,operation_id) ON DELETE NO ACTION,
 CHECK((outcome='IN_PROGRESS' AND finished_at IS NULL) OR (outcome<>'IN_PROGRESS' AND finished_at IS NOT NULL)),
 CHECK(finished_at IS NULL OR finished_at >= started_at)
);
CREATE UNIQUE INDEX commercial_operation_reconciliation_active_unique ON commercial_operation_reconciliation_attempts(operation_id) WHERE finished_at IS NULL;
CREATE INDEX commercial_operation_reconciliation_evidence_idx ON commercial_operation_reconciliation_attempts(evidence_id,operation_id);
CREATE TABLE commercial_operation_reconciliation_cases (
 operation_id UUID NOT NULL REFERENCES commercial_operations(operation_id) ON DELETE NO ACTION,
 case_family_id TEXT NOT NULL REFERENCES reconciliation_cases(case_family_id) ON DELETE NO ACTION,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(operation_id,case_family_id)
);
CREATE INDEX commercial_operation_reconciliation_case_idx ON commercial_operation_reconciliation_cases(case_family_id);

CREATE FUNCTION commercial_operation_update_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.state <> 'REQUESTED' OR NEW.attempt_no <> 0 OR NEW.version <> 1 THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_OPERATION_INITIAL_STATE'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_OPERATION_PRESERVED'; END IF;
 IF ROW(NEW.operation_id,NEW.user_id,NEW.booking_id,NEW.payment_id,NEW.refund_request_id,NEW.operation_type,
  NEW.execution_environment,NEW.adapter_id,NEW.adapter_account_scope,NEW.idempotency_key,NEW.payload_digest,
  NEW.context_version,NEW.context_expires_at,NEW.amount_minor,NEW.currency,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.operation_id,OLD.user_id,OLD.booking_id,OLD.payment_id,OLD.refund_request_id,OLD.operation_type,
  OLD.execution_environment,OLD.adapter_id,OLD.adapter_account_scope,OLD.idempotency_key,OLD.payload_digest,
  OLD.context_version,OLD.context_expires_at,OLD.amount_minor,OLD.currency,OLD.created_at) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_OPERATION_IMMUTABLE';
 END IF;
 IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
 IF OLD.state IN ('SUCCEEDED','FAILED_FINAL') THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_OPERATION_TERMINAL'; END IF;
 IF NEW.version <> OLD.version+1 OR NEW.attempt_no < OLD.attempt_no THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_OPERATION_VERSION'; END IF;
 IF NOT ((OLD.state='REQUESTED' AND NEW.state IN ('CLAIMED','FAILED_FINAL'))
  OR (OLD.state='CLAIMED' AND NEW.state IN ('DISPATCHING','FAILED_RETRYABLE','FAILED_FINAL'))
  OR (OLD.state='DISPATCHING' AND NEW.state IN ('SUCCEEDED','FAILED_FINAL','FAILED_RETRYABLE','OUTCOME_UNKNOWN'))
  OR (OLD.state='FAILED_RETRYABLE' AND NEW.state IN ('CLAIMED','FAILED_FINAL'))
  OR (OLD.state='OUTCOME_UNKNOWN' AND NEW.state IN ('SUCCEEDED','FAILED_FINAL','FAILED_RETRYABLE'))) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_OPERATION_TRANSITION'; END IF;
 IF NEW.state='CLAIMED' THEN
  IF NEW.attempt_no <> OLD.attempt_no+1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_OPERATION_ATTEMPT'; END IF;
 ELSIF NEW.attempt_no <> OLD.attempt_no THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_OPERATION_ATTEMPT'; END IF;
 IF OLD.state='CLAIMED' AND NEW.state='DISPATCHING' AND ROW(NEW.claim_token,NEW.claimed_at) IS DISTINCT FROM ROW(OLD.claim_token,OLD.claimed_at) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_OPERATION_CLAIM'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_operation_update_guard BEFORE INSERT OR UPDATE OR DELETE ON commercial_operations FOR EACH ROW EXECUTE FUNCTION commercial_operation_update_guard();

CREATE FUNCTION commercial_operation_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='commercial_operation_evidence' OR TG_OP='DELETE' THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_EVIDENCE_PRESERVED'; END IF;
 IF ROW(NEW.operation_id,NEW.attempt_no,NEW.claim_token,NEW.claimed_at) IS DISTINCT FROM ROW(OLD.operation_id,OLD.attempt_no,OLD.claim_token,OLD.claimed_at)
  OR (OLD.finished_at IS NOT NULL AND NEW IS DISTINCT FROM OLD)
  OR (OLD.dispatch_authorized_at IS NOT NULL AND NEW.dispatch_authorized_at IS DISTINCT FROM OLD.dispatch_authorized_at) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_ATTEMPT_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_evidence_guard BEFORE UPDATE OR DELETE ON commercial_operation_evidence FOR EACH ROW EXECUTE FUNCTION commercial_operation_child_guard();
CREATE TRIGGER commercial_attempt_guard BEFORE UPDATE OR DELETE ON commercial_operation_attempts FOR EACH ROW EXECUTE FUNCTION commercial_operation_child_guard();

CREATE FUNCTION commercial_operation_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op commercial_operations%ROWTYPE; receipt commercial_operation_evidence%ROWTYPE;
BEGIN
 SELECT * INTO op FROM commercial_operations WHERE operation_id=NEW.operation_id;
 IF op.state NOT IN ('SUCCEEDED','FAILED_FINAL') THEN RETURN NULL; END IF;
 SELECT * INTO receipt FROM commercial_operation_evidence WHERE evidence_id=op.result_evidence_id AND operation_id=op.operation_id;
 IF NOT FOUND OR receipt.normalized_outcome <> op.state
  OR ROW(receipt.adapter_id,receipt.adapter_account_scope,receipt.execution_environment,receipt.amount_minor,receipt.currency)
   IS DISTINCT FROM ROW(op.adapter_id,op.adapter_account_scope,op.execution_environment,op.amount_minor,op.currency)
  OR (op.state='SUCCEEDED' AND (receipt.source_kind='SERVER_DECISION' OR op.attempt_no=0))
  OR receipt.external_reference IS DISTINCT FROM op.external_reference THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_RESULT_INVALID'; END IF;
 IF op.state='SUCCEEDED' AND NOT EXISTS(SELECT 1 FROM commercial_operation_attempts a
  WHERE a.operation_id=op.operation_id AND a.attempt_no=op.attempt_no AND a.dispatch_authorized_at IS NOT NULL) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='COMMERCIAL_RESULT_ATTEMPT_REQUIRED'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER commercial_operation_result_guard AFTER INSERT OR UPDATE ON commercial_operations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commercial_operation_result_guard();
