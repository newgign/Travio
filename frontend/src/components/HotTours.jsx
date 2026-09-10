import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import HotTourCard from "./HotTourCard";
import API_URL from "../services/api";
export default function HotTours() {
  const [state, setState] = useState({ loading: true, error: false, tours: [] });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${API_URL}/special-offers`, { signal: controller.signal });
        if (!response.ok) throw new Error("Offers unavailable");
        const result = await response.json();
        if (!controller.signal.aborted) setState({ loading: false, error: false, tours: (result.data || []).filter(t => t.provider === "hotelbeds" && t.priceEnvironment === "live" && t.discountEvidence?.source === "price_history" && t.discountEvidence.originalPrice > t.price) });
      } catch {
        if (!controller.signal.aborted) setState({ loading: false, error: true, tours: [] });
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => { clearInterval(timer); controller.abort(); };
  }, []);
  return <section id="offers" className={`hot-tours${!state.loading && !state.error && !state.tours.length ? " hot-tours-empty" : ""}`} aria-busy={state.loading}>
    <div className="section-header"><h2>🔥 Горящие предложения</h2><p>Специальные предложения с подтверждённым снижением цены</p></div>
    {state.loading ? <div className="collection-grid" role="status" aria-label="Загружаем предложения">
      {[0,1,2].map(key => <div key={key} className="hot-tour-skeleton collection-pulse" aria-hidden="true"><div /><span /><span /><span /></div>)}
    </div> : state.error ? <div className="home-loading" role="status"><p>Не удалось загрузить предложения. Попробуйте позже.</p><Link className="collection-cta" to="/results">Посмотреть все предложения</Link></div>
      : state.tours.length ? <div className="collection-grid">{state.tours.map(tour => <HotTourCard key={tour.offerId} tour={tour} />)}</div>
        : <div className="home-loading" role="status"><p>Сейчас нет подтверждённых горящих предложений.</p><Link className="collection-cta" to="/results">Посмотреть все предложения</Link></div>}
  </section>;
}
