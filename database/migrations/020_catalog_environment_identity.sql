-- Preserve every row while allowing the same provider identity in TEST and LIVE.
CREATE UNIQUE INDEX IF NOT EXISTS provider_destinations_environment_identity
ON provider_destinations(provider, code, content_environment);
CREATE UNIQUE INDEX IF NOT EXISTS provider_hotels_environment_identity
ON provider_hotels(provider, provider_hotel_id, content_environment);
ALTER TABLE provider_destinations DROP CONSTRAINT IF EXISTS provider_destinations_provider_code_key;
ALTER TABLE provider_hotels DROP CONSTRAINT IF EXISTS provider_hotels_provider_provider_hotel_id_key;
