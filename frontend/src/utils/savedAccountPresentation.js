import { displayDate, detailsGuests, hotelLocation } from './detailsPresentation';
import { normalizeRoomDisplay, normalizeBoardDisplay, stayLabel, validPrice } from './hotelOfferDisplay';
import { formatMoney } from './money';
import { pluralCount } from './resultsPresentation';

export const textValue = value => typeof value === 'string' ? value.trim() : '';
export const savedTitle = item => textValue(item.name) || textValue(item.title) || textValue(item.hotel) || 'Отель';
export function savedSearchLink(item = {}) {
  const params = new URLSearchParams();
  for (const key of ['countryCode', 'country', 'destinationCode']) if (textValue(item[key])) params.set(key, item[key]);
  // Old dates/rates never become a current search or a fresh selected snapshot.
  return params.size ? `/?${params}#home-search` : '/#home-search';
}
export const savedMoney = (amount, currency) => validPrice(amount) && /^[A-Z]{3}$/.test(currency || '') ? formatMoney(amount, currency) : null;
export const storedRoom = offer => normalizeRoomDisplay(textValue(offer.roomName) || textValue(offer.roomType) || textValue(offer.roomCode));
export const storedBoard = offer => offer.boardCode || offer.food || offer.boardName ? normalizeBoardDisplay(textValue(offer.boardCode) || textValue(offer.food), textValue(offer.boardName)) : '';

export const localBookingStatuses = Object.freeze({
  'Новая': { label: 'На рассмотрении', group: 'active', tone: 'pending' },
  'Подтверждена': { label: 'Подтверждено', group: 'active', tone: 'confirmed' },
  'Отменена': { label: 'Отменено', group: 'cancelled', tone: 'cancelled' },
});
export const providerBookingStatuses = Object.freeze({
  LOCAL_PENDING: { label: 'Заявка создана', group: 'active', tone: 'pending' },
  CONFIRMING: { label: 'Ожидает подтверждения', group: 'active', tone: 'pending' },
  CONFIRMATION_UNKNOWN: { label: 'Требует сверки', group: 'active', tone: 'attention' },
  CONFIRMATION_FAILED: { label: 'Не подтверждено', group: 'other', tone: 'attention' },
  RATE_EXPIRED: { label: 'Тариф недоступен', group: 'other', tone: 'attention' },
  CONFIRMED: { label: 'Подтверждено', group: 'active', tone: 'confirmed' },
  MODIFIED: { label: 'Подтверждено с изменениями', group: 'active', tone: 'confirmed' },
  CANCELLED: { label: 'Отменено', group: 'cancelled', tone: 'cancelled' },
  CANCELED: { label: 'Отменено', group: 'cancelled', tone: 'cancelled' },
});
export function bookingStatus(booking) {
  const providerStatus = textValue(booking.provider_status).toUpperCase();
  const unknown = { label: 'Статус неизвестен', group: 'other', tone: 'unknown' };
  // Provider outcome is authoritative for Hotelbeds, including unknown outcomes.
  if (booking.provider === 'hotelbeds' && providerStatus) return Object.hasOwn(providerBookingStatuses, providerStatus) ? providerBookingStatuses[providerStatus] : unknown;
  return Object.hasOwn(localBookingStatuses, booking.status) ? localBookingStatuses[booking.status] : unknown;
}
export function testBooking(booking) {
  return booking.provider === 'mock' || booking.offer_snapshot?.priceEnvironment === 'test' || booking.gateway_provider === 'sandbox' || booking.payment_status === 'test';
}
export function bookingAmount(booking) {
  // Projection price may fall back to today's tours.price; do not present it as a persisted amount.
  const amount = savedMoney(booking.total_amount, booking.currency);
  if (amount) return { label: bookingStatus(booking).tone === 'confirmed' ? 'Сумма бронирования' : 'Сумма заявки', amount };
  const quoted = savedMoney(booking.quoted_amount, booking.quoted_currency);
  return quoted ? { label: 'Сумма при создании заявки', amount: quoted } : null;
}
export function bookingFacts(booking) {
  const offer = booking.offer_snapshot && typeof booking.offer_snapshot === 'object' ? booking.offer_snapshot : {};
  const filters = booking.search_filters && typeof booking.search_filters === 'object' ? booking.search_filters : {};
  const start = offer.checkIn || offer.check_in || offer.stay?.checkIn || offer.departureDate || filters.checkIn || filters.departureDate;
  const end = offer.checkOut || offer.check_out || offer.stay?.checkOut || filters.checkOut;
  const adults = offer.adults ?? offer.occupancy?.adults;
  const children = offer.children ?? offer.occupancy?.children;
  const guests = adults != null ? detailsGuests({ adults, children: Number.isInteger(Number(children)) && Number(children) >= 0 ? children : 0 }) : Number.isInteger(Number(booking.people)) && Number(booking.people) > 0 ? pluralCount(booking.people, ['гость', 'гостя', 'гостей']) : 'Гости не указаны';
  const nights = offer.nights ?? filters.nights;
  return {
    offer, location: hotelLocation({ country: booking.country, city: booking.city, destinationCode: offer.destinationCode }),
    dates: [displayDate(start), displayDate(end)].filter(value => value !== '—').join(' — ') || 'Даты не указаны',
    nights: Number.isInteger(Number(nights)) && Number(nights) > 0 ? stayLabel(nights).replace(/^за /, '') : '',
    guests, checkIn: displayDate(start), checkOut: displayDate(end), rooms: Number.isInteger(Number(offer.rooms ?? offer.occupancy?.rooms)) && Number(offer.rooms ?? offer.occupancy?.rooms) > 0 ? Number(offer.rooms ?? offer.occupancy?.rooms) : null, room: storedRoom({ ...offer, roomName: offer.roomName || offer.room_name, roomType: offer.roomType || offer.room_type, roomCode: offer.roomCode || offer.room_code }), board: storedBoard({ ...offer, boardCode: offer.boardCode || offer.board_code || offer.board }),
  };
}
export function sortedBookings(items, group = 'all') {
  return items.filter(item => group === 'all' || bookingStatus(item).group === group).slice().sort((a, b) => {
    const left = Date.parse(a.booking_date), right = Date.parse(b.booking_date);
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
    if (!Number.isFinite(right)) return -1;
    return right - left || String(b.id).localeCompare(String(a.id), 'en', { numeric: true });
  });
}
export function refundLabel(booking) {
  // These are separate payment.refund_status values, not booking statuses.
  const labels = { requested: 'Запрошен возврат', refunded: 'Возврат выполнен' };
  const label = Object.hasOwn(labels, booking.refund_status) ? labels[booking.refund_status] : '';
  if (!label) return '';
  return booking.gateway_provider === 'sandbox' ? `Тестовый возврат: ${booking.refund_status === 'requested' ? 'запрошен' : 'выполнен без движения денег'}` : label;
}

export function bookingNotice(booking) {
  return testBooking(booking)
    ? 'Тестовая запись — не подтверждает реальную бронь Hotelbeds или право на заселение.'
    : 'Сохранённая запись. Режим создания не подтверждён. Запись не является подтверждением реальной брони Hotelbeds; проверка поставщика не выполняется.';
}
export function bookingPayment(booking) {
  const labels = { pending: 'Ожидает оплаты по записи', requires_action: 'Ожидает действия по записи', paid: 'Оплата отмечена в записи', failed: 'Ошибка оплаты по записи', test: 'Тестовый платёж' };
  const value = textValue(booking.payment_status).toLowerCase();
  const label = Object.hasOwn(labels, value) ? labels[value] : 'Данные об оплате отсутствуют или неизвестны';
  return booking.gateway_provider === 'sandbox' ? `Sandbox: ${label}` : label;
}
export function bookingEventLabel(type) {
  const labels = { booking_created:'Запись создана', booking_confirmed:'Подтверждение отмечено в истории', booking_status_changed:'Статус записи изменён', payment_intent_created:'Платёжная запись создана', payment_completed:'Завершение оплаты отмечено в истории', provider_synced:'Состояние поставщика сохранено', cancellation_quote:'Условия отмены сохранены', booking_cancelled:'Отмена отмечена в истории', voucher_generated:'Формирование документа отмечено в истории', refund_requested:'Запрос возврата отмечен в истории', refund_completed:'Завершение возврата отмечено в истории' };
  return Object.hasOwn(labels,type) ? labels[type] : 'Событие истории';
}
