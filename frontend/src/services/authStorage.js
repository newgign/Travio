import { sessionUser } from '../utils/profilePresentation';
// Tab-scoped bearer storage. Never promote a legacy persistent session.
function removeLegacy() {
  try { globalThis.localStorage?.removeItem('token'); globalThis.localStorage?.removeItem('user'); } catch { /* Storage may be unavailable. */ }
}
export const authStorage = {
  getItem(key) {
    removeLegacy();
    try { return globalThis.sessionStorage?.getItem(key) ?? null; } catch { return null; }
  },
  setItem(key, value) {
    removeLegacy();
    try {
      if (!globalThis.sessionStorage) throw Error();
      globalThis.sessionStorage.setItem(key, key === 'user' ? JSON.stringify(sessionUser(JSON.parse(value))) : value);
    } catch { throw Error('AUTH_STORAGE_UNAVAILABLE'); }
  },
  removeItem(key) {
    removeLegacy();
    try { globalThis.sessionStorage?.removeItem(key); } catch { /* No persistent fallback. */ }
  },
};
export const getAuthToken = () => authStorage.getItem('token');
