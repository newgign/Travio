/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import useSession from '../hooks/useSession';
import { createAccountListStore } from '../services/accountListStore';
import { favoriteKey, readFavorites, removeSavedFavorite, toggleSavedFavorite } from '../services/savedAccountData';
import { sessionIdentity, storedSessionIdentity, subscribeSession } from '../services/session';

const FavoritesContext = createContext(null);

export function createFavoritesStore({ token, userId, loadData = readFavorites }) {
  const identity = sessionIdentity(token, userId);
  const store = createAccountListStore({ ownerToken: identity, readToken: storedSessionIdentity, loadData });
  store.connect = () => {
    const disconnect = subscribeSession(() => { if (storedSessionIdentity() !== identity) store.invalidate(); });
    return () => { disconnect(); store.invalidate(); };
  };
  return store;
}

export function FavoritesProvider({ children }) {
  const { token, user } = useSession();
  const userId = user?.id;
  const identity = sessionIdentity(token, userId);
  const store = useMemo(() => createFavoritesStore({ token, userId }), [token, userId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    const timer = setTimeout(() => store.load(), 0);
    const disconnect = store.connect();
    return () => { disconnect(); clearTimeout(timer); };
  }, [store]);

  const isFavorite = (id, provider = 'mock') => state.items.some(item => favoriteKey(item) === `${provider}:${id}`);
  async function removeFavorite(tour) {
    const key = favoriteKey(tour);
    return store.mutate(key, () => removeSavedFavorite(tour), items => items.filter(item => favoriteKey(item) !== key));
  }
  const toggleFavorite = tour => toggleSavedFavorite(store, tour);
  return <FavoritesContext.Provider value={{
    favoriteSessionKey: token ? identity : null, favorites: state.items, loadingFavorites: state.status === 'loading', favoritesStatus: state.status,
    favoritesKnown: state.status === 'ready', pendingFavorites: state.pending,
    loadFavorites: store.load, removeFavorite, toggleFavorite, isFavorite,
  }}>{children}</FavoritesContext.Provider>;
}
export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used inside FavoritesProvider');
  return context;
}
