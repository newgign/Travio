const crypto = require("crypto");
const pool = require("../db");
const logger = require("../utils/logger");

function eventKey(prefix = "event") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

async function recordEvent({
  client = pool,
  bookingId,
  userId = null,
  key = null,
  type,
  actorType = "system",
  title,
  description = null,
  status = null,
  metadata = {},
  occurredAt = null,
}) {
  const resolvedKey = key || eventKey(type || "event");
  const result = await client.query(
    `
    INSERT INTO booking_events
    (booking_id, user_id, event_key, event_type, actor_type, title, description, status, metadata, occurred_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, COALESCE($10::timestamp, NOW()))
    ON CONFLICT (booking_id, event_key)
    DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      status = EXCLUDED.status,
      metadata = EXCLUDED.metadata,
      occurred_at = EXCLUDED.occurred_at
    RETURNING *
    `,
    [
      bookingId,
      userId,
      resolvedKey,
      type,
      actorType,
      title,
      description,
      status,
      JSON.stringify(metadata || {}),
      occurredAt,
    ]
  );

  return result.rows[0];
}

async function safeRecordEvent(payload) {
  try {
    return await recordEvent(payload);
  } catch (error) {
    logger.error(`BOOKING EVENT ERROR | `, { error });
    return null;
  }
}

async function listEvents(bookingId) {
  const result = await pool.query(
    `
    SELECT id, booking_id, user_id, event_key, event_type, actor_type,
           title, description, status, metadata, occurred_at, created_at
    FROM booking_events
    WHERE booking_id = $1
    ORDER BY occurred_at DESC, id DESC
    `,
    [bookingId]
  );
  return result.rows;
}

module.exports = {
  eventKey,
  recordEvent,
  safeRecordEvent,
  listEvents,
};
