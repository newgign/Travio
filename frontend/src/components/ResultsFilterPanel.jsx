import { hotelCount } from '../utils/resultsPresentation';
export default function ResultsFilterPanel({open,onClose,shown,children,panelRef}) {
  function keyboard(event) {
    if(!open)return;
    if(event.key==='Escape'){event.preventDefault();onClose();}
    if(event.key==='Tab'){
      const controls=[...event.currentTarget.querySelectorAll('button, input, select, summary, a[href]')].filter(node=>!node.disabled && node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey && event.target===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && event.target===last){event.preventDefault();first?.focus();}
    }
  }
  return <div className={`filters-desktop-wrap ${open?'mobile-open':''}`}>
    <button type="button" className="filters-backdrop" aria-label="Закрыть фильтры" tabIndex={-1} onClick={onClose} />
    <div id="results-filter-panel" ref={panelRef} className="filters-drawer" role={open?'dialog':undefined} aria-modal={open?true:undefined} aria-label="Фильтры отелей" onKeyDown={keyboard}>
      <div className="filters-mobile-head"><strong>Фильтры</strong><button type="button" aria-label="Закрыть фильтры" onClick={onClose}>×</button></div>
      {children}<button type="button" className="filters-mobile-done" onClick={onClose}>Показать {hotelCount(shown)}</button>
    </div></div>;
}
