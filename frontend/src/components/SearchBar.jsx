import { useState } from "react";
import { useNavigate } from "react-router-dom";

import "./SearchBar.css";

export default function SearchBar() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    country: "",
    departureDate: "",
    people: 2,
    children: 0,
    childrenAges: [],
    nights: 7,
    food: "",
    stars: "",
  });

  const [error, setError] = useState("");

  const today = new Date().toISOString().split("T")[0];

  function handleChange(event) {
    const { name, value } = event.target;

    if (name === "children") {
      const children = Math.max(Number(value) || 0, 0);

      setFilters((prev) => ({
        ...prev,
        children,
        childrenAges: Array.from(
          { length: children },
          (_, index) => prev.childrenAges[index] ?? 7
        ),
      }));

      if (error) {
        setError("");
      }

      return;
    }

    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  }

  function handleChildAge(index, value) {
    setFilters((prev) => ({
      ...prev,
      childrenAges: prev.childrenAges.map((age, ageIndex) =>
        ageIndex === index ? Number(value) : age
      ),
    }));
  }

  function handleSearch(event) {
    event.preventDefault();

    if (!filters.country) {
      setError("Выберите страну для поиска реальных предложений.");
      return;
    }

    if (!filters.departureDate) {
      setError("Выберите дату заезда.");
      return;
    }

    const params = new URLSearchParams();

    params.set("provider", "hotelbeds");
    params.set("country", filters.country);
    if (import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED === 'true' && filters.country === 'TEST_3424') {
      params.delete('country');
      params.set('stagingTestHotel', '3424');
      params.set('rooms', '1');
    }
    params.set("departureDate", filters.departureDate);
    params.set("people", String(Number(filters.people) || 2));
    params.set("children", String(Number(filters.children) || 0));
    params.set("nights", String(Number(filters.nights) || 7));

    if (Number(filters.children) > 0) {
      params.set("childrenAges", filters.childrenAges.join(","));
    }

    if (filters.food) {
      params.set("food", filters.food);
    }

    if (filters.stars) {
      params.set("stars", filters.stars);
    }

    navigate(`/results?${params.toString()}`);
  }

  return (
    <div className="hero-search-wrap">
      <form className="hero-search" onSubmit={handleSearch}>
        <div className="search-item">
          <label htmlFor="search-country">🌍 Страна</label>

          <select
            id="search-country" name="country"
            value={filters.country}
            onChange={handleChange}
            required
          >
            <option value="">Выберите страну</option>
            {import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED === 'true' && <option value="TEST_3424">Hotelbeds TEST — отель 3424 (1 номер)</option>}
            <option value="Египет">🇪🇬 Египет</option>
            <option value="Турция">🇹🇷 Турция</option>
            <option value="ОАЭ">🇦🇪 ОАЭ</option>
            <option value="Таиланд">🇹🇭 Таиланд</option>
          </select>
        </div>

        <div className="search-item">
          <label htmlFor="search-departureDate">📅 Дата заезда</label>

          <input
            type="date"
            id="search-departureDate" name="departureDate"
            min={today}
            value={filters.departureDate}
            onChange={handleChange}
            required
          />
        </div>

        <div className="search-item">
          <label htmlFor="search-people">👥 Гости</label>

          <select
            id="search-people" name="people"
            value={filters.people}
            onChange={handleChange}
          >
            <option value="1">1 гость</option>
            <option value="2">2 гостя</option>
            <option value="3">3 гостя</option>
            <option value="4">4 гостя</option>
            <option value="5">5 гостей</option>
            <option value="6">6 гостей</option>
          </select>
        </div>

        <div className="search-item">
          <label htmlFor="search-children">👶 Дети</label>

          <select
            id="search-children" name="children"
            value={filters.children}
            onChange={handleChange}
          >
            <option value="0">Без детей</option>
            <option value="1">1 ребёнок</option>
            <option value="2">2 ребёнка</option>
            <option value="3">3 ребёнка</option>
          </select>
        </div>

        {filters.childrenAges.map((age, index) => (
          <div className="search-item" key={`child-age-${index}`}>
            <label htmlFor={`search-child-${index}`}>Возраст ребёнка {index + 1}</label>

            <select
              id={`search-child-${index}`} value={age}
              onChange={(event) => handleChildAge(index, event.target.value)}
            >
              {Array.from({ length: 18 }, (_, childAge) => (
                <option value={childAge} key={childAge}>
                  {childAge} лет
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="search-item">
          <label htmlFor="search-nights">🌙 Ночей</label>

          <select
            id="search-nights" name="nights"
            value={filters.nights}
            onChange={handleChange}
          >
            <option value="1">1 ночь</option>
            <option value="3">3 ночи</option>
            <option value="5">5 ночей</option>
            <option value="7">7 ночей</option>
            <option value="10">10 ночей</option>
            <option value="12">12 ночей</option>
            <option value="14">14 ночей</option>
            <option value="21">21 ночь</option>
          </select>
        </div>

        <div className="search-item">
          <label htmlFor="search-food">🍽 Питание</label>

          <select
            id="search-food" name="food"
            value={filters.food}
            onChange={handleChange}
          >
            <option value="">Любое питание</option>
            <option value="RO">Без питания</option>
            <option value="BB">Завтрак</option>
            <option value="HB">Полупансион</option>
            <option value="FB">Полный пансион</option>
            <option value="AI">All Inclusive</option>
          </select>
        </div>

        <div className="search-item">
          <label htmlFor="search-stars">⭐ Категория</label>

          <select
            id="search-stars" name="stars"
            value={filters.stars}
            onChange={handleChange}
          >
            <option value="">Любая</option>
            <option value="3">3★ и выше</option>
            <option value="4">4★ и выше</option>
            <option value="5">5★</option>
          </select>
        </div>

        <button type="submit" className="search-button">
          🔍 Найти предложения
        </button>
      </form>

      <div className="search-live-note">
        <span>●</span>
        Доступность и стоимость уточняются перед оформлением.
      </div>

      {error && (
        <div className="search-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
