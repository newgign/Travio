export default function ResultsFilterChips({items,onRemove,onReset}) {
  if(!items.length)return null;
  return <div className="results-context" aria-label="Активные фильтры">{items.map(item=><button type="button" key={item.key} className="context-chip" aria-label={`Убрать фильтр: ${item.label}`} onClick={()=>onRemove(item.key)}>{item.label}<span aria-hidden="true">×</span></button>)}<button type="button" className="results-reset-all" onClick={onReset}>Сбросить фильтры</button></div>;
}
