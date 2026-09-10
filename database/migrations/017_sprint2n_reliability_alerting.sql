-- Travio Sprint 2N
-- Reliability & Alerting: persistent incident lifecycle and health history.

CREATE TABLE IF NOT EXISTS operational_incidents (
    id BIGSERIAL PRIMARY KEY,
    incident_key VARCHAR(120) NOT NULL,
    source VARCHAR(60) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning'
        CHECK (severity IN ('warning', 'critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'acknowledged', 'resolved')),
    title VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMP,
    acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    resolution VARCHAR(120),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Only one active lifecycle may exist for a given alert key. Once resolved,
-- the same condition can create a new historical incident later.
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_incidents_active_key
ON operational_incidents(incident_key)
WHERE status IN ('open', 'acknowledged');

CREATE INDEX IF NOT EXISTS idx_operational_incidents_status_updated
ON operational_incidents(status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_operational_incidents_source_created
ON operational_incidents(source, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_operational_incidents_severity_created
ON operational_incidents(severity, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS reliability_snapshots (
    id BIGSERIAL PRIMARY KEY,
    overall_state VARCHAR(20) NOT NULL
        CHECK (overall_state IN ('healthy', 'degraded', 'unhealthy')),
    components JSONB NOT NULL DEFAULT '{}'::jsonb,
    thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
    trigger VARCHAR(30) NOT NULL DEFAULT 'interval',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reliability_snapshots_created
ON reliability_snapshots(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_reliability_snapshots_state_created
ON reliability_snapshots(overall_state, created_at DESC);
