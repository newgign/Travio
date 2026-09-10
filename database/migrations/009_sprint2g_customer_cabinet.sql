-- Travio Sprint 2G
-- Customer cabinet, saved travelers, voucher metadata and email notification outbox.

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) NOT NULL DEFAULT 'ru';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS booking_reminders BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS traveler_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(80) NOT NULL DEFAULT 'Турист',
    traveler_type VARCHAR(2) NOT NULL DEFAULT 'AD',
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120) NOT NULL,
    birth_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT traveler_profiles_type_check CHECK (traveler_type IN ('AD', 'CH'))
);

CREATE INDEX IF NOT EXISTS idx_traveler_profiles_user_id
ON traveler_profiles(user_id);

CREATE TABLE IF NOT EXISTS notification_outbox (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
    event_type VARCHAR(60) NOT NULL,
    recipient VARCHAR(320) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    provider VARCHAR(40),
    provider_message_id VARCHAR(255),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_user_id
ON notification_outbox(user_id);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_booking_id
ON notification_outbox(booking_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_outbox_booking_event
ON notification_outbox(booking_id, event_type)
WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status
ON notification_outbox(status);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_generated_at TIMESTAMP;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS search_filters JSONB NOT NULL DEFAULT '{}'::jsonb;
