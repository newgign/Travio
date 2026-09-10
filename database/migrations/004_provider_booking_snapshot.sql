-- Travio Sprint 2A
-- Provider-aware booking snapshots.
-- New bookings no longer need to create duplicate rows in the legacy tours table.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_hotel_id VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_offer_id VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_booking_id VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_status VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'KZT';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS offer_snapshot JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;

-- Legacy bookings still keep tour_id. Provider bookings may store the immutable
-- booked offer snapshot directly and therefore do not require a tours row.
ALTER TABLE bookings ALTER COLUMN tour_id DROP NOT NULL;

UPDATE bookings
SET provider = 'legacy'
WHERE provider IS NULL OR TRIM(provider) = '';

UPDATE bookings
SET currency = 'KZT'
WHERE currency IS NULL OR TRIM(currency) = '';

UPDATE bookings b
SET total_amount = COALESCE(
    (
        SELECT p.amount
        FROM payments p
        WHERE p.booking_id = b.id
        ORDER BY p.id DESC
        LIMIT 1
    ),
    (
        SELECT t.price
        FROM tours t
        WHERE t.id = b.tour_id
    ),
    0
)
WHERE total_amount IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_provider_hotel
ON bookings(provider, provider_hotel_id);

CREATE INDEX IF NOT EXISTS idx_bookings_provider_offer
ON bookings(provider, provider_offer_id);

CREATE INDEX IF NOT EXISTS idx_bookings_provider_booking
ON bookings(provider, provider_booking_id)
WHERE provider_booking_id IS NOT NULL;
