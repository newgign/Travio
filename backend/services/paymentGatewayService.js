const crypto = require("crypto");
const pool = require("../db");
const bookingEventService = require("./bookingEventService");
const productionGateService = require("./productionGateService");

function readiness() {
  const mode = String(process.env.PAYMENTS_MODE || "disabled").trim().toLowerCase();
  const provider = String(process.env.PAYMENTS_PROVIDER || "none").trim().toLowerCase();
  const gate = productionGateService.state();
  return {
    mode,
    provider,
    realChargesEnabled: gate.realChargesEnabled,
    productionSalesEnabled: gate.productionSalesEnabled,
    safetyGate: gate.enforcedSafeMode,
    sandboxAvailable: mode === "sandbox",
    configured: mode === "disabled" ? true : mode === "sandbox" ? true : false,
    message:
      mode === "sandbox"
        ? "Sandbox payment intents are enabled. No real charge is performed."
        : "Real payment gateway is not connected. Hotelbeds TEST booking remains separate from payment.",
  };
}

async function createIntent({ bookingId, userId, isAdmin = false }) {
  const state = readiness();
  const bookingResult = await pool.query(
    `SELECT id, user_id, provider, total_amount, currency, status FROM bookings WHERE id = $1 LIMIT 1`,
    [bookingId]
  );
  const booking = bookingResult.rows[0];
  if (!booking) {
    const error = new Error("Бронирование не найдено");
    error.status = 404;
    throw error;
  }
  if (!isAdmin && Number(booking.user_id) !== Number(userId)) {
    const error = new Error("Нет доступа к бронированию");
    error.status = 403;
    throw error;
  }
  if (booking.provider === "hotelbeds") {
    const error = new Error("Hotelbeds TEST не требует локального платежа. Реальные списания отключены.");
    error.status = 409;
    error.code = "HOTELBEDS_TEST_PAYMENT_BLOCKED";
    throw error;
  }
  if (state.mode !== "sandbox") {
    const error = new Error("Платёжный шлюз ещё не подключён");
    error.status = 409;
    error.code = "PAYMENT_GATEWAY_DISABLED";
    throw error;
  }

  const idempotencyKey = `booking-${booking.id}-sandbox-v1`;
  const externalId = `sbx_${crypto.randomBytes(8).toString("hex")}`;
  const result = await pool.query(
    `
    UPDATE payments
    SET gateway_provider = 'sandbox',
        external_id = COALESCE(external_id, $1),
        idempotency_key = COALESCE(idempotency_key, $2),
        status = CASE WHEN status = 'paid' THEN status ELSE 'requires_action' END,
        metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
        updated_at = NOW()
    WHERE booking_id = $4
    RETURNING *
    `,
    [externalId, idempotencyKey, JSON.stringify({ mode: "sandbox", realCharge: false }), booking.id]
  );
  if (!result.rows.length) {
    const error = new Error("Платёжная запись не найдена");
    error.status = 404;
    throw error;
  }

  const payment = result.rows[0];
  await bookingEventService.safeRecordEvent({
    bookingId: booking.id,
    userId,
    key: `payment-intent-${payment.id}`,
    type: "payment_intent_created",
    actorType: "customer",
    title: "Sandbox payment intent создан",
    description: "Travio подготовил тестовое платёжное намерение. Реального списания нет.",
    status: payment.status,
    metadata: {
      paymentId: payment.id,
      gatewayProvider: payment.gateway_provider,
      realCharge: false,
    },
  });

  return { readiness: state, payment };
}

async function prepareCheckoutIntent(request) {
  // Validate-only checkout foundation; never delegates to the sandbox/PSP path.
  const reject = code => { throw Object.assign(new Error('Payment intent validation failed'), { status: 409, code }); };
  if (!request || typeof request !== 'object' || Array.isArray(request)) reject('PAYMENT_VALIDATION_ERROR');
  const fields = ['checkoutToken', 'travelers', 'review', 'acceptedPriceToken', 'provider', 'hotelId', 'rateKey', 'price', 'currency', 'priceEnvironment'];
  // Reject unknown fields, including card credentials, client states and booking references.
  if (Object.keys(request).some(key => !fields.includes(key))) reject('PAYMENT_VALIDATION_ERROR');
  if (request.review !== true || typeof request.checkoutToken !== 'string' || !request.checkoutToken) reject('PAYMENT_PREREQUISITE_MISSING');
  let session, bookingIntent, review;
  try {
    session = await require('./checkoutSessionService').readForIntent(request.checkoutToken);
    const booking = require('./hotelbedsBookingService');
    bookingIntent = booking.prepareIntent(request, session);
    // REVIEW_READY is reconstructed server-side, never accepted as a browser assertion.
    review = booking.reviewPreview(bookingIntent, session);
  } catch (error) {
    const prerequisites = new Set(['CHECKOUT_SESSION_REQUIRED', 'CHECKOUT_SESSION_NOT_FOUND', 'CHECKOUT_SESSION_USED',
      'CHECKOUT_SESSION_EXPIRED', 'CHECKOUT_SESSION_INVALID', 'OFFER_ENVIRONMENT_MISMATCH', 'RATE_CHANGED',
      'CHECKRATE_CONFIRMATION_REQUIRED', 'CHECKRATE_CONFIRMATION_EXPIRED']);
    if (prerequisites.has(error.code)) reject('PAYMENT_PREREQUISITE_MISSING');
    if (/^BOOKING_INTENT_/.test(error.code || '')) reject('PAYMENT_VALIDATION_ERROR');
    throw error;
  }
  if (bookingIntent.state !== 'INTENT_READY' || review.state !== 'REVIEW_READY') reject('PAYMENT_PREREQUISITE_MISSING');
  const payment = readiness();
  // Hard stop even if someone requests sandbox/live flags. No row, reference or transaction is created.
  return { ...require('./bookingPaymentRecovery').disabledBoundary('payment', bookingIntent.requestId),
    paymentState: 'PAYMENT_NOT_STARTED', bookingState: 'BOOKING_DISABLED',
    bookingAvailable: false, paymentAvailable: false,
    intent: { state: 'PAYMENT_INTENT_READY', reviewState: review.state, requestId: bookingIntent.requestId,
      provider: bookingIntent.provider, hotelId: bookingIntent.hotelId, environment: bookingIntent.environment,
      mode: payment.mode, paymentProvider: payment.provider, amount: bookingIntent.price, currency: bookingIntent.currency,
      expiresAt: review.expiresAt },
    message: 'Оплата пока недоступна. Бронь не создана. Списаний нет.' };
}

module.exports = { readiness, createIntent, prepareCheckoutIntent };
