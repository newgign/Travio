import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Navigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import PersistedBookingCard from '../components/PersistedBookingCard';
import { AccountAuth, AccountEmpty, AccountError, AccountLoading } from '../components/AccountStates';
import useSession from '../hooks/useSession';
import { bookingHistory } from '../services/bookingHistory';

import { bookingStatus, sortedBookings } from '../utils/savedAccountPresentation';
import '../styles/AccountPages.css';
import '../styles/MyBookings.css';

export function MyBookingsView({ bookings, status, onRetry, initialGroup = 'all', onGroup = () => {} }) {
  const [group, setGroup] = useState(initialGroup);
  const showFilters = bookings.length >= 5;
  const selectedGroup = showFilters ? group : 'all';
  const visible = sortedBookings(bookings, selectedGroup);
  const requestsOnly = bookings.length > 0 && bookings.every(item => ['На рассмотрении', 'Заявка создана'].includes(bookingStatus(item).label));
  return <main className="account-page my-bookings"><header className="account-header"><h1>Мои бронирования</h1><p>{requestsOnly ? 'Ваши заявки' : 'Заявки и история поездок'}</p></header>
    {status === 'guest' || status === 'auth' ? <AccountAuth /> : status === 'loading' ? <AccountLoading label="Загружаем бронирования" /> : status === 'error' ? <AccountError title="Не удалось загрузить бронирования" onRetry={onRetry} /> :
      bookings.length === 0 ? <AccountEmpty /> : <>
        {showFilters && <div className="account-filters" aria-label="Фильтры записей">{[['all', 'Все'], ['active', 'Активные'], ['cancelled', 'Отменённые'], ['other', 'Другие статусы']].map(([value, label]) => <button key={value} type="button" className="account-button secondary" aria-pressed={selectedGroup === value} onClick={() => (setGroup(value), onGroup(value))}>{label}</button>)}</div>}
        {visible.length ? <div className="persisted-bookings-list" role="list" aria-label="Сохранённые заказы">{visible.map(booking => <div role="listitem" key={booking.id}><PersistedBookingCard key={booking.id} booking={booking} /></div>)}</div> : <section className="account-state"><h2>Нет записей с этим статусом</h2><button type="button" className="account-button" onClick={() => (setGroup('all'), onGroup('all'))}>Показать все</button></section>}
      </>}
  </main>;
}
export default function MyBookings() {
  const { token } = useSession();
  const history = useMemo(() => bookingHistory(token), [token]);
  const store = history.list;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { const timer = setTimeout(() => { if (store.getSnapshot().status === 'loading' || store.getSnapshot().status === 'guest') store.load(); }, 0); return () => clearTimeout(timer); }, [store]);
  if (state.status === 'auth') return <Navigate to="/login" replace state={{ returnTo: '/my-bookings' }} />;
  return <><Navbar /><MyBookingsView key={token} bookings={state.items} status={state.status} onRetry={store.load} initialGroup={history.getGroup()} onGroup={history.setGroup} /><Footer /></>;
}
