import API_URL from './api';
import { selectedOfferSnapshot, offerFreshUntil } from '../utils/selectedOfferSnapshot';
import { contentText, displayDate } from '../utils/detailsPresentation';
import { validPrice } from '../utils/hotelOfferDisplay';

// Validate the selected object without repairing or replacing any rate fields.
export function validDetailsOffer(offer) {
  if (!offer) return false;
  const integer = (value, min) => ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= min;
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && displayDate(value) !== '—';
  if (!date(offer.checkIn) || !date(offer.checkOut) || !integer(offer.nights, 1) ||
      (Date.parse(offer.checkOut) - Date.parse(offer.checkIn)) / 86400000 !== Number(offer.nights) ||
      !integer(offer.adults, 1) || !integer(offer.children, 0) || Number(offer.occupancy?.rooms ?? 1) !== 1 ||
      !validPrice(offer.price) || !/^[A-Z]{3}$/.test(offer.currency || '')) return false;
  if (![offer.roomName, offer.roomType, offer.roomCode].some(contentText) ||
      ![offer.boardName, offer.boardCode, offer.food].some(contentText)) return false;
  for (const field of ['adults', 'children']) {
    if (offer.occupancy?.[field] != null && Number(offer.occupancy[field]) !== Number(offer[field])) return false;
  }
  if (offer.childrenAges != null && offer.childrenAges !== '') {
    const ages = Array.isArray(offer.childrenAges) ? offer.childrenAges : typeof offer.childrenAges === 'string' ? offer.childrenAges.split(',') : null;
    if (!ages || ages.length !== Number(offer.children) || ages.some(age => !integer(age, 0) || Number(age) > 17)) return false;
  }
  return true;
}

// UI expiry only, using the same policy as Results; never a provider refresh.
export function watchDetailsExpiry(offer,onExpire,{now=Date.now,schedule=setTimeout,cancel=clearTimeout}={}) {
  const timer=schedule(onExpire,Math.max(0,offerFreshUntil(offer,now())-now()));
  return ()=>cancel(timer);
}

// Same direct-URL endpoint. A rejected selection must never resolve to a different rate.
export async function loadDetailsOffer({ selectedOffer, provider, id, search, signal }) {
  const snapshot = selectedOfferSnapshot(selectedOffer, provider, id, search);
  if (snapshot && validDetailsOffer(snapshot)) return snapshot;
  if (selectedOffer) throw Object.assign(new Error('Selected offer rejected'), { code: 'SELECTED_OFFER_STALE' });
  const params = new URLSearchParams(search);
  const response = await fetch(`${API_URL}/offers/${encodeURIComponent(provider)}/${encodeURIComponent(id)}?${params}`, { signal });
  const result = await response.json();
  if (!response.ok || !result?.success || !result?.data) {
    throw Object.assign(new Error('Details unavailable'), { code: result?.code, status: response.status });
  }
  if (String(result.data.providerHotelId ?? result.data.id) !== String(id)) {
    throw Object.assign(new Error('Hotel identity mismatch'), { code: 'OFFER_NOT_FOUND' });
  }
  if (!selectedOfferSnapshot(result.data, provider, id, search) || !validDetailsOffer(result.data)) {
    throw Object.assign(new Error('Resolved offer rejected'), { code: 'SELECTED_OFFER_STALE' });
  }
  return result.data;
}
