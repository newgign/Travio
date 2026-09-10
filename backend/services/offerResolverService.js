const providerManager = require("../providers/providerManager");
const offerService = require("./offerService");

class OfferResolverService {
  normalizeFilters(filters = {}) {
    return {
      ...filters,
      people: Math.max(Number(filters.people || filters.adults || 2), 1),
      nights: Math.max(Number(filters.nights || 7), 1),
      children: Math.max(Number(filters.children || 0), 0),
    };
  }

  async resolve({ providerName = "mock", hotelId, filters = {} }) {
    if (hotelId === undefined || hotelId === null || hotelId === "") {
      const error = new Error("Не указан отель");
      error.status = 400;
      throw error;
    }

    const normalizedFilters = this.normalizeFilters(filters);
    const provider = providerManager.getProvider(providerName);

    let hotel = null;

    if (typeof provider.getHotelById === "function") {
      hotel = await provider.getHotelById(hotelId, normalizedFilters);
    } else {
      const hotels = await provider.searchHotels(normalizedFilters);
      hotel = hotels.find(
        (item) =>
          String(item.providerHotelId ?? item.id) === String(hotelId) ||
          String(item.id) === String(hotelId)
      );
    }

    if (!hotel) {
      const error = new Error("Предложение не найдено");
      error.status = 404;
      throw error;
    }

    if (
      normalizedFilters.food &&
      Array.isArray(hotel.foods) &&
      !hotel.foods.includes(normalizedFilters.food)
    ) {
      const error = new Error("Выбранный тип питания больше недоступен");
      error.status = 409;
      throw error;
    }

    return offerService.generateOffer(hotel, normalizedFilters);
  }
}

module.exports = new OfferResolverService();
