export function offerDetailsLink(tour) {
  const params = new URLSearchParams();
  const filters = { destinationCode: tour.destinationCode, country: tour.country, city: tour.city, departureDate: tour.departureDate || tour.checkIn,
    nights: tour.nights, people: tour.adults, children: tour.children, childrenAges: tour.childrenAges,
    food: tour.food, roomType: tour.roomType, departureCity: tour.departureCity };
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return `/tour/${encodeURIComponent(tour.provider || "mock")}/${encodeURIComponent(tour.providerHotelId ?? tour.id)}?${params}`;
}
