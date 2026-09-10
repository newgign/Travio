const pool = require("../db");
const logger = require("../utils/logger");

function dbClient(client) {
  return client && typeof client.query === "function" ? client : pool;
}

function cleanText(value, max = 1000) {
  return String(value || "").slice(0, max);
}

async function recordEvent({
  client,
  level = "info",
  category = "system",
  code = null,
  message,
  requestId = null,
  userId = null,
  route = null,
  method = null,
  statusCode = null,
  durationMs = null,
  metadata = {},
}) {
  if (!message) return null;

  const result = await dbClient(client).query(
    `
    INSERT INTO system_events
      (level, category, code, message, request_id, user_id, route, method, status_code, duration_ms, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    RETURNING *
    `,
    [
      cleanText(level, 20).toLowerCase() || "info",
      cleanText(category, 50).toLowerCase() || "system",
      code ? cleanText(code, 80) : null,
      cleanText(message, 3000),
      requestId ? cleanText(requestId, 80) : null,
      userId || null,
      route ? cleanText(route, 255) : null,
      method ? cleanText(method, 12).toUpperCase() : null,
      Number.isFinite(Number(statusCode)) ? Number(statusCode) : null,
      Number.isFinite(Number(durationMs)) ? Math.max(0, Math.round(Number(durationMs))) : null,
      JSON.stringify(metadata || {}),
    ]
  );

  return result.rows[0] || null;
}

async function safeRecordEvent(payload) {
  try {
    return await recordEvent(payload);
  } catch (error) {
    logger.warn(`SYSTEM EVENT WRITE FAILED | ${error.message}`);
    return null;
  }
}

async function listRecent({ limit = 50, level = "", category = "" } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const clauses = [];
  const params = [];

  function add(value) {
    params.push(value);
    return `$${params.length}`;
  }

  if (level && level !== "all") clauses.push(`LOWER(se.level) = ${add(String(level).toLowerCase())}`);
  if (category && category !== "all") clauses.push(`LOWER(se.category) = ${add(String(category).toLowerCase())}`);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(safeLimit);

  const result = await pool.query(
    `
    SELECT se.id, se.level, se.category, se.code, se.message, se.request_id,
           se.user_id, se.route, se.method, se.status_code, se.duration_ms,
           se.metadata, se.created_at,
           u.full_name AS user_name, u.email AS user_email
    FROM system_events se
    LEFT JOIN users u ON u.id = se.user_id
    ${where}
    ORDER BY se.created_at DESC, se.id DESC
    LIMIT $${params.length}
    `,
    params
  );

  return result.rows;
}

module.exports = { recordEvent, safeRecordEvent, listRecent };
