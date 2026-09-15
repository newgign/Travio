// One shared local snapshot for access, catalog and planner. No provider polling.
export function createHotelbedsAdminStore(fetcher) {
  let snapshot={access:null,content:null,plan:null,busy:false,refreshing:false,message:''};
  let version=0;
  const listeners=new Set();
  const publish=patch=>{snapshot={...snapshot,...patch};for(const listener of listeners)listener();};
  async function refresh() {
    const current=++version;
    publish({refreshing:true});
    try {
      const [access,content,plan]=await Promise.all([
        fetcher('/admin/providers/hotelbeds/access'),fetcher('/admin/providers/hotelbeds/content'),fetcher('/admin/providers/hotelbeds/catalog-plan'),
      ]);
      if(current===version)publish({access,content,plan,refreshing:false});
    } catch {
      if(current===version)publish({plan:null,access:null,content:null,refreshing:false,message:'Локальный статус недоступен. Обновите данные перед импортом.'});
    }
  }
  async function mutate(url,body) {
    if(snapshot.busy || snapshot.refreshing)return;
    version++;publish({busy:true,message:''});
    try {const result=await fetcher(url,{method:'POST',body:JSON.stringify(body)});publish({message:result.status || 'Операция завершена'});}
    catch {publish({message:'Операция заблокирована или завершилась ошибкой. Проверьте обновлённый статус.'});}
    finally {await refresh();publish({busy:false});}
  }
  return {
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    getSnapshot:()=>snapshot,refresh,
    importScope(scopeId){
      if(!snapshot.plan?.scopes.some(s=>s.scopeId===scopeId && s.manualImportAvailable))return Promise.resolve();
      return mutate('/admin/providers/hotelbeds/content',{scopeId,action:'next'});
    },
    control(action,operation,scopeId){
      if(!['arm','control'].includes(action))return Promise.resolve();
      return mutate('/admin/providers/hotelbeds/access/'+action,{operation,...(scopeId?{scopeId}:{})});
    },
  };
}
