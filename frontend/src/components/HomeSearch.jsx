import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { countryLabel, destinationLabel } from '../utils/testDestinationLabels';
import { buildHomeSearch, destinationKey, guestLabel, initialHomeSearch, nightLabel } from '../utils/homeSearch';
import GuestPanel from './GuestPanel';
import { beginResultsSearch } from '../services/resultsSearch';
import './HomeSearch.css';

export default function HomeSearch({destinations=[],catalogState='loading'}) {
  const [params]=useSearchParams();
  return <HomeSearchForm key={params.toString()} params={params} destinations={destinations} catalogState={catalogState} />;
}
function HomeSearchForm({params,destinations,catalogState}) {
  const [form,setForm]=useState(()=>initialHomeSearch(params));
  const [errors,setErrors]=useState({});
  const [open,setOpen]=useState(false);
  const [minimumDate]=useState(()=>new Date(Date.now()+86400000).toISOString().slice(0,10));
  const trigger=useRef(null);
  const navigate=useNavigate();
  const test=import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED==='true';
  const diagnostic=test && params.get('stagingTestHotel')==='3424';
  const close=()=>{setOpen(false);trigger.current?.focus();};
  const change=event=>{setForm({...form,[event.target.name]:event.target.value});setErrors({});};
  const error=field=>errors[field] && <small className="home-field-error" id={`home-error-${field}`}>{errors[field]}</small>;
  function submit(event) {
    event.preventDefault();
    const result=buildHomeSearch(form,destinations,diagnostic);
    setErrors(result.errors);
    if(result.url) {beginResultsSearch(result.url);navigate(result.url);}
    else {if(result.errors.guests)setOpen(true);event.currentTarget.querySelector(`[name="${Object.keys(result.errors)[0]}"]`)?.focus();}
  }
  return <div className="home-search-wrap">
    {diagnostic && <div className="home-diagnostic">TEST / diagnostic: отель 3424 · 1 номер</div>}
    <form id="home-search" className="home-search-surface" aria-label="Поиск отелей" onSubmit={submit} noValidate>
      <div className="home-search-field"><label htmlFor="home-destination">Куда</label>
        <select id="home-destination" name="destination" value={form.destination} onChange={change} disabled={diagnostic || catalogState!=='ready'} aria-invalid={!!errors.destination} aria-describedby={errors.destination?'home-error-destination':undefined}>
          <option value="">{diagnostic?'Диагностический поиск':catalogState==='loading'?'Загрузка направлений…':'Выберите направление'}</option>
          {destinations.filter(row=>row.hotelCount>0).map(row=><option key={destinationKey(row)} value={destinationKey(row)}>{destinationLabel(row)}, {countryLabel(row.countryCode,row.countryName)}</option>)}
        </select>{error('destination')}
        {catalogState==='error' && <small role="status">Каталог временно недоступен</small>}
        {catalogState==='ready' && !destinations.some(row=>row.hotelCount>0) && <small>Доступных направлений пока нет</small>}
      </div>
      <div className="home-search-field"><label htmlFor="home-checkIn">Дата заезда</label><input type="date" id="home-checkIn" name="checkIn" min={minimumDate} value={form.checkIn} onChange={change} aria-invalid={!!errors.checkIn} aria-describedby={errors.checkIn?'home-error-checkIn':undefined} />{error('checkIn')}</div>
      <div className="home-search-field"><label htmlFor="home-nights">Ночей</label><select id="home-nights" name="nights" value={form.nights} onChange={change} aria-invalid={!!errors.nights} aria-describedby={errors.nights?'home-error-nights':undefined}>{Array.from({length:14},(_,i)=><option key={i+1} value={i+1}>{nightLabel(i+1)}</option>)}</select>{error('nights')}</div>
      <div className="home-search-field home-guests" onKeyDown={event=>{if(event.key==='Escape'){close();event.stopPropagation();}}}>
        <label htmlFor="home-guests">Гости</label><button ref={trigger} id="home-guests" name="guests" type="button" aria-expanded={open} aria-controls="home-guest-panel" aria-invalid={!!errors.guests} aria-describedby={errors.guests?'home-error-guests':undefined} onClick={()=>setOpen(!open)}>{guestLabel(form.adults,form.children)}<span aria-hidden="true">⌄</span></button>
        {open && <GuestPanel form={form} onChange={value=>{setForm(value);setErrors({});}} onClose={close} />}{error('guests')}
      </div>
      <button type="submit" className="home-search-submit" disabled={!diagnostic && (catalogState!=='ready' || !destinations.some(row=>row.hotelCount>0))}>Найти отели</button>
    </form>
    <div className="home-search-note">{test?'Тестовый поиск · реальное бронирование и оплата отключены':'Выбирайте из направлений загруженного каталога.'}</div>
  </div>;
}
