import TestDestinationCards from './TestDestinationCards';
export default function PopularDestinations({destinations=[],catalogState='loading'}) {
  return <section id="popular" className="popular section">
    <span id="countries" aria-hidden="true" />
    <div className="section-header"><h2>Популярные направления</h2><p>Выберите место для следующего путешествия</p></div>
    {catalogState==='loading' ? <div className="destination-grid" role="status" aria-label="Загрузка направлений">
      {Array.from({length:5},(_,i)=><div key={i} className="destination-skeleton collection-pulse" aria-hidden="true" />)}
    </div> : catalogState==='error' ? <p className="home-catalog-message" role="status">Каталог временно недоступен. Попробуйте открыть страницу позже.</p>
      : destinations.length ? <div className="destination-grid"><TestDestinationCards destinations={destinations} /></div>
        : <p className="home-catalog-message">Направления скоро появятся в каталоге.</p>}
  </section>;
}
