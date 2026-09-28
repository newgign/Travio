import useSession from '../hooks/useSession';
import { ensureSessionValidated, logout } from '../services/session';
import '../styles/Auth.css';

export function SessionStatus({ status }) {
  return <main className="auth-page"><section className="auth-card"><h1>Проверка сессии</h1>
    {status === 'error' ? <><p role="alert">Не удалось проверить сессию. Попробуйте ещё раз.</p>
      <button type="button" onClick={() => { void ensureSessionValidated({ retry: true }); }}>Повторить</button>
      <button type="button" onClick={logout}>Выйти</button></> : <p role="status" aria-live="polite">Проверяем сессию…</p>}
  </section></main>;
}

export default function SessionBoundary({ children }) {
  const { status } = useSession();
  return ['guest', 'authenticated'].includes(status) ? children : <SessionStatus status={status} />;
}
