import { hotelCount } from '../utils/resultsPresentation';
export default function ResultsToolbar({total,shown,activeCount,sort,local,open,onOpen,onSort,triggerRef}) {
  return <div className="results-toolbar"><div className="results-count" aria-live="polite"><strong>Найдено {hotelCount(total)}</strong>{activeCount>0 && <span>Показано {shown} из {total} после фильтров</span>}<small>Среди загруженных результатов</small></div>
    <div className="results-actions"><button ref={triggerRef} type="button" className="mobile-filter-button" aria-expanded={open} aria-controls="results-filter-panel" onClick={onOpen}>Фильтры{activeCount>0?` (${activeCount})`:''}</button>
      <label className="sort-control" htmlFor="results-sort"><span>Сортировка</span><select id="results-sort" name="sort" value={sort} onChange={onSort}><option value="default">По умолчанию</option><option value="priceAsc">Сначала дешевле</option><option value="priceDesc">Сначала дороже</option>{local && <option value="pricePerNight">Цена за ночь</option>}<option value="stars">Категория отеля</option>{local && <option value="name">Название A–Z</option>}<option value="rating">По рейтингу</option></select></label>
    </div></div>;
}
