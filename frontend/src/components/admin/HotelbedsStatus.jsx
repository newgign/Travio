import { useEffect, useRef, useState } from 'react';
import authFetch from '../../services/authFetch';
import HotelbedsContentStatus from './HotelbedsContentStatus';
import HotelbedsAccess from './HotelbedsAccess';
import { canProbeTest, probeOptions } from '../../utils/hotelbedsProbe';
export default function HotelbedsStatus() {
  const [status, setStatus] = useState(null);
  const [accessVersion,setAccessVersion] = useState(0);
  const [error, setError] = useState(false);
  const [probe, setProbe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function runProbe(availability) {
    if (inFlight.current || cooldown || !canProbeTest(status)) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await authFetch('/admin/providers/hotelbeds/probe', probeOptions(availability));
      setProbe({ ...result, requestedAvailability: availability });
      if (result.networkAttempted || result.blockers?.includes('PROBE_RATE_LIMITED')) setCooldown(60);
      try { setStatus(await authFetch('/admin/providers/hotelbeds')); } catch { /* Keep the safe probe result visible. */ }
    } catch {
      setProbe({ status: 'FAIL', requestedAvailability: availability, blockers: ['ADMIN_PROBE_REQUEST_FAILED'] });
      setCooldown(60);
    } finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    authFetch('/admin/providers/hotelbeds').then(value => { if (active) setStatus(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  if (error) return <p>Статус Hotelbeds недоступен.</p>;
  if (!status) return <p>Загрузка статуса Hotelbeds…</p>;
  return <section className="admin-card"><h3>Hotelbeds {status.environment.toUpperCase()} · {status.environment === 'test' ? 'доступ по категориям' : status.status}</h3>
    <p>Staging TEST allowed: {String(Boolean(status.stagingTestAllowed))} · Availability hotels/rates: {status.liveProbe?.lastAvailability?.hotelCount ?? '—'} / {status.liveProbe?.lastAvailability?.rateCount ?? '—'} · Sales ready: false</p>
    {status.message && <p>{status.message}</p>}
    <p>Последний успешный запрос: {status.lastSuccessfulRequest || '—'}</p>
    <p>{status.environment.toUpperCase()} credentials: {status.connection?.credentialsConfigured ? 'настроены' : 'не настроены'} · mTLS: {status.connection?.mtlsReady ? 'готов' : 'не готов'}</p>
    <p>Причина mTLS: {status.connection?.mtlsErrorCode || 'NOT RUN'}</p>
    <p>API key length: {status.connection?.apiKeyLength ?? '—'} · API secret length: {status.connection?.apiSecretLength ?? '—'}</p>
    <p>Credential fingerprint: {status.connection?.credentialPairFingerprint || '—'}</p>
    <p>Secret source: {status.connection?.usingHotelbedsApiSecret ? 'HOTELBEDS_API_SECRET' : status.connection?.usingLegacyHotelbedsSecret ? 'legacy HOTELBEDS_SECRET' : status.environment === 'live' && status.connection?.secretConfigured ? 'LIVE secret' : 'не настроен'}</p>
    {status.environment === 'test' && <div>
      <button type="button" disabled={!canProbeTest(status) || busy || cooldown > 0} onClick={() => runProbe(false)}>Проверить Hotelbeds TEST</button>
      <button type="button" disabled={!canProbeTest(status) || busy || cooldown > 0} onClick={() => runProbe(true)}>Получить TEST Availability</button>
      <p>Только server-side selection. CheckRate не выполняется. {busy ? 'Проверка…' : cooldown > 0 ? `Повторная проверка через ${cooldown} с.` : ''}</p>
      <p>Один probe на процесс; cooldown 60 секунд после сетевой попытки. Общего лимитера нескольких instances нет.</p>
    </div>}
    {probe && <div role="status">
      <p>Environment: {probe.environment === 'test' ? 'TEST' : '—'} · mTLS: {(probe.mtlsReady ?? status.connection?.mtlsReady) === true ? 'ready' : 'not ready'} · Probe: {probe.status}</p>
      <p>Hostname: {probe.hostname || '—'} · Duration: {probe.durationMs ?? '—'} ms · Timestamp: {probe.timestamp || '—'}</p>
      {probe.blockers?.map(code => <p key={code}>Причина: {code}</p>)}
      {probe.requestedAvailability && !probe.operations?.some(operation => operation.operation === 'availability') && <p>Availability: {probe.status === 'BLOCKED' ? 'BLOCKED' : 'NOT RUN'}</p>}
      {probe.operations?.map(operation => <div key={operation.operation}>
        <p>Operation: {operation.operation} · Hostname: {operation.hostname || '—'} · {operation.status} · HTTP: {operation.httpStatus ?? '—'} · Категория: {operation.code || '—'}</p>
        {operation.providerReason && <p>Причина HBX: {operation.providerReason}</p>}
        {operation.rateLimit !== undefined && <p>Quota limit: {operation.rateLimit}</p>}
        {operation.rateLimitRemaining !== undefined && <p>Quota remaining: {operation.rateLimitRemaining}</p>}
        {operation.retryAfterSeconds !== undefined && <p>Retry after: {operation.retryAfterSeconds} sec</p>}
        {operation.operation === 'availability' && <p>Availability: {operation.status} · hotelCount: {operation.hotelCount ?? '—'} · rateCount: {operation.rateCount ?? '—'} · currencies: {operation.currencies?.join(', ') || '—'} · priceSources: {operation.priceSources?.join(', ') || '—'}</p>}
      </div>)}
    </div>}
    <p>{status.environment.toUpperCase()} smoke: {status.liveProbe?.status || 'NOT RUN'} · последний probe: {status.liveProbe?.timestamp || '—'}</p>
    <p>Availability: {status.liveProbe?.lastAvailabilityStatus || 'NOT RUN'}. История probe относится к текущему процессу и сбрасывается после перезапуска.</p>
    <p>Booking: {status.bookingDisabled ? 'выключен' : 'проверьте flags'} · Payments: {status.paymentsDisabled ? 'выключены' : 'проверьте flags'}. Успешное подключение не разрешает продажи.</p>
    <p>Мониторинг: {status.monitor.enabled ? 'включён' : 'выключен'} · Отслеживается: {status.trackedOffers} · Горящих предложений: {status.confirmedHotDealsCount}</p>
    {status.jobs.map(job => <p key={job.job}>{job.job}: {job.last_success || 'Нет успешных запусков'} {job.last_error_category || ''}</p>)}
    {status.environment === 'test' && <><HotelbedsAccess onChange={()=>setAccessVersion(value=>value+1)} /><HotelbedsContentStatus key={accessVersion} /></>}
  </section>;
}
