const pool = require("../db");
const offerResolverService = require("../services/offerResolverService");
const checkoutSessionService = require("../services/checkoutSessionService");
const logger = require("../utils/logger");
const bookingEventService = require("../services/bookingEventService");
const { buildRefundReadiness } = require("../services/refundReadinessService");
const adminAuditService = require("../services/adminAuditService");

function normalizeSearchFilters(filters = {}, people) {
  return {
    ...filters,
    people: Number(people) || Number(filters.people) || 2,
    nights: Number(filters.nights) || 7,
    children: Number(filters.children) || 0,
  };
}

function buildBookingProjection(whereClause = "") {
  return `
    SELECT
      b.*,
      COALESCE(
        NULLIF(b.offer_snapshot->>'name', ''),
        NULLIF(b.offer_snapshot->>'title', ''),
        t.hotel,
        t.title,
        'Travio booking #' || b.id
      ) AS hotel,
      COALESCE(NULLIF(b.offer_snapshot->>'country', ''), t.country, '') AS country,
      COALESCE(NULLIF(b.offer_snapshot->>'city', ''), t.city, '') AS city,
      COALESCE(NULLIF(b.offer_snapshot->>'image', ''), t.image, '') AS image,
      COALESCE(b.total_amount, p.amount, t.price, 0) AS price,
      COALESCE(NULLIF(b.currency, ''), b.offer_snapshot->>'currency', 'KZT') AS currency,
      COALESCE(NULLIF(b.provider, ''), 'legacy') AS provider,
      COALESCE(NULLIF(b.provider_hotel_id, ''), b.tour_id::text) AS provider_hotel_id,
      p.id AS payment_id,
      p.status AS payment_status,
      p.method AS payment_method,
      p.paid_at,
      p.gateway_provider,
      p.external_id AS payment_external_id,
      p.idempotency_key AS payment_idempotency_key,
      p.failure_code AS payment_failure_code,
      p.failure_message AS payment_failure_message,
      p.metadata AS payment_metadata,
      p.refunded_amount,
      p.refund_status
    FROM bookings b
    LEFT JOIN tours t ON b.tour_id = t.id
    LEFT JOIN LATERAL (
      SELECT payment.*
      FROM payments payment
      WHERE payment.booking_id = b.id
      ORDER BY payment.id DESC
      LIMIT 1
    ) p ON TRUE
    ${whereClause}
  `;
}

function normalizeTravelers(rawTravelers, fallback = {}) {
  const travelers = Array.isArray(rawTravelers) ? rawTravelers : [];

  if (travelers.length > 0) {
    return travelers.map((traveler, index) => ({
      type: String(traveler?.type || "AD").toUpperCase() === "CH" ? "CH" : "AD",
      firstName: String(traveler?.firstName || traveler?.name || "").trim(),
      lastName: String(traveler?.lastName || traveler?.surname || "").trim(),
      birthDate: traveler?.birthDate || null,
      age:
        traveler?.age === undefined || traveler?.age === null || traveler?.age === ""
          ? null
          : Number(traveler.age),
      roomId: Number(traveler?.roomId) || 1,
      order: index + 1,
    }));
  }

  if (fallback.firstName || fallback.lastName) {
    return [
      {
        type: "AD",
        firstName: String(fallback.firstName || "").trim(),
        lastName: String(fallback.lastName || "").trim(),
        birthDate: fallback.birthDate || null,
        age: null,
        roomId: 1,
        order: 1,
      },
    ];
  }

  return [];
}

function validateHotelbedsTravelers(travelers, filters = {}) {
  const adults = Math.max(Number(filters.people || filters.adults || 2), 1);
  const children = Math.max(Number(filters.children || 0), 0);
  const expectedTotal = adults + children;

  if (travelers.length !== expectedTotal) {
    const error = new Error(
      `Для бронирования нужны данные всех туристов: ${adults} взр. + ${children} дет.`
    );
    error.status = 400;
    error.code = "TRAVELERS_COUNT_MISMATCH";
    throw error;
  }

  const adultCount = travelers.filter((item) => item.type === "AD").length;
  const childCount = travelers.filter((item) => item.type === "CH").length;

  if (adultCount !== adults || childCount !== children) {
    const error = new Error(
      "Состав туристов не совпадает с составом гостей выбранного Hotelbeds-тарифа."
    );
    error.status = 400;
    error.code = "TRAVELERS_OCCUPANCY_MISMATCH";
    throw error;
  }

  for (const traveler of travelers) {
    if (!traveler.firstName || !traveler.lastName) {
      const error = new Error("Укажите имя и фамилию каждого туриста.");
      error.status = 400;
      error.code = "TRAVELER_NAME_REQUIRED";
      throw error;
    }
  }
}

const createBooking = async (req, res) => {
  if (require('../config/providers').hotelbeds.stagingTestRequested) return res.status(503).json({ success: false, code: 'HOTELBEDS_READ_ONLY_OPERATION_BLOCKED', message: 'Hotelbeds TEST: бронирование и оплата отключены.' });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      provider = "mock",
      hotelId,
      tour_id,
      checkoutToken,
      firstName,
      lastName,
      phone,
      email,
      birthDate,
      people,
      comment,
      filters = {},
      travelers: rawTravelers,
    } = req.body || {};

    if (!phone || !email) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Укажите телефон и Email держателя брони" });
    }

    let offer;
    let searchFilters;
    let checkoutSession = null;
    const selectedHotelId = hotelId ?? tour_id;

    if (checkoutToken) {
      checkoutSession = await checkoutSessionService.lockForBooking(
        client,
        checkoutToken
      );

      offer = checkoutSession.offer_snapshot;
      if (offer.priceConfirmationRequired && req.body.acceptedPriceToken !== checkoutSession.token) {
        throw Object.assign(new Error("Подтвердите новую стоимость предложения."), { status: 409, code: "RATE_CHANGED" });
      }
      searchFilters = checkoutSession.search_filters || {};

      if (provider && String(provider) !== String(checkoutSession.provider)) {
        const error = new Error("Поставщик checkout-сессии не совпадает с запросом.");
        error.status = 409;
        error.code = "CHECKOUT_PROVIDER_MISMATCH";
        throw error;
      }

      if (
        selectedHotelId !== undefined &&
        selectedHotelId !== null &&
        String(selectedHotelId) !== String(checkoutSession.provider_hotel_id)
      ) {
        const error = new Error("Отель checkout-сессии не совпадает с запросом.");
        error.status = 409;
        error.code = "CHECKOUT_HOTEL_MISMATCH";
        throw error;
      }
    } else {
      if (provider === "hotelbeds") {
        const error = new Error(
          "Для Hotelbeds требуется актуальная checkout-сессия. Вернитесь к проверке тура."
        );
        error.status = 400;
        error.code = "CHECKOUT_SESSION_REQUIRED";
        throw error;
      }

      if (selectedHotelId === undefined || selectedHotelId === null) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Не указан отель" });
      }

      searchFilters = normalizeSearchFilters(filters, people);
      offer = await offerResolverService.resolve({
        providerName: provider,
        hotelId: selectedHotelId,
        filters: searchFilters,
      });
    }

    const travelers = normalizeTravelers(rawTravelers, {
      firstName,
      lastName,
      birthDate,
    });

    if (offer.provider === "hotelbeds") {
      validateHotelbedsTravelers(travelers, searchFilters);
    } else if (travelers.length === 0 || !travelers[0].firstName || !travelers[0].lastName) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Заполните данные туриста" });
    }

    const holder = travelers.find((item) => item.type === "AD") || travelers[0];
    const amount = Number(offer.price) || 0;
    const currency = offer.currency || "KZT";
    const totalPeople =
      travelers.length ||
      Math.max(Number(searchFilters.people) || 1, 1) +
        Math.max(Number(searchFilters.children) || 0, 0);

    const bookingResult = await client.query(
      `
      INSERT INTO bookings
      (
        user_id,
        tour_id,
        first_name,
        last_name,
        phone,
        email,
        birth_date,
        people,
        comment,
        status,
        provider,
        provider_hotel_id,
        provider_offer_id,
        provider_status,
        currency,
        total_amount,
        quoted_currency,
        quoted_amount,
        offer_snapshot,
        travelers,
        search_filters
      )
      VALUES
      (
        $1,
        NULL,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'Новая',
        $9,
        $10,
        $11,
        'local_pending',
        $12,
        $13,
        $12,
        $13,
        $14::jsonb,
        $15::jsonb,
        $16::jsonb
      )
      RETURNING *
      `,
      [
        req.user.id,
        holder.firstName,
        holder.lastName,
        String(phone).trim(),
        String(email).trim(),
        holder.birthDate || birthDate || null,
        totalPeople,
        comment || null,
        offer.provider || provider,
        String(offer.providerHotelId ?? selectedHotelId),
        String(offer.offerId || offer.providerOfferId || offer.rateKey),
        currency,
        amount,
        JSON.stringify(offer),
        JSON.stringify(travelers),
        JSON.stringify(searchFilters || {}),
      ]
    );

    let booking = bookingResult.rows[0];
    const clientReference = `TRAVIO-${booking.id}`;

    const bookingUpdate = await client.query(
      `
      UPDATE bookings
      SET provider_client_reference = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [clientReference, booking.id]
    );

    booking = bookingUpdate.rows[0];

    await client.query(
      `
      INSERT INTO payments
      (booking_id, amount, method, status)
      VALUES ($1, $2, NULL, 'pending')
      `,
      [booking.id, amount]
    );

    await bookingEventService.recordEvent({
      client,
      bookingId: booking.id,
      userId: req.user.id,
      key: "booking-created",
      type: "booking_created",
      actorType: "customer",
      title: "Бронирование создано",
      description: "Заявка Travio зарегистрирована.",
      status: booking.status,
      metadata: {
        provider: offer.provider || provider,
        travioReference: clientReference,
        amount,
        currency,
      },
      occurredAt: booking.booking_date,
    });

    if (checkoutSession) {
      await checkoutSessionService.markUsed(client, checkoutSession.token);
    }

    await client.query("COMMIT");

    logger.info(
      `BOOKING SNAPSHOT CREATED | bookingId=${booking.id} | ${offer.provider}:${offer.providerHotelId} | ${amount} ${currency}`
    );

    return res.status(201).json({
      ...booking,
      amount,
      price: amount,
      hotel: offer.name || offer.title,
      country: offer.country,
      city: offer.city,
      image: offer.image || offer.images?.[0] || "",
      provider: offer.provider,
      providerHotelId: String(offer.providerHotelId),
      providerOfferId: offer.offerId,
      currency,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      require("../utils/logger").error("BOOKING ROLLBACK ERROR:", { error: rollbackError });
    }

    require("../utils/logger").error("CREATE BOOKING ERROR:", { error: error });

    return res.status(error.status || 500).json({
      message: require("../utils/apiResponse").publicMessage(error, "Ошибка создания бронирования"),
      code: require("../utils/apiResponse").publicCode(error),
    });
  } finally {
    client.release();
  }
};

const getMyBookings = async (req, res) => {
  try {
    const result = await pool.query(
      `${buildBookingProjection("WHERE b.user_id = $1")}
       ORDER BY b.booking_date DESC`,
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    require("../utils/logger").error("GET MY BOOKINGS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки бронирований" });
  }
};

const getMyBookingDetails = async (req, res) => {
  try {
    const bookingResult = await pool.query(
      `${buildBookingProjection("WHERE b.id = $1")} LIMIT 1`,
      [req.params.id]
    );
    const booking = bookingResult.rows[0] || null;

    if (!booking) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    if (req.user.role !== "admin" && Number(booking.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "Нет доступа к этому бронированию" });
    }

    const [events, notificationResult, refundResult] = await Promise.all([
      bookingEventService.listEvents(booking.id),
      pool.query(
        `
        SELECT id, event_type, subject, status, provider, attempts, sent_at, created_at, updated_at
        FROM notification_outbox
        WHERE booking_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 20
        `,
        [booking.id]
      ),
      pool.query(
        `
        SELECT id, amount, currency, status, provider, external_id, idempotency_key, reason,
               metadata, requested_at, processed_at, created_at, updated_at
        FROM refund_requests
        WHERE booking_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 10
        `,
        [booking.id]
      ),
    ]);

    const payment = booking.payment_id
      ? {
          id: booking.payment_id,
          status: booking.payment_status,
          method: booking.payment_method,
          paidAt: booking.paid_at,
          gatewayProvider: booking.gateway_provider,
          externalId: booking.payment_external_id,
          idempotencyKey: booking.payment_idempotency_key,
          failureCode: booking.payment_failure_code,
          failureMessage: booking.payment_failure_message,
          metadata: booking.payment_metadata || {},
          refundedAmount: Number(booking.refunded_amount) || 0,
          refundStatus: booking.refund_status || "not_requested",
          amount: Number(booking.price) || 0,
          currency: booking.currency || "KZT",
        }
      : null;

    return res.json({
      success: true,
      booking,
      payment,
      refundReadiness: buildRefundReadiness(booking, payment ? {
        amount: payment.amount,
        status: payment.status,
        gateway_provider: payment.gatewayProvider,
        metadata: payment.metadata,
        refunded_amount: payment.refundedAmount,
        refund_status: payment.refundStatus,
      } : null),
      refunds: refundResult.rows,
      events,
      notifications: notificationResult.rows,
    });
  } catch (error) {
    require("../utils/logger").error("GET BOOKING DETAILS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки деталей бронирования" });
  }
};

const getBookings = async (req, res) => {
  try {
    const result = await pool.query(
      `${buildBookingProjection()}
       ORDER BY b.booking_date DESC`
    );

    return res.json(result.rows);
  } catch (error) {
    require("../utils/logger").error("GET BOOKINGS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки бронирований" });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = String(req.body?.status || "").trim();
    const allowedStatuses = new Set(["Новая", "Подтверждена", "Отменена"]);

    if (!allowedStatuses.has(status)) {
      return res.status(400).json({
        message: "Недопустимый статус бронирования",
      });
    }

    const current = await pool.query(
      `SELECT id, user_id, status, provider, provider_booking_id, provider_status FROM bookings WHERE id = $1`,
      [id]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    if (current.rows[0].provider === "hotelbeds") {
      return res.status(409).json({
        code: "HOTELBEDS_STATUS_MANAGED_BY_PROVIDER",
        message:
          "Статус Hotelbeds-бронирования нельзя менять вручную. Используйте синхронизацию или Cancellation API поставщика.",
      });
    }

    const result = await pool.query(
      `
      UPDATE bookings
      SET status = $1,
          cancelled_at = CASE WHEN $1 = 'Отменена' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END,
          confirmed_at = CASE WHEN $1 = 'Подтверждена' THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [status, id]
    );

    const updated = result.rows[0];
    await bookingEventService.safeRecordEvent({
      bookingId: updated.id,
      userId: updated.user_id,
      type: status === "Отменена" ? "booking_cancelled" : status === "Подтверждена" ? "booking_confirmed" : "booking_status_changed",
      actorType: "admin",
      title: `Статус изменён: ${status}`,
      description: "Статус локальной брони изменён администратором Travio.",
      status,
      metadata: { previousStatus: current.rows[0].status || null },
    });

    await adminAuditService.safeRecordAction({
      adminId: req.user.id,
      bookingId: updated.id,
      actionType: "booking_status_changed",
      targetType: "booking",
      targetId: updated.id,
      metadata: { previousStatus: current.rows[0].status || null, status },
    });

    return res.json(updated);
  } catch (error) {
    require("../utils/logger").error("UPDATE BOOKING ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка обновления бронирования" });
  }
};

const deleteBooking = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await client.query(
      `
      SELECT id, provider, provider_booking_id, provider_status
      FROM bookings
      WHERE id = $1
      FOR UPDATE
      `,
      [req.params.id]
    );

    if (current.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    const booking = current.rows[0];
    const unsafeHotelbedsStatus = new Set(["confirming", "confirmation_unknown"]);

    if (
      booking.provider === "hotelbeds" &&
      (booking.provider_booking_id || unsafeHotelbedsStatus.has(booking.provider_status))
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "PROVIDER_BOOKING_CANCEL_FIRST",
        message:
          "Нельзя удалить Hotelbeds-бронь локально, пока она существует или может существовать у поставщика. Сначала требуется Cancellation/Sync API.",
      });
    }

    await adminAuditService.recordAction({
      client,
      adminId: req.user.id,
      bookingId: booking.id,
      actionType: "booking_deleted",
      targetType: "booking",
      targetId: booking.id,
      metadata: {
        provider: booking.provider || null,
        providerReference: booking.provider_booking_id || null,
        providerStatus: booking.provider_status || null,
      },
    });

    await client.query("DELETE FROM payments WHERE booking_id = $1", [req.params.id]);

    await client.query(`DELETE FROM bookings WHERE id = $1`, [req.params.id]);

    await client.query("COMMIT");
    return res.json({ message: "Бронирование удалено" });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      require("../utils/logger").error("DELETE BOOKING ROLLBACK ERROR:", { error: rollbackError });
    }

    require("../utils/logger").error("DELETE BOOKING ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка удаления бронирования" });
  } finally {
    client.release();
  }
};

module.exports = {
  createBooking,
  getBookings,
  getMyBookings,
  getMyBookingDetails,
  updateBookingStatus,
  deleteBooking,
};
