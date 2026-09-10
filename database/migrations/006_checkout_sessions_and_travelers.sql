-- Travio Sprint 2E
-- Server-side checkout sessions keep the selected provider offer/rateKey intact
-- between Availability/CheckRate and Booking confirmation.

CREATE TABLE IF NOT EXISTS checkout_sessions (
    token VARCHAR(80) PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    provider_hotel_id VARCHAR(255) NOT NULL,
    provider_offer_id TEXT NOT NULL,
    rate_type VARCHAR(50),
    currency VARCHAR(10) NOT NULL DEFAULT 'KZT',
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    offer_snapshot JSONB NOT NULL,
    search_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_expires_at
ON checkout_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_provider_offer
ON checkout_sessions(provider, provider_offer_id);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS travelers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_response JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_client_reference VARCHAR(120);
ALTER TABLE bookings ALTER COLUMN provider_offer_id TYPE TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_provider_client_reference
ON bookings(provider, provider_client_reference)
WHERE provider_client_reference IS NOT NULL;
