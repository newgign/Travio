const pool = require("../db");
const logger = require("../utils/logger");
const paymentGatewayService = require("../services/paymentGatewayService");
const bookingEventService = require("../services/bookingEventService");
const notificationService = require("../services/notificationService");
const adminAuditService = require("../services/adminAuditService");

function canAccessBooking(req, booking) {
  return req.user.role === "admin" || Number(booking.user_id) === Number(req.user.id);
}

function isExplicitNoRealCharge(payment) {
  const value = payment?.metadata?.realCharge;
  return value === false || String(value).toLowerCase() === "false";
}

async function lockContext(client, bookingId) {
  const bookingResult = await client.query(
    `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
    [bookingId]
  );
  const booking = bookingResult.rows[0] || null;
  if (!booking) return { booking: null, payment: null, refund: null };

  const paymentResult = await client.query(
    `
    SELECT *
    FROM payments
    WHERE booking_id = $1
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
    `,
    [bookingId]
  );
  const payment = paymentResult.rows[0] || null;

  let refund = null;
  if (payment) {
    const refundResult = await client.query(
      `
      SELECT *
      FROM refund_requests
      WHERE payment_id = $1
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [payment.id]
    );
    refund = refundResult.rows[0] || null;
  }

  return { booking, payment, refund };
}

function assertSandboxRefundable(req, booking, payment) {
  if (!canAccessBooking(req, booking)) {
    const error = new Error("Нет доступа к этому бронированию");
    error.status = 403;
    throw error;
  }
  if (booking.provider === "hotelbeds") {
    const error = new Error("Hotelbeds TEST отменяется через Cancellation API поставщика. Sandbox-refund Travio здесь не используется.");
    error.status = 409;
    error.code = "HOTELBEDS_REFUND_PROVIDER_MANAGED";
    throw error;
  }
  if (!payment || payment.gateway_provider !== "sandbox" || payment.status !== "paid") {
    const error = new Error("Для тестового возврата нужен завершённый sandbox-платёж.");
    error.status = 409;
    error.code = "SANDBOX_PAID_PAYMENT_REQUIRED";
    throw error;
  }
  if (!isExplicitNoRealCharge(payment)) {
    const error = new Error("Sprint 2I не выполняет возвраты по реальным списаниям.");
    error.status = 409;
    error.code = "REAL_CHARGE_REFUND_BLOCKED";
    throw error;
  }
}

const requestSandboxRefund = async (req, res) => {
  let client;
  try {
    if (paymentGatewayService.readiness().mode !== "sandbox") {
      return res.status(409).json({
        code: "REFUND_SANDBOX_DISABLED",
        message: "Sandbox-возврат доступен только при PAYMENTS_MODE=sandbox.",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    const context = await lockContext(client, req.params.id);
    if (!context.booking) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Бронирование не найдено" });
    }
    assertSandboxRefundable(req, context.booking, context.payment);

    if (context.refund) {
      await client.query(
        `UPDATE payments SET refund_status = $1, updated_at = NOW() WHERE id = $2`,
        [context.refund.status === "refunded" ? "refunded" : "requested", context.payment.id]
      );
      await client.query("COMMIT");
      return res.json({ success: true, idempotent: true, refund: context.refund, realRefund: false });
    }

    const amount = Math.max(0, Number(context.payment.amount || 0) - Number(context.payment.refunded_amount || 0));
    if (amount <= 0 || context.payment.refund_status === "refunded") {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "REFUND_ALREADY_COMPLETED", message: "Эта sandbox-оплата уже полностью возвращена." });
    }

    const idempotencyKey = `refund-booking-${context.booking.id}-payment-${context.payment.id}-full-v1`;
    const reason = String(req.body?.reason || "Полный тестовый возврат из личного кабинета").trim();
    const refundResult = await client.query(
      `
      INSERT INTO refund_requests
      (booking_id, payment_id, user_id, amount, currency, status, provider, idempotency_key, reason, metadata, requested_at)
      VALUES ($1, $2, $3, $4, $5, 'requested', 'sandbox', $6, $7, $8::jsonb, NOW())
      RETURNING *
      `,
      [
        context.booking.id,
        context.payment.id,
        req.user.id,
        amount,
        context.booking.currency || "KZT",
        idempotencyKey,
        reason,
        JSON.stringify({ sandbox: true, realRefund: false, fullRefund: true }),
      ]
    );
    const refund = refundResult.rows[0];

    await client.query(`UPDATE payments SET refund_status = 'requested', updated_at = NOW() WHERE id = $1`, [context.payment.id]);
    await bookingEventService.recordEvent({
      client,
      bookingId: context.booking.id,
      userId: req.user.id,
      key: `refund-${refund.id}-requested`,
      type: "refund_requested",
      actorType: req.user.role === "admin" ? "admin" : "customer",
      title: "Sandbox-возврат запрошен",
      description: "Создан запрос полного тестового возврата. Реальный возврат денег не выполняется.",
      status: "requested",
      metadata: { refundId: refund.id, paymentId: context.payment.id, amount, currency: context.booking.currency || "KZT", realRefund: false },
      occurredAt: refund.requested_at,
    });

    if (req.user.role === "admin") {
      await adminAuditService.recordAction({
        client,
        adminId: req.user.id,
        bookingId: context.booking.id,
        actionType: "sandbox_refund_requested",
        targetType: "refund",
        targetId: refund.id,
        metadata: { amount, currency: context.booking.currency || "KZT", realRefund: false },
      });
    }

    await client.query("COMMIT");
    return res.status(201).json({ success: true, idempotent: false, refund, realRefund: false });
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch (rollbackError) { logger.error("Operation failed", { error: rollbackError }); }
    }
    logger.error("Operation failed", { error: error });
    return res.status(error.status || 500).json({ message: require("../utils/apiResponse").publicMessage(error, "Ошибка создания sandbox-возврата"), code: require("../utils/apiResponse").publicCode(error) });
  } finally {
    client?.release();
  }
};

const completeSandboxRefund = async (req, res) => {
  let client;
  try {
    if (paymentGatewayService.readiness().mode !== "sandbox") {
      return res.status(409).json({ code: "REFUND_SANDBOX_DISABLED", message: "Sandbox-возврат доступен только при PAYMENTS_MODE=sandbox." });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    const context = await lockContext(client, req.params.id);
    if (!context.booking) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Бронирование не найдено" });
    }
    assertSandboxRefundable(req, context.booking, context.payment);

    if (!context.refund) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "REFUND_REQUEST_REQUIRED", message: "Сначала создайте запрос sandbox-возврата." });
    }
    if (context.refund.status === "refunded" || context.payment.refund_status === "refunded") {
      await client.query("COMMIT");
      return res.json({ success: true, idempotent: true, refund: context.refund, payment: context.payment, booking: context.booking, realRefund: false });
    }
    if (context.refund.status !== "requested") {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "REFUND_NOT_READY", message: `Возврат нельзя завершить из статуса ${context.refund.status}.` });
    }

    const remaining = Math.max(0, Number(context.payment.amount || 0) - Number(context.payment.refunded_amount || 0));
    if (remaining <= 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "REFUND_ALREADY_COMPLETED", message: "Возвращаемая сумма уже равна нулю." });
    }

    const refundResult = await client.query(
      `
      UPDATE refund_requests
      SET status = 'refunded',
          external_id = COALESCE(external_id, 'sandbox-refund-' || id::text),
          processed_at = COALESCE(processed_at, NOW()),
          metadata = COALESCE(metadata, '{}'::jsonb) || '{"sandboxCompleted":true,"realRefund":false}'::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [context.refund.id]
    );
    const refund = refundResult.rows[0];

    const paymentResult = await client.query(
      `
      UPDATE payments
      SET refunded_amount = amount,
          refund_status = 'refunded',
          metadata = COALESCE(metadata, '{}'::jsonb) || '{"sandboxRefundCompleted":true,"realRefund":false}'::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [context.payment.id]
    );
    const payment = paymentResult.rows[0];

    const bookingResult = await client.query(
      `
      UPDATE bookings
      SET status = 'Отменена',
          provider_status = 'local_refunded',
          cancelled_at = COALESCE(cancelled_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [context.booking.id]
    );
    const booking = bookingResult.rows[0];

    await bookingEventService.recordEvent({
      client,
      bookingId: booking.id,
      userId: req.user.id,
      key: `refund-${refund.id}-completed`,
      type: "refund_completed",
      actorType: req.user.role === "admin" ? "admin" : "system",
      title: "Sandbox-возврат завершён",
      description: "Полный тестовый возврат завершён. Реальный возврат денег не выполнялся.",
      status: "refunded",
      metadata: { refundId: refund.id, paymentId: payment.id, amount: Number(refund.amount) || 0, currency: refund.currency || booking.currency || "KZT", externalId: refund.external_id, realRefund: false },
      occurredAt: refund.processed_at,
    });
    await bookingEventService.recordEvent({
      client,
      bookingId: booking.id,
      userId: req.user.id,
      key: `booking-cancelled-refund-${refund.id}`,
      type: "booking_cancelled",
      actorType: "system",
      title: "Локальная бронь отменена после sandbox-возврата",
      description: "Полный тестовый возврат завершил локальную mock-бронь.",
      status: booking.status,
      metadata: { refundId: refund.id, providerStatus: booking.provider_status },
      occurredAt: booking.cancelled_at,
    });

    if (req.user.role === "admin") {
      await adminAuditService.recordAction({
        client,
        adminId: req.user.id,
        bookingId: booking.id,
        actionType: "sandbox_refund_completed",
        targetType: "refund",
        targetId: refund.id,
        metadata: { amount: Number(refund.amount) || 0, currency: refund.currency || booking.currency || "KZT", realRefund: false },
      });
    }

    await client.query("COMMIT");
    await notificationService.notifyBookingEvent(booking.id, "booking_cancelled");
    return res.json({ success: true, idempotent: false, refund, payment, booking, realRefund: false });
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch (rollbackError) { logger.error("Operation failed", { error: rollbackError }); }
    }
    logger.error("Operation failed", { error: error });
    return res.status(error.status || 500).json({ message: require("../utils/apiResponse").publicMessage(error, "Ошибка завершения sandbox-возврата"), code: require("../utils/apiResponse").publicCode(error) });
  } finally {
    client?.release();
  }
};

module.exports = { requestSandboxRefund, completeSandboxRefund };
