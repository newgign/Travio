import API_URL from './api';
export async function loadHomeCatalog(signal, request=fetch) {
  const response=await request(`${API_URL}/catalog/test-options`,{signal});
  if(!response.ok) throw new Error('Каталог временно недоступен');
  const data=await response.json();
  if (!Array.isArray(data?.destinations) || data.destinations.some(row => !row ||
      !/^[A-Z]{2}$/.test(row.countryCode) || !/^[A-Z0-9]{1,12}$/.test(row.code) ||
      !Number.isInteger(row.hotelCount) || row.hotelCount < 0)) throw Error('INVALID_HOME_CATALOG');
  return data.destinations;
}

// Page-owned public data only. No persistent cache, implicit retry or provider resolver.
export function createHomeLoad(loader) {
  let state={status:'loading',items:[]}, pending=null, controller=null, generation=0;
  const listeners=new Set();
  const emit=value=>{state=value;listeners.forEach(fn=>fn());};
  return {
    getSnapshot:()=>state,
    subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},
    load() {
      if (pending) return pending;
      const version=++generation;
      controller=new AbortController();
      const signal=controller.signal;
      emit({status:'loading',items:[]});
      pending=Promise.resolve().then(()=>signal.aborted ? null : loader(signal)).then(items=>{
        if (version!==generation) return;
        if (!Array.isArray(items)) throw Error('INVALID_HOME_LIST');
        emit({status:'ready',items});
      }).catch(()=>{if(version===generation)emit({status:'error',items:[]});})
        .finally(()=>{if(version===generation)pending=null;});
      return pending;
    },
    dispose() {generation++;controller?.abort();pending=null;emit({status:'loading',items:[]});},
  };
}
