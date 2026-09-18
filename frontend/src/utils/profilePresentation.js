export const accountName = user => user?.full_name?.trim() || user?.email || 'Личный кабинет';
export const accountInitials = user => (user?.full_name?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('') || user?.email?.slice(0, 1) || 'ЛК').toUpperCase();

export function publicProfile(value) {
  if (!value || !value.id || typeof value.email !== 'string' || typeof value.full_name !== 'string') throw Error('INVALID_PROFILE');
  return Object.fromEntries(['id', 'full_name', 'email', 'phone', 'role', 'preferred_language', 'email_notifications', 'booking_reminders', 'created_at'].map(key => [key, value[key]]));
}
export function profileDraft(user) {
  return { full_name: user.full_name || '', phone: user.phone || '', preferred_language: user.preferred_language || 'ru', email_notifications: user.email_notifications !== false, booking_reminders: user.booking_reminders !== false };
}
export function profileErrors(draft) {
  const errors = {};
  if (!draft.full_name.trim()) errors.full_name = 'Укажите имя';
  else if (draft.full_name.trim().length > 255) errors.full_name = 'Имя должно содержать не более 255 символов';
  if (draft.phone.trim().length > 50) errors.phone = 'Телефон должен содержать не более 50 символов';
  return errors;
}
export const emptyPassword = () => ({ currentPassword: '', newPassword: '', confirmPassword: '' });
export function passwordErrors(value) {
  const errors = {};
  if (!value.currentPassword) errors.currentPassword = 'Введите текущий пароль';
  if (value.newPassword.length < 8) errors.newPassword = 'Не менее 8 символов';
  if (value.confirmPassword !== value.newPassword) errors.confirmPassword = 'Пароли не совпадают';
  return errors;
}
