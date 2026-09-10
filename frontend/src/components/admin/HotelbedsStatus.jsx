import { useEffect, useState } from 'react';
import authFetch from '../../services/authFetch';
export default function HotelbedsStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    authFetch('/admin/providers/hotelbeds').then(value => { if (active) setStatus(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  if (error) return <p>Статус Hotelbeds недоступен.</p>;
  if (!status) return <p>Загрузка статуса Hotelbeds…</p>;
  return <section className="admin-card"><h3>Hotelbeds {status.environment.toUpperCase()} · {status.status}</h3>
    {status.message && <p>{status.message}</p>}
    <p>Последний успешный запрос: {status.lastSuccessfulRequest || '—'}</p>
    <p>Мониторинг: {status.monitor.enabled ? 'включён' : 'выключен'} · Отслеживается: {status.trackedOffers} · Горящих предложений: {status.confirmedHotDealsCount}</p>
    {status.jobs.map(job => <p key={job.job}>{job.job}: {job.last_success || 'Нет успешных запусков'} {job.last_error_category || ''}</p>)}
  </section>;
}
