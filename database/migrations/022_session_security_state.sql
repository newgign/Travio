-- Sprint 7M.1: additive foundation only. Execution and enforcement require separate approval.
-- Existing users receive version 1 and active=true through PostgreSQL column defaults.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version >= 1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
