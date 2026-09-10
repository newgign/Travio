CREATE TABLE IF NOT EXISTS hotels (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50),
    provider_hotel_id VARCHAR(255),
    slug VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    city VARCHAR(100),
    stars INTEGER,
    rating NUMERIC(3,1),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    address TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotels_country
ON hotels(country);

CREATE INDEX IF NOT EXISTS idx_hotels_city
ON hotels(city);

CREATE INDEX IF NOT EXISTS idx_hotels_slug
ON hotels(slug);

CREATE INDEX IF NOT EXISTS idx_hotels_provider
ON hotels(provider);

CREATE INDEX IF NOT EXISTS idx_hotels_location
ON hotels(latitude, longitude);
