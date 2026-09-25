export const BOARD_LABELS = Object.freeze({RO:'Без питания', BB:'Завтрак', HB:'Полупансион', FB:'Полный пансион', AI:'Всё включено'});
export function normalizeRoomDisplay(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}
export function normalizeBoardDisplay(code, name) {
  return BOARD_LABELS[code] || normalizeRoomDisplay(name) || code || 'Питание не указано';
}
export function validPrice(value) {
  return ['number','string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
}
export function calculatePricePerNight(price, nights, currency) {
  return validPrice(price) && Number.isInteger(Number(nights)) && Number(nights) >= 1 && /^[A-Z]{3}$/.test(currency || '')
    ? Number(price) / Number(nights) : null;
}
export function stayLabel(value) {
  const nights = Number(value);
  if (!Number.isInteger(nights) || nights < 1) return 'за проживание';
  const word = nights % 100 >= 11 && nights % 100 <= 14 ? 'ночей' : nights % 10 === 1 ? 'ночь' : nights % 10 >= 2 && nights % 10 <= 4 ? 'ночи' : 'ночей';
  return `за ${nights} ${word}`;
}
const textCompare = (a,b) => String(a ?? '').localeCompare(String(b ?? ''), 'ru');
export function stableSortHotels(offers, sort='default') {
  if(!['priceAsc','priceDesc','pricePerNight','stars','rating','name'].includes(sort))return [...offers];
  const night = offer => calculatePricePerNight(offer.price, offer.nights, offer.currency);
  const numeric = (a,b,descending=false) => {
    if (a == null || !Number.isFinite(Number(a))) return b == null ? 0 : 1;
    if (b == null || !Number.isFinite(Number(b))) return -1;
    return descending ? Number(b)-Number(a) : Number(a)-Number(b);
  };
  return [...offers].sort((a,b) => {
    const tie = () => textCompare(a.name || a.title,b.name || b.title) || textCompare(a.providerHotelId ?? a.id,b.providerHotelId ?? b.id) || textCompare(a.provider,b.provider) || textCompare(a.priceEnvironment,b.priceEnvironment);
    if (sort === 'name') return tie();
    if (sort === 'stars' || sort === 'rating') return numeric(a[sort], b[sort], true) || tie();
    // No currency conversion or cross-currency cheapest claim.
    return textCompare(a.currency,b.currency) || numeric(sort === 'pricePerNight' ? night(a) : a.price, sort === 'pricePerNight' ? night(b) : b.price, sort === 'priceDesc') || tie();
  });
}
