import { visibleProviderOffer } from "../utils/providerEnvironment";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFavorites } from "../context/FavoritesContext";
import { offerDetailsLink } from "../utils/hotTours";
import { formatMoney } from "../utils/money";
import HotelImage from './HotelImage';
import "./TourCard.css";

function labelFood(tour) {
  return tour.boardName || tour.food || tour.boardCode || null;
}

export default function TourCard({ tour }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleFavorite, isFavorite } = useFavorites();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const publicPrice = !import.meta.env.PROD || (visibleProviderOffer(tour) && now - Date.parse(tour.observedAt) < 900000);
  const id = tour.id;
  const hotelName = tour.name || tour.title || tour.hotel || "Отель";
  const displayImage = tour.image || tour.images?.[0] || null;
  const numericPrice = Number(tour.price) || 0;
  const numericBasePrice = Number(tour.discountEvidence?.originalPrice) || 0;
  const formattedPrice = formatMoney(numericPrice, tour.currency || "KZT");
  const formattedBasePrice = formatMoney(numericBasePrice, tour.currency || "KZT");
  const hasDiscount = tour.priceEnvironment === "live" && tour.discountEvidence?.source === "price_history" && numericBasePrice > numericPrice && numericPrice > 0;
  const favoriteActive = isFavorite(tour.providerHotelId ?? id, tour.provider || "mock");
  const providerName = tour.provider || "mock";
  const testBookingDisabled = providerName === 'hotelbeds' && tour.priceEnvironment === 'test' && tour.stagingTestAllowed === true && tour.bookingDisabled === true;
  const providerHotelId = tour.providerHotelId ?? id;
  const foodLabel = labelFood(tour);
  const roomLabel = tour.roomName || tour.roomType || tour.roomCode || null;

  function openDetails() {
    navigate(tour.checkIn ? offerDetailsLink(tour) : `/tour/${encodeURIComponent(providerName)}/${encodeURIComponent(providerHotelId)}${location.search}`, { state: { selectedOffer: tour } });
  }

  async function handleFavorite(event) {
    event.stopPropagation();
    if (!localStorage.getItem("token")) { navigate("/login"); return; }
    try { await toggleFavorite(tour); }
    catch (error) {
      if (error.message === "AUTH_REQUIRED") { navigate("/login"); return; }
      alert(error.message || "Не удалось обновить избранное");
    }
  }

  const amenities = [
    tour.wifi && ["📶", "Wi-Fi"],
    tour.pool && ["🏊", "Бассейн"],
    tour.privateBeach && ["🏖", "Пляж"],
    tour.spa && ["💆", "SPA"],
    tour.gym && ["🏋️", "Зал"],
    tour.kidsClub && ["🧸", "Детский клуб"],
    tour.aquapark && ["🌊", "Аквапарк"],
    tour.transfer && ["🚐", "Трансфер"],
  ].filter(Boolean).slice(0, 6);

  if (!publicPrice) return <article className="home-loading"><h3>{hotelName}</h3><p>Актуальная стоимость этого сохранённого предложения недоступна.</p><button type="button" className="details-btn" onClick={handleFavorite}>{favoriteActive ? "Удалить из избранного" : "В избранное"}</button><button type="button" className="details-btn" onClick={() => navigate("/results")}>Найти предложения</button></article>;
  return (
    <article className="tour-card">
      <div className="tour-card-image">
        <button type="button" className={`tour-card-favorite ${favoriteActive ? "active" : ""}`} onClick={handleFavorite} aria-label={favoriteActive ? "Удалить из избранного" : "Добавить в избранное"}>
          {favoriteActive ? "♥" : "♡"}
        </button>
        <HotelImage key={`${tour.provider}:${tour.providerHotelId || tour.id}`} src={displayImage} alt={hotelName} loading="lazy" />
        <div className="tour-card-overlay-top">
          {Number(tour.stars) > 0 && <span className="tour-card-stars">{"★".repeat(Math.min(Number(tour.stars), 5))}</span>}
          {providerName === "hotelbeds" && <span className="tour-card-test-badge">Hotelbeds {tour.priceEnvironment === "test" ? "TEST · без бронирования" : ""}</span>}
        </div>
        {Number(tour.beachLine) === 1 && <div className="tour-card-badge">🌊 1-я линия</div>}
      </div>

      <div className="tour-card-content">
        <div className="tour-card-header">
          <div>
            <h3>{hotelName}</h3>
            <p className="tour-card-location">📍 {tour.city}{tour.city && tour.country ? ", " : ""}{tour.country}</p>
          </div>
          {Number(tour.rating) > 0 && (
            <div className="tour-card-rating"><strong>{Number(tour.rating).toFixed(1)}</strong>{Number(tour.reviewsCount) > 0 && <span>{Number(tour.reviewsCount).toLocaleString("ru-RU")} отзывов</span>}</div>
          )}
        </div>

        <div className="tour-card-primary-info">
          {roomLabel && <div><span>Номер</span><strong>🛏 {roomLabel}</strong></div>}
          {foodLabel && <div><span>Питание</span><strong>🍽 {foodLabel}</strong></div>}
          {Number(tour.nights) > 0 && <div><span>Проживание</span><strong>🌙 {tour.nights} ночей</strong></div>}
        </div>

        <div className="tour-card-info">
          {Number(tour.adults) > 0 && <span>👤 {tour.adults} взр.</span>}
          {Number(tour.children) > 0 && <span>👶 {tour.children} дет.</span>}
          {tour.rateType && <span>{providerName === 'hotelbeds' && tour.priceEnvironment === 'test' ? 'Тариф Hotelbeds: ' : '⚡ '}{String(tour.rateType).toUpperCase()}</span>}
          {testBookingDisabled && <span>Тестовый режим — бронирование отключено</span>}
          {tour.recheckRequired && <span className="recheck-chip">🔄 CheckRate</span>}
        </div>

        {amenities.length > 0 && <div className="tour-card-amenities">{amenities.map(([icon, label]) => <span key={label} title={label}>{icon}<small>{label}</small></span>)}</div>}

        <div className="tour-card-bottom">
          <div className="tour-card-price">
            {hasDiscount && <span className="tour-card-old-price">{formattedBasePrice}</span>}
            <div className="tour-card-current-price"><strong>{formattedPrice}</strong></div>
            {tour.priceEnvironment === 'test' && <p>Тестовая цена · provider=hotelbeds · environment=test<br />Источник цены: {tour.priceSource || '—'} · Наблюдение: {tour.observedAt || '—'}</p>}
            <small>{providerName === "hotelbeds" ? "за проживание · за всех гостей" : "стоимость тура"}</small>
          </div>
          <div className="tour-card-actions">
            <button type="button" className="details-btn secondary" onClick={openDetails}>Подробнее</button>
            <button type="button" className="details-btn" disabled={testBookingDisabled} onClick={openDetails}>{testBookingDisabled ? 'Бронирование недоступно' : 'Выбрать →'}</button>
          </div>
        </div>
      </div>
    </article>
  );
}
