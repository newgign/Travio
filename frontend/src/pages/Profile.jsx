import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { AccountError, AccountLoading } from '../components/AccountStates';
import useSession from '../hooks/useSession';
import { logout } from '../services/session';
import { createProfileStore } from '../services/profileStore';
import { accountInitials, accountName } from '../utils/profilePresentation';
import { displayDate } from '../utils/detailsPresentation';
import '../styles/AccountPages.css';
import '../styles/Profile.css';

function PasswordField({ name, label, value, error, disabled, onChange }) {
  const [visible, setVisible] = useState(false);
  const id = `profile-${name}`;
  return <div className="profile-field"><label htmlFor={id}>{label}</label><div className="profile-password-input">
    <input id={id} type={visible ? 'text' : 'password'} value={value} disabled={disabled} onChange={event => onChange(name, event.target.value)} autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
    <button type="button" className="account-button secondary" aria-label={`${visible ? 'Скрыть' : 'Показать'}: ${label}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Скрыть' : 'Показать'}</button>
  </div>{error && <span id={`${id}-error`} className="account-error">{error}</span>}</div>;
}

export function ProfileView({ state, actions, onLogout = logout }) {
  const { user, draft } = state;
  return <main className="account-page profile-page"><header className="account-header"><h1>Личный кабинет</h1><p>Управляйте личными данными и настройками аккаунта</p></header>
    {state.status === 'loading' ? <AccountLoading label="Загружаем профиль" /> : state.status === 'error' ? <AccountError title="Не удалось загрузить данные профиля" onRetry={actions.load} /> : state.status === 'auth' ? <Navigate to="/login" replace /> : user && draft && <>
      <section className="profile-summary profile-card" aria-label="Ваш аккаунт"><div className="profile-avatar" aria-hidden="true">{accountInitials(user)}</div><div><h2>{accountName(user)}</h2><p>{user.email}</p>{user.phone && <p>{user.phone}</p>}{displayDate(user.created_at) !== '—' && <p className="account-note">В Asedeliya с {displayDate(user.created_at)}</p>}{user.role === 'admin' && <span className="account-status">Администратор</span>}</div></section>
      <div className="profile-layout"><section className="profile-card"><h2>Личные данные</h2><form className="profile-form" noValidate onSubmit={event => { event.preventDefault(); actions.save(); }}>
        {[['full_name', 'Имя', 'text', 'name'], ['phone', 'Телефон', 'tel', 'tel']].map(([name, label, type, autocomplete]) => <div className="profile-field" key={name}><label htmlFor={`profile-${name}`}>{label}</label><input id={`profile-${name}`} type={type} autoComplete={autocomplete} value={draft[name]} disabled={state.saving} onChange={event => actions.edit(name, event.target.value)} aria-invalid={Boolean(state.errors[name])} aria-describedby={state.errors[name] ? `profile-${name}-error` : undefined} />{state.errors[name] && <span id={`profile-${name}-error`} className="account-error">{state.errors[name]}</span>}</div>)}
        <div className="profile-field"><label htmlFor="profile-email">Email</label><input id="profile-email" value={user.email} readOnly aria-describedby="profile-email-note" /><small id="profile-email-note">Используется для входа. Изменение email здесь недоступно.</small></div>
        <div className="profile-field"><label htmlFor="profile-language">Предпочитаемый язык</label><select id="profile-language" value={draft.preferred_language} disabled={state.saving} onChange={event => actions.edit('preferred_language', event.target.value)}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></select><small>Сохранённое предпочтение не переключает язык сайта автоматически.</small></div>
        <fieldset disabled={state.saving}><legend>Уведомления</legend>{[['email_notifications', 'Email-уведомления'], ['booking_reminders', 'Напоминания о поездке']].map(([name, label]) => <label className="profile-check" key={name}><input type="checkbox" checked={draft[name]} onChange={event => actions.edit(name, event.target.checked)} />{label}</label>)}<p className="account-note">Предпочтения сохраняются в аккаунте. Напоминания будут доступны после запуска сервиса.</p></fieldset>
        {state.dirty && <p className="account-note">Есть несохранённые изменения</p>}
        {state.saveError && <p role="alert" className="account-error">{state.saveError}</p>}
        <p role="status" aria-live="polite">{state.message}</p>
        <div className="account-actions"><button className="account-button" type="submit" disabled={!state.dirty || state.saving}>{state.saving ? 'Сохраняем…' : 'Сохранить изменения'}</button><button className="account-button secondary" type="button" disabled={!state.dirty || state.saving} onClick={actions.cancel}>Отменить изменения</button></div>
      </form></section>
      <section className="profile-card"><h2>Безопасность</h2><p className="account-note">Для смены пароля укажите текущий пароль.</p><form className="profile-form" noValidate onSubmit={event => { event.preventDefault(); actions.savePassword(); }}>
        {[['currentPassword', 'Текущий пароль'], ['newPassword', 'Новый пароль'], ['confirmPassword', 'Повторите новый пароль']].map(([name, label]) => <PasswordField key={name} name={name} label={label} value={state.password[name]} error={state.passwordErrors[name]} disabled={state.passwordBusy} onChange={actions.editPassword} />)}
        <p className="account-note">Новый пароль — не менее 8 символов.</p>
        {state.passwordError && <p role="alert" className="account-error">{state.passwordError}</p>}
        <p role="status" aria-live="polite">{state.passwordMessage}</p>
        <button className="account-button secondary" type="submit" disabled={state.passwordBusy}>{state.passwordBusy ? 'Сохраняем…' : 'Изменить пароль'}</button>
      </form></section></div>
      <nav className="profile-shortcuts" aria-label="Разделы личного кабинета"><Link to="/favorites" className="profile-card"><h2>Избранное</h2><p>Сохранённые отели для будущих поездок</p></Link><Link to="/my-bookings" className="profile-card"><h2>Мои бронирования</h2><p>Заявки и история поездок</p></Link>{user.role === 'admin' && <Link className="account-button secondary" to="/admin">Админ-панель</Link>}</nav>
      <button type="button" className="account-button secondary" onClick={onLogout}>Выйти из аккаунта</button>
    </>}
  </main>;
}

export default function Profile() {
  const { token, user } = useSession();
  const store = useMemo(() => createProfileStore({ token }), [token]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    const timer = setTimeout(() => store.load(), 0);
    return () => { clearTimeout(timer); store.invalidate(); };
  }, [store]);
  if (!token || !user || state.status === 'auth') return <Navigate to="/login" replace />;
  return <><Navbar /><ProfileView key={token} state={state} actions={store} /><Footer /></>;
}
