import { Link } from 'react-router-dom';
import useHomeLoad from '../hooks/useHomeLoad';
import { loadHomeSpecials } from '../services/homeCatalog';
import { confirmedPriceDrop } from '../utils/hotTours';
import HotToursSection from './HotToursSection';

export function HotToursView({status,items=[],onRetry}) {
  if(status==='ready' && items.some(confirmedPriceDrop)) return <HotToursSection tours={items} />;
  return <section id="offers" className="hot-tours hot-tours-empty">
    <div className="section-header"><h2>Предложения со снижением цены</h2><p>Только сравнения, подтверждённые сохранённой историей цен.</p></div>
    {status==='error' ? <div className="home-catalog-message"><p role="alert">Не удалось загрузить предложения. Попробуйте ещё раз.</p><button className="collection-cta" type="button" onClick={onRetry} disabled={typeof onRetry!=='function'}>Повторить загрузку предложений</button></div>
      : status!=='ready' ? <div className="collection-grid" role="status" aria-busy="true" aria-label="Загрузка предложений">{[1,2,3].map(id=><div key={id} className="hot-tour-skeleton collection-pulse" aria-hidden="true"><div /><span /><span /></div>)}</div>
        : <div className="home-loading"><p>Сейчас нет предложений с подтверждённым снижением цены. Это не означает, что отелей нет в поиске.</p><Link className="collection-cta" to="/#home-search">Перейти к поиску</Link></div>}
  </section>;
}
export default function HotTours() {
  const state=useHomeLoad(loadHomeSpecials);
  return <HotToursView {...state} />;
}
