import { Link, useLocation } from 'react-router-dom';
import { authOrigin } from '../utils/authPresentation';
export function AccountLoading({ label }) {
  return <div role="status" aria-label={label} className="account-skeleton-list"><span>{label}</span>{[1, 2, 3].map(i => <div key={i} className="account-skeleton" aria-hidden="true" />)}</div>;
}
export function AccountError({ title, onRetry }) {
  return <section className="account-state" role="alert"><h2>{title}</h2><button type="button" className="account-button" disabled={typeof onRetry !== 'function'} onClick={onRetry}>Повторить</button></section>;
}
export function AccountEmpty({ favorites = false }) {
  return <section className="account-state">{favorites && <span className="account-empty-icon" aria-hidden="true">♡</span>}
    <h2>{favorites ? 'В избранном пока ничего нет' : 'У вас пока нет бронирований'}</h2>
    <p>{favorites ? 'Добавляйте понравившиеся отели, чтобы быстро вернуться к ним позже.' : 'Сохранённых записей заказов пока нет. Бронирование и оплата сейчас отключены.'}</p>
    <Link className="account-button" to="/#home-search">Найти отели</Link>
  </section>;
}
export function AccountAuth() {
  const location = useLocation();
  return <section className="account-state"><h2>Войдите в аккаунт</h2><p>Войдите, чтобы пользоваться избранным и личными данными.</p><div className="account-actions"><Link className="account-button" to="/login" state={{ returnTo: authOrigin(location.pathname) }}>Войти</Link><Link className="account-button secondary" to="/register" state={{ returnTo: authOrigin(location.pathname) }}>Создать аккаунт</Link></div></section>;
}
