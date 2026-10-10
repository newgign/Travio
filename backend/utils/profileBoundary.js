// Small pure profile boundary. Unknown input keys are ignored, never mapped to storage.
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
const languages = ['ru', 'en', 'kk'];
function invalid(field) {
  throw Object.assign(new Error('Проверьте поля профиля'), { status: 400, code: 'PROFILE_INPUT_INVALID', field });
}
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('body');
  return value;
}
function text(value, field, max, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || controls.test(value) || [...value].length > max) invalid(field);
  const normalized = value.trim();
  if (!normalized && required) invalid(field);
  return normalized || null;
}
function profileInput(value) {
  const body = object(value);
  const preferredLanguage = body.preferred_language ?? 'ru';
  if (!languages.includes(preferredLanguage)) invalid('preferred_language');
  for (const key of ['email_notifications', 'booking_reminders'])
    if (body[key] !== undefined && typeof body[key] !== 'boolean') invalid(key);
  return { fullName: text(body.full_name, 'full_name', 255, true), phone: text(body.phone, 'phone', 50),
    preferredLanguage, emailNotifications: body.email_notifications ?? true, bookingReminders: body.booking_reminders ?? true };
}
function dateOnly(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('birth_date');
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) invalid('birth_date');
  return value;
}
function travelerInput(value) {
  const body = object(value);
  const alias = (snake, camel) => {
    if (body[snake] !== undefined && body[camel] !== undefined && body[snake] !== body[camel]) invalid(snake);
    return body[snake] !== undefined ? body[snake] : body[camel];
  };
  const type = alias('traveler_type', 'travelerType') ?? 'AD';
  if (typeof type !== 'string' || !['AD', 'CH'].includes(type.toUpperCase())) invalid('traveler_type');
  return { label: text(body.label, 'label', 80) || 'Турист', travelerType: type.toUpperCase(),
    firstName: text(alias('first_name', 'firstName'), 'first_name', 120, true),
    lastName: text(alias('last_name', 'lastName'), 'last_name', 120, true),
    birthDate: dateOnly(alias('birth_date', 'birthDate')) };
}
function safeText(value, max, fallback = null) {
  return typeof value === 'string' && !controls.test(value) && [...value].length <= max ? value.trim() || fallback : fallback;
}
function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  return safeText(value, 40);
}
function publicUser(row) {
  return { id: row.id, full_name: safeText(row.full_name, 255, ''), email: safeText(row.email, 254, ''),
    phone: safeText(row.phone, 50), role: ['user', 'admin'].includes(row.role) ? row.role : 'user',
    preferred_language: languages.includes(row.preferred_language) ? row.preferred_language : 'ru',
    email_notifications: row.email_notifications !== false, booking_reminders: row.booking_reminders !== false,
    created_at: timestamp(row.created_at) };
}
function adminUser(row) {
  const user = publicUser(row);
  return Object.fromEntries(['id', 'full_name', 'email', 'phone', 'role', 'created_at']
    .filter(key => row[key] !== undefined).map(key => [key, user[key]]));
}
function publicTraveler(row) {
  let birth = null;
  try { birth = dateOnly(row.birth_date); } catch { /* Legacy invalid dates are not renderable data. */ }
  return { id: row.id, label: safeText(row.label, 80, 'Турист'), traveler_type: row.traveler_type === 'CH' ? 'CH' : 'AD',
    first_name: safeText(row.first_name, 120, ''), last_name: safeText(row.last_name, 120, ''), birth_date: birth,
    created_at: timestamp(row.created_at), updated_at: timestamp(row.updated_at) };
}
module.exports = { profileInput, travelerInput, dateOnly, publicUser, adminUser, publicTraveler };
