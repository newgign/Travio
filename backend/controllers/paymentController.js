const pool = require("../db");
const logger = require("../utils/logger");
const notificationService = require("../services/notificationService");
const paymentGatewayService = require("../services/paymentGatewayService");
const bookingEventService = require("../services/bookingEventService");

async function getBookingForAccess(bookingId) {
  const result = await pool.query(
    `SELECT * FROM bookings WHERE id = $1`,
    [bookingId]
  );

  return result.rows[0] || null;
}

function canAccessBooking(req, booking) {
  return (
    req.user.role === "admin" ||
    Number(booking.user_id) === Number(req.user.id)
  );
}

const payBooking = async (req, res) => {
  let client;

  try {
    const { id } = req.params;
    const method = String(req.body.method || "").trim();

    if (!method) {
      return res.status(400).json({ message: "Выберите способ оплаты" });
    }

    let booking = await getBookingForAccess(id);

    if (!booking) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    if (!canAccessBooking(req, booking)) {
      return res.status(403).json({ message: "Нет доступа к этому бронированию" });
    }

    if (booking.provider === "hotelbeds") {
      return res.status(409).json({
        code: "HOTELBEDS_TEST_CONFIRM_SEPARATE_FROM_PAYMENT",
        message:
          "Hotelbeds TEST подтверждается отдельной операцией Booking API. Настоящий платёжный шлюз ещё не подключён.",
      });
    }

    const readiness = paymentGatewayService.readiness();
    if (readiness.mode !== "sandbox") {
      return res.status(409).json({
        code: "PAYMENT_GATEWAY_DISABLED",
        message: "Локальная оплата разрешена только в безопасном sandbox-режиме.",
      });
    }

    const intentResult = await pool.query(
      `
      SELECT id, gateway_provider, idempotency_key, status
      FROM payments
      WHERE booking_id = $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [id]
    );

    const intent = intentResult.rows[0];
    if (!intent || intent.gateway_provider !== "sandbox" || !intent.idempotency_key) {
      return res.status(409).json({
        code: "PAYMENT_INTENT_REQUIRED",
        message: "Сначала создайте sandbox payment intent.",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const paymentResult = await client.query(
      `
      UPDATE payments
      SET status = 'paid',
          method = $1,
          paid_at = NOW(),
          metadata = COALESCE(metadata, '{}'::jsonb) ||
            '{"sandboxCompleted":true,"realCharge":false}'::jsonb,
          updated_at = NOW()
      WHERE booking_id = $2
        AND gateway_provider = 'sandbox'
        AND idempotency_key IS NOT NULL
      RETURNING *
      `,
      [method, id]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Платёж для бронирования не найден" });
    }

    const bookingResult = await client.query(
      `
      UPDATE bookings
      SET
        status = 'Подтверждена',
        provider_status = CASE
          WHEN provider = 'hotelbeds' THEN provider_status
          WHEN provider = 'legacy' THEN provider_status
          ELSE 'local_paid'
        END,
        confirmed_at = COALESCE(confirmed_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    await client.query("COMMIT");

    const payment = paymentResult.rows[0];
    await bookingEventService.safeRecordEvent({
      bookingId: booking.id,
      userId: req.user.id,
      key: `payment-${payment.id}-paid`,
      type: "payment_completed",
      actorType: "customer",
      title: "Sandbox-оплата завершена",
      description: "Тестовая оплата завершена без реального списания денег.",
      status: payment.status,
      metadata: {
        paymentId: payment.id,
        gatewayProvider: payment.gateway_provider,
        amount: Number(payment.amount) || 0,
        currency: booking.currency || "KZT",
        realCharge: false,
      },
      occurredAt: payment.paid_at,
    });

    await bookingEventService.safeRecordEvent({
      bookingId: booking.id,
      userId: req.user.id,
      key: "booking-confirmed",
      type: "booking_confirmed",
      actorType: "system",
      title: "Бронирование подтверждено",
      description: "Travio подтвердил локальную бронь после sandbox-оплаты.",
      status: bookingResult.rows[0]?.status || "Подтверждена",
      metadata: { provider: booking.provider || "mock" },
      occurredAt: bookingResult.rows[0]?.confirmed_at,
    });

    await notificationService.notifyBookingEvent(id, "booking_confirmed");

    return res.json({
      success: true,
      payment: paymentResult.rows[0],
      booking: bookingResult.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logger.error(rollbackError.stack || rollbackError.message);
      }
    }

    logger.error(error.stack || error.message);
    return res.status(error.status || 500).json({
      message: error.message || "Ошибка оплаты",
      code: error.code || undefined,
    });
  } finally {
    client?.release();
  }
};

const getPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await getBookingForAccess(id);

    if (!booking) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    if (!canAccessBooking(req, booking)) {
      return res.status(403).json({ message: "Нет доступа к этому бронированию" });
    }

    const result = await pool.query(
      `
      SELECT
        p.*,
        COALESCE(NULLIF(b.offer_snapshot->>'name', ''), t.hotel, t.title) AS hotel,
        COALESCE(NULLIF(b.offer_snapshot->>'image', ''), t.image, '') AS image,
        COALESCE(b.total_amount, p.amount, t.price, 0) AS price,
        COALESCE(NULLIF(b.offer_snapshot->>'country', ''), t.country, '') AS country,
        COALESCE(NULLIF(b.offer_snapshot->>'city', ''), t.city, '') AS city,
        COALESCE(NULLIF(b.currency, ''), b.offer_snapshot->>'currency', 'KZT') AS currency,
        COALESCE(NULLIF(b.provider, ''), 'legacy') AS provider,
        COALESCE(NULLIF(b.provider_hotel_id, ''), b.tour_id::text) AS provider_hotel_id,
        b.provider_booking_id,
        b.provider_status,
        b.provider_client_reference
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      LEFT JOIN tours t ON b.tour_id = t.id
      WHERE p.booking_id = $1
      ORDER BY p.id DESC
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Платёж не найден" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    logger.error(error.stack || error.message);
    return res.status(500).json({ message: "Ошибка загрузки платежа" });
  }
};


const getPaymentReadiness = async (req, res) => {
  return res.json({ success: true, payment: paymentGatewayService.readiness() });
};

const createPaymentIntent = async (req, res) => {
  try {
    const result = await paymentGatewayService.createIntent({
      bookingId: req.params.id,
      userId: req.user.id,
      isAdmin: req.user.role === "admin",
    });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Ошибка создания платёжного намерения",
      code: error.code || undefined,
    });
  }
};

module.exports = {
  payBooking,
  getPayment,
  getPaymentReadiness,
  createPaymentIntent,
};
