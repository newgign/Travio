import authFetch from './authFetch';
import { getMyBookings } from './bookingService';

export const favoriteKey = item => `${item.provider || 'mock'}:${item.providerHotelId ?? item.id}`;
export async function readFavorites() {
  const result = await authFetch('/favorites');
  if (!result?.success || !Array.isArray(result.data)) throw Error('INVALID_FAVORITES_RESPONSE');
  return result.data;
}
export async function removeSavedFavorite(item) {
  return authFetch(`/favorites/${encodeURIComponent(item.provider || 'mock')}/${encodeURIComponent(item.providerHotelId ?? item.id)}`, { method: 'DELETE' });
}
export async function readBookings() {
  const items = await getMyBookings();
  if (!Array.isArray(items)) throw Error('INVALID_BOOKINGS_RESPONSE');
  return items;
}