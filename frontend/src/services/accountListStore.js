// Session-owned app data. No provider resolution or optimistic removal.
export function createAccountListStore({ loadData, ownerToken, readToken }) {
  let state = { items: [], status: ownerToken ? 'loading' : 'guest', pending: [] };
  let version = 0, generation = 0, inFlight = null;
  const listeners = new Set(), mutations = new Map();
  const current = () => Boolean(ownerToken) && readToken() === ownerToken;
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const store = {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    invalidate: () => { version++; generation++; inFlight = null; },
    load() {
      if (!current()) { emit({ items: [], status: 'guest' }); return Promise.resolve(); }
      if (inFlight) return inFlight;
      if (mutations.size) return Promise.resolve();
      const requestVersion = ++version;
      emit({ items: [], status: 'loading' });
      const request = (async () => {
        try {
          const items = await Promise.resolve().then(() => current() && version === requestVersion ? loadData() : []);
          if (current() && version === requestVersion) emit({ items, status: 'ready' });
        } catch (error) {
          if (current() && version === requestVersion) emit({ items: [], status: error.status === 401 || error.code === 'AUTH_REQUIRED' ? 'auth' : 'error' });
        } finally { if (version === requestVersion) inFlight = null; }
      })();
      inFlight = request;
      return request;
    },
    mutate(key, action, apply) {
      if (!current()) return Promise.reject(Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' }));
      if (mutations.has(key)) return mutations.get(key);
      const reloadNeeded = state.status !== 'ready';
      version++; inFlight = null;
      const operationGeneration = generation;
      emit({ pending: [...state.pending, key] });
      const request = (async () => {
        try {
          const result = await Promise.resolve().then(() => {
            if (!current() || operationGeneration !== generation) throw Error('STALE_SESSION');
            return action();
          });
          if (current() && operationGeneration === generation) emit({ items: apply(state.items, result) });
          return result;
        } catch (error) {
          if (current() && operationGeneration === generation) throw error;
        } finally {
          mutations.delete(key);
          if (current() && operationGeneration === generation) {
            emit({ pending: state.pending.filter(value => value !== key) });
            if (reloadNeeded && !mutations.size) void store.load();
          }
        }
      })();
      mutations.set(key, request);
      return request;
    },
  };
  return store;
}
