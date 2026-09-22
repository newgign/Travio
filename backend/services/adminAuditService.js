const pool = require("../db");
const logger = require("../utils/logger");

function dbClient(client) {
  return client && typeof client.query === "function" ? client : pool;
}

async function recordAction({
  client,
  adminId,
  bookingId = null,
  actionType,
  targetType = "system",
  targetId = null,
  status = "success",
  metadata = {},
}) {
  if (!adminId || !actionType) return null;

  const result = await dbClient(client).query(
    `
    INSERT INTO admin_actions
      (admin_user_id, booking_id, action_type, target_type, target_id, status, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *
    `,
    [
      adminId,
      bookingId || null,
      String(actionType),
      String(targetType || "system"),
      targetId === undefined || targetId === null ? null : String(targetId),
      String(status || "success"),
      JSON.stringify(metadata || {}),
    ]
  );

  return result.rows[0] || null;
}

async function safeRecordAction(payload) {
  try {
    return await recordAction(payload);
  } catch (error) {
    logger.warn(`ADMIN AUDIT WRITE FAILED | `, { error });
    return null;
  }
}

module.exports = { recordAction, safeRecordAction };
