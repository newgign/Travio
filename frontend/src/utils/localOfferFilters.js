import { normalizeRoomDisplay, stableSortHotels } from './hotelOfferDisplay';
import { searchQuery } from './catalogUx';

export const localFilterKeys = ['stars','rating','food','roomType','maxPrice','beachLine','beachType','hotelName'];
export const filterEmptyMessage = 'Нет отелей, соответствующих выбранным фильтрам';
export function localPriceCurrency(offers) {
  return offers.flatMap(offer => offer.candidateOffers || [offer])
    .map(offer => offer.currency).filter(currency => /^[A-Z]{3}$/.test(currency || '')).sort()[0] || 'EUR';
}
export function resetOfferFilters(params) {
  const next = new URLSearchParams(params);
  localFilterKeys.forEach(key => next.delete(key));
  next.delete('sort');
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
    query.adults=query.adults || query.people || '2';query.people='';
    query.checkIn=query.checkIn || query.departureDate;query.departureDate='';
    query.nights=query.nights || '7';
    query.country=query.country.toUpperCase();query.destinationCode=query.destinationCode.toUpperCase();
    const time=Date.parse(query.checkIn), nights=Number(query.nights);
    if(!query.checkOut && Number.isFinite(time) && Number.isInteger(nights) && nights>=1 && nights<=14)query.checkOut=new Date(time+nights*86400000).toISOString().slice(0,10);
  }
  return JSON.stringify(query);
}
export function filterOffers(offers, params) {
  const value = key => params.get(key);
  // The displayed budget has one fixed currency across all local filter edits.
  const budgetCurrency = localPriceCurrency(offers);
  const filtered = offers.flatMap(offer => {
    if(value('hotelName') && !String(offer.name || offer.title || offer.hotel || '').toLocaleLowerCase().includes(value('hotelName').trim().toLocaleLowerCase()))return [];
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
  const sort=value('sort') || 'default';
  return stableSortHotels(filtered, sort);
}
