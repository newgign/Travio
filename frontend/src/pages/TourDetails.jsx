import { visibleProviderOffer } from "../utils/providerEnvironment";
import RateConditions from "../components/RateConditions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useFavorites } from "../context/FavoritesContext";
import API_URL from "../services/api";
import { formatMoney } from "../utils/money";
import "../styles/TourDetails.css";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=85";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function addDays(value, nights) {
  if (!value || !Number(nights)) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + Number(nights));
  return date.toISOString().slice(0, 10);
}

export default function TourDetails() {
  const { provider: providerParam, id } = useParams();
  const provider = providerParam || "mock";
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleFavorite, isFavorite } = useFavorites();
  const [tour, setTour] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeImage, setActiveImage] = useState(0);
  const selectedOffer = location.state?.selectedOffer || null;

  const loadTour = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      if (selectedOffer && Date.now() - Date.parse(selectedOffer.observedAt) < 900000 && (!import.meta.env.PROD || visibleProviderOffer(selectedOffer)) && String(selectedOffer.provider || provider) === String(provider) && String(selectedOffer.providerHotelId ?? selectedOffer.id) === String(id)) {
        setTour(selectedOffer);
        return;
      }
      const params = new URLSearchParams(location.search);
      const response = await fetch(`${API_URL}/offers/${encodeURIComponent(provider)}/${encodeURIComponent(id)}?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || !result?.success || !result?.data) throw new Error(result?.message || "Не удалось загрузить информацию о туре");
      setTour(result.data);
    } catch (err) {
      console.error(err);
      setError(err.message || "Ошибка загрузки тура");
      setTour(null);
    } finally {
      setLoading(false);
    }
  }, [provider, id, location.search, selectedOffer]);

  useEffect(() => { const timer = setTimeout(loadTour, 0); return () => clearTimeout(timer); }, [loadTour]);
  useEffect(() => { const timer = setTimeout(() => setActiveImage(0), 0); return () => clearTimeout(timer); }, [tour?.id, tour?.providerHotelId]);

  const images = useMemo(() => {
    if (!tour) return [FALLBACK_IMAGE];
    const unique = [...new Set([tour.image, ...(Array.isArray(tour.images) ? tour.images : [])].filter(Boolean))].slice(0, 6);
    return unique.length ? unique : [FALLBACK_IMAGE];
  }, [tour]);

  if (import.meta.env.PROD && tour && !visibleProviderOffer(tour)) return <><Navbar /><main className="help-page"><h1>Предложение недоступно</h1><p>Вернитесь к поиску актуальных предложений.</p><a href="/results">Найти туры</a></main><Footer /></>;
  if (loading) return <><Navbar /><main className="tour-loading"><div className="tour-loading-card"><span className="tour-spinner" /><h2>Проверяем предложение...</h2><p>Загружаем данные отеля и выбранного тарифа</p></div></main><Footer /></>;
  if (error || !tour) return <><Navbar /><main className="tour-loading"><div className="tour-loading-card"><h2>Тур не найден</h2><p>{error}</p><button type="button" onClick={() => navigate(-1)}>Вернуться назад</button></div></main><Footer /></>;

  const hotelName = tour.name || tour.title || tour.hotel || "Отель";
  const price = Number(tour.price || 0);
  const basePrice = Number(tour.discountEvidence?.originalPrice || 0);
  const hasDiscount = tour.priceEnvironment === "live" && tour.discountEvidence?.source === "price_history" && basePrice > price && price > 0;
  const formattedPrice = formatMoney(price, tour.currency || "KZT");
  const formattedBasePrice = formatMoney(basePrice, tour.currency || "KZT");
  const params = new URLSearchParams(location.search);
  const checkIn = tour.departureDate || params.get("departureDate") || null;
  const nights = Number(tour.nights || params.get("nights") || 7);
  const checkOut = tour.checkOut || tour.departureEndDate || addDays(checkIn, nights);
  const adults = Number(tour.adults || params.get("people") || 2);
  const children = Number(tour.children || params.get("children") || 0);
  const foodLabel = tour.boardName || tour.food || tour.boardCode || "По тарифу";
  const roomLabel = tour.roomName || tour.roomType || tour.roomCode || "Номер по выбранному тарифу";
  const isHotelbeds = (tour.provider || provider) === "hotelbeds";
  const favoriteActive = isFavorite(tour.providerHotelId ?? tour.id, tour.provider || provider);
  const cancellationPolicies = Array.isArray(tour.cancellationPolicies) ? tour.cancellationPolicies : [];

  function goCheckout() {
    if (tour.bookingDisabled) return;
    navigate(`/checkout/${encodeURIComponent(tour.provider || provider)}/${encodeURIComponent(tour.providerHotelId ?? tour.id)}${location.search}`, { state: { selectedOffer: tour } });
  }

  async function handleFavorite() {
    if (!localStorage.getItem("token")) { navigate("/login"); return; }
    try { await toggleFavorite(tour); }
    catch (err) { alert(err.message || "Не удалось обновить избранное"); }
  }

  return (
    <>
      <Navbar />
      <main className="tour-page">
        {tour.priceEnvironment === "test" && <p role="status">Hotelbeds TEST / Evaluation — только техническое тестирование. Бронирование и оплата недоступны.</p>}
        <div className="tour-breadcrumbs"><button type="button" onClick={() => navigate(-1)}>← К результатам</button><span>/</span><span>{tour.country || "Направление"}</span><span>/</span><strong>{hotelName}</strong></div>

        <section className="tour-product-head">
          <div>
            <div className="tour-location">📍 {tour.city}{tour.city && tour.country ? ", " : ""}{tour.country}</div>
            <h1>{hotelName}</h1>
            <div className="tour-head-meta">
              {Number(tour.stars) > 0 && <span className="stars-pill">{"★".repeat(Math.min(Number(tour.stars), 5))}</span>}
              {Number(tour.rating) > 0 && <span className="rating-pill">⭐ {Number(tour.rating).toFixed(1)}{Number(tour.reviewsCount) > 0 ? ` · ${tour.reviewsCount} отзывов` : ""}</span>}
              {isHotelbeds && <span className="provider-pill">Hotelbeds</span>}
            </div>
          </div>
          <button type="button" className={`tour-favorite ${favoriteActive ? "active" : ""}`} onClick={handleFavorite}>{favoriteActive ? "♥ В избранном" : "♡ В избранное"}</button>
        </section>

        <section className="tour-gallery-grid">
          <div className="tour-gallery-main"><img src={images[activeImage] || FALLBACK_IMAGE} alt={`${hotelName} — фото ${activeImage + 1}`} onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }} />{Number(tour.beachLine) === 1 && <span className="tour-hot">🌊 1-я береговая линия</span>}<span className="gallery-counter">{activeImage + 1} / {images.length}</span></div>
          <div className="tour-thumbnails">{images.slice(0, 5).map((src, index) => <button type="button" key={`${src}-${index}`} className={activeImage === index ? "active" : ""} onClick={() => setActiveImage(index)}><img src={src} alt="" onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }} /></button>)}</div>
        </section>

        <section className="tour-detail-layout">
          <div className="tour-detail-main">
            {isHotelbeds && <div className="tour-live-provider"><strong>● Актуальный тариф Hotelbeds</strong><span>Перед Booking API Asedeliya повторно проверит доступность и цену. Реального списания денег сейчас нет.</span></div>}

            <div className="tour-facts-grid">
              <div><span>Заезд</span><strong>📅 {formatDate(checkIn)}</strong></div>
              <div><span>Выезд</span><strong>📅 {formatDate(checkOut)}</strong></div>
              <div><span>Ночей</span><strong>🌙 {nights}</strong></div>
              <div><span>Гости</span><strong>👥 {adults} взр.{children ? ` · ${children} дет.` : ""}</strong></div>
              <div><span>Питание</span><strong>🍽 {foodLabel}</strong></div>
              <div><span>Номер / тариф</span><strong>🛏 {roomLabel}</strong></div>
            </div>

            <section className="tour-section-card"><h2>Об отеле</h2><p>{tour.description || `${hotelName} — вариант проживания в городе ${tour.city || ""}${tour.city && tour.country ? ", " : ""}${tour.country || ""}. Проверьте параметры выбранного тарифа перед оформлением.`}</p></section>

            <section className="tour-section-card"><h2>Удобства</h2><div className="amenities-grid">
              {[
                [tour.privateBeach, "🏖", "Собственный пляж"], [tour.wifi, "📶", "Wi-Fi"], [tour.pool, "🏊", "Бассейн"], [tour.spa, "💆", "SPA"], [tour.gym, "🏋️", "Тренажёрный зал"], [tour.kidsClub, "🧸", "Детский клуб"], [tour.aquapark, "🌊", "Аквапарк"], [tour.restaurant, "🍽", "Ресторан"], [tour.bar, "🍹", "Бар"], [tour.parking, "🚗", "Парковка"]
              ].filter(([enabled]) => enabled).map(([, icon, label]) => <div key={label}><span>{icon}</span><strong>{label}</strong></div>)}
              {Array.isArray(tour.amenities) && tour.amenities.filter(Boolean).slice(0, 10).map((amenity) => <div key={amenity}><span>✓</span><strong>{amenity}</strong></div>)}
              {(!Array.isArray(tour.amenities) || tour.amenities.length === 0) && !tour.privateBeach && !tour.wifi && !tour.pool && !tour.spa && !tour.gym && !tour.kidsClub && !tour.aquapark && !tour.restaurant && !tour.bar && !tour.parking && <div className="amenity-empty"><span>ℹ️</span><strong>Информация уточняется у поставщика</strong></div>}
            </div></section>

            <section className="tour-section-card"><h2>Условия предложения</h2><div className="conditions-grid">
              <div><span>Подтверждение</span><strong>{isHotelbeds ? (tour.recheckRequired ? "Требуется CheckRate" : "Тариф доступен для Booking API") : "По правилам Asedeliya"}</strong></div>
              <div><span>Отмена</span><strong>{cancellationPolicies.length ? "Есть правила отмены поставщика" : "Уточняется перед бронированием"}</strong></div>
              <div><span>Что входит</span><strong>{isHotelbeds ? "Проживание по выбранному тарифу" : "Состав тура указан в предложении"}</strong></div>
              <div><span>Что не входит</span><strong>{isHotelbeds ? "Перелёт и страховка не заявлены Hotelbeds" : "Зависит от выбранного пакета"}</strong></div>
            </div>
            {isHotelbeds && <RateConditions offer={tour} />}
            {cancellationPolicies.length > 0 && <div className="cancellation-note">📋 Asedeliya получил {cancellationPolicies.length} правил(а) отмены. Точная сумма возможного штрафа перепроверяется в процессе оформления.</div>}
            </section>
          </div>

          <aside className="tour-sidebar"><div className="price-card">
            <div className="price-label">{isHotelbeds ? "Стоимость проживания" : "Стоимость тура"}</div>
            {hasDiscount && <div className="old-price">{formattedBasePrice}</div>}
            <div className="current-price">{formattedPrice}</div>
            <div className="price-caption">{isHotelbeds ? `за ${nights} ночей · ${adults + children} гост.` : "итоговая стоимость предложения"}</div>
            <div className="price-checks"><span>✓ Цена из выбранного предложения</span><span>✓ Параметры гостей сохранены</span><span>✓ Перед подтверждением будет проверка</span></div>
            <button type="button" className="book-btn" disabled={tour.bookingDisabled} onClick={goCheckout}>{tour.bookingDisabled ? 'Бронирование отключено' : 'Перейти к оформлению →'}</button>
            <div className="secure-booking">🔒 Оплата и подтверждение доступны после проверки условий</div>
          </div></aside>
        </section>
      </main>

      <div className="mobile-booking-bar"><div><span>Стоимость</span><strong>{formattedPrice}</strong></div><button type="button" disabled={tour.bookingDisabled} onClick={goCheckout}>{tour.bookingDisabled ? 'Бронирование отключено' : 'Выбрать'}</button></div>
      <Footer />
    </>
  );
}
