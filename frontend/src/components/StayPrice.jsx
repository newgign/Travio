import { calculatePricePerNight, stayLabel, validPrice } from '../utils/hotelOfferDisplay';
import { formatMoney } from '../utils/money';

export default function StayPrice({offer}) {
  const currency = offer.currency;
  if (!validPrice(offer.price) || !/^[A-Z]{3}$/.test(currency || '')) return <span>Цена недоступна</span>;
  const perNight = calculatePricePerNight(offer.price, offer.nights, currency);
  return <div className="stay-price"><strong>{formatMoney(offer.price,currency)}</strong>
    {perNight != null && Number(offer.nights) > 1 && <div>{formatMoney(perNight,currency)} / ночь</div>}
    <small>{stayLabel(offer.nights)} · за всех гостей</small>
  </div>;
}
