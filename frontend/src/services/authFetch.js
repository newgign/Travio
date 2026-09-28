import API_URL from "./api";
import { clearSession, storedSessionIdentity } from "./session";

export default async function authFetch(url, options = {}) {
  // Callers supply an API-relative path, never a URL or a path escaping the API base.
  let path;
  try { path = decodeURIComponent(typeof url === 'string' ? url.split('?')[0] : ''); } catch { throw Error('INVALID_API_PATH'); }
  if (!path.startsWith('/') || path.startsWith('//') || /[\\#\s]/.test(path) || path.split('/').some(part => part === '.' || part === '..')) throw Error('INVALID_API_PATH');
  const token = localStorage.getItem("token");
  const identity = storedSessionIdentity();

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers,
    redirect: 'error',
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!response.ok) {
    if (response.status === 401 && storedSessionIdentity() === identity) {
      clearSession(token, 'expired');
    }

    const authPath = path.startsWith('/auth/');
    const error = new Error(authPath ? 'AUTH_REQUEST_FAILED' : data?.message || `Ошибка сервера (${response.status})`);
    error.status = response.status;
    error.code = response.status === 401 ? 'AUTH_REQUIRED' : authPath ? null : data?.code || null;
    if (!authPath) error.data = data;
    throw error;
  }

  return data;
}
