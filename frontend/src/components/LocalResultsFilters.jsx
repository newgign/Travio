import { useSearchParams } from 'react-router-dom';
import { BOARD_LABELS, normalizeBoardDisplay } from '../utils/hotelOfferDisplay';
import { resetOfferFilters } from '../utils/localOfferFilters';
import { changePresentationFilter } from '../utils/resultsPresentation';
export default function LocalResultsFilters({currency,boards}) {
  const [params,setParams]=useSearchParams();
  const change=event=>setParams(changePresentationFilter(params,event.target.name,event.target.value));
  const field=(name,label,control)=><div className="filter-block"><label htmlFor={`filter-${name}`}>{label}</label>{control}</div>;
  const props=name=>({id:`filter-${name}`,name,className:'filter-input',value:params.get(name)||'',onChange:change});
  return <aside className="results-filters-panel"><div className="filter-title-row"><h2>Фильтры</h2></div>
    {field('maxPrice','Цена за весь период — до',<><input {...props('maxPrice')} type="number" min="0" step="1" placeholder={`Сумма в ${currency}`} /><small>Лимит только в {currency}. При заданном лимите тарифы в других валютах скрыты. Конвертации нет.</small></>)}
    {field('stars','Категория отеля',<select {...props('stars')}><option value="">Любая</option><option value="3">3★ и выше</option><option value="4">4★ и выше</option><option value="5">5★</option></select>)}
    {field('food','Питание',<select {...props('food')}><option value="">Любое</option>{(boards || Object.keys(BOARD_LABELS).map(code=>({code}))).map(board=><option key={board.code} value={board.code}>{normalizeBoardDisplay(board.code,board.name)}</option>)}</select>)}
    {field('roomType','Номер / тариф',<input {...props('roomType')} type="text" placeholder="Например Superior" />)}
    <div className="filters-secondary"><h3>Дополнительно</h3>
      {field('rating','Рейтинг гостей',<select {...props('rating')}><option value="">Любой</option><option value="4">4.0 и выше</option><option value="4.5">4.5 и выше</option><option value="4.8">4.8 и выше</option></select>)}
      {field('beachLine','Береговая линия',<select {...props('beachLine')}><option value="">Любая</option><option value="1">1-я линия</option><option value="2">2-я линия</option></select>)}
    </div>
    <button type="button" className="filter-reset" onClick={()=>setParams(resetOfferFilters(params))}>Сбросить фильтры</button>
  </aside>;
}
