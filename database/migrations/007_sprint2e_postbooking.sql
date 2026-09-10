-- Travio Sprint 2E post-booking state.
-- Keep provider snapshots immutable enough for support/reconciliation while
-- allowing the latest provider response to be synchronized.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_synced_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_cancelled_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_cancellation_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_bookings_provider_status
ON bookings(provider, provider_status);

CREATE INDEX IF NOT EXISTS idx_bookings_provider_synced_at
ON bookings(provider_synced_at)
WHERE provider_synced_at IS NOT NULL;
