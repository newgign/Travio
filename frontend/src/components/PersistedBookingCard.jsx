import { Link } from 'react-router-dom';
import HotelImage from './HotelImage';
import { displayDate } from '../utils/detailsPresentation';
import { bookingAmount, bookingFacts, bookingStatus, refundLabel, savedSearchLink, testBooking, textValue } from '../utils/savedAccountPresentation';

export default function PersistedBookingCard({ booking }) {
  const status = bookingStatus(booking), facts = bookingFacts(booking), amount = bookingAmount(booking);
  const title = textValue(booking.hotel) || 'Сохранённая заявка';
  const refund = refundLabel(booking);
  return <article className="persisted-booking-card">
    <div className="persisted-booking-image"><HotelImage src={booking.image} alt={title} loading="lazy" /></div>
    <div className="persisted-booking-body"><div className="persisted-booking-head"><div><h2>{title}</h2><p className="account-muted">{facts.location}</p></div><span className={`account-status ${status.tone}`}>{status.label}</span></div>
      {testBooking(booking) && <span className="account-test-badge">Тестовая запись</span>}
      <p className="account-stay">{facts.dates}</p><p className="account-muted">{[facts.nights, facts.guests].filter(Boolean).join(' · ')}</p>
      {amount && <div className="booking-amount"><span>{amount.label}</span><strong>{amount.amount}</strong><small>Сумма в записи, не подтверждение оплаты.</small></div>}
      <p className="account-note">Запись № {booking.id} · Создана {displayDate(booking.booking_date)}</p>
      <details className="booking-persisted-details"><summary>Детали</summary><dl>
        {facts.room && <div><dt>Сохранённый номер</dt><dd>{facts.room}</dd></div>}
        {facts.board && <div><dt>Сохранённое питание</dt><dd>{facts.board}</dd></div>}
        {booking.confirmed_at && <div><dt>Подтверждение в истории записи</dt><dd>{displayDate(booking.confirmed_at)}</dd></div>}
        {booking.cancelled_at && <div><dt>Отмена в истории записи</dt><dd>{displayDate(booking.cancelled_at)}</dd></div>}
        {refund && <div><dt>Возврат по данным записи</dt><dd>{refund}</dd></div>}
      </dl><p className="account-note">Это сохранённые данные. Бронирование, оплата и действия у поставщика сейчас недоступны.</p>
      {(booking.provider_hotel_id || booking.tour_id) && <Link className="account-button secondary" to={savedSearchLink({ country: booking.country, destinationCode: facts.offer.destinationCode })}>Посмотреть отель</Link>}
      <p className="account-note">Для новых дат и тарифов откройте поиск.</p></details>
    </div>
  </article>;
}