-- Travio Sprint 2F
-- Booking resilience, price audit and provider reconciliation state.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quoted_amount NUMERIC(14,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quoted_currency VARCHAR(10);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_last_error JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_reconciled_at TIMESTAMP;

UPDATE bookings
SET quoted_amount = COALESCE(
      quoted_amount,
      CASE
        WHEN COALESCE(offer_snapshot->>'price', '') ~ '^[0-9]+([.][0-9]+)?$'
          THEN (offer_snapshot->>'price')::NUMERIC
        ELSE total_amount
      END
    ),
    quoted_currency = COALESCE(
      quoted_currency,
      NULLIF(offer_snapshot->>'currency', ''),
      currency
    )
WHERE quoted_amount IS NULL OR quoted_currency IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_provider_reconciled_at
ON bookings(provider_reconciled_at)
WHERE provider_reconciled_at IS NOT NULL;
