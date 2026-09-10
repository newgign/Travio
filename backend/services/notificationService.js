const pool = require("../db");
const logger = require("../utils/logger");
const { bookingEmailContent, escapeHtml } = require("./notificationTemplates");
const emailProviderService = require("./emailProviderService");

function enabled() {
  return emailProviderService.status().enabled;
}

function providerName() {
  return emailProviderService.providerName();
}

function channelStatus() {
  const state = emailProviderService.status();
  return {
    enabled: state.enabled,
    provider: state.provider,
    fromConfigured: Boolean(process.env.EMAIL_FROM),
    providerConfigured: state.configured,
    mode: state.mode,
    externalDelivery: state.externalDelivery,
  };
}

async function loadContext(bookingId) {
  const result = await pool.query(
    `
    SELECT
      b.*,
      u.email AS user_email,
      u.email_notifications,
      COALESCE(
        NULLIF(b.offer_snapshot->>'name', ''),
        NULLIF(b.offer_snapshot->>'title', ''),
        t.hotel,
        t.title,
        'Travio booking #' || b.id
      ) AS hotel
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN tours t ON t.id = b.tour_id
    WHERE b.id = $1
    LIMIT 1
    `,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function updateOutbox(id, patch) {
  const status = patch.status;
  await pool.query(
    `
    UPDATE notification_outbox
    SET status = $1::varchar(30),
        provider = COALESCE($2::varchar(40), provider),
        provider_message_id = COALESCE($3::varchar(255), provider_message_id),
        last_error = $4::text,
        attempts = attempts + CASE WHEN $5::boolean THEN 1 ELSE 0 END,
        last_attempt_at = CASE WHEN $5::boolean THEN NOW() ELSE last_attempt_at END,
        next_attempt_at = $6::timestamp,
        sent_at = CASE WHEN $1::varchar(30) = 'sent' THEN NOW() ELSE sent_at END,
        updated_at = NOW()
    WHERE id = $7::integer
    `,
    [
      status,
      patch.provider || null,
      patch.providerMessageId || null,
      patch.lastError || null,
      patch.countAttempt === true,
      patch.nextAttemptAt || null,
      id,
    ]
  );
}

async function deliver(content) {
  return emailProviderService.send(content);
}

function testEmailContent(user) {
  const name = user.full_name || "Travio user";
  return {
    subject: "Travio: проверка email-уведомлений",
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h1 style="color:#2563eb">Travio</h1><p>Здравствуйте, ${escapeHtml(name)}.</p><p>Email-канал Travio работает.</p><p><strong>Это тестовое сообщение, бронирование не создавалось.</strong></p></div>`,
    text: `Travio\nЗдравствуйте, ${name}.\nEmail-канал Travio работает.\nЭто тестовое сообщение, бронирование не создавалось.`,
  };
}

async function contentForOutbox(row) {
  if (row.booking_id) {
    const booking = await loadContext(row.booking_id);
    if (!booking) throw new Error("Booking for notification no longer exists");
    return bookingEmailContent(booking, row.event_type);
  }
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return {
    subject: row.subject,
    html: payload.html || `<p>${escapeHtml(payload.text || row.subject)}</p>`,
    text: payload.text || row.subject,
  };
}

async function dispatchOutboxItem(id, { force = false } = {}) {
  const result = await pool.query(`SELECT * FROM notification_outbox WHERE id = $1 LIMIT 1`, [id]);
  const row = result.rows[0];
  if (!row) return { status: "missing" };
  if (row.status === "sent" && !force) return { status: "sent", messageId: row.provider_message_id };

  if (!enabled()) {
    await updateOutbox(id, { status: "disabled", lastError: "EMAIL_ENABLED=false" });
    return { status: "disabled" };
  }

  try {
    const content = await contentForOutbox(row);
    const sent = await deliver({ recipient: row.recipient, ...content });
    await updateOutbox(id, {
      status: "sent",
      provider: sent.provider,
      providerMessageId: sent.messageId,
      lastError: null,
      countAttempt: true,
    });
    return { status: "sent", messageId: sent.messageId };
  } catch (error) {
    const nextAttemptAt = new Date(Date.now() + 5 * 60 * 1000);
    await updateOutbox(id, {
      status: "failed",
      provider: providerName(),
      lastError: error.message,
      countAttempt: true,
      nextAttemptAt,
    });
    logger.warn(`EMAIL NOTIFICATION FAILED | outboxId=${id} | ${error.message}`);
    return { status: "failed", message: error.message };
  }
}

async function notifyBookingEvent(bookingId, eventType) {
  try {
    const booking = await loadContext(bookingId);
    if (!booking) return { status: "missing_booking" };
    const recipient = booking.email || booking.user_email;
    if (!recipient) return { status: "missing_recipient" };
    const content = bookingEmailContent(booking, eventType);

    const inserted = await pool.query(
      `
      INSERT INTO notification_outbox
        (user_id, booking_id, event_type, recipient, subject, status, payload)
      VALUES ($1, $2, $3, $4, $5, 'queued', $6::jsonb)
      ON CONFLICT (booking_id, event_type) WHERE booking_id IS NOT NULL
      DO NOTHING
      RETURNING id
      `,
      [booking.user_id, booking.id, eventType, recipient, content.subject,
       JSON.stringify({ provider: booking.provider, providerReference: booking.provider_booking_id || null })]
    );

    if (inserted.rows.length === 0) return { status: "duplicate" };
    const outboxId = inserted.rows[0].id;

    if (booking.email_notifications === false) {
      await updateOutbox(outboxId, { status: "skipped", lastError: "User disabled email notifications" });
      return { status: "skipped" };
    }
    if (!enabled()) {
      await updateOutbox(outboxId, { status: "disabled", lastError: "EMAIL_ENABLED=false" });
      return { status: "disabled" };
    }
    return dispatchOutboxItem(outboxId);
  } catch (error) {
    logger.warn(`NOTIFICATION OUTBOX ERROR | bookingId=${bookingId} | ${error.message}`);
    return { status: "failed" };
  }
}

async function queueTestNotification(userId) {
  const userResult = await pool.query(
    `SELECT id, full_name, email, email_notifications FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) return { status: "missing_user" };
  const content = testEmailContent(user);
  const inserted = await pool.query(
    `
    INSERT INTO notification_outbox
      (user_id, booking_id, event_type, recipient, subject, status, payload)
    VALUES ($1, NULL, 'email_channel_test', $2, $3, 'queued', $4::jsonb)
    RETURNING id
    `,
    [user.id, user.email, content.subject, JSON.stringify({ html: content.html, text: content.text })]
  );
  const id = inserted.rows[0].id;
  if (user.email_notifications === false) {
    await updateOutbox(id, { status: "skipped", lastError: "User disabled email notifications" });
    return { status: "skipped", id };
  }
  if (!enabled()) {
    await updateOutbox(id, { status: "disabled", lastError: "EMAIL_ENABLED=false" });
    return { status: "disabled", id };
  }
  return { id, ...(await dispatchOutboxItem(id)) };
}

async function listForUser(userId, limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const result = await pool.query(
    `
    SELECT id, booking_id, event_type, recipient, subject, status, provider,
           provider_message_id, attempts, last_error, created_at, sent_at,
           last_attempt_at, next_attempt_at
    FROM notification_outbox
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [userId, safeLimit]
  );
  return result.rows;
}

async function retryForUser(id, userId, isAdmin = false) {
  const allowed = await pool.query(
    `SELECT id FROM notification_outbox WHERE id = $1 AND status IN ('failed', 'disabled') AND ($2::boolean OR user_id = $3)`,
    [id, isAdmin, userId]
  );
  if (!allowed.rows.length) return { status: "forbidden" };
  return dispatchOutboxItem(id, { force: true });
}

async function processPending({ limit = 25 } = {}) {
  const result = await pool.query(
    `
    SELECT id
    FROM notification_outbox
    WHERE status IN ('queued', 'failed')
      AND attempts < 3
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [Math.min(Math.max(Number(limit) || 25, 1), 100)]
  );
  const results = [];
  for (const row of result.rows) results.push({ id: row.id, ...(await dispatchOutboxItem(row.id)) });
  return results;
}

module.exports = {
  notifyBookingEvent,
  queueTestNotification,
  listForUser,
  retryForUser,
  processPending,
  channelStatus,
  dispatchOutboxItem,
};
