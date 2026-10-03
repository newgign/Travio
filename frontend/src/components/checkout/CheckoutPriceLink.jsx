import { Link } from 'react-router-dom';

export default function CheckoutPriceLink({ tour, search = '' }) {
  if (tour?.provider !== 'hotelbeds' || tour.priceEnvironment !== 'test' || !tour.offerToken) return null;
  const params = new URLSearchParams(search);
  params.set('people', tour.adults);
  params.set('children', tour.children);
  params.set('nights', tour.nights);
  return <Link className="details-back" to={`/checkout/hotelbeds/${encodeURIComponent(tour.providerHotelId)}?${params}`}
    state={{ selectedOffer: tour }}>Проверить стоимость →</Link>;
}
