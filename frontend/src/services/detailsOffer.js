import API_URL from './api';
import { selectedOfferSnapshot } from '../utils/selectedOfferSnapshot';

// Same direct-URL endpoint. A rejected selection must never resolve to a different rate.
export async function loadDetailsOffer({ selectedOffer, provider, id, search, signal }) {
  const snapshot = selectedOfferSnapshot(selectedOffer, provider, id, search);
  if (snapshot) return snapshot;
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
  return result.data;
}