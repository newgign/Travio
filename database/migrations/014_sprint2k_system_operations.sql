-- Travio Sprint 2K
-- System health / observability support for safe pre-production hardening.

CREATE TABLE IF NOT EXISTS system_events (
    id BIGSERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL DEFAULT 'info',
    category VARCHAR(50) NOT NULL DEFAULT 'system',
    code VARCHAR(80),
    message TEXT NOT NULL,
    request_id VARCHAR(80),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    route VARCHAR(255),
    method VARCHAR(12),
    status_code INTEGER,
    duration_ms INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_events_created_at
ON system_events(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_system_events_level
ON system_events(level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_events_category
ON system_events(category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_events_request_id
ON system_events(request_id)
WHERE request_id IS NOT NULL;
