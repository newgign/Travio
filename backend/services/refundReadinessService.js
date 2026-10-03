function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildRefundReadiness(booking, payment) {
  const currency = booking?.currency || "KZT";
  const paidAmount = numberValue(payment?.amount || booking?.total_amount);
  const refundedAmount = numberValue(payment?.refunded_amount);
  const refundableAmount = Math.max(0, paidAmount - refundedAmount);
  const provider = String(booking?.provider || "legacy").toLowerCase();
  const paymentGateway = String(payment?.gateway_provider || "none").toLowerCase();
  const paymentStatus = String(payment?.status || "pending").toLowerCase();
  const refundStatus = String(payment?.refund_status || "not_requested").toLowerCase();

  if (provider === "hotelbeds") {
    return {
      prepared: true,
      requestEnabled: false,
      completeEnabled: false,
      realRefundEnabled: false,
      mode: "provider-managed",
      status: refundStatus,
      refundableAmount: 0,
      refundedAmount,
      currency,
      message: "Hotelbeds TEST отменяется через Cancellation API. Денежный refund-контур Travio для этой брони не используется.",
    };
  }

  if (paymentGateway === "sandbox" && paymentStatus === "paid") {
    const completed = refundStatus === "refunded" || refundableAmount <= 0;
    const requested = refundStatus === "requested";
    return {
      prepared: true,
      requestEnabled: !completed && !requested && refundableAmount > 0,
      completeEnabled: !completed && requested && refundableAmount > 0,
      realRefundEnabled: false,
      mode: completed ? "sandbox-complete" : "sandbox-ready",
      status: completed ? "refunded" : refundStatus,
      refundableAmount: completed ? 0 : refundableAmount,
      refundedAmount: completed ? paidAmount : refundedAmount,
      currency,
      message: completed
        ? "Sandbox-возврат завершён. Реальный возврат денег не выполнялся."
        : requested
          ? "Запрос sandbox-возврата создан. Для завершения подтвердите второй тестовый шаг."
          : "Доступен полный sandbox-возврат. Реальных денежных операций не выполняется.",
    };
  }

  return {
    prepared: true,
    requestEnabled: false,
    completeEnabled: false,
    realRefundEnabled: false,
    mode: "not-applicable",
    status: refundStatus,
    refundableAmount: 0,
    refundedAmount,
    currency,
    message: "Для этой брони sandbox-возврат недоступен.",
  };
}

function validateIntentAccess(request, booking, { bookingId, userId, isAdmin = false } = {}) {
  const reject = (code, status = 409) => { throw Object.assign(new Error('Intent unavailable'), { code, status }); };
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).length
    || !/^[1-9]\d{0,9}$/.test(String(bookingId || ''))) reject('COMPENSATION_INTENT_INVALID');
  if (!booking || String(booking.id) !== String(bookingId)) reject('BOOKING_NOT_FOUND', 404);
  if (!isAdmin && (!/^[1-9]\d*$/.test(String(userId || '')) || String(booking.user_id) !== String(userId))) reject('BOOKING_ACCESS_DENIED', 403);
  return require('node:crypto').createHash('sha256').update(`booking-${booking.id}`).digest('hex').slice(0, 32);
}
function providerBookingObserved(booking, statuses) {
  const result = booking?.provider_response?.booking;
  return booking?.provider === 'hotelbeds' && booking.offer_snapshot?.priceEnvironment === 'test'
    && require('../config/providers').hotelbeds.environment === 'test'
    && typeof booking.provider_booking_id === 'string' && booking.provider_booking_id.length > 0
    && result?.reference === booking.provider_booking_id && statuses.includes(booking.provider_status)
    && result.status === booking.provider_status && /^[A-Z]{3}$/.test(booking.currency || '')
    && result.currency === booking.currency;
}
function prepareCancellationIntent(request, booking, access) {
  const requestId = validateIntentAccess(request, booking, access);
  const recovery = unavailableCompensation(requestId);
  const eligible = providerBookingObserved(booking, ['CONFIRMED', 'MODIFIED']);
  // Existing saved quote is an estimate only, and must match the same provider booking/currency.
  const quote = booking.provider_cancellation_snapshot;
  const matching = eligible && quote?.booking?.reference === booking.provider_booking_id
    && quote.booking.currency === booking.currency;
  const penalty = matching ? require('./hotelbedsBookingService').parseCancellationResponse(quote).cancellationFee : null;
  return { success: false, code: 'CANCELLATION_UNAVAILABLE', state: 'CANCELLATION_UNAVAILABLE',
    providerState: 'PROVIDER_NOT_CALLED', cancellationAvailable: recovery.cancellationAttemptAllowed,
    intent: { requestId, eligibility: eligible ? 'ELIGIBLE_PROVIDER_BOOKING' : 'REAL_CONFIRMED_BOOKING_REQUIRED',
      environment: 'test', currency: eligible ? booking.currency : null,
      estimatedPenalty: penalty, penaltyStatus: penalty === null ? 'UNKNOWN' : 'ESTIMATE_ONLY' },
    message: 'Отмена бронирования пока недоступна.' };
}
function prepareRefundIntent(request, booking, payment, access) {
  const requestId = validateIntentAccess(request, booking, access);
  const recovery = unavailableCompensation(requestId);
  const money = value => ['number', 'string'].includes(typeof value) && String(value).trim() !== ''
    && Number.isFinite(Number(value)) && Number(value) >= 0;
  const realCharge = payment && String(payment.booking_id) === String(booking.id)
    && payment.status === 'paid' && payment.metadata?.realCharge === true
    && typeof payment.gateway_provider === 'string' && !['none', 'sandbox', ''].includes(payment.gateway_provider)
    && typeof payment.external_id === 'string' && payment.external_id.length > 0 && !payment.external_id.startsWith('sbx_')
    && /^[A-Z]{3}$/.test(payment.metadata?.currency || '') && payment.metadata.currency === booking.currency
    && money(payment.amount) && Number(payment.amount) > 0 && money(payment.refunded_amount)
    && Number(payment.refunded_amount) <= Number(payment.amount);
  // Current foundation follows cancellation-before-refund; a simulation is not completed cancellation.
  const cancellationObserved = providerBookingObserved(booking, ['CANCELLED', 'CANCELED']);
  const penalty = cancellationObserved ? require('./hotelbedsBookingService').parseCancellationResponse(booking.provider_response).cancellationFee : null;
  const amount = realCharge && cancellationObserved && penalty !== null
    ? Math.max(0, Math.round(Number(payment.amount) * 100) - Math.round(penalty * 100) - Math.round(Number(payment.refunded_amount) * 100)) / 100 : null;
  return { success: false, code: 'REFUND_UNAVAILABLE', state: 'REFUND_UNAVAILABLE',
    providerState: 'PROVIDER_NOT_CALLED', refundAvailable: recovery.refundAttemptAllowed,
    intent: { requestId, eligibility: !realCharge ? 'REAL_CHARGE_REQUIRED' : !cancellationObserved ? 'CANCELLATION_REQUIRED'
      : amount === null ? 'PENALTY_UNKNOWN' : amount > 0 ? 'REFUNDABLE_CHARGE' : 'NO_REFUNDABLE_AMOUNT',
      currency: realCharge ? payment.metadata.currency : null, amount, amountStatus: amount === null ? 'UNKNOWN' : 'TRUSTED_ESTIMATE',
      environment: 'test' }, message: 'Возврат оплаты пока недоступен.' };
}
function unavailableCompensation(requestId) {
  require('./bookingLifecycle').assertLifecycleState({ cancellation: 'CANCELLATION_UNAVAILABLE', refund: 'REFUND_UNAVAILABLE' });
  return require('./bookingPaymentRecovery').compensationPlan({ requestId,
    booking: { state: 'BOOKING_DISABLED' }, payment: { state: 'PAYMENTS_DISABLED' },
    cancellation: { state: 'CANCELLATION_UNAVAILABLE' }, refund: { state: 'REFUND_UNAVAILABLE' } });
}
function intentError(error) {
  const known = ['COMPENSATION_INTENT_INVALID', 'BOOKING_NOT_FOUND', 'BOOKING_ACCESS_DENIED'].includes(error?.code);
  return { status: known ? error.status : 503, body: { success: false,
    code: known ? error.code : 'INTERNAL_RETRYABLE_ERROR', providerState: 'PROVIDER_NOT_CALLED',
    message: known ? 'Перепроверьте данные записи и доступ к ней.' : 'Не удалось проверить запись. Повторите попытку позже.' } };
}
module.exports = { buildRefundReadiness, prepareCancellationIntent, prepareRefundIntent, intentError };
