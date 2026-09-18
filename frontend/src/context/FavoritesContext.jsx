/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import useSession from '../hooks/useSession';
import authFetch from '../services/authFetch';
import { createAccountListStore } from '../services/accountListStore';
import { favoriteKey, readFavorites, removeSavedFavorite } from '../services/savedAccountData';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { token } = useSession();
  const store = useMemo(() => createAccountListStore({
    ownerToken: token, readToken: () => localStorage.getItem('token'), loadData: readFavorites,
  }), [token]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    const timer = setTimeout(() => store.load(), 0);
    return () => { clearTimeout(timer); store.invalidate(); };
  }, [store]);

  const isFavorite = (id, provider = 'mock') => state.items.some(item => favoriteKey(item) === `${provider}:${id}`);
  async function removeFavorite(tour) {
    const key = favoriteKey(tour);
    return store.mutate(key, () => removeSavedFavorite(tour), items => items.filter(item => favoriteKey(item) !== key));
  }
  async function toggleFavorite(tour) {
    const key = favoriteKey(tour);
    if (isFavorite(tour.providerHotelId ?? tour.id, tour.provider || 'mock')) {
      await removeFavorite(tour);
      return false;
    }
    // Existing add flow is unchanged. Favorites page never invokes this POST.
    await store.mutate(key, () => authFetch('/favorites', {
      method: 'POST',
      body: JSON.stringify({ provider: tour.provider || 'mock', hotelId: tour.providerHotelId ?? tour.id,
        filters: { checkIn: tour.checkIn, checkOut: tour.checkOut, departureDate: tour.departureDate, nights: tour.nights, people: tour.adults, children: tour.children, childrenAges: tour.childrenAges, food: tour.boardCode, roomType: tour.roomCode } }),
    }), (items, result) => [result.data, ...items.filter(item => favoriteKey(item) !== key)]);
    return true;
  }
  return <FavoritesContext.Provider value={{
    favorites: state.items, loadingFavorites: state.status === 'loading', favoritesStatus: state.status,
    favoritesKnown: state.status === 'ready', pendingFavorites: state.pending,
    loadFavorites: store.load, removeFavorite, toggleFavorite, isFavorite,
  }}>{children}</FavoritesContext.Provider>;
}
export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used inside FavoritesProvider');
  return context;
}