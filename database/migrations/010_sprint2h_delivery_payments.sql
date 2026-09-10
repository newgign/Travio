-- Travio Sprint 2H
-- Delivery observability, notification retry metadata and payment-gateway readiness.

ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP;
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_retry
ON notification_outbox(status, next_attempt_at);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_provider VARCHAR(40);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS external_id VARCHAR(180);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_message TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
ON payments(idempotency_key)
WHERE idempotency_key IS NOT NULL;
