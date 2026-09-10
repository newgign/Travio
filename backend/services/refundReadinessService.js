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

module.exports = { buildRefundReadiness };
