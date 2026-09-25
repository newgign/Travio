import { searchTours } from './tourService';
import { offerFreshUntil } from '../utils/selectedOfferSnapshot';
import { validateResultsSearch } from '../utils/searchExperience';
import { providerQuery } from '../utils/localOfferFilters';
export function resultsFreshUntil(result,now=Date.now()) {
  const offers=(result?.data || []).flatMap(offer=>[offer,...(offer.candidateOffers || [])]);
  return offers.length ? Math.min(...offers.map(offer=>offerFreshUntil(offer,now))) : 0;
}
// Small tab-memory cache, never persisted. Reuse only fresh signed offers; no polling/retries.
export function createResultsSearch(request=searchTours,clock=Date.now) {
  const entries=new Map();
  const load=function(query,{retry=false}={}) {
    const filters=JSON.parse(query);
    const params=new URLSearchParams(Object.entries(filters).filter(([,value])=>value!==''));
    if(validateResultsSearch(params,new Date(clock())).state!=='VALID')return Promise.reject(Object.assign(new Error('INVALID_SEARCH'),{code:'INVALID_SEARCH'}));
    const existing=entries.get(query);
    if(existing?.pending)return existing.pending;
    if(!retry && existing) {
      if(existing.result && clock()<resultsFreshUntil(existing.result,clock()))return Promise.resolve(existing.result);
      return Promise.reject(Object.assign(new Error('RESULTS_STALE'),{code:'RESULTS_STALE'}));
    }
    const entry={};
    entry.pending=Promise.resolve().then(()=>request(filters)).then(result=>{
      if(result?.data?.length && clock()>=resultsFreshUntil(result,clock()))throw Object.assign(new Error('RESULTS_STALE'),{code:'RESULTS_STALE'});
      entry.result=result;entry.pending=null;return result;
    }).catch(error=>{entry.pending=null;throw error;});
    entries.set(query,entry);
    // Keep tombstones for discarded results: Back must never silently refetch.
    const stored=[...entries.values()].filter(value=>value.result);
    if(stored.length>=3)stored[0].result=null;
    return entry.pending;
  };
  load.begin=query=>{for(const entry of entries.values())entry.result=null;entries.delete(query);};
  return load;
}
export const loadResultsSearch=createResultsSearch();
let generation=0;
export const resultsSearchGeneration=()=>generation;
export function beginResultsSearch(url){loadResultsSearch.begin(providerQuery(new URLSearchParams(url.split('?')[1]),true));generation++;}
