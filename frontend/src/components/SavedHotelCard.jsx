import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HotelImage from './HotelImage';
import { hotelCategory, hotelLocation } from '../utils/detailsPresentation';
import { savedMoney, savedSearchLink, savedTitle, storedBoard, storedRoom } from '../utils/savedAccountPresentation';

export default function SavedHotelCard({ item, onRemove, pending = false }) {
  const navigate = useNavigate();
  const busy = useRef(false);
  const [error, setError] = useState(false);
  const [working, setWorking] = useState(false);
  const title = savedTitle(item), stars = hotelCategory(item.stars);
  const amount = savedMoney(item.price, item.currency);
  const room = storedRoom(item), board = storedBoard(item);
  async function remove() {
    if (busy.current || pending) return;
    busy.current = true; setWorking(true); setError(false);
    try { await onRemove(item); }
    catch (err) {
      if (err.status === 401 || err.code === 'AUTH_REQUIRED' || err.message === 'AUTH_REQUIRED') navigate('/login');
      else setError(true);
    } finally { busy.current = false; setWorking(false); }
  }
  return <article className="saved-hotel-card">
    <div className="saved-hotel-image"><HotelImage src={item.image || item.images?.[0]} alt={title} loading="lazy" /></div>
    <div className="saved-hotel-body"><h2>{title}</h2>
      {stars && <p className="account-category" aria-label={`Категория отеля: ${stars} звёзд`}>{'★'.repeat(stars)}</p>}
      <p className="account-muted">{hotelLocation(item)}</p>
      {(room || board) && <div className="saved-rate"><small>Сохранённый вариант</small>{room && <p>{room}</p>}{board && <p>{board}</p>}</div>}
      {amount && <div className="saved-price"><span>Последняя сохранённая цена</span><strong>{amount}</strong><small>Текущая стоимость может отличаться.</small></div>}
      <div className="account-actions"><Link className="account-button" to={savedSearchLink(item)}>Посмотреть отель</Link>
        <button type="button" className="account-button secondary" aria-label={`Удалить из избранного: ${title}`} disabled={pending || working} onClick={remove}>{pending || working ? 'Удаление…' : 'Удалить из избранного'}</button></div>
      <p className="account-note">Откроется новый поиск. Проверьте направление и выберите даты, чтобы узнать наличие.</p>
      {error && <p role="alert" className="account-error">Не удалось выполнить действие. Попробуйте ещё раз.</p>}
    </div>
  </article>;
}
