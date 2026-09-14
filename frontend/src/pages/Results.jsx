import { countryLabel } from '../utils/testDestinationLabels';
import { providerQuery, filterOffers, resetOfferFilters, filterEmptyMessage } from '../utils/localOfferFilters';
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import SearchBar from "../components/SearchBar";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import TourCard from "../components/TourCard";
import ResultsFilters from "../components/ResultsFilters";
import API_URL from '../services/api';
import { destinationTitle } from '../utils/destinationTitle';
import { useRef } from 'react';
import { catalogEmptyMessage, noRatesMessage } from '../utils/catalogUx';
import { searchTours } from "../services/tourService";
import "../styles/Results.css";

const FOOD_LABELS = {
  RO: "Без питания",
  BB: "Завтрак",
  HB: "Полупансион",
  FB: "Полный пансион",
  AI: "All Inclusive",
};

function pluralGuests(value) {
  const count = Number(value) || 0;
  return `${count} ${count === 1 ? "гость" : count >= 2 && count <= 4 ? "гостя" : "гостей"}`;
}

export default function Results() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tours, setTours] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, pages: 1, provider: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogEmpty, setCatalogEmpty] = useState(false);
  const requestVersion = useRef({version:0});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [destinations, setDestinations] = useState([]);
  useEffect(() => {
    if (!searchParams.get('destinationCode') || searchParams.get('stagingTestHotel')) return;
    const controller = new AbortController();
    fetch(`${API_URL}/catalog/test-options`, {signal:controller.signal}).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!controller.signal.aborted) setDestinations(data.destinations || []);
    }).catch(() => { /* A missing catalog name never becomes a guessed title. */ });
    return () => controller.abort();
  }, [searchParams]);

  const sortBy = searchParams.get("sort") || "priceAsc";
  const provider = searchParams.get("provider") || "hotelbeds";
  const localFilters = import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED === 'true' && provider === 'hotelbeds';
  const requestQuery = providerQuery(searchParams, localFilters);
  const visibleTours = localFilters ? filterOffers(tours, searchParams) : tours;
  const filterEmpty = localFilters && tours.length > 0 && visibleTours.length === 0;
  const currency = tours[0]?.currency || (provider === "hotelbeds" ? "EUR" : "KZT");

  const activeFilters = useMemo(() => {
    const items = [];
    const country = searchParams.get("country") || searchParams.get("countryCode");
    const city = searchParams.get("city");
    const departureDate = searchParams.get("departureDate") || searchParams.get("checkIn");
    const nights = searchParams.get("nights");
    const people = searchParams.get("adults") || searchParams.get("people");
    const children = Number(searchParams.get("children") || 0);
    const food = searchParams.get("food");
    const stars = searchParams.get("stars");
    const rating = searchParams.get("rating");
    const roomType = searchParams.get("roomType");
    const beachLine = searchParams.get("beachLine");
    const maxPrice = searchParams.get("maxPrice");

    if (country) items.push({ key: "country", label: `🌍 ${countryLabel(country)}`, locked: true });
    if (city) items.push({ key: "city", label: `📍 ${city}` });
    if (departureDate) items.push({ key: "departureDate", label: `📅 ${new Date(`${departureDate}T00:00:00`).toLocaleDateString("ru-RU")}`, locked: true });
    if (nights) items.push({ key: "nights", label: `🌙 ${nights} ночей`, locked: true });
    if (people) items.push({ key: "people", label: `👥 ${pluralGuests(people)}`, locked: true });
    if (children > 0) items.push({ key: "children", label: `👶 ${children} дет.` , locked: true });
    if (food) items.push({ key: "food", label: `🍽 ${FOOD_LABELS[food] || food}` });
    if (stars) items.push({ key: "stars", label: `⭐ ${stars}★+` });
    if (rating) items.push({ key: "rating", label: `👍 рейтинг ${rating}+` });
    if (roomType) items.push({ key: "roomType", label: `🛏 ${roomType}` });
    if (beachLine) items.push({ key: "beachLine", label: `🌊 ${beachLine}-я линия` });
    if (maxPrice) items.push({ key: "maxPrice", label: `💰 до ${maxPrice} ${currency}` });
    return items;
  }, [searchParams, currency]);

  const loadTours = useCallback(async () => {
    const version=++requestVersion.current.version;
    const filters = JSON.parse(requestQuery);
    if (provider === "hotelbeds" && !filters.departureDate && !filters.checkIn) { setTours([]); setLoading(false); return; }
    try {
      setLoading(true);
      setError("");
      setCatalogEmpty(false);
      const result = await searchTours(filters);
      if (version !== requestVersion.current.version) return;
      setTours(Array.isArray(result?.data) ? result.data : []);
      setMeta({
        page: Number(result?.meta?.page) || 1,
        limit: Number(result?.meta?.limit) || 20,
        total: Number(result?.meta?.total) || 0,
        pages: Number(result?.meta?.pages) || 1,
        provider: result?.meta?.provider || provider,
      });
    } catch (err) {
      if (version !== requestVersion.current.version) return;
      console.error("Ошибка загрузки результатов:", err);
      setTours([]);
      if (err.code === 'TEST_CATALOG_EMPTY') { setCatalogEmpty(true); setError(''); setMeta({page:1,limit:20,total:0,pages:1,provider}); }
      else setError(err.message || "Не удалось загрузить предложения.");
    } finally {
      if (version === requestVersion.current.version) setLoading(false);
    }
  }, [provider, requestQuery]);

  useEffect(() => { const state = requestVersion.current; const timer = setTimeout(loadTours, 0); return () => { clearTimeout(timer); state.version++; }; }, [loadTours]);

  function handleSortChange(event) {
    const params = new URLSearchParams(searchParams);
    params.set("sort", event.target.value);
    params.set("page", "1");
    setSearchParams(params);
  }

  function removeFilter(key) {
    const params = new URLSearchParams(searchParams);
    params.delete(key);
    if (key === "children") params.delete("childrenAges");
    params.set("page", "1");
    setSearchParams(params);
  }

  function changePage(page) {
    if (page < 1 || page > meta.pages || page === meta.page) return;
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <Navbar />
      <main className="results-page">
        {provider === "hotelbeds" && !searchParams.get("departureDate") && !searchParams.get("checkIn") && <section className="catalogue-search"><h1>Найдите подходящий отдых</h1><p>Укажите направление, даты и гостей для проверки доступности.</p><SearchBar /></section>}
        {(provider !== "hotelbeds" || searchParams.get("departureDate") || searchParams.get("checkIn")) && <section className="results-shell">
          <div className="results-top">
            <div>
              <span className="results-kicker">SPRINT 3A · PRODUCT EXPERIENCE</span>
              <h1>{destinationTitle(searchParams, destinations)}</h1>
              <p>Найдено <strong>{meta.total}</strong> предложений{localFilters ? ' · Hotelbeds TEST · бронирование отключено' : ' · цены можно уточнить перед бронированием'}</p>
              {provider === "hotelbeds" && (
                <div className="live-provider-badge"><span>●</span> Проживание в отеле · перелёт не включён</div>
              )}
            </div>

            <div className="results-actions">
              <button type="button" className="mobile-filter-button" onClick={() => setFiltersOpen(true)}>
                ☰ Фильтры
              </button>
              <label className="sort-control">
                <span>Сортировка</span>
                <select value={sortBy} onChange={handleSortChange}>
                  <option value="priceAsc">Сначала дешевле</option>
                  <option value="priceDesc">Сначала дороже</option>
                  <option value="stars">По звёздам</option>
                  <option value="rating">По рейтингу</option>
                </select>
              </label>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="results-context" aria-label="Параметры поиска">
              {activeFilters.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`context-chip ${item.locked ? "locked" : ""}`}
                  onClick={() => !item.locked && removeFilter(item.key)}
                  title={item.locked ? "Параметр исходного поиска" : "Убрать фильтр"}
                >
                  {item.label}{!item.locked && <span>×</span>}
                </button>
              ))}
            </div>
          )}

          <button type="button" className="filter-reset" onClick={() => setSearchParams(resetOfferFilters(searchParams))}>Сбросить фильтры</button>

          {loading && (
            <div className="results-layout loading-layout">
              <div className="filter-skeleton" />
              <div className="results-skeleton-list">
                {[1, 2, 3].map((item) => <div className="result-skeleton" key={item}><div /><section><i /><i /><i /><i /></section></div>)}
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="no-results"><h2>Не удалось выполнить поиск</h2><p>{error}</p><button type="button" onClick={loadTours}>Попробовать ещё раз</button></div>
          )}

          {!loading && !error && (
            <div className="results-layout">
              <div className={`filters-desktop-wrap ${filtersOpen ? "mobile-open" : ""}`}>
                <button type="button" className="filters-backdrop" aria-label="Закрыть фильтры" onClick={() => setFiltersOpen(false)} />
                <div className="filters-drawer">
                  <div className="filters-mobile-head"><strong>Фильтры</strong><button type="button" onClick={() => setFiltersOpen(false)}>×</button></div>
                  <ResultsFilters key={searchParams.toString()} currency={currency} onApplied={() => setFiltersOpen(false)} />
                </div>
              </div>

              <div className="results-content">
                <div className="results-content-head">
                  <span>{`Показано ${visibleTours.length} из ${meta.total}`}</span>
                  <span>Страница {meta.page} / {meta.pages}</span>
                </div>

                {visibleTours.length === 0 ? (
                  <div className="no-results"><h2>{catalogEmpty ? catalogEmptyMessage : filterEmpty ? filterEmptyMessage : noRatesMessage}</h2><p>{catalogEmpty ? 'Выберите другое готовое направление.' : 'Измените дату, питание, категорию или диапазон цены.'}</p></div>
                ) : (
                  <>
                    <div className="tour-grid">
                      {visibleTours.map((tour) => <TourCard key={`${tour.provider || "hotel"}-${tour.providerHotelId || tour.id}`} tour={tour} />)}
                    </div>
                    {meta.pages > 1 && (
                      <div className="results-pagination">
                        <button type="button" disabled={meta.page <= 1} onClick={() => changePage(meta.page - 1)}>← Назад</button>
                        <span>Страница <strong>{meta.page}</strong> из <strong>{meta.pages}</strong></span>
                        <button type="button" disabled={meta.page >= meta.pages} onClick={() => changePage(meta.page + 1)}>Далее →</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>}
      </main>
      <Footer />
    </>
  );
}
