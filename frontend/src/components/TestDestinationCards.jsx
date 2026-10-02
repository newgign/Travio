import { useState } from 'react';
import { Link } from 'react-router-dom';
import { countryLabel, destinationLabel } from '../utils/testDestinationLabels';
import turkey from '../assets/images/turkey.png';
import egypt from '../assets/images/egypt.png';
import dubai from '../assets/images/dubai.png';
import thailand from '../assets/images/thailand.png';

const assets = {'TR:AYT':turkey,'EG:SSH':egypt,'AE:DXB':dubai,'TH:HKT':thailand};
function DestinationImage({src,label}) {
  const [failed,setFailed]=useState(false);
  return <div className={`collection-image${!src || failed ? ' destination-art-fallback' : ''}`}>
    {src && !failed ? <img src={src} alt={`Иллюстрация направления: ${label}`} loading="lazy" decoding="async" onError={()=>setFailed(true)} /> : <span className="destination-art-label">Направление путешествия</span>}
  </div>;
}
export default function TestDestinationCards({destinations}) {
  return destinations.map(row => {
    const ready=row.hotelCount>0;
    const content=<><DestinationImage key={`${row.countryCode}:${row.code}`} src={assets[`${row.countryCode}:${row.code}`]} label={destinationLabel(row)} /><div className="destination-caption"><span>{countryLabel(row.countryCode,row.countryName)}</span><h3>{destinationLabel(row)}</h3>{ready ? <p>Выбрать даты и гостей</p> : <p>отели пока не загружены</p>}</div></>;
    const query=new URLSearchParams({provider:'hotelbeds',countryCode:row.countryCode,destinationCode:row.code});
    return ready ? <Link key={`${row.countryCode}:${row.code}`} className="destination-card" to={`/results?${query}`}>{content}</Link> : <div key={`${row.countryCode}:${row.code}`} className="destination-card" aria-disabled="true">{content}</div>;
  });
}
