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
    <p>Staging TEST allowed: {String(Boolean(status.stagingTestAllowed))} · Availability hotels/rates: {status.liveProbe?.lastAvailability?.hotelCount ?? '—'} / {status.liveProbe?.lastAvailability?.rateCount ?? '—'} · Sales ready: false</p>
    {status.message && <p>{status.message}</p>}
    <p>Последний успешный запрос: {status.lastSuccessfulRequest || '—'}</p>
    <p>{status.environment.toUpperCase()} credentials: {status.connection?.credentialsConfigured ? 'настроены' : 'не настроены'} · mTLS: {status.connection?.mtlsReady ? 'готов' : 'не готов'}</p>
    <p>{status.environment.toUpperCase()} smoke: {status.liveProbe?.status || 'NOT RUN'} · последний probe: {status.liveProbe?.timestamp || '—'}</p>
    <p>Availability: {status.liveProbe?.lastAvailabilityStatus || 'NOT RUN'}. История probe относится к текущему процессу и сбрасывается после перезапуска.</p>
    <p>Booking: {status.bookingDisabled ? 'выключен' : 'проверьте flags'} · Payments: {status.paymentsDisabled ? 'выключены' : 'проверьте flags'}. Успешное подключение не разрешает продажи.</p>
    <p>Мониторинг: {status.monitor.enabled ? 'включён' : 'выключен'} · Отслеживается: {status.trackedOffers} · Горящих предложений: {status.confirmedHotDealsCount}</p>
    {status.jobs.map(job => <p key={job.job}>{job.job}: {job.last_success || 'Нет успешных запусков'} {job.last_error_category || ''}</p>)}
  </section>;
}
