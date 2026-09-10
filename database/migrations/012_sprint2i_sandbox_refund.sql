-- Travio Sprint 2I — safe sandbox refund flow.
-- Full-refund only. No real payment/refund gateway call exists in this sprint.

ALTER TABLE refund_requests
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);

CREATE UNIQUE INDEX IF NOT EXISTS ux_refund_requests_idempotency
ON refund_requests(idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_refund_requests_one_full_refund_per_payment
ON refund_requests(payment_id)
WHERE payment_id IS NOT NULL;
