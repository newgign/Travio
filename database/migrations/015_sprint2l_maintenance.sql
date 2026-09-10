CREATE TABLE IF NOT EXISTS maintenance_runs (
  id SERIAL PRIMARY KEY,
  operation VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'started',
  artifact_name VARCHAR(255),
  checksum VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_maintenance_runs_created_at
  ON maintenance_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_runs_operation_status
  ON maintenance_runs(operation, status);
