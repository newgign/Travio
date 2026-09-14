import { useState } from 'react';
import { Link } from 'react-router-dom';
import { countryLabel, destinationLabel } from '../utils/testDestinationLabels';
import turkey from '../assets/images/turkey.png';
import egypt from '../assets/images/egypt.png';
import dubai from '../assets/images/dubai.png';
import thailand from '../assets/images/thailand.png';

const assets = {'TR:AYT':turkey,'EG:SSH':egypt,'AE:DXB':dubai,'TH:HKT':thailand};
function DestinationImage({src}) {
  const [failed,setFailed]=useState(false);
  return <div className="collection-image" style={{background:'linear-gradient(135deg, #e6eeed, #c5d6d5)',display:'grid',placeItems:'center',minHeight:180}}>
    {src && !failed ? <img src={src} alt="Иллюстрация направления" loading="lazy" onError={()=>setFailed(true)} /> : <span style={{color:'#345454'}}>Направление путешествия</span>}
  </div>;
}
export default function TestDestinationCards({destinations}) {
  return destinations.map(row => {
    const ready=row.hotelCount>0;
    const content=<><DestinationImage src={assets[`${row.countryCode}:${row.code}`]} /><div className="destination-caption"><span>{countryLabel(row.countryCode,row.countryName)}</span><h3>{destinationLabel(row)}</h3>{!ready && <p>отели пока не загружены</p>}</div></>;
    const query=new URLSearchParams({provider:'hotelbeds',countryCode:row.countryCode,destinationCode:row.code});
    return ready ? <Link key={`${row.countryCode}:${row.code}`} className="destination-card" to={`/results?${query}`}>{content}</Link> : <div key={`${row.countryCode}:${row.code}`} className="destination-card" aria-disabled="true">{content}</div>;
  });
}
