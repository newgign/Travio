import { visibleProviderOffer } from './providerEnvironment';

// Shared existing selected-offer freshness window; no independent cache TTL.
export function offerFreshUntil(offer, now=Date.now()) {
  const observed=Date.parse(offer?.observedAt);
  return Number.isFinite(observed) && observed<=now ? observed+900000 : 0;
}
export function selectedOfferSnapshot(offer, provider, id, search, now=Date.now()) {
  if (!offer || String(offer.provider) !== String(provider) || String(offer.providerHotelId ?? offer.id) !== String(id)) return null;
  if (now >= offerFreshUntil(offer,now) || (import.meta.env.PROD && !visibleProviderOffer(offer))) return null;
  const params=new URLSearchParams(search);
  const fields={checkIn:offer.checkIn,departureDate:offer.departureDate || offer.checkIn,checkOut:offer.checkOut,
    nights:offer.nights,people:offer.adults,adults:offer.adults,children:offer.children,childrenAges:offer.childrenAges,rooms:offer.occupancy?.rooms || 1};
  if (Object.entries(fields).some(([key,value])=>params.has(key) && (params.getAll(key).length!==1 || String(value ?? '') !== params.get(key)))) return null;
  return offer;
}
