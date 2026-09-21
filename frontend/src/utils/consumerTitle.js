import { helpArticles } from '../content/helpContent';
import { destinationLabel } from './testDestinationLabels';

const titles = {
  '/':'Asedeliya — поиск отелей', '/results':'Отели — Asedeliya',
  '/favorites':'Избранное — Asedeliya', '/my-bookings':'Мои бронирования — Asedeliya',
  '/profile':'Личный кабинет — Asedeliya', '/login':'Вход — Asedeliya',
  '/register':'Регистрация — Asedeliya', '/help':'Помощь — Asedeliya',
  '/contacts':'Контакты — Asedeliya',
};

// Display data only. Query values select a catalog identity, never become title text.
function displayName(value) {
  if (typeof value !== 'string' || /[<>\p{Cc}\p{Cf}]/u.test(value)) return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

export function consumerTitle(pathname, { params, destinations = [], hotelName } = {}) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/results' && params && !params.get('stagingTestHotel')) {
    const country = params.get('country') || params.get('countryCode');
    const row = destinations.find(item => item.code === params.get('destinationCode') && item.countryCode === country);
    const name = row && displayName(destinationLabel(row));
    if (name && name !== row.code) return `Отели: ${name} — Asedeliya`;
  }
  if (Object.hasOwn(titles,path)) return titles[path];
  if (/^\/tour\/[^/]+(?:\/[^/]+)?$/.test(path)) return `${displayName(hotelName) || 'Отель'} — Asedeliya`;
  const topic = path.startsWith('/help/') ? path.slice(6) : '';
  if (Object.hasOwn(helpArticles,topic)) return `${helpArticles[topic].title} — Asedeliya`;
  return 'Страница не найдена — Asedeliya';
}
