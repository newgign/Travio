import {useState} from 'react';
export default function HotelbedsContentStatus({data,plan,busy=false,onImport}) {
  const [scopeId,setScopeId]=useState('');
  return <ContentPlanView {...{data,plan,busy,onImport,scopeId,setScopeId}} />;
}
export function ContentPlanView({data,plan,busy=false,onImport,scopeId,setScopeId}) {
  const selected=plan?.scopes.find(scope=>scope.scopeId===scopeId);
  if(!data || !plan)return <p>План каталога недоступен до чтения локальных данных.</p>;
  return <section><h4>План расширения Hotelbeds Content TEST</h4>
    <p>Configured TEST scopes: {plan.totals.scopes} · Локальных отелей: {plan.totals.hotels} · Осталось до cap: {plan.totals.remaining}</p>
    <p>Весь локальный каталог: {data.hotels} отелей · {data.destinations} направлений · {data.countries} стран</p>
    <p>Приоритет расширения каталога: {plan.priorityReason}. При равенстве — country/destination order.</p>
    <div style={{overflowX:'auto'}}><table><thead><tr>
      <th>Направление</th><th>Каталог</th><th>Осталось</th><th>Состояние</th><th>Следующий batch</th><th>Выбор</th>
    </tr></thead><tbody>{plan.scopes.map(scope=><tr key={scope.scopeId}>
      <td>{scope.label} ({scope.countryCode}/{scope.destinationCode})</td>
      <td>{scope.hotelCount} / {scope.cap}{scope.overCap?' · превышение cap в локальных данных':''}</td>
      <td>{scope.remaining}</td><td>{scope.state}</td>
      <td>{scope.complete?'COMPLETE':`${scope.nextFrom}–${scope.nextTo} · COUNT ${scope.nextCount}`}</td>
      <td><button type="button" disabled={busy || scope.complete} onClick={()=>setScopeId(scope.scopeId)}>Выбрать для импорта</button></td>
    </tr>)}</tbody></table></div>
    <label>Разрешённое направление <select value={selected?.scopeId || ''} disabled={busy} onChange={event=>setScopeId(event.target.value)}>
      <option value="">Выберите направление</option>
      {plan.scopes.map(scope=><option key={scope.scopeId} value={scope.scopeId}>{scope.label} ({scope.scopeId})</option>)}
    </select></label>
    {selected && <section aria-label="Проверка перед ручным импортом">
      <h4>Перед ручным импортом</h4>
      <p>Направление: {selected.label} ({selected.countryCode}/{selected.destinationCode})</p>
      <p>Каталог: {selected.hotelCount} / {selected.cap} · Осталось: {selected.remaining}</p>
      <p>Следующий batch: {selected.complete?'COMPLETE':`${selected.nextFrom}–${selected.nextTo}`} · COUNT: {selected.nextCount}</p>
      <p>Максимум Content requests: {selected.complete?0:plan.maxRequestsPerImport}</p>
      <p>Content access: {plan.contentAccessState} · Cooldown: {plan.cooldown.state}{plan.cooldown.state==='WAIT'?` · на момент чтения осталось ${Math.ceil(plan.cooldown.remainingMs/1000)} с.; затем обновите локальный план`:''}</p>
      <p>Observed today UTC: {plan.observed.today}</p>
      {!selected.manualImportAvailable && <p>Import unavailable: {selected.unavailableReason}</p>}
      <p>Официальный остаток квоты Hotelbeds неизвестен.</p>
      <button type="button" disabled={busy || !selected.manualImportAvailable} onClick={()=>onImport(selected.scopeId)}>
        {selected.complete?'IMPORT COMPLETE':'Импортировать следующий batch выбранного направления'}
      </button>
    </section>}
    <p>При успешном полном import операция использует до {plan.maxRequestsPerImport} Content requests: metadata window #1, при необходимости metadata window #2, затем hotel page. Блокировка или ошибка может завершить операцию раньше, включая 0 requests.</p>
    <p>Если один следующий import выполнит полный bounded path, локальный observed counter может увеличиться максимум на {plan.maxRequestsPerImport}. Это envelope одной операции, а не доступный остаток запросов.</p>
    <p>Observed app requests · Today UTC: {plan.observed.today} · Last 24h: {plan.observed.last24h}</p>
    {Object.entries(plan.observed.breakdown).map(([category,counts])=><p key={category}>{category}: {counts.today} / {counts.last24h}</p>)}
    <strong>Это локально наблюдаемые запросы приложения. Это НЕ официальный остаток квоты Hotelbeds.</strong>
    <p>Next batch выводится из текущего уникального local hotel count. Это не доказательство непрерывной Hotelbeds pagination: возможны duplicates, пустая provider page, изменившийся provider ordering и меньше новых unique hotels. COUNT не гарантирует достижение 20/20.</p>
    <p>После каждой операции план и счётчики перечитываются из PostgreSQL. Автоматического следующего batch, scope или retry нет.</p>
    <p>Последний импорт: {data.lastImport?.last_run || 'NOT RUN'} · Результат: {data.lastImport?.last_error_category || data.lastImport?.details?.status || 'NOT RUN'} · Upserted: {data.lastImport?.details?.upsertedHotels ?? '—'}</p>
    <p>Лимиты: {data.limits.destinations} scope · до {data.limits.requests} запросов · retries={data.limits.retries} · timeout={data.limits.timeoutMs} ms.</p>
  </section>;
}
