import {useEffect,useState} from 'react';
import authFetch from '../../services/authFetch';
export function CircuitPanel({name,circuit,scopes=[],selectedScope,setSelectedScope,busy,act}) {
  const content=name==='content';
  const operation=content?'CONTENT':'AVAILABILITY_3424';
  const scopeId=circuit.armed?circuit.scopeId:selectedScope;
  return <section>
    <h4>Hotelbeds TEST {content?'Content':'Booking read'} access</h4>
    <p>State: {circuit.state}</p>
    <p>Last successful operation/request: {circuit.lastSuccessAt || '—'} · {circuit.lastSuccessCategory || '—'}</p>
    <p>Last AUTH_ERROR: {circuit.lastAuthErrorAt || '—'} · {circuit.lastAuthErrorCategory || '—'}</p>
    {circuit.state==='AUTH_BLOCKED' && <p>Этот access получил 403 AUTH_ERROR. Причина может быть связана с quota, доступом или настройками аккаунта.</p>}
    {circuit.state==='UNKNOWN_BLOCKED' && <p>Доступ ещё не подтверждён контрольной проверкой. Запросы этого типа заблокированы.</p>}
    {circuit.armed && <p>CONTROL REQUEST ARMED · {circuit.operation} {circuit.scopeId || ''}</p>}
    {circuit.inFlight && <p>Операция этого типа выполняется или её результат не удалось сохранить.</p>}
    {content && <label>Направление для контрольного Content import
      <select value={scopeId || ''} disabled={busy || circuit.armed || circuit.inFlight} onChange={event=>setSelectedScope(event.target.value)}>
        <option value="">Выберите направление</option>
        {scopes.map(scope=><option key={scope.id} value={scope.id}>{scope.name || scope.id} ({scope.id})</option>)}
      </select>
    </label>}
    <button type="button" disabled={busy || circuit.state==='READY' || circuit.armed || circuit.inFlight || (content && !scopeId)}
      onClick={()=>act('arm',operation,content?scopeId:undefined)}>Разрешить одну контрольную операцию</button>
    <button type="button" disabled={busy || !circuit.armed || circuit.inFlight}
      onClick={()=>act('control',operation,content?scopeId:undefined)}>Выполнить контрольный {content?'Content import':'Availability 3424'}</button>
    <p>{content?'Один bounded import выбранного направления.':'Отель 3424, 1 номер, 2 взрослых, 1 ночь; заезд через 7 дней (UTC).'} Вооружение не отправляет запрос Hotelbeds.</p>
  </section>;
}
export default function HotelbedsAccess({onChange}) {
  const [data,setData]=useState(null),[scopes,setScopes]=useState([]),[selectedScope,setSelectedScope]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    let active=true;
    authFetch('/admin/providers/hotelbeds/access').then(value=>{if(active)setData(value);}).catch(()=>{if(active)setMessage('Защита доступа недоступна. Запросы блокируются.');});
    authFetch('/admin/providers/hotelbeds/content').then(value=>{if(active)setScopes(value.scopes || []);}).catch(()=>{});
    return()=>{active=false;};
  },[]);
  async function act(action,operation,scopeId) {
    setBusy(true);setMessage('');
    try {
      await authFetch(`/admin/providers/hotelbeds/access/${action}`,{method:'POST',body:JSON.stringify({operation,...(scopeId?{scopeId}:{})})});
      setMessage(action==='arm'?'Одна контрольная операция разрешена':'Контрольная операция успешна');
    } catch {setMessage('Операция заблокирована или завершилась ошибкой.');}
    finally {
      try {setData(await authFetch('/admin/providers/hotelbeds/access'));} catch {setData(null);}
      setBusy(false);onChange?.();
    }
  }
  return <section><h4>Hotelbeds TEST access</h4><p role="status">{message}</p>
    {data && <>
      <p>Общее состояние доступа: {data.summary}. Content и Booking read проверяются независимо.</p>
      {Object.entries(data.circuits).map(([name,circuit])=><CircuitPanel key={name} {...{name,circuit,scopes,selectedScope,setSelectedScope,busy,act}} />)}
      <p>Observed app requests · Today (UTC): {data.today} · Last 24h: {data.last24h}</p>
      {Object.entries(data.breakdown).map(([category,counts])=><p key={category}>{category}: {counts.today} / {counts.last24h}</p>)}
    </>}
    <p>Локальный счётчик запросов этого приложения. Это НЕ официальный остаток квоты Hotelbeds.</p>
  </section>;
}
