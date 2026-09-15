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
    if (busy || !data?.enabled || !selectedScope || selectedScope.batch?.complete) return;
    setBusy(true);
    try {
      const response = await authFetch('/admin/providers/hotelbeds/content', { method: 'POST', body: JSON.stringify({scopeId:selectedScope.id,action:'next'}) });
      setResult(response.status);
      setData(await authFetch('/admin/providers/hotelbeds/content'));
    } catch (error) {
      setResult(error.code === 'HOTELBEDS_AUTH_BLOCKED' ? 'Импорт заблокирован защитой доступа Hotelbeds TEST.' : 'Импорт заблокирован или завершился ошибкой');
      try { setData(await authFetch('/admin/providers/hotelbeds/content')); } catch { /* Preserve the last local plan. */ }
    }
    finally { setBusy(false); }
  }
  return <section><h4>Hotelbeds Content TEST</h4>
    <p>{result}</p>
    {data && <>
      {['AUTH_BLOCKED','UNKNOWN_BLOCKED'].includes(data.accessState) && <p>Импорт заблокирован защитой доступа Hotelbeds TEST. {data.accessState === 'UNKNOWN_BLOCKED' ? 'Сначала выполните контрольный Content import.' : ''}</p>}
      <p>Environment: {data.environment} · Страны: {data.countries} · Направления: {data.destinations} · Отели: {data.hotels}</p>
      <p>Последний импорт: {data.lastImport?.last_run || 'NOT RUN'} · Результат: {data.lastImport?.last_error_category || data.lastImport?.details?.status || 'NOT RUN'} · Upserted: {data.lastImport?.details?.upsertedHotels ?? '—'}</p>
      <label>Разрешённое направление <select value={selectedScope?.id || ''} disabled={busy} onChange={event=>setScopeId(event.target.value)}>
        {!data.scopes?.length && <option value="">Не настроено</option>}
        {data.scopes?.map(scope=><option key={scope.id} value={scope.id}>{scope.name || scope.destinationCode} ({scope.countryCode} / {scope.destinationCode})</option>)}
      </select></label>
      <p>Страница: {selectedScope?.from ?? '—'}–{selectedScope?.to ?? '—'}</p>
      {data.scopes?.map(scope=><p key={scope.id}>{scope.name || scope.destinationCode} ({scope.countryCode} / {scope.destinationCode}) · {scope.hotelCount} / 20 отелей · {scope.state} · environment={scope.environment}<br />Настроенный FROM: {scope.from}, COUNT: {scope.count}<br />{scope.batch?.complete ? 'IMPORT COMPLETE' : `Следующий ручной batch: ${scope.batch?.next?.from}–${scope.batch?.next?.to} (COUNT ${scope.batch?.next?.count})`}</p>)}
      {data.destinationsDetail?.map(row=><p key={`${row.countryCode}:${row.code}`}>{row.name || row.code} ({row.countryCode} / {row.code}): {row.hotelCount} отелей</p>)}
      <p>Лимиты: {data.limits.destinations} направление, до {data.limits.destinationWindows ?? 1} окон метаданных, {data.limits.pages} страница отелей, до {data.limits.hotels} отелей и {data.limits.requests} запросов; retries={data.limits.retries}, timeout={data.limits.timeoutMs} ms.</p>
      <button type="button" disabled={busy || !data.enabled || !selectedScope?.batch?.next} onClick={run}>{selectedScope?.batch?.complete ? 'IMPORT COMPLETE' : 'Импортировать следующий batch выбранного направления'}</button>
      <p>Диапазон — предложение по числу локальных отелей, не подтверждение provider pagination. Повторы или пустая страница не запускают следующий запрос. Перед нажатием проверьте выбранное направление.</p>
      <p>Только настроенный сервером scope. Повторный импорт — не чаще раза в минуту. Scheduler отключён.</p>
    </>}
  </section>;
}
