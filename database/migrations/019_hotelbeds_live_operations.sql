-- Additive only: historical observations and existing bookings remain intact.
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'hotelbeds';
CREATE INDEX IF NOT EXISTS price_history_provider_environment_latest
  ON price_history(provider, environment, offer_fingerprint, observed_at DESC);
CREATE TABLE IF NOT EXISTS provider_job_state (
  job text NOT NULL, environment text NOT NULL,
  last_run timestamptz, last_success timestamptz, last_error_category text,
  details jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(job, environment)
);
CREATE TABLE IF NOT EXISTS hotelbeds_tracked_searches (
  fingerprint text PRIMARY KEY, environment text NOT NULL,
  filters jsonb NOT NULL, last_viewed_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hotelbeds_tracked_searches_recent
  ON hotelbeds_tracked_searches(environment, last_viewed_at DESC);
CREATE TABLE IF NOT EXISTS provider_content_dictionaries (
  environment text NOT NULL, kind text NOT NULL, code text NOT NULL,
  data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(environment, kind, code)
);
ALTER TABLE provider_hotels ADD COLUMN IF NOT EXISTS content_environment text NOT NULL DEFAULT 'test';
ALTER TABLE provider_destinations ADD COLUMN IF NOT EXISTS content_environment text NOT NULL DEFAULT 'test';
