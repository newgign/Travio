import { BOARD_LABELS, normalizeBoardDisplay } from '../utils/hotelOfferDisplay';
import { resetOfferFilters } from '../utils/localOfferFilters';
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./ResultsFilters.css";

const FILTER_KEYS = ["maxPrice", "stars", "rating", "food", "nights", "beachLine", "roomType"];

export default function ResultsFilters({ currency = "EUR", boards, onApplied }) {
  const [searchParams] = useSearchParams();
  // Discard an old draft whenever navigation changes the authoritative query.
  return <ResultsFiltersForm key={searchParams.toString()} currency={currency} boards={boards} onApplied={onApplied} />;
}

function ResultsFiltersForm({ currency, boards, onApplied }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState(() => Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) || (key === "nights" ? "7" : "")])));

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function applyFilters(event) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams);
    FILTER_KEYS.forEach((key) => {
      const value = form[key];
      if (value) params.set(key, value); else params.delete(key);
    });
    if (form.nights !== (searchParams.get("nights") || "7")) params.delete("checkOut");
    params.set("page", "1");
    setSearchParams(params);
    onApplied?.();
  }

  function resetFilters() {
    const params = resetOfferFilters(searchParams);
    params.set("page", "1");
    setForm({ maxPrice: "", stars: "", rating: "", food: "", nights: searchParams.get("nights") || "7", beachLine: "", roomType: "" });
    setSearchParams(params);
    onApplied?.();
  }

  const activeCount = FILTER_KEYS.filter((key) => key !== "nights" && Boolean(form[key])).length + (form.nights && form.nights !== "7" ? 1 : 0);

  return (
    <aside className="results-filters-panel">
      <div className="filter-title-row"><div><h2>Фильтры</h2><p>Уточните подходящий вариант</p><small>Изменение числа ночей запускает новый поиск по датам.</small></div>{activeCount > 0 && <span>{activeCount}</span>}</div>
      <form onSubmit={applyFilters}>
        <div className="filter-block"><h3>Цена за весь период — до</h3><input className="filter-input" type="number" name="maxPrice" min="0" step="1" placeholder={`Например 500 ${currency}`} value={form.maxPrice} onChange={handleChange} /><small>В валюте поставщика: {currency}</small>{boards && <small>Лимит только в {currency}. При заданном лимите тарифы в других валютах скрыты. Конвертации нет.</small>}</div>
        <div className="filter-block"><h3>Категория отеля</h3><select className="filter-input" name="stars" value={form.stars} onChange={handleChange}><option value="">Любая</option><option value="3">3★ и выше</option><option value="4">4★ и выше</option><option value="5">5★</option></select></div>
        <div className="filter-block"><h3>Рейтинг гостей</h3><select className="filter-input" name="rating" value={form.rating} onChange={handleChange}><option value="">Любой</option><option value="4">4.0 и выше</option><option value="4.5">4.5 и выше</option><option value="4.8">4.8 и выше</option></select></div>
        <div className="filter-block"><h3>Питание</h3><select className="filter-input" name="food" value={form.food} onChange={handleChange}><option value="">Любое</option>{(boards || Object.keys(BOARD_LABELS).map(code => ({code}))).map(board => <option key={board.code} value={board.code}>{normalizeBoardDisplay(board.code,board.name)}</option>)}</select></div>
        <div className="filter-block"><h3>Ночей</h3><select className="filter-input" name="nights" value={form.nights} onChange={handleChange}>{!['1','3','5','7','10','12','14','21'].includes(form.nights) && <option value={form.nights}>{form.nights} ночей</option>}<option value="1">1 ночь</option><option value="3">3 ночи</option><option value="5">5 ночей</option><option value="7">7 ночей</option><option value="10">10 ночей</option><option value="12">12 ночей</option><option value="14">14 ночей</option><option value="21">21 ночь</option></select></div>
        <div className="filter-block"><h3>Береговая линия</h3><select className="filter-input" name="beachLine" value={form.beachLine} onChange={handleChange}><option value="">Любая</option><option value="1">1-я линия</option><option value="2">1–2 линия</option></select></div>
        <div className="filter-block"><h3>Номер / тариф</h3><input className="filter-input" type="text" name="roomType" placeholder="Например Superior" value={form.roomType} onChange={handleChange} /></div>
        <button className="filter-apply" type="submit">Показать предложения</button>
        <button className="filter-reset" type="button" onClick={resetFilters}>Сбросить фильтры</button>
      </form>
    </aside>
  );
}
