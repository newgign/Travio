-- Travio Sprint 2M
-- Query indexes for operational dashboards, health incidents and maintenance history.

CREATE INDEX IF NOT EXISTS idx_system_events_code_created_at
ON system_events(code, created_at DESC)
WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_events_http_errors
ON system_events(status_code, created_at DESC)
WHERE status_code >= 400;

CREATE INDEX IF NOT EXISTS idx_maintenance_runs_operation_created_at
ON maintenance_runs(operation, created_at DESC);
