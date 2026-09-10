-- Additive migration. No seeded/demo prices and no changes to booking tables.
CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  offer_fingerprint TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('live', 'test')),
  currency TEXT NOT NULL,
  price NUMERIC(18, 4) NOT NULL CHECK (price > 0),
  offer_snapshot JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS price_history_identity_observed_idx
  ON price_history (offer_fingerprint, environment, observed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS price_history_recent_idx
  ON price_history (environment, observed_at DESC);
