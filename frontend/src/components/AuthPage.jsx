import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createAuthFormStore } from '../services/authFormStore';
import { authFields, authOrigin, focusAuthError } from '../utils/authPresentation';
import '../styles/Auth.css';

const labels = { full_name: 'Имя', email: 'Email', phone: 'Телефон (необязательно)', password: 'Пароль', confirmPassword: 'Повторите пароль' };
function AuthField({ name, mode, state, onEdit }) {
  const [visible, setVisible] = useState(false);
  const password = name === 'password' || name === 'confirmPassword';
  const id = `auth-${name}`, error = state.errors[name];
  const hint = name === 'password' && mode === 'register';
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  const autocomplete = password ? (mode === 'login' ? 'current-password' : 'new-password') : {full_name:'name',email:'email',phone:'tel'}[name];
  return <div className="auth-field"><label htmlFor={id}>{labels[name]}</label><div className={password ? 'auth-password' : undefined}>
    <input id={id} name={name} type={password ? (visible ? 'text' : 'password') : name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'} autoComplete={autocomplete} required={name !== 'phone'} value={state.form[name]} disabled={state.pending} onChange={event => onEdit(name, event.target.value)} aria-invalid={Boolean(error)} aria-describedby={describedBy} />
    {password && <button type="button" className="auth-visibility" onClick={() => setVisible(!visible)} aria-label={`${visible ? 'Скрыть' : 'Показать'}: ${labels[name]}`} aria-pressed={visible}>{visible ? 'Скрыть' : 'Показать'}</button>}
  </div>{hint && <small id={`${id}-hint`}>Не менее 8 символов</small>}{error && <span className="auth-error" id={`${id}-error`}>{error}</span>}</div>;
}

export function AuthView({ mode, state, actions, returnTo = '/', registered = false }) {
  const register = mode === 'register';
  function submit(event) {
    event.preventDefault();
    void actions.submit();
    focusAuthError(event.currentTarget, actions.getSnapshot().errors, mode);
  }
  return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-heading">
    <header><Link to="/" className="auth-logo">✈️ Asedeliya</Link><h1 id="auth-heading">{register ? 'Создать аккаунт' : 'Вход в аккаунт'}</h1><p>{register ? 'Сохраняйте понравившиеся отели и управляйте личными данными.' : 'Войдите, чтобы управлять избранным, профилем и поездками.'}</p></header>
    {!register && registered && <p className="auth-success" role="status" aria-live="polite">Аккаунт создан. Теперь войдите в Asedeliya.</p>}
    <form noValidate onSubmit={submit} aria-busy={state.pending}>
      {authFields(mode).map(name => <AuthField key={name} name={name} mode={mode} state={state} onEdit={actions.edit} />)}
      {state.error && <p className="auth-error auth-server-error" role="alert">{state.error}</p>}
      <button className="auth-submit" type="submit" disabled={state.pending}>{state.pending ? (register ? 'Создаём аккаунт…' : 'Входим…') : (register ? 'Создать аккаунт' : 'Войти')}</button>
      <span className="auth-pending" role="status" aria-live="polite">{state.pending ? 'Выполняем запрос…' : ''}</span>
    </form>
    <p className="auth-switch">{register ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}<Link to={register ? '/login' : '/register'} state={{ returnTo: authOrigin(returnTo) }}>{register ? 'Войти' : 'Зарегистрироваться'}</Link></p>
  </section></main>;
}

export default function AuthPage({ mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = authOrigin(location.state?.returnTo);
  const store = useMemo(() => createAuthFormStore({ mode, returnTo, onSuccess: navigate }), [mode, returnTo, navigate]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => store.connect(), [store]);
  return <AuthView key={`${mode}:${location.key}`} mode={mode} state={state} actions={store} returnTo={returnTo} registered={location.state?.registered === true} />;
}
