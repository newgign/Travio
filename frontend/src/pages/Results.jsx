import { providerQuery, filterOffers, resetOfferFilters, filterEmptyMessage, localPriceCurrency } from '../utils/localOfferFilters';
import { activeFilterChips, changePresentationFilter } from '../utils/resultsPresentation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ConsumerMetadata from '../components/ConsumerMetadata';
import TourCard from '../components/TourCard';
import ResultsFilters from '../components/ResultsFilters';
import ResultsHeader from '../components/ResultsHeader';
import ResultsToolbar from '../components/ResultsToolbar';
import ResultsFilterChips from '../components/ResultsFilterChips';
import ResultsFilterPanel from '../components/ResultsFilterPanel';
import API_URL from '../services/api';
import { catalogEmptyMessage, noRatesMessage } from '../utils/catalogUx';
import { searchTours } from '../services/tourService';
import '../styles/Results.css';

export default function Results() {
  const [searchParams,setSearchParams]=useSearchParams();
  const [tours,setTours]=useState([]);
  const [meta,setMeta]=useState({page:1,limit:20,total:0,pages:1,provider:null});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [catalogEmpty,setCatalogEmpty]=useState(false);
  const requestVersion=useRef({version:0});
  const [filtersOpen,setFiltersOpen]=useState(false);
  const filterTrigger=useRef(null);
  const filterPanel=useRef(null);
  const [destinations,setDestinations]=useState([]);
  const destinationCode=searchParams.get('destinationCode');
  const diagnostic=searchParams.get('stagingTestHotel');
  useEffect(()=>{
    if(!destinationCode || diagnostic)return;
    const controller=new AbortController();
    fetch(`${API_URL}/catalog/test-options`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)return;
      const data=await response.json();
      if(!controller.signal.aborted)setDestinations(data.destinations || []);
    }).catch(()=>{});
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
  const sortBy=searchParams.get('sort') || 'priceAsc';
  const provider=searchParams.get('provider') || 'hotelbeds';
  const localFilters=import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED==='true' && provider==='hotelbeds';
  const requestQuery=providerQuery(searchParams,localFilters);
  const visibleTours=localFilters ? filterOffers(tours,searchParams) : tours;
  const filterEmpty=localFilters && tours.length>0 && visibleTours.length===0;
  const currency=localFilters ? localPriceCurrency(tours) : tours[0]?.currency || (provider==='hotelbeds'?'EUR':'KZT');
  const boards=localFilters ? [...new Map(tours.flatMap(tour=>tour.candidateOffers || [tour]).filter(tour=>tour.boardCode).map(tour=>[tour.boardCode,{code:tour.boardCode,name:tour.boardName}])).values()] : undefined;
  const chips=activeFilterChips(searchParams,currency,boards);
  const reset=()=>setSearchParams(resetOfferFilters(searchParams));

  const loadTours = useCallback(async () => {
    const version=++requestVersion.current.version;
    const filters = JSON.parse(requestQuery);
    if (provider === "hotelbeds" && !filters.departureDate && !filters.checkIn) { setTours([]); setLoading(false); return; }
    try {
      setLoading(true);
      setError("");
      setCatalogEmpty(false);
      const result = await searchTours(filters);
      if (version !== requestVersion.current.version) return;
      setTours(Array.isArray(result?.data) ? result.data : []);
      setMeta({
        page: Number(result?.meta?.page) || 1,
        limit: Number(result?.meta?.limit) || 20,
        total: Number(result?.meta?.total) || 0,
        pages: Number(result?.meta?.pages) || 1,
        provider: result?.meta?.provider || provider,
      });
    } catch (err) {
      if (version !== requestVersion.current.version) return;
      console.error("Ошибка загрузки результатов:", err);
      setTours([]);
      if (err.code === 'TEST_CATALOG_EMPTY') { setCatalogEmpty(true); setError(''); setMeta({page:1,limit:20,total:0,pages:1,provider}); }
      else if (err.code === 'HOTELBEDS_AUTH_BLOCKED') setError('Hotelbeds TEST временно недоступен. Последняя проверка доступа завершилась ошибкой авторизации.');
      else if (err.code === 'HOTELBEDS_ACCESS_UNAVAILABLE') setError('Hotelbeds TEST временно недоступен. Повторите поиск позже.');
      else if (err.code === 'HOTELBEDS_UNKNOWN_BLOCKED') setError('Hotelbeds TEST временно недоступен. Доступ к Availability ещё не подтверждён контрольной проверкой.');
      else setError(err.message || "Не удалось загрузить предложения.");
    } finally {
      if (version === requestVersion.current.version) setLoading(false);
    }
  }, [provider, requestQuery]);

  useEffect(() => { const state = requestVersion.current; const timer = setTimeout(loadTours, 0); return () => { clearTimeout(timer); state.version++; }; }, [loadTours]);


  function changePage(page) {
    if(page<1 || page>meta.pages || page===meta.page)return;
    const params=new URLSearchParams(searchParams);params.set('page',String(page));setSearchParams(params);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  const hasSearch=provider!=='hotelbeds' || searchParams.get('departureDate') || searchParams.get('checkIn');
  return <><ConsumerMetadata pathname="/results" params={searchParams} destinations={destinations} /><Navbar /><main className="results-page">
    {!hasSearch && <section className="catalogue-search"><h1>Найдите подходящий отель</h1><p>Укажите направление, дату, ночи и гостей.</p><SearchBar /></section>}
    {hasSearch && <section className="results-shell">
      <ResultsHeader params={searchParams} destinations={destinations} />
      {localFilters && <p className="results-test-note">Тестовые цены · бронирование отключено</p>}
      {!loading && !error && <ResultsToolbar total={meta.total} shown={visibleTours.length} activeCount={chips.length} sort={sortBy} local={localFilters} open={filtersOpen} triggerRef={filterTrigger} onOpen={()=>setFiltersOpen(true)} onSort={event=>setSearchParams(changePresentationFilter(searchParams,'sort',event.target.value))} />}
      <ResultsFilterChips items={chips} onRemove={key=>setSearchParams(changePresentationFilter(searchParams,key,''))} onReset={reset} />
      {loading && <div className="results-layout loading-layout" role="status" aria-label="Загрузка отелей"><div className="filter-skeleton" /><div className="results-skeleton-list">{[1,2,3].map(item=><div className="result-skeleton" key={item}><div /><section><i /><i /><i /><i /></section></div>)}</div></div>}
      {!loading && error && <div className="no-results" role="alert"><h2>Не удалось выполнить поиск</h2><p>{error}</p><button type="button" onClick={loadTours}>Попробовать ещё раз</button></div>}
      {!loading && !error && <div className="results-layout">
        <ResultsFilterPanel open={filtersOpen} onClose={closeFilters} shown={visibleTours.length} panelRef={filterPanel}>
          <ResultsFilters instant={localFilters} currency={currency} boards={boards} onApplied={closeFilters} />
        </ResultsFilterPanel>
        <div className="results-content">
          {visibleTours.length===0 ? <div className="no-results"><h2>{catalogEmpty?catalogEmptyMessage:filterEmpty?filterEmptyMessage:noRatesMessage}</h2><p>{catalogEmpty?'Выберите другое готовое направление.':filterEmpty?'Попробуйте изменить или сбросить фильтры.':'Попробуйте другие даты или направление.'}</p>{filterEmpty && <button type="button" onClick={reset}>Сбросить фильтры</button>}</div> : <>
            <div className="tour-grid">{visibleTours.map(tour=><TourCard key={`${tour.provider || 'hotel'}-${tour.providerHotelId || tour.id}`} tour={tour} />)}</div>
            {meta.pages>1 && <div className="results-pagination"><button type="button" disabled={meta.page<=1} onClick={()=>changePage(meta.page-1)}>← Назад</button><span>Страница <strong>{meta.page}</strong> из <strong>{meta.pages}</strong></span><button type="button" disabled={meta.page>=meta.pages} onClick={()=>changePage(meta.page+1)}>Далее →</button></div>}
          </>}
        </div>
      </div>}
    </section>}
  </main><Footer /></>;
}
