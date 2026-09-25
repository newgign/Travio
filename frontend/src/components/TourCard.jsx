import { stayGuests } from '../utils/resultsPresentation';
import { resultsOrigin } from '../utils/detailsPresentation';
import StayPrice from '../components/StayPrice';
import { normalizeBoardDisplay, normalizeRoomDisplay, stayLabel } from '../utils/hotelOfferDisplay';
import { countryLabel } from '../utils/testDestinationLabels';
import { visibleProviderOffer } from "../utils/providerEnvironment";
import { offerFreshUntil } from '../utils/selectedOfferSnapshot';
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFavorites } from "../context/FavoritesContext";
import { offerDetailsLink } from "../utils/hotTours";
import { formatMoney } from "../utils/money";
import HotelImage from './HotelImage';
import "./TourCard.css";

function labelFood(tour) {
  return normalizeBoardDisplay(tour.boardCode || tour.food, tour.boardName);
}

export default function TourCard({ tour }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleFavorite, isFavorite } = useFavorites();

  const [now, setNow] = useState(() => Date.now());
  const [favoriteError,setFavoriteError]=useState('');
  const [favoritePending,setFavoritePending]=useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const publicPrice = !import.meta.env.PROD || (visibleProviderOffer(tour) && now < offerFreshUntil(tour,now));
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
  const roomLabel = normalizeRoomDisplay(tour.roomName || tour.roomType || tour.roomCode);

  function openDetails() {
    navigate(tour.checkIn ? offerDetailsLink(tour) : `/tour/${encodeURIComponent(providerName)}/${encodeURIComponent(providerHotelId)}${location.search}`, { state: { selectedOffer: tour, resultsOrigin: resultsOrigin(location) } });
  }

  async function handleFavorite(event) {
    event.stopPropagation();
    if(favoritePending)return;
    setFavoriteError('');
    if (!localStorage.getItem("token")) { navigate("/login"); return; }
    setFavoritePending(true);
    try { await toggleFavorite(tour); }
    catch (error) {
      if (error.message === "AUTH_REQUIRED") { navigate("/login"); return; }
      setFavoriteError('Не удалось обновить избранное. Попробуйте ещё раз.');
    }
    finally { setFavoritePending(false); }
  }


  if (!publicPrice) return <article className="home-loading"><h3>{hotelName}</h3><p>Актуальная стоимость этого сохранённого предложения недоступна.</p><button type="button" className="details-btn" onClick={handleFavorite}>{favoriteActive ? "Удалить из избранного" : "В избранное"}</button><button type="button" className="details-btn" onClick={() => navigate("/results")}>Найти предложения</button></article>;
  const stars=Number(tour.stars);
  const category=Number.isInteger(stars) && stars>=1 && stars<=5;
  return <article className="tour-card">
    <div className="tour-card-image">
      <HotelImage key={`${tour.provider}:${tour.providerHotelId || tour.id}`} src={displayImage} alt={hotelName} loading="lazy" />
      <button type="button" className={`tour-card-favorite ${favoriteActive?'active':''}`} onClick={handleFavorite} disabled={favoritePending} aria-pressed={favoriteActive} aria-label={favoriteActive?'Удалить из избранного':'Добавить в избранное'}>{favoriteActive?'♥':'♡'}</button>
      {tour.priceEnvironment==='test' && <div className="tour-card-overlay-top"><span className="tour-card-test-badge">Hotelbeds TEST</span></div>}
    </div>
    <div className="tour-card-content">
      {favoriteError && <p role="alert">{favoriteError}</p>}
      <div className="tour-card-header"><div><h3>{hotelName}</h3>
        {category?<span className="tour-card-category" aria-label={`Категория отеля: ${stars} звёзд`}>{'★'.repeat(stars)}</span>:<small>Категория не указана</small>}
        <p className="tour-card-location">{[tour.city,countryLabel(tour.country)].filter(Boolean).join(', ')}</p>
      </div>{Number(tour.rating)>0 && <div className="tour-card-rating"><strong>{Number(tour.rating).toFixed(1)}</strong><span>Рейтинг гостей</span></div>}</div>
      <div className="tour-card-rate"><p><span>Номер</span><strong>{roomLabel || 'Номер по тарифу'}</strong></p><p><span>Питание</span><strong>{foodLabel}</strong></p></div>
      <p className="tour-card-stay">{stayLabel(tour.nights).replace(/^за /,'')} · {stayGuests(tour.adults || 2,tour.children || 0)}</p>
      <div className="tour-card-bottom">
        <div className="tour-card-price">{hasDiscount && <span className="tour-card-old-price">{formattedBasePrice}</span>}
          <div className="tour-card-current-price">{providerName==='hotelbeds'?<StayPrice offer={tour} />:<strong>{formattedPrice}</strong>}</div>
          {tour.priceEnvironment==='test' && <small>Тестовая цена</small>}
        </div>
        <div className="tour-card-actions">
          <button type="button" className="details-btn" onClick={openDetails}>Подробнее</button>
          <button type="button" className="details-btn secondary" disabled={testBookingDisabled} onClick={openDetails}>{testBookingDisabled?'Бронирование недоступно':'Выбрать →'}</button>
        </div>
      </div>
      {providerName==='hotelbeds' && <details className="tour-card-technical"><summary>Техническая информация</summary>
        {testBookingDisabled && <p>Тестовый режим — бронирование отключено</p>}
        {tour.rateType && <p>Тариф Hotelbeds: {String(tour.rateType).toUpperCase()}</p>}
        <p>Источник цены: {tour.priceSource || '—'}</p><p>Наблюдение: {tour.observedAt || '—'}</p>
      </details>}
    </div>
  </article>;
}
