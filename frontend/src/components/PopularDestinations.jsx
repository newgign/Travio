import { Link } from "react-router-dom";
import { popularDestinations, catalogueLink } from "../data/popularDestinations";
import CollectionImage from "./CollectionImage";
import { useEffect, useState } from 'react';
import API_URL from '../services/api';
import TestDestinationCards from './TestDestinationCards';

function DestinationCard({ destination }) {
  const { country, city, image } = destination;
  const link = catalogueLink(destination);
  return <Link className="destination-card" to={link}>
    <CollectionImage src={image} alt={`${country}, ${city}${destination.illustration ? " — иллюстрация" : ""}`} />
    <div className="destination-caption"><span>{country}</span><h3>{city}</h3></div>
  </Link>;
}
export default function PopularDestinations() {
  const test = import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED === 'true';
  const [rows,setRows]=useState([]);
  const [state,setState]=useState('loading');
  useEffect(()=>{
    if (!test) return;
    const controller=new AbortController();
    fetch(`${API_URL}/catalog/test-options`,{signal:controller.signal}).then(async response=>{
      if (!response.ok) throw new Error('catalog');
      const data=await response.json();
      if (!controller.signal.aborted) {setRows(data.destinations||[]);setState('ready');}
    }).catch(()=>{if(!controller.signal.aborted)setState('error');});
    return ()=>controller.abort();
  },[test]);
  return <section id="popular" className="popular section">
    <div className="section-header"><h2>🌍 Популярные направления</h2><p>Выберите направление для следующего путешествия</p></div>
    {test && state !== 'ready' && <p>{state==='loading' ? 'Загрузка каталога…' : 'Каталог временно недоступен'}</p>}
    {test && state==='ready' && !rows.length && <p>Hotelbeds TEST каталог пока не загружен</p>}
    <div className="collection-grid">{test ? <TestDestinationCards destinations={rows} /> : popularDestinations.map((destination) => <DestinationCard key={`${destination.country}-${destination.city}`} destination={destination} />)}</div>
  </section>;
}
