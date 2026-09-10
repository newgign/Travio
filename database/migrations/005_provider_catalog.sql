-- Travio Sprint 2C
-- Persistent static provider catalog. Hotelbeds Content API must be synced
-- into our database and must NOT be called in real time from user searches.

CREATE TABLE IF NOT EXISTS provider_destinations (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    code VARCHAR(100) NOT NULL,
    country_code VARCHAR(10),
    country_name VARCHAR(120),
    name VARCHAR(255),
    zones JSONB NOT NULL DEFAULT '[]'::jsonb,
    group_zones JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(provider, code)
);

CREATE INDEX IF NOT EXISTS idx_provider_destinations_country
ON provider_destinations(provider, country_code);

CREATE INDEX IF NOT EXISTS idx_provider_destinations_country_name
ON provider_destinations(provider, LOWER(country_name));

CREATE INDEX IF NOT EXISTS idx_provider_destinations_name
ON provider_destinations(provider, LOWER(name));


CREATE TABLE IF NOT EXISTS provider_hotels (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    provider_hotel_id VARCHAR(255) NOT NULL,
    country_code VARCHAR(10),
    country_name VARCHAR(120),
    destination_code VARCHAR(100),
    zone_code INTEGER,
    city VARCHAR(255),
    name VARCHAR(500) NOT NULL,
    category_code VARCHAR(50),
    stars INTEGER NOT NULL DEFAULT 0,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    address TEXT,
    postal_code VARCHAR(80),
    description TEXT,
    website TEXT,
    email TEXT,
    phone VARCHAR(100),
    image_url TEXT,
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    facilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    rooms JSONB NOT NULL DEFAULT '[]'::jsonb,
    board_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_hotels_country
ON provider_hotels(provider, country_code);

CREATE INDEX IF NOT EXISTS idx_provider_hotels_country_name
ON provider_hotels(provider, LOWER(country_name));

CREATE INDEX IF NOT EXISTS idx_provider_hotels_destination
ON provider_hotels(provider, destination_code);

CREATE INDEX IF NOT EXISTS idx_provider_hotels_city
ON provider_hotels(provider, LOWER(city));

CREATE INDEX IF NOT EXISTS idx_provider_hotels_name
ON provider_hotels(provider, LOWER(name));
