import API_URL from './api';
import { authSuccess } from '../utils/authPresentation';

let authRevision = 0;
let validatedSnapshot = null, validatedState = null, bootstrap = null;
let sessionNotice = '';
let restoredProfileAvailable = false;
const validationListeners = new Set();
const notifyValidation = () => validationListeners.forEach(fn => fn());

export const sessionIdentity = (token, userId) => token && /^[1-9]\d*$/.test(String(userId)) ? JSON.stringify([token, String(userId)]) : null;
export const storedSessionIdentity = () => {
  const { token, user } = readSession(sessionSnapshot());
  return sessionIdentity(token, user?.id);
};

// Storage is the existing persistence mechanism; only server-confirmed identity is exposed to UI.
export function validatedSessionSnapshot() {
  const snapshot = sessionSnapshot();
  if (snapshot !== validatedSnapshot) {
    restoredProfileAvailable = false;
    validatedSnapshot = snapshot;
    const token = localStorage.getItem('token');
    validatedState = { status: token ? 'unknown' : 'guest', token: null, user: null, notice: sessionNotice };
  }
  return validatedState;
}

export function subscribeValidatedSession(callback) {
  validationListeners.add(callback);
  const unsubscribe = subscribeSession(callback);
  return () => { validationListeners.delete(callback); unsubscribe(); };
}

function acceptIdentity(token, user, restored = false) {
  validatedSnapshot = sessionSnapshot();
  validatedState = { status: 'authenticated', token, user, notice: '' };
  sessionNotice = '';
  restoredProfileAvailable = restored;
}

// The Profile page can consume the just-validated response once, without a second startup GET.
export function takeRestoredProfile(token) {
  const state = validatedSessionSnapshot();
  if (!restoredProfileAvailable || state.status !== 'authenticated' || state.token !== token) return null;
  restoredProfileAvailable = false;
  return state.user;
}

export function ensureSessionValidated({ retry = false } = {}) {
  const state = validatedSessionSnapshot();
  const snapshot = sessionSnapshot();
  if (bootstrap?.snapshot === snapshot && bootstrap.revision === authRevision) return bootstrap.promise;
  if (state.status !== 'unknown' && !(retry && state.status === 'error')) return Promise.resolve();
  const token = localStorage.getItem('token');
  const revision = authRevision;
  const current = () => snapshot === sessionSnapshot() && revision === authRevision;
  validatedState = { status: 'bootstrapping', token: null, user: null, notice: '' };
  const request = { snapshot, revision, promise: null };
  bootstrap = request;
  request.promise = Promise.resolve().then(async () => {
    try {
      if (!current()) return;
      const response = await fetch(`${API_URL}/auth/profile`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' });
      if (!current()) return;
      if ([401, 404].includes(response.status)) { clearSession(token, 'expired'); return; }
      if (!response.ok) throw Error('SESSION_UNAVAILABLE');
      const user = authSuccess('profile', { user: JSON.parse(await response.text()) });
      if (!current()) return;
      localStorage.setItem('user', JSON.stringify(user));
      acceptIdentity(token, user, true);
      window.dispatchEvent(new Event('travio-auth-changed'));
    } catch {
      if (current()) validatedState = { status: 'error', token: null, user: null, notice: '' };
    } finally {
      if (bootstrap === request) bootstrap = null;
      notifyValidation();
    }
  });
  notifyValidation();
  return request.promise;
}

// Invalidates older login/register attempts, including guest -> guest logout.
export function beginAuthAttempt() {
  const revision = ++authRevision;
  const snapshot = sessionSnapshot();
  return () => revision === authRevision && snapshot === sessionSnapshot();
}

export function establishSession(token, user, isCurrent) {
  if (!isCurrent()) return false;
  authRevision++;
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  acceptIdentity(token, user);
  window.dispatchEvent(new Event("travio-auth-changed"));
  return true;
}

export function sessionSnapshot() {
  return JSON.stringify([localStorage.getItem("token"), localStorage.getItem("user")]);
}

export function subscribeSession(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener("pageshow", callback);
  window.addEventListener("travio-auth-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("pageshow", callback);
    window.removeEventListener("travio-auth-changed", callback);
  };
}

export function readSession(snapshot) {
  try {
    const [token, rawUser] = JSON.parse(snapshot);
    return { token, user: rawUser ? JSON.parse(rawUser) : null };
  } catch {
    return { token: null, user: null };
  }
}

export function clearSession(token, reason = '') {
  // A late response from an old session must not log out a newer login.
  if (localStorage.getItem("token") !== token) return;
  authRevision++;
  sessionNotice = reason === 'expired' ? 'Сессия завершена. Войдите снова.' : '';
  validatedSnapshot = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.dispatchEvent(new Event("travio-auth-changed"));
}

export function logout() {
  clearSession(localStorage.getItem("token"));
  window.location.href = "/";
}

export function updateSessionUser(token, user) {
  if (!token || localStorage.getItem("token") !== token) return;
  authRevision++;
  localStorage.setItem("user", JSON.stringify(user));
  if (validatedState?.status === 'authenticated' && validatedState.token === token && String(validatedState.user.id) === String(user.id)) acceptIdentity(token, user);
  window.dispatchEvent(new Event("travio-auth-changed"));
}
