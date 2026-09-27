import authFetch from './authFetch';
import { getMyBookings } from './bookingService';

export const favoriteKey = item => `${item.provider || 'mock'}:${item.providerHotelId ?? item.id}`;
export async function readFavorites() {
  const result = await authFetch('/favorites');
  if (!result?.success || !Array.isArray(result.data)) throw Error('INVALID_FAVORITES_RESPONSE');
  const unique = new Map();
  for (const item of result.data) {
    if (!item || !['string', 'number'].includes(typeof (item.providerHotelId ?? item.id))) continue;
    const key = favoriteKey(item);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}
export async function toggleSavedFavorite(store, tour) {
  if (store.getSnapshot().status !== 'ready') await store.load();
  const state = store.getSnapshot();
  if (['guest', 'auth'].includes(state.status)) throw Object.assign(Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' });
  if (state.status !== 'ready') throw Error('FAVORITES_UNAVAILABLE');
  const key = favoriteKey(tour);
  const active = state.items.some(item => favoriteKey(item) === key);
  await store.mutate(key, () => active ? removeSavedFavorite(tour) : authFetch('/favorites', {
    method: 'POST',
    body: JSON.stringify({ provider: tour.provider || 'mock', hotelId: tour.providerHotelId ?? tour.id,
      ...(tour.provider === 'hotelbeds' ? {} : { filters: { checkIn: tour.checkIn, checkOut: tour.checkOut, departureDate: tour.departureDate, nights: tour.nights, people: tour.adults, children: tour.children, childrenAges: tour.childrenAges, food: tour.boardCode, roomType: tour.roomCode } }) }),
  }), (items, result) => {
    if (!result?.success || (!active && favoriteKey(result.data || {}) !== key)) throw Error('INVALID_FAVORITE_RESPONSE');
    const others = items.filter(item => favoriteKey(item) !== key);
    return active ? others : [result.data, ...others];
  });
  return !active;
}
export async function removeSavedFavorite(item) {
  const result = await authFetch(`/favorites/${encodeURIComponent(item.provider || 'mock')}/${encodeURIComponent(item.providerHotelId ?? item.id)}`, { method: 'DELETE' });
  if (!result?.success) throw Error('INVALID_FAVORITE_RESPONSE');
  return result;
}
export async function readBookings() {
  const items = await getMyBookings();
  if (!Array.isArray(items)) throw Error('INVALID_BOOKINGS_RESPONSE');
  return items;
}
