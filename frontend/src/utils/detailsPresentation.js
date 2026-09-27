import { normalizeRoomDisplay, stayLabel } from './hotelOfferDisplay';
import { countryLabel, destinationLabel } from './testDestinationLabels';
import { editSearchLink, pluralCount } from './resultsPresentation';
import { formatMoney } from './money';

export const contentText = value => typeof value === 'string' ? value.trim() : '';
export const hotelDescription = offer => contentText(offer.description)
  .replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')
  .split('\n').map(line => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n')
  || 'Описание отеля пока недоступно.';
// Only explicit blank lines delimit paragraphs; never guess boundaries in prose.
export const hotelDescriptionParagraphs = offer => hotelDescription(offer).split('\n\n');
export const hotelAddress = offer => contentText(offer.address);
export function cancellationDateLabel(value) {
  const parts = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2})(?:T((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?)(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/.exec(value);
  if (!parts || displayDate(parts[1]) === '—') return '';
  // Format the calendar date in UTC, but keep supplied clock/offset as text.
  const date = displayDate(parts[1]).replace(/\s*г\.$/u, '');
  if (!parts[2]) return date;
  const offset = parts[3] === 'Z' ? 'UTC (Z)' : parts[3] ? `(${parts[3]})` : '(часовой пояс не указан)';
  return `${date}, ${parts[2]} ${offset}`;
}
export function rateConditions(offer) {
  const comments=contentText(offer.rateComments);
  const policies=(Array.isArray(offer.cancellationPolicies)?offer.cancellationPolicies:[]).flatMap(policy=>{
    if(!policy || typeof policy!=='object')return [];
    const from=contentText(policy.from), currency=policy.currency ?? offer.currency;
    const fromLabel = cancellationDateLabel(from);
    if(!fromLabel || !/^[A-Z]{3}$/.test(currency || ''))return [];
    if(!['number','string'].includes(typeof policy.amount) || !/^\d+(?:\.\d+)?$/.test(String(policy.amount)) || !Number.isFinite(Number(policy.amount)))return [];
    return [{from,fromLabel,amount:formatMoney(policy.amount,currency)}];
  }).slice(0,20);
  return {comments,policies};
}

export function displayDate(value, compact = false) {
  const iso = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const date = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return '—';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: compact ? 'short' : 'long', ...(compact ? {} : { year: 'numeric' }), timeZone: 'UTC' });
}

export function stayDates(offer) {
  const checkIn = offer.checkIn || offer.departureDate;
  let checkOut = offer.checkOut || offer.departureEndDate;
  if (!checkOut && displayDate(checkIn) !== '—' && Number.isInteger(Number(offer.nights)) && Number(offer.nights) > 0 && Number(offer.nights)<=14) {
    const date = new Date(`${checkIn.slice(0, 10)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(offer.nights));
    checkOut = date.toISOString().slice(0, 10);
  }
  return { checkIn, checkOut };
}

export function detailsGuests(offer) {
  const adults = Number(offer.adults);
  if (!Number.isInteger(adults) || adults < 1) return 'Гости не указаны';
  return [pluralCount(adults, ['взрослый', 'взрослых', 'взрослых']),
    Number(offer.children) > 0 ? pluralCount(offer.children, ['ребёнок', 'ребёнка', 'детей']) : ''].filter(Boolean).join(' · ');
}

export function detailsSummary(offer) {
  const { checkIn, checkOut } = stayDates(offer);
  const dates = displayDate(checkIn, true) === '—' ? '' : [displayDate(checkIn, true), displayDate(checkOut, true)].filter(value => value !== '—').join(' — ');
  const rooms=Number(offer.occupancy?.rooms ?? 1);
  return [dates, stayLabel(offer.nights).replace(/^за /, ''), detailsGuests(offer),rooms===1?'1 номер':'Количество номеров не подтверждено'].filter(Boolean).join(' · ');
}

export function hotelLocation(offer) {
  const city = normalizeRoomDisplay(typeof offer.city === 'string' ? offer.city : '');
  const country = typeof offer.country === 'string' ? offer.country : '';
  // Replace only a confirmed spelling of the same city, not a district with a destination.
  const known = destinationLabel({ countryCode: country, code: contentText(offer.destinationCode) });
  const label = city && known && city.toLocaleLowerCase() === known.toLocaleLowerCase() ? known : city || contentText(known);
  return [label, countryLabel(country)].filter(Boolean).join(', ');
}

export function hotelCategory(value) {
  const stars = Number(value);
  return Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;
}

export function galleryImages(offer) {
  return [...new Set([offer.image, ...(Array.isArray(offer.images) ? offer.images : [])]
    .filter(image => typeof image === 'string' && image.trim() && !/^(?:data|javascript):/i.test(image.trim())).map(image=>image.trim()))].slice(0, 6);
}

export function hotelAmenities(offer) {
  const flags = { wifi: 'Wi-Fi', pool: 'Бассейн', spa: 'SPA', gym: 'Тренажёрный зал', kidsClub: 'Детский клуб', aquapark: 'Аквапарк', parking: 'Парковка', privateBeach: 'Собственный пляж', restaurant: 'Ресторан', bar: 'Бар' };
  const names = Array.isArray(offer.amenities) ? offer.amenities.filter(value => typeof value === 'string').map(normalizeRoomDisplay).filter(Boolean) : [];
  // Existing normalized labels/flags are authoritative; no new facility-code inference.
  return [...new Set([...Object.entries(flags).filter(([key]) => offer[key] === true).map(([, label]) => label), ...names])].slice(0, 20);
}

const returnKeys = ['provider', 'countryCode', 'country', 'destinationCode', 'city', 'stagingTestHotel', 'checkIn', 'checkOut', 'departureDate', 'nights', 'adults', 'people', 'children', 'childrenAges', 'rooms', 'food', 'roomType', 'maxPrice', 'stars', 'rating', 'beachLine', 'beachType', 'hotelName', 'sort', 'page'];
export function resultsOrigin(location) {
  if (location.pathname !== '/results') return null;
  const source = new URLSearchParams(location.search), query = new URLSearchParams();
  for (const key of returnKeys) if (source.has(key)) query.set(key, source.get(key));
  return { pathname: '/results', search: `?${query}`, key: location.key };
}

export function detailsBackTarget(origin, historyIndex, search) {
  // Only Card navigation from Results may go back; a direct tab never leaves the app.
  if (origin?.pathname === '/results' && typeof origin.key === 'string' && Number.isInteger(historyIndex) && historyIndex > 0) return -1;
  return editSearchLink(new URLSearchParams(origin?.pathname === '/results' ? origin.search : search));
}

export function detailsError(error) {
  const code = error?.code || 'DETAILS_LOCAL_ERROR';
  if (code === 'SELECTED_OFFER_STALE') return { code, title: 'Выбранный тариф устарел', message: 'Выполните новый поиск, чтобы получить актуальные варианты.' };
  const access = {
    HOTELBEDS_AUTH_BLOCKED: 'Доступ к поставщику временно закрыт после ошибки авторизации.',
    HOTELBEDS_UNKNOWN_BLOCKED: 'Доступ к тарифам поставщика ещё не подтверждён.',
    HOTELBEDS_ACCESS_UNAVAILABLE: 'Поставщик временно недоступен. Попробуйте поиск позже.',
  };
  if (access[code]) return { code, title: 'Тарифы временно недоступны', message: access[code] };
  if (error?.status === 404 || code === 'OFFER_NOT_FOUND') return { code: 'OFFER_NOT_FOUND', title: 'Отель не найден', message: 'Для этих параметров предложение недоступно. Попробуйте новый поиск.' };
  return { code:'DETAILS_LOCAL_ERROR', title: 'Не удалось загрузить отель', message: 'Попробуйте вернуться к поиску. Данные выбранного тарифа не подтверждены.' };
}
