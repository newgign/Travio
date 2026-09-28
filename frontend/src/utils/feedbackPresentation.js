// Fixed public copy only. Never interpolate service errors or payloads.
const checkoutMessages = {
  HOTELBEDS_RATE_EXPIRED: 'Тариф больше недоступен. Вернитесь к результатам поиска.',
  HOTELBEDS_NEW_RATE_REQUIRED: 'Тариф больше недоступен. Вернитесь к результатам поиска.',
  HOTELBEDS_CONFIRMATION_UNKNOWN: 'Результат подтверждения неизвестен. Проверьте историю заказов и не повторяйте бронирование.',
  HOTELBEDS_RECONCILIATION_UNAVAILABLE: 'Результат подтверждения неизвестен. Проверьте историю заказов и не повторяйте бронирование.',
  HOTELBEDS_AT_HOTEL_UNSUPPORTED: 'Этот способ оплаты недоступен. Вернитесь к результатам поиска.',
};
export function checkoutFailureMessage(code) {
  return Object.hasOwn(checkoutMessages, code) ? checkoutMessages[code] : 'Не удалось завершить оформление. Проверьте историю заказов перед повторным действием.';
}
export const reviewFailureMessage = 'Не удалось загрузить информацию о туре. Вернитесь назад или повторите запрос.';
export const voucherFailureMessage = 'Ваучер недоступен. Вернитесь к бронированиям.';
export const pdfFailureMessage = 'Не удалось скачать PDF. Попробуйте ещё раз.';
