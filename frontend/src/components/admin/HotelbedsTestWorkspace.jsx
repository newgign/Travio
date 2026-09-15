import {useEffect,useState,useSyncExternalStore} from 'react';
import authFetch from '../../services/authFetch';
import {createHotelbedsAdminStore} from '../../services/hotelbedsAdminStore';
import HotelbedsAccess from './HotelbedsAccess';
import HotelbedsContentStatus from './HotelbedsContentStatus';
export default function HotelbedsTestWorkspace() {
  const [store]=useState(()=>createHotelbedsAdminStore(authFetch));
  const data=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  useEffect(()=>{void store.refresh();},[store]);
  const busy=data.busy || data.refreshing;
  return <section>
    <p role="status">{data.message}</p>
    <button type="button" disabled={busy} onClick={store.refresh}>Обновить локальный план и счётчики</button>
    {data.refreshing && <p>Обновление локальных данных…</p>}
    <HotelbedsAccess data={data.access} scopes={data.content?.scopes || []} busy={busy} act={store.control} />
    <HotelbedsContentStatus data={data.content} plan={data.plan} busy={busy} onImport={store.importScope} />
  </section>;
}
