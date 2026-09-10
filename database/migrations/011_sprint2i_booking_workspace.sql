-- Travio Sprint 2I
-- Customer booking workspace, lifecycle audit trail and refund-readiness metadata.

CREATE TABLE IF NOT EXISTS booking_events (
    id BIGSERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_key VARCHAR(180) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    actor_type VARCHAR(30) NOT NULL DEFAULT 'system',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(60),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(booking_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_booking_events_booking_time
ON booking_events(booking_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_booking_events_user
ON booking_events(user_id, occurred_at DESC);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(30) NOT NULL DEFAULT 'not_requested';

CREATE TABLE IF NOT EXISTS refund_requests (
    id BIGSERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'KZT',
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    provider VARCHAR(40) NOT NULL DEFAULT 'none',
    external_id VARCHAR(180),
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    requested_at TIMESTAMP,
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_booking
ON refund_requests(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refund_requests_status
ON refund_requests(status, created_at DESC);

-- Backfill a minimal lifecycle for existing bookings. ON CONFLICT keeps migration idempotent.
INSERT INTO booking_events
(booking_id, user_id, event_key, event_type, actor_type, title, description, status, metadata, occurred_at)
SELECT
    b.id,
    b.user_id,
    'booking-created',
    'booking_created',
    'customer',
    'Бронирование создано',
    'Заявка Travio зарегистрирована.',
    b.status,
    jsonb_build_object('provider', COALESCE(b.provider, 'legacy')),
    COALESCE(b.booking_date, NOW())
FROM bookings b
ON CONFLICT (booking_id, event_key) DO NOTHING;

INSERT INTO booking_events
(booking_id, user_id, event_key, event_type, actor_type, title, description, status, metadata, occurred_at)
SELECT
    b.id,
    b.user_id,
    'booking-confirmed',
    'booking_confirmed',
    CASE WHEN b.provider = 'hotelbeds' THEN 'provider' ELSE 'system' END,
    'Бронирование подтверждено',
    CASE WHEN b.provider = 'hotelbeds'
      THEN 'Hotelbeds TEST подтвердил бронирование.'
      ELSE 'Travio подтвердил бронирование.'
    END,
    COALESCE(b.provider_status, b.status),
    jsonb_build_object(
      'provider', COALESCE(b.provider, 'legacy'),
      'providerReference', b.provider_booking_id
    ),
    COALESCE(b.confirmed_at, b.updated_at, b.booking_date, NOW())
FROM bookings b
WHERE b.confirmed_at IS NOT NULL
   OR b.status = 'Подтверждена'
   OR UPPER(COALESCE(b.provider_status, '')) IN ('CONFIRMED', 'MODIFIED')
ON CONFLICT (booking_id, event_key) DO NOTHING;

INSERT INTO booking_events
(booking_id, user_id, event_key, event_type, actor_type, title, description, status, metadata, occurred_at)
SELECT
    b.id,
    b.user_id,
    'booking-cancelled',
    'booking_cancelled',
    CASE WHEN b.provider = 'hotelbeds' THEN 'provider' ELSE 'system' END,
    'Бронирование отменено',
    CASE WHEN b.provider = 'hotelbeds'
      THEN 'Отмена подтверждена Hotelbeds TEST.'
      ELSE 'Бронирование отменено в Travio.'
    END,
    COALESCE(b.provider_status, b.status),
    jsonb_build_object('providerReference', b.provider_booking_id),
    COALESCE(b.provider_cancelled_at, b.cancelled_at, b.updated_at, NOW())
FROM bookings b
WHERE b.status = 'Отменена'
   OR b.provider_cancelled_at IS NOT NULL
   OR b.cancelled_at IS NOT NULL
   OR UPPER(COALESCE(b.provider_status, '')) IN ('CANCELLED', 'CANCELED')
ON CONFLICT (booking_id, event_key) DO NOTHING;

INSERT INTO booking_events
(booking_id, user_id, event_key, event_type, actor_type, title, description, status, metadata, occurred_at)
SELECT
    b.id,
    b.user_id,
    'payment-' || p.id::text || '-paid',
    'payment_completed',
    'system',
    CASE WHEN p.gateway_provider = 'sandbox'
      THEN 'Sandbox-оплата завершена'
      ELSE 'Оплата отмечена завершённой'
    END,
    CASE WHEN LOWER(COALESCE(p.metadata->>'realCharge', 'false')) <> 'true'
      THEN 'Реального списания денег не выполнялось.'
      ELSE 'Платёж завершён.'
    END,
    p.status,
    jsonb_build_object(
      'paymentId', p.id,
      'gatewayProvider', p.gateway_provider,
      'amount', p.amount,
      'realCharge', CASE WHEN LOWER(COALESCE(p.metadata->>'realCharge', 'false')) = 'true' THEN TRUE ELSE FALSE END
    ),
    COALESCE(p.paid_at, p.updated_at, p.created_at, NOW())
FROM payments p
JOIN bookings b ON b.id = p.booking_id
WHERE p.status = 'paid'
ON CONFLICT (booking_id, event_key) DO NOTHING;

INSERT INTO booking_events
(booking_id, user_id, event_key, event_type, actor_type, title, description, status, metadata, occurred_at)
SELECT
    b.id,
    b.user_id,
    'provider-last-sync',
    'provider_synced',
    'provider',
    'Статус поставщика синхронизирован',
    'Travio сохранил актуальный статус поставщика.',
    b.provider_status,
    jsonb_build_object('provider', b.provider, 'providerReference', b.provider_booking_id),
    b.provider_synced_at
FROM bookings b
WHERE b.provider_synced_at IS NOT NULL
ON CONFLICT (booking_id, event_key) DO NOTHING;
