export const accountName = user => user?.full_name?.trim() || user?.email || 'Личный кабинет';
export const accountInitials = user => (user?.full_name?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('') || user?.email?.slice(0, 1) || 'ЛК').toUpperCase();

const controls = /\p{Cc}/u;
const bounded = (value, max, fallback = '') => typeof value === 'string' && !controls.test(value) && [...value].length <= max ? value.trim() : fallback;
export function publicProfile(value) {
  if (!value || !Number.isSafeInteger(value.id) || value.id < 1 || !bounded(value.email, 254) || typeof value.full_name !== 'string' || !['user', 'admin'].includes(value.role)) throw Error('INVALID_PROFILE');
  return { id: value.id, full_name: bounded(value.full_name, 255), email: bounded(value.email, 254),
    phone: bounded(value.phone, 50, null), role: value.role,
    preferred_language: ['ru', 'en', 'kk'].includes(value.preferred_language) ? value.preferred_language : 'ru',
    email_notifications: value.email_notifications !== false, booking_reminders: value.booking_reminders !== false,
    created_at: bounded(value.created_at, 40, null) };
}
export function sessionUser(value) {
  const user = publicProfile(value);
  return { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
}
export function profileDraft(user) {
  return { full_name: bounded(user.full_name, 255), phone: bounded(user.phone, 50), preferred_language: ['ru', 'en', 'kk'].includes(user.preferred_language) ? user.preferred_language : 'ru', email_notifications: user.email_notifications !== false, booking_reminders: user.booking_reminders !== false };
}
export function profileErrors(draft) {
  const errors = {};
  if (typeof draft.full_name !== 'string' || !draft.full_name.trim()) errors.full_name = 'Укажите имя';
  else if ([...draft.full_name].length > 255 || controls.test(draft.full_name)) errors.full_name = 'Проверьте имя (не более 255 символов)';
  if (typeof draft.phone !== 'string' || [...draft.phone].length > 50 || controls.test(draft.phone)) errors.phone = 'Проверьте телефон (не более 50 символов)';
  if (!['ru', 'en', 'kk'].includes(draft.preferred_language)) errors.preferred_language = 'Выберите язык';
  for (const key of ['email_notifications', 'booking_reminders']) if (typeof draft[key] !== 'boolean') errors[key] = 'Проверьте настройку';
  return errors;
}
export const profilePayload = value => Object.fromEntries(['full_name', 'phone', 'preferred_language', 'email_notifications', 'booking_reminders'].filter(key => value[key] !== undefined).map(key => [key, value[key]]));
export const travelerPayload = value => Object.fromEntries(['label', 'traveler_type', 'travelerType', 'first_name', 'firstName', 'last_name', 'lastName', 'birth_date', 'birthDate'].filter(key => value[key] !== undefined).map(key => [key, value[key]]));
export function publicTraveler(value) {
  if (!value || !Number.isSafeInteger(value.id) || value.id < 1) throw Error('INVALID_TRAVELER');
  return { id: value.id, label: bounded(value.label, 80, 'Турист'), first_name: bounded(value.first_name, 120), last_name: bounded(value.last_name, 120),
    traveler_type: value.traveler_type === 'CH' ? 'CH' : 'AD', birth_date: typeof value.birth_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.birth_date) ? value.birth_date : null };
}
export const emptyPassword = () => ({ currentPassword: '', newPassword: '', confirmPassword: '' });
export function passwordErrors(value) {
  const errors = {};
  if (!value.currentPassword) errors.currentPassword = 'Введите текущий пароль';
  if (value.newPassword.length < 8) errors.newPassword = 'Не менее 8 символов';
  if (value.confirmPassword !== value.newPassword) errors.confirmPassword = 'Пароли не совпадают';
  return errors;
}
