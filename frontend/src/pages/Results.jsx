import { providerQuery, filterOffers, resetOfferFilters, localPriceCurrency } from '../utils/localOfferFilters';
import { activeFilterChips, changePresentationFilter } from '../utils/resultsPresentation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import HomeSearch from '../components/HomeSearch';
import { loadHomeCatalog } from '../services/homeCatalog';
import { loadResultsSearch, resultsFreshUntil, resultsSearchGeneration } from '../services/resultsSearch';
import { validateResultsSearch, resultsState, searchFailureMessage, staleResultsMessage } from '../utils/searchExperience';
import ResultsNotice from '../components/ResultsNotice';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ConsumerMetadata from '../components/ConsumerMetadata';
import TourCard from '../components/TourCard';
import ResultsFilters from '../components/ResultsFilters';
import ResultsHeader from '../components/ResultsHeader';
import ResultsToolbar from '../components/ResultsToolbar';
import ResultsFilterChips from '../components/ResultsFilterChips';
import ResultsFilterPanel from '../components/ResultsFilterPanel';
import '../styles/Results.css';

export default function Results() {
  const [params]=useSearchParams();
  // Search identity changes remount the state; local presentation edits do not.
  return <ResultsPage key={`${providerQuery(params,true)}:${validateResultsSearch(params).state}:${resultsSearchGeneration()}`} />;
}
function ResultsPage() {
  const [searchParams,setSearchParams]=useSearchParams();
  const [tours,setTours]=useState([]);
  const [freshUntil,setFreshUntil]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [catalogEmpty,setCatalogEmpty]=useState(false);
  const requestVersion=useRef({version:0});
  const [filtersOpen,setFiltersOpen]=useState(false);
  const filterTrigger=useRef(null);
  const filterPanel=useRef(null);
  const [destinations,setDestinations]=useState([]);
  const [catalogState,setCatalogState]=useState('loading');
  const validation=validateResultsSearch(searchParams);
  const valid=validation.state==='VALID';
  const destinationCode=searchParams.get('destinationCode');
  const diagnostic=searchParams.get('stagingTestHotel');
  useEffect(()=>{
    const controller=new AbortController();
    loadHomeCatalog(controller.signal).then(rows=>{
      if(!controller.signal.aborted){setDestinations(rows);setCatalogState('ready');}
    }).catch(()=>{if(!controller.signal.aborted)setCatalogState('error');});
    return ()=>controller.abort();
  },[destinationCode,diagnostic]);
  useEffect(()=>{
    if(!filtersOpen)return;
    filterPanel.current?.querySelector('button')?.focus();
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const desktop=window.matchMedia('(min-width:801px)');
    const resized=()=>{if(desktop.matches)setFiltersOpen(false);};
    desktop.addEventListener('change',resized);
    return ()=>{document.body.style.overflow=previous;desktop.removeEventListener('change',resized);};
  },[filtersOpen]);
  const closeFilters=()=>{setFiltersOpen(false);filterTrigger.current?.focus();};
  const sortBy=['default','priceAsc','priceDesc','pricePerNight','stars','name','rating'].includes(searchParams.get('sort'))?searchParams.get('sort'):'default';
  const provider=searchParams.get('provider') || 'hotelbeds';
  const localFilters=true;
  const requestQuery=providerQuery(searchParams,localFilters);
  const filterQuery=searchParams.toString();
  const visibleTours=useMemo(()=>{const params=new URLSearchParams(filterQuery);params.set('sort',sortBy);return filterOffers(tours,params);},[tours,filterQuery,sortBy]);
  const filterEmpty=localFilters && tours.length>0 && visibleTours.length===0;
  const currency=localFilters ? localPriceCurrency(tours) : tours[0]?.currency || (provider==='hotelbeds'?'EUR':'KZT');
  const boards=localFilters ? [...new Map(tours.flatMap(tour=>tour.candidateOffers || [tour]).filter(tour=>tour.boardCode).map(tour=>[tour.boardCode,{code:tour.boardCode,name:tour.boardName}])).values()] : undefined;
  const chips=activeFilterChips(searchParams,currency,boards);
  const reset=()=>setSearchParams(resetOfferFilters(searchParams));

  const loadTours = useCallback(async (retry=false) => {
    const version=++requestVersion.current.version;
    if (!valid) { setTours([]); setLoading(false); setError(''); return; }
    try {
      setLoading(true);
      setTours([]);
      setError("");
      setCatalogEmpty(false);
      const result = await loadResultsSearch(requestQuery,{retry});
      if (version !== requestVersion.current.version) return;
      setTours(Array.isArray(result?.data) ? result.data : []);
      setFreshUntil(resultsFreshUntil(result));
    } catch (err) {
      if (version !== requestVersion.current.version) return;
      setTours([]);
      if (err?.code === 'TEST_CATALOG_EMPTY') { setCatalogEmpty(true); setError('');  }
      else setError(err?.code==='RESULTS_STALE'?staleResultsMessage:searchFailureMessage);
    } finally {
      if (version === requestVersion.current.version) setLoading(false);
    }
  }, [requestQuery,valid]);

  useEffect(() => { const state = requestVersion.current; const timer = setTimeout(loadTours, 0); return () => { clearTimeout(timer); state.version++; }; }, [loadTours]);


  useEffect(()=>{
    if(!freshUntil || !tours.length)return;
    const timer=setTimeout(()=>{setTours([]);setError(staleResultsMessage);},Math.max(0,freshUntil-Date.now()));
    return ()=>clearTimeout(timer);
  },[freshUntil,tours]);
  const hasSearch=valid;
  const state=resultsState({valid,loading,error,count:visibleTours.length,rawCount:tours.length});
  return <><ConsumerMetadata pathname="/results" params={searchParams} destinations={destinations} /><Navbar /><main className="results-page" data-search-state={state}>
    {!hasSearch && <section className="catalogue-search"><h1>Найдите подходящий отель</h1><p>Укажите направление, дату, ночи и гостей.</p>{validation.message && <p role="alert">{validation.message}</p>}<HomeSearch destinations={destinations} catalogState={catalogState} /></section>}
    {hasSearch && <section className="results-shell">
      <ResultsHeader params={searchParams} destinations={destinations} />
      {provider==='hotelbeds' && import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED==='true' && <p className="results-test-note">Тестовые цены · бронирование отключено</p>}
      {!loading && !error && <ResultsToolbar total={tours.length} shown={visibleTours.length} activeCount={chips.length} sort={sortBy} local={localFilters} open={filtersOpen} triggerRef={filterTrigger} onOpen={()=>setFiltersOpen(true)} onSort={event=>setSearchParams(changePresentationFilter(searchParams,'sort',event.target.value))} />}
      <ResultsFilterChips items={chips} onRemove={key=>setSearchParams(changePresentationFilter(searchParams,key,''))} onReset={reset} />
      {loading && <div className="results-layout loading-layout" role="status" aria-label="Загрузка отелей"><div className="filter-skeleton" /><div className="results-skeleton-list">{[1,2,3].map(item=><div className="result-skeleton" key={item}><div /><section><i /><i /><i /><i /></section></div>)}</div></div>}
      {!loading && error && <ResultsNotice state="ERROR" stale={error===staleResultsMessage} params={searchParams} onRetry={()=>loadTours(true)} />}
      {!loading && !error && <div className="results-layout">
        <ResultsFilterPanel open={filtersOpen} onClose={closeFilters} shown={visibleTours.length} panelRef={filterPanel}>
          <ResultsFilters instant={localFilters} currency={currency} boards={boards} onApplied={closeFilters} />
        </ResultsFilterPanel>
        <div className="results-content">
          {visibleTours.length===0 ? <ResultsNotice state={filterEmpty?"FILTER_EMPTY":"PROVIDER_EMPTY"} catalogEmpty={catalogEmpty} params={searchParams} onReset={reset} /> : <>
            <div className="tour-grid">{visibleTours.map(tour=><TourCard key={`${tour.provider || 'hotel'}-${tour.providerHotelId || tour.id}`} tour={tour} />)}</div>
          </>}
        </div>
      </div>}
    </section>}
  </main><Footer /></>;
}
