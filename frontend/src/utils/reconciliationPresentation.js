export const labels = {
  priority: { CRITICAL: 'Критический', HIGH: 'Высокий', MEDIUM: 'Средний', LOW: 'Низкий' },
  category: { PAYMENT_OUTCOME_UNKNOWN: 'Результат платежа неизвестен', PAYMENT_STATE_CONFLICT: 'Противоречивые сведения о платеже',
    PAYMENT_CORRELATION_MISMATCH: 'Несовпадение идентификаторов', PAYMENT_AMOUNT_MISMATCH: 'Несовпадение суммы', PAYMENT_CURRENCY_MISMATCH: 'Несовпадение валюты',
    BOOKING_PAYMENT_INCONSISTENCY: 'Несогласованность бронирования и платежа', REFUND_REVIEW_REQUIRED: 'Проверка необходимости возврата',
    CANCELLATION_REVIEW_REQUIRED: 'Проверка необходимости отмены', RECONCILIATION_REQUIRED: 'Требуется сверка', AWAITING_PROVIDER_EVIDENCE: 'Ожидание сведений' },
  status: { MANUAL_REVIEW_REQUIRED: 'Нужна ручная проверка', RECONCILIATION_REQUIRED: 'Требуется сверка', COMPENSATION_REQUIRED: 'Требуется проверка компенсации', AWAITING_EVIDENCE: 'Ожидание сведений' },
  paymentState: { PAYMENT_NOT_STARTED: 'Не начат', PAYMENTS_DISABLED: 'Платежи отключены', PAYMENT_PENDING: 'В ожидании', PAYMENT_AUTHORIZED: 'Авторизован, без подтверждения списания',
    PAYMENT_CAPTURED: 'Наблюдение о списании', PAYMENT_FAILED_FINAL: 'Завершился ошибкой', PAYMENT_CANCELLED: 'Наблюдение об отмене платежа', PAYMENT_OUTCOME_UNKNOWN: 'Результат неизвестен' },
  bookingState: { BOOKING_NOT_STARTED: 'Не начато', BOOKING_DISABLED: 'Бронирование отключено', BOOKING_PENDING: 'В ожидании', BOOKING_FAILED_FINAL: 'Завершилось ошибкой', BOOKING_OUTCOME_UNKNOWN: 'Результат неизвестен', BOOKING_CONFIRMED: 'Наблюдение о подтверждении' },
  recommendedNextAction: { WAIT_FOR_PROVIDER: 'Дождаться сведений от провайдера', VERIFY_PROVIDER_STATUS: 'Проверить статус у платёжного провайдера', REVIEW_PAYMENT: 'Проверить платёж', REVIEW_BOOKING: 'Проверить бронирование',
    REVIEW_REFUND: 'Проверить необходимость возврата', REVIEW_CANCELLATION: 'Проверить необходимость отмены', ESCALATE_RECONCILIATION: 'Передать сверку на дополнительную проверку', NO_ACTION: 'Действия не требуются' },
  reasonCode: { PAYMENT_STATE_CONFLICT: 'Сведения о состоянии противоречат друг другу', PAYMENT_CORRELATION_MISMATCH: 'Идентификаторы не совпадают', PAYMENT_AMOUNT_MISMATCH: 'Сумма не совпадает', PAYMENT_CURRENCY_MISMATCH: 'Валюта не совпадает',
    PAYMENT_OR_BOOKING_OUTCOME_UNKNOWN: 'Результат платежа или бронирования неизвестен', UNRESOLVED_RECOVERY: 'Восстановление ещё не завершено', REFUND_REQUIRED: 'Нужно проверить необходимость возврата', CANCELLATION_REQUIRED: 'Нужно проверить необходимость отмены',
    BOOKING_PAYMENT_INCONSISTENT: 'Платёж и бронирование не согласованы', WEBHOOK_MISSING: 'Сведения от провайдера ещё не получены', DUPLICATE_WEBHOOK_EVENT: 'Повторное уведомление', CONSISTENT_OBSERVATIONS: 'Сведения согласованы' },
  eventType: { 'payment.pending': 'Ожидание платежа', 'payment.authorized': 'Авторизация платежа', 'payment.captured': 'Сообщение о списании', 'payment.failed': 'Сообщение об ошибке', 'payment.cancelled': 'Сообщение об отмене', 'payment.unknown': 'Неизвестный результат' },
};
const fail = () => { throw Error('INVALID_RECONCILIATION_RESPONSE'); };
const hex = (value, length = 64) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const enumValue = (group, value) => typeof value === 'string' && Object.hasOwn(labels[group], value);
const match = value => value === null || typeof value === 'boolean';
export const consistencyLabel = value => value === true ? 'Совпадает' : value === false ? 'Не совпадает' : 'Нет сведений';
export function safeRow(value) {
  if (!value || !hex(value.caseId) || !hex(value.caseFamilyId) || !hex(value.requestId, 32) || !hex(value.providerFingerprint)
    || value.contractOnly !== true || value.commercialSuccess !== false || value.applicationPaymentState !== 'PAYMENTS_DISABLED' || value.operatorActionsExecutable !== false
    || !match(value.amountMatch) || !match(value.currencyMatch)) fail();
  const out = {};
  for (const key of ['caseId', 'caseFamilyId', 'requestId', 'providerFingerprint']) out[key] = value[key];
  for (const key of ['priority', 'category', 'status', 'reasonCode', 'paymentState', 'bookingState', 'recommendedNextAction']) {
    if (!enumValue(key, value[key])) fail();
    out[key] = value[key];
  }
  for (const key of ['manualReviewRequired', 'reconciliationRequired', 'compensationRequired']) {
    if (typeof value[key] !== 'boolean') fail(); out[key] = value[key];
  }
  return { ...out, amountMatch: value.amountMatch, currencyMatch: value.currencyMatch };
}
export function safeList(response) {
  if (!response || !['unavailable', 'available'].includes(response.source) || !Array.isArray(response.items) || response.items.length > 1000) fail();
  if (response.source === 'unavailable' && response.items.length) fail();
  const identities = new Map();
  for (const value of response.items) {
    const row = safeRow(value), previous = identities.get(row.caseFamilyId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) fail();
    identities.set(row.caseFamilyId, row);
  }
  const order = Object.keys(labels.priority);
  return { source: response.source, items: [...identities.values()].sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority) || a.caseId.localeCompare(b.caseId)) };
}
export function safeDetail(value, identity) {
  const row = safeRow(value);
  if (!hex(value.paymentFingerprint) || !Array.isArray(value.relatedCaseIds) || value.relatedCaseIds.length > 1000 || value.relatedCaseIds.some(id => !hex(id))
    || !value.relatedCaseIds.includes(row.caseId) || !(row.caseFamilyId === identity || value.relatedCaseIds.includes(identity))
    || value.timelineOrder !== 'DETERMINISTIC_OBSERVATION_ORDER' || !Array.isArray(value.timeline) || value.timeline.length > 1000) fail();
  const timeline = value.timeline.map(entry => {
    if (!entry || !(entry.eventType === null || enumValue('eventType', entry.eventType)) || !enumValue('paymentState', entry.internalPaymentState)
      || !enumValue('paymentState', entry.observedPaymentState) || !enumValue('bookingState', entry.bookingState) || !enumValue('reasonCode', entry.reasonCode)
      || !enumValue('recommendedNextAction', entry.recommendedNextAction) || !match(entry.amountMatch) || !match(entry.currencyMatch)) fail();
    return { eventType: entry.eventType, internalPaymentState: entry.internalPaymentState, observedPaymentState: entry.observedPaymentState,
      bookingState: entry.bookingState, reasonCode: entry.reasonCode, recommendedNextAction: entry.recommendedNextAction, amountMatch: entry.amountMatch, currencyMatch: entry.currencyMatch };
  });
  return { ...row, timeline };
}
export function filterCases(items, filters) {
  return items.filter(row => Object.entries(filters).every(([key, value]) => value === '' || (['manualReviewRequired', 'compensationRequired'].includes(key) ? row[key] === (value === 'true') : row[key] === value)));
}
