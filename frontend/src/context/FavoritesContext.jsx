/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import useSession from '../hooks/useSession';
import { createAccountListStore } from '../services/accountListStore';
import { favoriteKey, readFavorites, removeSavedFavorite, toggleSavedFavorite } from '../services/savedAccountData';

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
  const toggleFavorite = tour => toggleSavedFavorite(store, tour);
  return <FavoritesContext.Provider value={{
    favoriteSessionKey: token, favorites: state.items, loadingFavorites: state.status === 'loading', favoritesStatus: state.status,
    favoritesKnown: state.status === 'ready', pendingFavorites: state.pending,
    loadFavorites: store.load, removeFavorite, toggleFavorite, isFavorite,
  }}>{children}</FavoritesContext.Provider>;
}
export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used inside FavoritesProvider');
  return context;
}