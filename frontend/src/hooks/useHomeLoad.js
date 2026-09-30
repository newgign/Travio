import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createHomeLoad } from '../services/homeCatalog';

export default function useHomeLoad(loader) {
  const store=useMemo(()=>createHomeLoad(loader),[loader]);
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  useEffect(()=>{
    const timer=setTimeout(()=>{void store.load();},0);
    return ()=>{clearTimeout(timer);store.dispose();};
  },[store]);
  return {...state,onRetry:store.load};
}
