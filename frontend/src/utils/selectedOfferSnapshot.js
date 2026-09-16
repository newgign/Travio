import { visibleProviderOffer } from './providerEnvironment';

export function selectedOfferSnapshot(offer, provider, id, search, now=Date.now()) {
  if (!offer || String(offer.provider) !== String(provider) || String(offer.providerHotelId ?? offer.id) !== String(id)) return null;
  const age=now-Date.parse(offer.observedAt);
  if (!Number.isFinite(age) || age < 0 || age >= 900000 || (import.meta.env.PROD && !visibleProviderOffer(offer))) return null;
  const params=new URLSearchParams(search);
  const fields={checkIn:offer.checkIn,departureDate:offer.departureDate || offer.checkIn,checkOut:offer.checkOut,
    nights:offer.nights,people:offer.adults,adults:offer.adults,children:offer.children,childrenAges:offer.childrenAges};
  if (Object.entries(fields).some(([key,value])=>params.has(key) && String(value ?? '') !== params.get(key))) return null;
  return offer;
}
