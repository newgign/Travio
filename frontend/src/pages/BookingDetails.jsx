import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ConsumerMetadata from '../components/ConsumerMetadata';
import HotelImage from '../components/HotelImage';
import { AccountAuth, AccountError, AccountLoading } from '../components/AccountStates';
import useSession from '../hooks/useSession';
import { bookingHistory } from '../services/bookingHistory';
import { displayDate } from '../utils/detailsPresentation';
import { bookingAmount, bookingFacts, bookingStatus, bookingNotice, bookingPayment, bookingEventLabel, refundLabel, testBooking, textValue } from '../utils/savedAccountPresentation';
import '../styles/AccountPages.css';
import '../styles/BookingDetails.css';

export function BookingDetailsView({ status, data, onRetry }) {
  const booking = data?.booking;
  const facts = booking ? bookingFacts(booking) : null;
  const state = booking ? bookingStatus(booking) : null;
  const amount = booking ? bookingAmount(booking) : null;
  const events = Array.isArray(data?.events) ? data.events : [];
  return <main className="account-page booking-history-details">
    <Link className="booking-history-back" to="/my-bookings">← Мои бронирования</Link>
    <header className="account-header"><h1>Детали заказа</h1><p>Сохранённые данные и история записи</p></header>
    {status === 'guest' || status === 'auth' ? <AccountAuth /> : status === 'loading' ? <AccountLoading label="Загружаем заказ" /> : status === 'error' ? <AccountError title="Не удалось открыть заказ." onRetry={onRetry} /> : !booking || data.notFound ? <section className="account-state"><h2>Запись не найдена или недоступна.</h2></section> : <>
      <section className="booking-history-section" aria-label="Сводка заказа">
        <div className="booking-history-heading"><h2>Запись № {booking.id}</h2><span className={`account-status ${state.tone}`}>{state.label}</span></div>
        {testBooking(booking) && <span className="account-test-badge">TEST · Тестовая запись</span>}
        <p>{bookingNotice(booking)}</p>
        <dl className="booking-history-facts"><div><dt>Создана</dt><dd>{displayDate(booking.booking_date)}</dd></div>
          {textValue(booking.provider_client_reference) && <div><dt>Номер заказа</dt><dd>{booking.provider_client_reference}</dd></div>}
        </dl>
      </section>
      <section className="booking-history-section booking-history-hotel" aria-label="Отель">
        <HotelImage src={textValue(booking.image)} alt={textValue(booking.hotel) || 'Сохранённый отель'} loading="lazy" />
        <div><h2>{textValue(booking.hotel) || 'Название отеля не сохранено'}</h2><p>{facts.location || 'Местоположение не сохранено'}</p></div>
      </section>
      <div className="booking-history-grid">
        <section className="booking-history-section"><h2>Проживание</h2><dl className="booking-history-facts">
          <div><dt>Заезд</dt><dd>{facts.checkIn}</dd></div><div><dt>Выезд</dt><dd>{facts.checkOut}</dd></div>
          <div><dt>Продолжительность</dt><dd>{facts.nights || 'Не сохранена'}</dd></div><div><dt>Гости</dt><dd>{facts.guests}</dd></div>
          <div><dt>Количество номеров</dt><dd>{facts.rooms ?? 'Не сохранено'}</dd></div>
        </dl><h3>Выбранный вариант</h3><dl className="booking-history-facts"><div><dt>Номер</dt><dd>{facts.room || 'Не сохранён'}</dd></div><div><dt>Питание</dt><dd>{facts.board || 'Не сохранено'}</dd></div></dl></section>
        <section className="booking-history-section"><h2>Стоимость заказа</h2>{amount ? <><p>{amount.label}</p><strong className="booking-history-amount">{amount.amount}</strong></> : <p>Стоимость не сохранена.</p>}
          <p>Сумма из сохранённой записи, не текущая цена и не подтверждение оплаты.</p><button className="account-button secondary" type="button" disabled>Бронирование отключено</button></section>
        <section className="booking-history-section"><h2>Оплата</h2><p>{bookingPayment(booking)}</p>
          {booking.payment_no_real_charge === true && <p>Реального списания денег не было: в записи указан sandbox без списания.</p>}
          {refundLabel(booking) && <p>{refundLabel(booking)}</p>}<p>Оплата и возвраты недоступны.</p></section>
        <section className="booking-history-section"><h2>Отмена</h2><p>{state.group === 'cancelled' ? 'Отмена отмечена в сохранённой записи.' : 'Отмена в сохранённом статусе не отмечена.'}</p>
          {booking.cancelled_at && <p>Дата локальной отметки: {displayDate(booking.cancelled_at)}</p>}
          {booking.provider_cancelled_at && <p>Дата сохранённой отметки поставщика: {displayDate(booking.provider_cancelled_at)}</p>}
          <p>Отмена недоступна. Статус записи не подтверждает новую отмену у поставщика.</p></section>
        <section className="booking-history-section"><h2>Документы</h2><p>{booking.voucher_generated_at ? `В истории отмечено формирование документа: ${displayDate(booking.voucher_generated_at)}.` : 'Сохранённый документ для скачивания не предоставлен.'}</p><p>Ваучер недоступен. Формирование PDF отключено на этой странице.</p></section>
        <section className="booking-history-section"><h2>Подтверждение поставщика</h2><p>Страница показывает только сохранённое состояние, без проверки у поставщика.</p>
          {textValue(booking.provider_booking_id) ? <dl><dt>Сохранённый номер поставщика</dt><dd>{booking.provider_booking_id}</dd></dl> : <p>Номер подтверждения поставщика не сохранён.</p>}
          <p>Запись не является новым подтверждением бронирования или права на заселение.</p></section>
      </div>
      <section className="booking-history-section"><h2>История заказа</h2>{events.length ? <ol className="booking-history-events">{events.map((event, index) => <li key={event.id ?? index}><span>{bookingEventLabel(event.event_type)}</span><span>{displayDate(event.occurred_at)}</span></li>)}</ol> : <p>События истории не сохранены.</p>}</section>
      <details className="booking-history-section"><summary>О сохранённых данных</summary><p>Отель, даты, номер, питание и сумма взяты из записи заказа. Поиск доступности и обновление тарифа не выполняются. Отсутствующие сведения не заменяются данными нового поиска.</p></details>
    </>}
  </main>;
}

export default function BookingDetails() {
  const { bookingId } = useParams();
  const { token, user } = useSession();
  const userId = user?.id;
  const store = useMemo(() => bookingHistory(token, userId).details(bookingId), [token, userId, bookingId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    const timer = setTimeout(() => { if (store.getSnapshot().status === 'loading' || store.getSnapshot().status === 'guest') store.load(); }, 0);
    return () => clearTimeout(timer);
  }, [store]);
  return <><ConsumerMetadata pathname="/my-bookings/details" /><Navbar /><BookingDetailsView status={state.status} data={state.items[0]} onRetry={store.load} /><Footer /></>;
}
