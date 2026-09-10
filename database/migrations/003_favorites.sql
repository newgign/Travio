CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_hotel_id VARCHAR(255) NOT NULL,
    hotel_data JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider, provider_hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id
ON favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_provider_hotel
ON favorites(provider, provider_hotel_id);
