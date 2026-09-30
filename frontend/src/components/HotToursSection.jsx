import { confirmedPriceDrop } from '../utils/hotTours';
import HotTourCard from './HotTourCard';
export default function HotToursSection({tours=[]}) {
  const confirmed=tours.filter(confirmedPriceDrop);
  if(!confirmed.length)return null;
  return <section id="offers" className="hot-tours"><div className="section-header"><h2>Горящие предложения: история цен</h2><p>Сохранённые предложения со снижением цены. Текущая доступность не проверяется при открытии страницы.</p></div><div className="collection-grid">{confirmed.map(tour=><HotTourCard key={tour.offerId} tour={tour} />)}</div></section>;
}
