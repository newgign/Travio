import { searchQuery } from './catalogUx';

export const localFilterKeys = ['stars','rating','food','roomType','maxPrice','beachLine','beachType'];
export const filterEmptyMessage = 'Нет предложений, соответствующих выбранным фильтрам';
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
  const filtered = offers.filter(offer => {
    for (const key of ['stars','rating']) {
      if (value(key) && !(offer[key] != null && Number(offer[key]) >= Number(value(key)))) return false;
    }
    if (value('maxPrice') && !(offer.price != null && Number(offer.price) <= Number(value('maxPrice')))) return false;
    if (value('food') && offer.boardCode !== value('food')) return false;
    if (value('roomType') && !String(offer.roomName || offer.roomType || '').toLowerCase().includes(value('roomType').toLowerCase())) return false;
    if (value('beachLine') && Number(offer.beachLine) !== Number(value('beachLine'))) return false;
    if (value('beachType') && offer.beachType !== value('beachType')) return false;
    return true;
  });
  const sort=value('sort') || 'priceAsc';
  return filtered.sort((a,b) => sort==='priceDesc' ? b.price-a.price : sort==='stars' ? (b.stars||0)-(a.stars||0) : sort==='rating' ? (b.rating||0)-(a.rating||0) : a.price-b.price);
}
