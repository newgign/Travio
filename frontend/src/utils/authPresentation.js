import { publicProfile } from './profilePresentation';

const accountPaths = new Set(['/profile', '/favorites', '/my-bookings']);
const adminPaths = new Set(['/admin', '/admin/bookings']);
// No query/hash, decoding or arbitrary URL parsing: exact application paths only.
export function authReturnPath(value, role) {
  return typeof value === 'string' && (accountPaths.has(value) || (role === 'admin' && adminPaths.has(value))) ? value : '/';
}
export const authOrigin = value => authReturnPath(value, 'admin');
export const authFields = mode => mode === 'register' ? ['full_name', 'email', 'phone', 'password', 'confirmPassword'] : ['email', 'password'];
export const emptyAuthForm = mode => Object.fromEntries(authFields(mode).map(key => [key, '']));
export function authValidation(mode, form) {
  const errors = {};
  if (mode === 'register' && !form.full_name.trim()) errors.full_name = 'Укажите имя';
  else if (mode === 'register' && [...form.full_name.trim()].length > 255) errors.full_name = 'Не более 255 символов';
  const email = form.email.trim();
  if (!email) errors.email = 'Укажите email';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (mode === 'register' && email.length > 254)) errors.email = 'Укажите корректный email';
  if (mode === 'register' && [...form.phone.trim()].length > 50) errors.phone = 'Не более 50 символов';
  if (!form.password) errors.password = 'Введите пароль';
  else if (mode === 'register' && form.password.length < 8) errors.password = 'Не менее 8 символов';
  if (mode === 'register' && (!form.confirmPassword || form.password !== form.confirmPassword)) errors.confirmPassword = 'Пароли должны совпадать';
  return errors;
}
export function authPayload(mode, form) {
  const payload = { email: form.email.trim(), password: form.password };
  return mode === 'register' ? { full_name: form.full_name.trim(), phone: form.phone, ...payload } : payload;
}
export function authError(mode, status) {
  if (mode === 'login' && status === 401) return 'Не удалось войти. Проверьте email и пароль.';
  if (mode === 'register' && status === 409) return 'Аккаунт с таким email уже существует.';
  if (status === 400) return 'Проверьте заполненные поля и попробуйте ещё раз.';
  return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}
export function authSuccess(mode, data) {
  const value = data?.user;
  if (!Number.isInteger(value?.id) || value.id < 1 || typeof value.email !== 'string' || !value.email.trim() || typeof value.full_name !== 'string' || !['user', 'admin'].includes(value.role)) throw Error('INVALID_AUTH_RESPONSE');
  for (const key of ['phone','preferred_language','created_at']) if (value[key] != null && typeof value[key] !== 'string') throw Error('INVALID_AUTH_RESPONSE');
  for (const key of ['email_notifications','booking_reminders']) if (value[key] != null && typeof value[key] !== 'boolean') throw Error('INVALID_AUTH_RESPONSE');
  if (mode === 'login' && (typeof data.token !== 'string' || !data.token.trim() || /\s/.test(data.token))) throw Error('INVALID_AUTH_RESPONSE');
  return publicProfile(value);
}
export function focusAuthError(formElement, errors, mode) {
  const first = authFields(mode).find(key => errors[key]);
  if (first) formElement?.elements?.namedItem(first)?.focus();
}
