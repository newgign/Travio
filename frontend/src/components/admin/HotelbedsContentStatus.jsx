import { useEffect, useState } from 'react';
import authFetch from '../../services/authFetch';
export default function HotelbedsContentStatus() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [scopeId, setScopeId] = useState('');
  const selectedScope = data?.scopes?.find(scope=>scope.id===scopeId) || (!scopeId ? data?.scopes?.[0] : null);
  useEffect(() => { let active = true; authFetch('/admin/providers/hotelbeds/content').then(value => { if (active) setData(value); }).catch(() => { if (active) setResult('Статус каталога недоступен'); }); return () => { active = false; }; }, []);
  async function run() {
    if (busy || !data?.enabled || !selectedScope) return;
    setBusy(true);
    try {
      const response = await authFetch('/admin/providers/hotelbeds/content', { method: 'POST', body: JSON.stringify({scopeId:selectedScope.id}) });
      setResult(response.status);
      setData(await authFetch('/admin/providers/hotelbeds/content'));
    } catch { setResult('Импорт заблокирован или завершился ошибкой'); }
    finally { setBusy(false); }
  }
  return <section><h4>Hotelbeds Content TEST</h4>
    <p>{result}</p>
    {data && <>
      <p>Environment: {data.environment} · Страны: {data.countries} · Направления: {data.destinations} · Отели: {data.hotels}</p>
      <p>Последний импорт: {data.lastImport?.last_run || 'NOT RUN'} · Результат: {data.lastImport?.last_error_category || data.lastImport?.details?.status || 'NOT RUN'} · Upserted: {data.lastImport?.details?.upsertedHotels ?? '—'}</p>
      <label>Разрешённое направление <select value={selectedScope?.id || ''} disabled={busy} onChange={event=>setScopeId(event.target.value)}>
        {!data.scopes?.length && <option value="">Не настроено</option>}
        {data.scopes?.map(scope=><option key={scope.id} value={scope.id}>{scope.name || scope.destinationCode} ({scope.countryCode} / {scope.destinationCode})</option>)}
      </select></label>
      <p>Страница: {selectedScope?.from ?? '—'}–{selectedScope?.to ?? '—'}</p>
      {data.destinationsDetail?.map(row=><p key={`${row.countryCode}:${row.code}`}>{row.name || row.code} ({row.countryCode} / {row.code}): {row.hotelCount} отелей</p>)}
      <p>Лимиты: {data.limits.destinations} направление, {data.limits.pages} страница, {data.limits.hotels} отелей, {data.limits.requests} запрос; retries={data.limits.retries}, timeout={data.limits.timeoutMs} ms.</p>
      <button type="button" disabled={busy || !data.enabled || !selectedScope} onClick={run}>Импортировать выбранное направление</button>
      <p>Только настроенный сервером scope. Повторный импорт — не чаще раза в минуту. Scheduler отключён.</p>
    </>}
  </section>;
}
