import { useEffect, useState } from "react";

function App() {
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [hotels, setHotels] = useState([]);

  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCity, setSelectedCity] = useState("");

  // Загружаем страны
  useEffect(() => {
    fetch("http://localhost:3000/countries")
      .then((res) => res.json())
      .then((data) => setCountries(data))
      .catch((err) => console.error(err));
  }, []);

  // Загружаем города после выбора страны
  useEffect(() => {
    if (!selectedCountry) {
      setCities([]);
      setHotels([]);
      return;
    }

    fetch("http://localhost:3000/cities")
      .then((res) => res.json())
      .then((data) => {
        const filtered = data.filter(
          (city) => city.country_id == selectedCountry
        );
        setCities(filtered);
        setSelectedCity("");
        setHotels([]);
      });
  }, [selectedCountry]);

  // Загружаем отели после выбора города
  useEffect(() => {
    if (!selectedCity) {
      setHotels([]);
      return;
    }

    fetch(`http://localhost:3000/hotels?city=${selectedCity}`)
      .then((res) => res.json())
      .then((data) => setHotels(data))
      .catch((err) => console.error(err));
  }, [selectedCity]);

  return (
    <div style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>🌍 Поиск туров</h1>

      <p>Добро пожаловать в наш сервис!</p>

      <hr />

      <label>Страна</label>
      <br />

      <select
        value={selectedCountry}
        onChange={(e) => setSelectedCountry(e.target.value)}
      >
        <option value="">Выберите страну</option>

        {countries.map((country) => (
          <option key={country.id} value={country.id}>
            {country.name}
          </option>
        ))}
      </select>

      <br />
      <br />

      <label>Город</label>
      <br />

      <select
        value={selectedCity}
        onChange={(e) => setSelectedCity(e.target.value)}
      >
        <option value="">Выберите город</option>

        {cities.map((city) => (
          <option key={city.id} value={city.id}>
            {city.name}
          </option>
        ))}
      </select>

      <br />
      <br />

      <label>Отель</label>
      <br />

      <select>
        <option>Выберите отель</option>

        {hotels.map((hotel) => (
          <option key={hotel.id} value={hotel.id}>
            {hotel.name}
          </option>
        ))}
      </select>

      <br />
      <br />

      <button>Найти тур</button>
    </div>
  );
}

export default App;