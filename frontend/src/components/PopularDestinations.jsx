import TestDestinationCards from './TestDestinationCards';
export default function PopularDestinations({destinations=[],catalogState='loading',onRetry}) {
  return <section id="popular" className="popular section">
    <span id="countries" aria-hidden="true" />
    <div className="section-header"><h2>Направления по странам</h2><p>Выберите направление из загруженного каталога. Затем укажите даты и гостей — поиск начнётся только после отправки формы.</p></div>
    {!['ready','error'].includes(catalogState) ? <div className="destination-grid" role="status" aria-busy="true" aria-label="Загрузка направлений">
      {Array.from({length:5},(_,i)=><div key={i} className="destination-skeleton collection-pulse" aria-hidden="true" />)}
    </div> : catalogState==='error' ? <div className="home-catalog-message"><p role="alert">Каталог временно недоступен. Попробуйте ещё раз.</p><button type="button" className="collection-cta" disabled={typeof onRetry !== 'function'} onClick={onRetry}>Повторить загрузку направлений</button></div>
      : destinations.length ? <div className="destination-grid"><TestDestinationCards destinations={destinations} /></div>
        : <p className="home-catalog-message">В загруженном каталоге пока нет направлений.</p>}
  </section>;
}
