const pool = require("../db");
const systemEventService = require("./systemEventService");
const logger = require("../utils/logger");

const ACTIVE_STATUSES = ["open", "acknowledged"];

function clean(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function severity(value) {
  return String(value || "warning").toLowerCase() === "critical" ? "critical" : "warning";
}

async function openOrUpdate({ key, source, severity: level = "warning", title, summary, metadata = {} }) {
  const incidentKey = clean(key, 120);
  if (!incidentKey) throw new Error("Incident key is required");

  const current = await pool.query(
    `SELECT * FROM operational_incidents
     WHERE incident_key = $1 AND status = ANY($2::varchar[])
     ORDER BY id DESC LIMIT 1`,
    [incidentKey, ACTIVE_STATUSES]
  );

  if (current.rows[0]) {
    const updated = await pool.query(
      `UPDATE operational_incidents
       SET source = $2,
           severity = $3,
           title = $4,
           summary = $5,
           occurrence_count = occurrence_count + 1,
           last_detected_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        current.rows[0].id,
        clean(source, 60) || "system",
        severity(level),
        clean(title, 255) || incidentKey,
        clean(summary, 3000) || incidentKey,
        JSON.stringify(metadata || {}),
      ]
    );
    return { incident: updated.rows[0], created: false };
  }

  const inserted = await pool.query(
    `INSERT INTO operational_incidents
      (incident_key, source, severity, status, title, summary, metadata)
     VALUES ($1,$2,$3,'open',$4,$5,$6::jsonb)
     RETURNING *`,
    [
      incidentKey,
      clean(source, 60) || "system",
      severity(level),
      clean(title, 255) || incidentKey,
      clean(summary, 3000) || incidentKey,
      JSON.stringify(metadata || {}),
    ]
  );

  const incident = inserted.rows[0];
  await systemEventService.safeRecordEvent({
    level: incident.severity === "critical" ? "error" : "warn",
    category: "incident",
    code: "INCIDENT_OPENED",
    message: `${incident.title}: ${incident.summary}`,
    metadata: {
      release: "3A",
      incidentId: incident.id,
      incidentKey: incident.incident_key,
      source: incident.source,
      severity: incident.severity,
    },
  });
  return { incident, created: true };
}

async function resolveByKey(key, resolution = "condition_recovered") {
  const result = await pool.query(
    `UPDATE operational_incidents
     SET status = 'resolved', resolved_at = NOW(), resolution = $2,
         updated_at = NOW(), last_detected_at = NOW()
     WHERE incident_key = $1 AND status = ANY($3::varchar[])
     RETURNING *`,
    [clean(key, 120), clean(resolution, 120), ACTIVE_STATUSES]
  );

  for (const incident of result.rows) {
    await systemEventService.safeRecordEvent({
      level: "info",
      category: "incident",
      code: "INCIDENT_RESOLVED",
      message: `${incident.title}: condition recovered`,
      metadata: {
        release: "3A",
        incidentId: incident.id,
        incidentKey: incident.incident_key,
        source: incident.source,
        resolution: incident.resolution,
      },
    });
  }
  return result.rows;
}

async function acknowledge(id, userId) {
  const result = await pool.query(
    `UPDATE operational_incidents
     SET status = 'acknowledged', acknowledged_at = COALESCE(acknowledged_at, NOW()),
         acknowledged_by = COALESCE(acknowledged_by, $2), updated_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [id, userId || null]
  );
  const incident = result.rows[0] || null;
  if (incident) {
    await systemEventService.safeRecordEvent({
      level: "info",
      category: "incident",
      code: "INCIDENT_ACKNOWLEDGED",
      message: `${incident.title}: acknowledged by administrator`,
      userId: userId || null,
      metadata: { release: "3A", incidentId: incident.id, incidentKey: incident.incident_key },
    });
  }
  return incident;
}

async function list({ status = "all", limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const normalized = clean(status, 20).toLowerCase();
  const params = [];
  let where = "";
  if (["open", "acknowledged", "resolved", "active"].includes(normalized)) {
    if (normalized === "active") where = `WHERE oi.status IN ('open','acknowledged')`;
    else {
      params.push(normalized);
      where = `WHERE oi.status = $1`;
    }
  }
  params.push(safeLimit);
  const limitParam = `$${params.length}`;
  const result = await pool.query(
    `SELECT oi.*, u.full_name AS acknowledged_by_name, u.email AS acknowledged_by_email
     FROM operational_incidents oi
     LEFT JOIN users u ON u.id = oi.acknowledged_by
     ${where}
     ORDER BY CASE oi.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
              oi.updated_at DESC, oi.id DESC
     LIMIT ${limitParam}`,
    params
  );
  return result.rows;
}

async function counts() {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'open')::int AS open,
       COUNT(*) FILTER (WHERE status = 'acknowledged')::int AS acknowledged,
       COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
       COUNT(*) FILTER (WHERE status IN ('open','acknowledged') AND severity = 'critical')::int AS critical_active
     FROM operational_incidents`
  );
  return result.rows[0] || { open: 0, acknowledged: 0, resolved: 0, critical_active: 0 };
}

async function safeOpenOrUpdate(payload) {
  try {
    return await openOrUpdate(payload);
  } catch (error) {
    logger.warn("INCIDENT WRITE FAILED", { error: error, incidentKey: payload?.key || null });
    return null;
  }
}

async function safeResolveByKey(key, resolution) {
  try {
    return await resolveByKey(key, resolution);
  } catch (error) {
    logger.warn("INCIDENT RESOLVE FAILED", { error: error, incidentKey: key });
    return [];
  }
}

module.exports = {
  openOrUpdate,
  safeOpenOrUpdate,
  resolveByKey,
  safeResolveByKey,
  acknowledge,
  list,
  counts,
};
