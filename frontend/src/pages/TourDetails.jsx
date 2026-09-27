import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ConsumerMetadata from '../components/ConsumerMetadata';
import StayPrice from '../components/StayPrice';
import DetailsGallery from '../components/DetailsGallery';
import { useFavorites } from '../context/FavoritesContext';
import { selectedOfferSnapshot } from '../utils/selectedOfferSnapshot';
import { visibleProviderOffer } from '../utils/providerEnvironment';
import { normalizeBoardDisplay, normalizeRoomDisplay } from '../utils/hotelOfferDisplay';
import { editSearchLink } from '../utils/resultsPresentation';
import { contentText, hotelAddress, hotelDescription, rateConditions, detailsBackTarget, detailsError, detailsSummary, displayDate, galleryImages, hotelAmenities, hotelCategory, hotelLocation, stayDates } from '../utils/detailsPresentation';
import { loadDetailsOffer, watchDetailsExpiry, validDetailsOffer } from '../services/detailsOffer';
import { toggleDetailsFavorite } from '../utils/detailsFavorite';
import '../styles/TourDetails.css';

export default function TourDetails() {
  const { provider: providerParam, id } = useParams();
  const location = useLocation();
  // Route/state navigation must not paint the previous hotel's offer while resolving.
  return <DetailsPage key={`${location.key}:${providerParam}:${id}:${location.search}`} provider={providerParam || 'mock'} id={id} location={location} />;
}

function DetailsPage({ provider, id, location }) {
  const navigate = useNavigate();
  const { toggleFavorite, isFavorite } = useFavorites();
  const selectedOffer = location.state?.selectedOffer || null;
  const [initialSnapshot] = useState(() => validDetailsOffer(selectedOffer) ? selectedOfferSnapshot(selectedOffer, provider, id, location.search) : null);
  const [tour, setTour] = useState(initialSnapshot);
  const [loading, setLoading] = useState(!initialSnapshot && !selectedOffer);
  const [error, setError] = useState(() => selectedOffer && !initialSnapshot ? detailsError({ code: 'SELECTED_OFFER_STALE' }) : null);
  const [activeImage, setActiveImage] = useState(0);
  const [favoriteError, setFavoriteError] = useState('');
  const [favoritePending, setFavoritePending] = useState(false);
  const pendingFavorite=useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    // One mount load only; no polling or fallback for rejected navigation state.
    const timer = setTimeout(async () => {
      try {
        const offer = await loadDetailsOffer({ selectedOffer, provider, id, search: location.search, signal: controller.signal });
        if (!controller.signal.aborted) { setTour(offer); setError(null); }
      } catch (err) {
        if (!controller.signal.aborted) { setError(detailsError(err)); setTour(null); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [provider, id, location.search, selectedOffer]);

  useEffect(()=>{
    if(!tour)return;
    return watchDetailsExpiry(tour,()=>{setTour(null);setError(detailsError({code:'SELECTED_OFFER_STALE'}));});
  },[tour]);

  const searchLink = editSearchLink(new URLSearchParams(location.state?.resultsOrigin?.search || location.search));
  function back() {
    navigate(detailsBackTarget(location.state?.resultsOrigin, window.history.state?.idx, location.search));
  }
  if (loading) return <><ConsumerMetadata pathname={location.pathname} /><Navbar /><main className="details-page details-loading" role="status" aria-label="Загрузка отеля" aria-busy="true">
    <h1>Загружаем выбранный отель</h1><p>Получаем данные отеля и тарифа.</p>
    <div className="details-layout" aria-hidden="true"><div className="details-skeleton details-skeleton-gallery" /><div className="details-skeleton details-skeleton-price" /></div>
  </main><Footer /></>;
  const unavailable = import.meta.env.PROD && tour && !visibleProviderOffer(tour);
  if (error || !tour || unavailable) {
    const state = error || detailsError({ code: 'OFFER_NOT_FOUND' });
    return <><ConsumerMetadata pathname={location.pathname} /><Navbar /><main className="details-page"><section className="details-state" role="alert" data-error-code={state.code}>
      <h1>{state.title}</h1><p>{state.message}</p><button type="button" className="details-back" onClick={() => navigate(searchLink)}>Вернуться к поиску</button>
      {location.state?.resultsOrigin && <button type="button" className="details-back" onClick={back}>Вернуться к результатам</button>}
    </section></main><Footer /></>;
  }

  const hotelName = contentText(tour.name) || contentText(tour.title) || contentText(tour.hotel) || 'Отель';
  const stars = hotelCategory(tour.stars);
  const place = hotelLocation(tour);
  const images = galleryImages(tour);
  const amenities = hotelAmenities(tour);
  const address=hotelAddress(tour);
  const conditions=rateConditions(tour);
  const { checkIn, checkOut } = stayDates(tour);
  const isTest = tour.provider === 'hotelbeds' && tour.priceEnvironment === 'test';
  const favoriteActive = isFavorite(tour.providerHotelId ?? tour.id, tour.provider || provider);
  const room = normalizeRoomDisplay(contentText(tour.roomName) || contentText(tour.roomType) || contentText(tour.roomCode)) || 'Номер по выбранному тарифу';
  const board = normalizeBoardDisplay(contentText(tour.boardCode) || contentText(tour.food), contentText(tour.boardName));

  async function handleFavorite() {
    if(pendingFavorite.current)return;
    setFavoritePending(true);
    setFavoriteError('');
    try { await toggleDetailsFavorite(tour, { hasSession: Boolean(localStorage.getItem('token')), toggleFavorite, navigate, pending:pendingFavorite }); }
    catch { setFavoriteError('Не удалось обновить избранное. Попробуйте ещё раз.'); }
    finally { setFavoritePending(false); }
  }

  return <><ConsumerMetadata pathname={location.pathname} hotelName={hotelName} /><Navbar /><main className="details-page">
    <button type="button" className="details-back" onClick={back}>← Вернуться к результатам</button>
    <header className="details-header">
      <div><h1>{hotelName}</h1>
        {stars ? <p className="details-stars" aria-label={`Категория отеля: ${stars} звёзд`}>{'★'.repeat(stars)}</p> : <p className="details-category">Категория не указана</p>}
        {place && <p className="details-location">{place}</p>}
        {isTest && <span className="details-test-badge">Hotelbeds TEST</span>}
      </div>
      <div className="details-favorite-wrap"><button type="button" className="details-favorite" aria-pressed={favoriteActive} aria-label={favoriteActive ? 'Удалить из избранного' : 'Добавить в избранное'} disabled={favoritePending} onClick={handleFavorite}>{favoriteActive ? '♥ В избранном' : '♡ В избранное'}</button>
        {favoriteError && <p role="alert">{favoriteError}</p>}
      </div>
    </header>

    <div className="details-layout">
      <div className="details-main">
        <DetailsGallery images={images} hotelName={hotelName} activeImage={activeImage} onSelect={setActiveImage} />
        <section className="details-section" aria-labelledby="selected-stay-title">
          <h2 id="selected-stay-title">Ваш вариант проживания</h2>
          <p className="details-stay-summary">{detailsSummary(tour)}</p>
          <dl className="details-offer-facts">
            <div><dt>Номер</dt><dd>{room}</dd></div><div><dt>Питание</dt><dd>{board}</dd></div>
            <div><dt>Заезд</dt><dd>{displayDate(checkIn)}</dd></div><div><dt>Выезд</dt><dd>{displayDate(checkOut)}</dd></div>
          </dl>
        </section>
      </div>

      <aside className="details-price-card" aria-label="Стоимость выбранного проживания">
        <h2>Стоимость проживания</h2><StayPrice offer={tour} />
        {isTest && <div className="details-test-explanation"><h3>Тестовая цена Hotelbeds</h3><p>Цена получена из тестовой среды. Перед реальным оформлением тариф потребуется проверить повторно.</p></div>}
        <button type="button" className="details-booking" disabled>Бронирование отключено</button>
        <p className="details-booking-note">Бронирование сейчас отключено. Оплата недоступна.</p>
      </aside>
      <div className="details-content">
        <section className="details-section" aria-labelledby="hotel-info-title"><h2 id="hotel-info-title">Об отеле</h2>
          <p className="details-description">{hotelDescription(tour)}</p>
          {amenities.length > 0 && <><h3>Удобства</h3><ul className="details-amenities">{amenities.slice(0,8).map(amenity => <li key={amenity}>{amenity}</li>)}</ul>
            {amenities.length>8 && <details className="details-more"><summary>Показать все удобства ({amenities.length})</summary><ul className="details-amenities">{amenities.slice(8).map(amenity=><li key={amenity}>{amenity}</li>)}</ul></details>}
          </>}
          {Number(tour.beachLine) > 0 && Number(tour.beachLine) <= 3 && <p>Береговая линия: {tour.beachLine}</p>}
        </section>
        {(place || address) && <section className="details-section" aria-labelledby="hotel-location-title"><h2 id="hotel-location-title">Расположение</h2>
          {place && <p>{place}</p>}{address && <p className="details-address"><strong>Адрес: </strong>{address}</p>}
        </section>}
        <section className="details-section" aria-labelledby="rate-conditions-title"><h2 id="rate-conditions-title">Условия тарифа</h2>
          {conditions.comments && <p className="details-description">{conditions.comments}</p>}
          {conditions.policies.length>0 && <><h3>Штрафы при отмене по выбранному тарифу</h3><ul className="details-policies">{conditions.policies.map((policy,index)=><li key={index}>С <time dateTime={policy.from}>{policy.from}</time> — {policy.amount}</li>)}</ul><p>Даты и время указаны как получены от поставщика, без изменения часового пояса.</p></>}
          <p>Подробные условия тарифа будут доступны после повторной проверки перед оформлением.</p>
        </section>
        <details className="details-technical"><summary>Техническая информация</summary><dl>
          <div><dt>Источник цены</dt><dd>{contentText(tour.priceSource) || '—'}</dd></div>
          <div><dt>Время наблюдения</dt><dd>{contentText(tour.observedAt) || '—'}</dd></div>
          <div><dt>Тип тарифа поставщика</dt><dd>{contentText(tour.rateType) || '—'}</dd></div>
        </dl></details>
      </div>
    </div>
  </main><Footer /></>;
}
