-- Sprint 7H: additive schema only. NOT executed or selected by runtime in this sprint.
CREATE TABLE IF NOT EXISTS reconciliation_cases (
  case_family_id TEXT PRIMARY KEY CHECK (case_family_id ~ '^[a-f0-9]{64}$'),
  request_id TEXT NOT NULL CHECK (request_id ~ '^[a-f0-9]{32}$'),
  provider_fingerprint TEXT NOT NULL CHECK (provider_fingerprint ~ '^[a-f0-9]{64}$'),
  payment_fingerprint TEXT NOT NULL CHECK (payment_fingerprint ~ '^[a-f0-9]{64}$'),
  latest_case_id TEXT NOT NULL CHECK (latest_case_id ~ '^[a-f0-9]{64}$'),
  version BIGINT NOT NULL CHECK (version >= 1),
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  status TEXT NOT NULL CHECK (status IN ('MANUAL_REVIEW_REQUIRED','COMPENSATION_REQUIRED','RECONCILIATION_REQUIRED','AWAITING_EVIDENCE')),
  manual_review_required BOOLEAN NOT NULL,
  compensation_required BOOLEAN NOT NULL,
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL CHECK (last_observed_at >= first_observed_at),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, provider_fingerprint, payment_fingerprint),
  UNIQUE (case_family_id, request_id, provider_fingerprint, payment_fingerprint)
);
CREATE TABLE IF NOT EXISTS reconciliation_observations (
  observation_id TEXT PRIMARY KEY CHECK (observation_id ~ '^[a-f0-9]{64}$'),
  case_family_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  provider_fingerprint TEXT NOT NULL,
  payment_fingerprint TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  snapshot_digest TEXT NOT NULL CHECK (snapshot_digest ~ '^[a-f0-9]{64}$'),
  event_fingerprint TEXT CHECK (event_fingerprint ~ '^[a-f0-9]{64}$'),
  evidence_digest TEXT CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  event_type TEXT CHECK (event_type IN ('payment.pending','payment.authorized','payment.captured','payment.failed','payment.cancelled','payment.unknown')),
  normalized_state TEXT,
  amount_minor BIGINT CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  currency TEXT CHECK (currency ~ '^[A-Z]{3}$'),
  reconciled BOOLEAN,
  CHECK ((event_fingerprint IS NULL AND evidence_digest IS NULL AND event_type IS NULL AND normalized_state IS NULL AND amount_minor IS NULL AND currency IS NULL AND reconciled IS NULL)
    OR (event_fingerprint IS NOT NULL AND evidence_digest IS NOT NULL AND event_type IS NOT NULL AND normalized_state IS NOT NULL AND amount_minor IS NOT NULL AND currency IS NOT NULL AND reconciled IS NOT NULL)),
  CONSTRAINT reconciliation_observations_correlation_fk FOREIGN KEY (case_family_id, request_id, provider_fingerprint, payment_fingerprint)
    REFERENCES reconciliation_cases (case_family_id, request_id, provider_fingerprint, payment_fingerprint),
  UNIQUE (provider_fingerprint, event_fingerprint)
);
CREATE INDEX IF NOT EXISTS reconciliation_observations_history_idx ON reconciliation_observations (case_family_id, observed_at, observation_id);
-- Cached classification is derived from the same conservative 7D aggregate on every distinct write.
CREATE INDEX IF NOT EXISTS reconciliation_cases_queue_idx ON reconciliation_cases (priority, case_family_id);
CREATE INDEX IF NOT EXISTS reconciliation_cases_status_idx ON reconciliation_cases (status);
CREATE INDEX IF NOT EXISTS reconciliation_cases_category_idx ON reconciliation_cases (category);
