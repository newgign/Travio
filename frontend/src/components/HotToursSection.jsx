import HotTourCard from './HotTourCard';
export default function HotToursSection({tours=[]}) {
  const confirmed=tours.filter(t=>t.provider==='hotelbeds' && t.priceEnvironment==='live' && t.discountEvidence?.source==='price_history' && t.discountEvidence.originalPrice>t.price);
  if(!confirmed.length)return null;
  return <section id="offers" className="hot-tours"><div className="section-header"><h2>Горящие предложения</h2><p>Предложения с подтверждённым снижением цены</p></div><div className="collection-grid">{confirmed.map(tour=><HotTourCard key={tour.offerId} tour={tour} />)}</div></section>;
}
