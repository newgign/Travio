export function offerDetailsLink(tour) {
  const params = new URLSearchParams();
  const filters = { destinationCode: tour.destinationCode, country: tour.country, city: tour.city, departureDate: tour.departureDate || tour.checkIn,
    checkOut: tour.checkOut, rooms: tour.occupancy?.rooms || 1, nights: tour.nights, people: tour.adults, children: tour.children, childrenAges: tour.childrenAges,
    food: tour.food, roomType: tour.roomType, departureCity: tour.departureCity };
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return `/tour/${encodeURIComponent(tour.provider || "mock")}/${encodeURIComponent(tour.providerHotelId ?? tour.id)}?${params}`;
}

// A stored comparison is not evidence of current availability.
export function confirmedPriceDrop(tour) {
  const current=Number(tour?.price), previous=Number(tour?.discountEvidence?.originalPrice);
  return tour?.provider==='hotelbeds' && tour.priceEnvironment==='live' &&
    tour.discountEvidence?.source==='price_history' && /^[A-Z]{3}$/.test(tour.currency) &&
    Number.isFinite(current) && Number.isFinite(previous) && current>0 && previous>current &&
    Math.round((previous-current)/previous*100)>=1 &&
    Number.isFinite(Date.parse(tour.discountEvidence.observedAt));
}
