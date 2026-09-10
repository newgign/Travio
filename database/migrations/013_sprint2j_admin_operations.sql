-- Travio Sprint 2J
-- Admin operations center and administrative audit trail.

CREATE TABLE IF NOT EXISTS admin_actions (
    id BIGSERIAL PRIMARY KEY,
    admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    action_type VARCHAR(80) NOT NULL,
    target_type VARCHAR(60) NOT NULL DEFAULT 'system',
    target_id VARCHAR(180),
    status VARCHAR(30) NOT NULL DEFAULT 'success',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at
ON admin_actions(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin
ON admin_actions(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_booking
ON admin_actions(booking_id, created_at DESC)
WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_actions_type
ON admin_actions(action_type, created_at DESC);
