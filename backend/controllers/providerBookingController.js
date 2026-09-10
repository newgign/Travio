const pool = require("../db");
const hotelbedsBookingService = require("../services/hotelbedsBookingService");
const logger = require("../utils/logger");
const notificationService = require("../services/notificationService");
const bookingEventService = require("../services/bookingEventService");
const adminAuditService = require("../services/adminAuditService");

async function getBooking(id) {
  const result = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

function assertAccess(req, booking) {
  if (req.user.role === "admin" || Number(booking.user_id) === Number(req.user.id)) {
    return;
  }

  const error = new Error("Нет доступа к этому бронированию");
  error.status = 403;
  error.code = "BOOKING_ACCESS_DENIED";
  throw error;
}

function assertHotelbeds(booking) {
  if ((booking.offer_snapshot?.priceEnvironment || "test") !== require("../config/providers").hotelbeds.environment) {
    throw Object.assign(new Error("Booking environment mismatch"), { status: 409, code: "BOOKING_ENVIRONMENT_MISMATCH" });
  }
  if (booking.provider !== "hotelbeds") {
    const error = new Error("Операция доступна только для Hotelbeds-бронирований");
    error.status = 400;
    error.code = "PROVIDER_OPERATION_NOT_SUPPORTED";
    throw error;
  }
}

function providerToLocalStatus(providerStatus, currentStatus) {
  const normalized = String(providerStatus || "").toUpperCase();

  if (normalized === "CANCELLED" || normalized === "CANCELED") {
    return "Отменена";
  }

  if (["CONFIRMED", "MODIFIED"].includes(normalized)) {
    return "Подтверждена";
  }

  return currentStatus || "Новая";
}

function errorSnapshot(error) {
  return {
    at: new Date().toISOString(),
    status: Number(error?.status) || null,
    code: error?.code || null,
    message: error?.message || "Unknown provider error",

  };
}

function quotedAmount(booking) {
  const explicit = Number(booking.quoted_amount);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const snapshot = Number(booking.offer_snapshot?.price);
  if (Number.isFinite(snapshot) && snapshot > 0) return snapshot;

  return Number(booking.total_amount) || 0;
}

async function persistProviderState(booking, providerResult, { reconciled = false } = {}) {
  const amount = providerResult.total || Number(booking.total_amount) || quotedAmount(booking);
  const currency = providerResult.currency || booking.currency || booking.quoted_currency || "EUR";
  const localStatus = providerToLocalStatus(providerResult.status, booking.status);

  const result = await pool.query(
    `
    UPDATE bookings
    SET
      provider_booking_id = COALESCE($1, provider_booking_id),
      provider_status = $2::varchar(50),
      provider_response = $3::jsonb,
      total_amount = $4,
      currency = $5,
      status = $6,
      confirmed_at = CASE
        WHEN $2::varchar(50) IN ('CONFIRMED', 'MODIFIED') AND confirmed_at IS NULL THEN NOW()
        ELSE confirmed_at
      END,
      provider_synced_at = NOW(),
      provider_reconciled_at = CASE WHEN $7 THEN NOW() ELSE provider_reconciled_at END,
      provider_last_error = NULL,
      updated_at = NOW()
    WHERE id = $8
    RETURNING *
    `,
    [
      providerResult.reference || null,
      providerResult.status || "UNKNOWN",
      JSON.stringify(providerResult.raw || {}),
      amount,
      currency,
      localStatus,
      reconciled,
      booking.id,
    ]
  );

  if (["CONFIRMED", "MODIFIED"].includes(String(providerResult.status || "").toUpperCase())) {
    await pool.query(
      `
      UPDATE payments
      SET amount = $1,
          status = 'test',
          method = 'Hotelbeds TEST',
          paid_at = NULL,
          updated_at = NOW()
      WHERE booking_id = $2
      `,
      [amount, booking.id]
    );
  }

  return result.rows[0];
}

async function markProviderFailure(bookingId, status, error, { reconciled = false } = {}) {
  const result = await pool.query(
    `
    UPDATE bookings
    SET provider_status = $1,
        provider_last_error = $2::jsonb,
        provider_reconciled_at = CASE WHEN $3 THEN NOW() ELSE provider_reconciled_at END,
        updated_at = NOW()
    WHERE id = $4 AND provider_booking_id IS NULL
    RETURNING *
    `,
    [status, JSON.stringify(errorSnapshot(error)), reconciled, bookingId]
  );

  return result.rows[0] || null;
}

function rateExpiredResponse(res, booking) {
  return res.status(409).json({
    success: false,
    code: "HOTELBEDS_RATE_EXPIRED",
    message:
      "Тариф больше недоступен у Hotelbeds. Бронь не создана. Вернитесь к результатам и выполните новый поиск.",
    booking,
  });
}

async function reconcileUncertainBooking(booking) {
  const reconciliation = await hotelbedsBookingService.reconcile(booking);

  if (!reconciliation.found) {
    // An empty list after a timeout is not proof that no booking was created.
    // Keep the durable unknown state and never send a second Booking POST.
    await markProviderFailure(booking.id, 'confirmation_unknown', {
      status: 503, code: 'HOTELBEDS_CONFIRMATION_UNKNOWN', message: 'Provider outcome is still unknown',
    }, { reconciled: true });
    throw Object.assign(new Error('Booking outcome requires reconciliation'), { status: 503, code: 'HOTELBEDS_CONFIRMATION_UNKNOWN' });
  }

  const updated = await persistProviderState(booking, reconciliation, {
    reconciled: true,
  });

  if (["CONFIRMED", "MODIFIED"].includes(String(updated.provider_status || "").toUpperCase())) {
    await bookingEventService.safeRecordEvent({
      bookingId: updated.id,
      userId: updated.user_id,
      key: "booking-confirmed",
      type: "booking_confirmed",
      actorType: "provider",
      title: "Hotelbeds TEST подтвердил бронирование",
      description: "Статус восстановлен через reconciliation после неопределённого ответа поставщика.",
      status: updated.provider_status,
      metadata: {
        provider: "hotelbeds",
        providerReference: updated.provider_booking_id,
        reconciled: true,
      },
      occurredAt: updated.confirmed_at,
    });
    await notificationService.notifyBookingEvent(updated.id, "booking_confirmed");
  }

  return { found: true, booking: updated, provider: reconciliation };
}

async function confirmProviderBooking(req, res, next) {
  try {
    const booking = await getBooking(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    assertAccess(req, booking);
    assertHotelbeds(booking);
    hotelbedsBookingService.assertBookingAllowed();

    if (booking.provider_booking_id) {
      return res.json({
        success: true,
        alreadyConfirmed: true,
        testMode: true,
        booking,
      });
    }

    if (booking.provider_status === "confirmation_unknown") {
      try {
        const reconciled = await reconcileUncertainBooking(booking);

        if (!reconciled.found) {
          return rateExpiredResponse(res, reconciled.booking);
        }

        return res.json({
          success: true,
          testMode: true,
          reconciled: true,
          booking: reconciled.booking,
          provider: reconciled.provider,
        });
      } catch (error) {
        await markProviderFailure(booking.id, "confirmation_unknown", error);
        const wrapped = new Error(
          "Не удалось сверить результат предыдущего запроса Hotelbeds. Не повторяйте бронирование; попробуйте синхронизацию позже."
        );
        wrapped.status = 503;
        wrapped.code = "HOTELBEDS_RECONCILIATION_UNAVAILABLE";
        throw wrapped;
      }
    }

    if (booking.provider_status === "confirming") {
      return res.status(409).json({
        code: "HOTELBEDS_CONFIRMATION_BUSY",
        message: "Hotelbeds-бронирование уже обрабатывается. Не нажимайте кнопку повторно.",
      });
    }

    if (["confirmation_failed", "RATE_EXPIRED"].includes(booking.provider_status)) {
      return rateExpiredResponse(res, booking);
    }

    const claim = await pool.query(
      `
      UPDATE bookings
      SET provider_status = 'confirming', provider_last_error = NULL, updated_at = NOW()
      WHERE id = $1
        AND provider = 'hotelbeds'
        AND provider_booking_id IS NULL
        AND COALESCE(provider_status, '') NOT IN
          ('confirming', 'confirmation_unknown', 'confirmation_failed', 'RATE_EXPIRED')
      RETURNING *
      `,
      [booking.id]
    );

    if (claim.rows.length === 0) {
      return res.status(409).json({
        code: "HOTELBEDS_CONFIRMATION_BUSY",
        message: "Hotelbeds-бронирование уже обрабатывается.",
      });
    }

    const claimedBooking = claim.rows[0];

    try {
      const confirmation = await hotelbedsBookingService.confirm(claimedBooking);
      const updated = await persistProviderState(claimedBooking, confirmation);

      logger.info(
        `HOTELBEDS TEST CONFIRMED | bookingId=${booking.id} | reference=${confirmation.reference} | status=${confirmation.status}`
      );

      await bookingEventService.safeRecordEvent({
        bookingId: updated.id,
        userId: updated.user_id,
        key: "booking-confirmed",
        type: "booking_confirmed",
        actorType: "provider",
        title: "Hotelbeds TEST подтвердил бронирование",
        description: "Travio получил подтверждение Booking API поставщика.",
        status: updated.provider_status,
        metadata: {
          provider: "hotelbeds",
          providerReference: updated.provider_booking_id,
          total: Number(updated.total_amount) || 0,
          currency: updated.currency,
        },
        occurredAt: updated.confirmed_at,
      });

      await notificationService.notifyBookingEvent(booking.id, "booking_confirmed");

      return res.json({
        success: true,
        testMode: true,
        booking: updated,
        provider: {
          reference: confirmation.reference,
          status: confirmation.status,
          currency: updated.currency,
          total: Number(updated.total_amount),
          quotedTotal: quotedAmount(updated),
          priceDelta: Number(updated.total_amount) - quotedAmount(updated),
        },
      });
    } catch (error) {
      if (Number(error.status) >= 500) {
        try {
          const reconciled = await reconcileUncertainBooking(claimedBooking);

          if (reconciled.found) {
            logger.warn(
              `HOTELBEDS CONFIRM RECONCILED | bookingId=${booking.id} | reference=${reconciled.booking.provider_booking_id}`
            );

            return res.json({
              success: true,
              testMode: true,
              reconciledAfterProviderError: true,
              booking: reconciled.booking,
              provider: reconciled.provider,
            });
          }

          return rateExpiredResponse(res, reconciled.booking);
        } catch (reconciliationError) {
          await markProviderFailure(
            booking.id,
            "confirmation_unknown",
            reconciliationError
          );

          const wrapped = new Error(
            "Hotelbeds не подтвердил ответ, а автоматическая сверка временно недоступна. Не повторяйте бронирование; статус можно проверить в «Моих бронированиях»."
          );
          wrapped.status = 503;
          wrapped.code = "HOTELBEDS_CONFIRMATION_UNKNOWN";
          throw wrapped;
        }
      }

      await markProviderFailure(booking.id, "confirmation_failed", error);
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

async function syncProviderBooking(req, res, next) {
  try {
    const booking = await getBooking(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    assertAccess(req, booking);
    assertHotelbeds(booking);
    hotelbedsBookingService.assertBookingAllowed();

    const synced = await hotelbedsBookingService.syncWithFallback(booking);

    if (synced.found === false) {
      const updated = await markProviderFailure(
        booking.id,
        "RATE_EXPIRED",
        {
          status: 409,
          code: "HOTELBEDS_RATE_EXPIRED",
          message: "Booking List returned no match for this clientReference.",
        },
        { reconciled: true }
      );

      if (req.user.role === "admin") {
        await adminAuditService.safeRecordAction({
          adminId: req.user.id,
          bookingId: updated.id,
          actionType: "provider_sync",
          targetType: "booking",
          targetId: updated.id,
          status: "attention",
          metadata: { provider: "hotelbeds", noMatch: true, providerStatus: updated.provider_status },
        });
      }

      return res.json({
        success: true,
        reconciled: true,
        noMatch: true,
        message: "Hotelbeds не нашёл эту бронь. Заявка помечена как неподтверждённая.",
        booking: updated,
      });
    }

    const updated = await persistProviderState(booking, synced, {
      reconciled: synced.source !== "booking_detail",
    });

    await bookingEventService.safeRecordEvent({
      bookingId: updated.id,
      userId: updated.user_id,
      type: "provider_synced",
      actorType: "provider",
      title: "Hotelbeds TEST синхронизирован",
      description: "Travio получил актуальный статус брони от поставщика.",
      status: updated.provider_status,
      metadata: {
        providerReference: updated.provider_booking_id,
        source: synced.source,
      },
      occurredAt: updated.provider_synced_at,
    });

    if (req.user.role === "admin") {
      await adminAuditService.safeRecordAction({
        adminId: req.user.id,
        bookingId: updated.id,
        actionType: "provider_sync",
        targetType: "booking",
        targetId: updated.id,
        metadata: {
          provider: "hotelbeds",
          providerReference: updated.provider_booking_id || null,
          providerStatus: updated.provider_status || null,
          source: synced.source,
        },
      });
    }

    return res.json({
      success: true,
      fallbackUsed: synced.source === "booking_list_fallback",
      booking: updated,
      provider: {
        reference: synced.reference,
        status: synced.status,
        currency: updated.currency,
        total: Number(updated.total_amount),
        source: synced.source,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function simulateProviderCancellation(req, res, next) {
  try {
    const booking = await getBooking(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    assertAccess(req, booking);
    assertHotelbeds(booking);

    if (!booking.provider_booking_id) {
      return res.status(409).json({
        code: "HOTELBEDS_REFERENCE_MISSING",
        message: "Нельзя рассчитать отмену без Hotelbeds reference.",
      });
    }

    if (["CANCELLED", "CANCELED"].includes(String(booking.provider_status || "").toUpperCase())) {
      return res.json({
        success: true,
        alreadyCancelled: true,
        cancellationFee: 0,
        currency: booking.currency || "EUR",
        booking,
      });
    }

    const simulation = await hotelbedsBookingService.simulateCancellation(
      booking.provider_booking_id
    );

    await pool.query(
      `
      UPDATE bookings
      SET provider_cancellation_snapshot = $1::jsonb,
          provider_synced_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
      `,
      [JSON.stringify(simulation.raw), booking.id]
    );

    await bookingEventService.safeRecordEvent({
      bookingId: booking.id,
      userId: booking.user_id,
      type: "cancellation_quote",
      actorType: "provider",
      title: "Условия отмены проверены",
      description: "Hotelbeds TEST рассчитал условия отмены перед подтверждением операции.",
      status: simulation.status || booking.provider_status,
      metadata: {
        cancellationFee: simulation.cancellationFee,
        currency: simulation.currency || booking.currency || "EUR",
      },
    });

    return res.json({
      success: true,
      simulation: true,
      cancellationFee: simulation.cancellationFee,
      currency: simulation.currency || booking.currency || "EUR",
      providerStatus: simulation.status,
    });
  } catch (error) {
    next(error);
  }
}

async function cancelProviderBooking(req, res, next) {
  try {
    const booking = await getBooking(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    assertAccess(req, booking);
    assertHotelbeds(booking);

    if (!booking.provider_booking_id) {
      return res.status(409).json({
        code: "HOTELBEDS_REFERENCE_MISSING",
        message: "Нельзя отменить бронь без Hotelbeds reference.",
      });
    }

    if (req.body?.confirmCancellation !== true) {
      return res.status(400).json({
        code: "CANCELLATION_CONFIRMATION_REQUIRED",
        message: "Сначала подтвердите отмену после просмотра возможного штрафа.",
      });
    }

    if (["CANCELLED", "CANCELED"].includes(String(booking.provider_status || "").toUpperCase())) {
      return res.json({ success: true, alreadyCancelled: true, booking });
    }

    const simulation = await hotelbedsBookingService.simulateCancellation(
      booking.provider_booking_id
    );

    const expectedFee = req.body?.expectedFee;
    if (expectedFee !== undefined && expectedFee !== null && simulation.cancellationFee !== null) {
      const expected = Number(expectedFee);
      if (Number.isFinite(expected) && Math.abs(expected - simulation.cancellationFee) > 0.01) {
        return res.status(409).json({
          code: "CANCELLATION_FEE_CHANGED",
          message: "Стоимость отмены изменилась. Проверьте условия ещё раз.",
          cancellationFee: simulation.cancellationFee,
          currency: simulation.currency || booking.currency || "EUR",
        });
      }
    }

    const cancelled = await hotelbedsBookingService.cancel(booking.provider_booking_id);
    const providerStatus = cancelled.status || "CANCELLED";

    const result = await pool.query(
      `
      UPDATE bookings
      SET
        provider_status = $1,
        provider_response = $2::jsonb,
        provider_cancellation_snapshot = $3::jsonb,
        provider_last_error = NULL,
        status = 'Отменена',
        provider_cancelled_at = NOW(),
        provider_synced_at = NOW(),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
      `,
      [
        providerStatus,
        JSON.stringify(cancelled.raw),
        JSON.stringify(cancelled.raw),
        booking.id,
      ]
    );

    logger.info(
      `HOTELBEDS TEST CANCELLED | bookingId=${booking.id} | reference=${booking.provider_booking_id} | fee=${cancelled.cancellationFee ?? "unknown"}`
    );

    const cancelledBooking = result.rows[0];
    await bookingEventService.safeRecordEvent({
      bookingId: cancelledBooking.id,
      userId: cancelledBooking.user_id,
      key: "booking-cancelled",
      type: "booking_cancelled",
      actorType: "provider",
      title: "Hotelbeds TEST-бронирование отменено",
      description: "Cancellation API поставщика подтвердил отмену.",
      status: cancelledBooking.provider_status,
      metadata: {
        providerReference: cancelledBooking.provider_booking_id,
        cancellationFee: cancelled.cancellationFee,
        currency: cancelled.currency || booking.currency || "EUR",
      },
      occurredAt: cancelledBooking.provider_cancelled_at,
    });

    await notificationService.notifyBookingEvent(booking.id, "booking_cancelled");

    return res.json({
      success: true,
      testMode: true,
      booking: result.rows[0],
      cancellationFee: cancelled.cancellationFee,
      currency: cancelled.currency || booking.currency || "EUR",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  confirmProviderBooking,
  syncProviderBooking,
  simulateProviderCancellation,
  cancelProviderBooking,
};
