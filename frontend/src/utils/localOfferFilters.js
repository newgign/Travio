import { normalizeRoomDisplay, stableSortHotels } from './hotelOfferDisplay';
import { searchQuery } from './catalogUx';

export const localFilterKeys = ['stars','rating','food','roomType','maxPrice','beachLine','beachType'];
export const filterEmptyMessage = 'Нет отелей, соответствующих выбранным фильтрам';
export function localPriceCurrency(offers) {
  return offers.flatMap(offer => offer.candidateOffers || [offer])
    .map(offer => offer.currency).filter(currency => /^[A-Z]{3}$/.test(currency || '')).sort()[0] || 'EUR';
}
export function resetOfferFilters(params) {
  const next = new URLSearchParams(params);
  localFilterKeys.forEach(key => next.delete(key));
  next.set('page','1');
  return next;
}
export function providerQuery(params, local) {
  const query = searchQuery(params);
  if (local) {
    localFilterKeys.forEach(key => delete query[key]);
    // TEST destination searches are bounded to 20 hotels. Fetch the existing
    // normalized offer set once, without presentation filters or pagination.
    query.page='1'; query.limit='100'; query.sort='priceAsc';
  }
  return JSON.stringify(query);
}
export function filterOffers(offers, params) {
  const value = key => params.get(key);
  // The displayed budget has one fixed currency across all local filter edits.
  const budgetCurrency = localPriceCurrency(offers);
  const filtered = offers.flatMap(offer => {
    for (const key of ['stars','rating']) {
      if (value(key) && !(offer[key] != null && Number(offer[key]) >= Number(value(key)))) return [];
    }
    if (value('beachLine') && Number(offer.beachLine) !== Number(value('beachLine'))) return [];
    if (value('beachType') && offer.beachType !== value('beachType')) return [];
    // Candidate order is authoritative backend price/identity order.
    // Every rate-level predicate must match the SAME signed candidate.
    const candidates = offer.candidateOffers || [offer];
    const selected = candidates.find(candidate =>
      (!value('food') || candidate.boardCode === value('food')) &&
      (!value('roomType') || normalizeRoomDisplay(candidate.roomName || candidate.roomType || '').toLowerCase().includes(normalizeRoomDisplay(value('roomType')).toLowerCase())) &&
      (!value('maxPrice') || ((!candidate.currency || candidate.currency === budgetCurrency) && candidate.price != null && Number(candidate.price) <= Number(value('maxPrice'))))
    );
    return selected ? [selected] : [];
  });
  const sort=value('sort') || 'priceAsc';
  return stableSortHotels(filtered, sort);
}
