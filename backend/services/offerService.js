const crypto = require("crypto");

const airlines = require("../data/airlines");
const operators = require("../data/tourOperators");
const priceEngine = require("./priceEngine");

function addDaysIso(value, days) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function defaultMockDepartureDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 14);
  return date.toISOString().slice(0, 10);
}

class OfferService {
  generateOffer(hotel, filters = {}) {
    const nights = hotel.provider === "hotelbeds" && hotel.checkIn && hotel.checkOut
      ? Math.round((Date.parse(hotel.checkOut) - Date.parse(hotel.checkIn)) / 86400000)
      : Math.max(Number(filters.nights || 7), 1);
    const adults = Math.max(Number(filters.people || filters.adults || 2), 1);
    const children = Math.max(Number(filters.children || 0), 0);

    const food = this.pickFood(hotel, filters.food);
    const airline = this.pickAirline(hotel, filters.airline);
    const operator = this.pickOperator(hotel, filters.operator);
    const roomType = this.pickRoomType(hotel, filters.roomType);

    const provider = hotel.provider || "mock";
    const providerHotelId = String(hotel.providerHotelId ?? hotel.id);
    const currency = hotel.currency || "KZT";
    const departureCity = filters.departureCity || filters.departure_city || "Астана";

    // Sprint 2I hotfix:
    // showcase/mock offers must still produce a complete immutable booking snapshot.
    // If the homepage card had no search date, use an explicit TEST/default date
    // instead of persisting an empty stay.
    const departureDate =
      filters.departureDate ||
      filters.departure_date ||
      hotel.departureDate ||
      hotel.checkIn ||
      (provider === "mock" ? defaultMockDepartureDate() : null);

    const pricingFilters = departureDate
      ? { ...filters, departureDate }
      : filters;

    const price = hotel.priceIsFinal === true
      ? Number(hotel.price || 0)
      : priceEngine.calculate(hotel, pricingFilters);

    const providerOfferId =
      hotel.providerOfferId ||
      hotel.rateKey ||
      this.createMockOfferId({
        provider,
        providerHotelId,
        nights,
        adults,
        children,
        food,
        roomType,
        airlineId: airline?.id || null,
        operatorId: operator?.id || null,
        departureCity,
        departureDate,
        price,
        currency,
      });

    return {
      ...hotel,
      provider,
      providerHotelId,
      offerId: providerOfferId,
      providerOfferId,
      rateKey: hotel.rateKey || providerOfferId,
      price,
      basePrice: Number(hotel.price || 0),
      currency,
      nights,
      adults,
      children,
      childrenAges: filters.childrenAges || null,
      food,
      roomType,
      airline,
      operator,
      departureCity,
      departureDate,
      checkIn: hotel.checkIn || departureDate || null,
      checkOut:
        hotel.checkOut ||
        addDaysIso(hotel.checkIn || departureDate, nights) ||
        null,
      recheckRequired:
        typeof hotel.recheckRequired === "boolean"
          ? hotel.recheckRequired
          : true,
      rateType: hotel.rateType || null,
      roomCode: hotel.roomCode || null,
      roomName: hotel.roomName || roomType || null,
      boardCode: hotel.boardCode || food || null,
      boardName: hotel.boardName || null,
      paymentType: hotel.paymentType || null,
      packaging: Boolean(hotel.packaging),
      cancellationPolicies: Array.isArray(hotel.cancellationPolicies)
        ? hotel.cancellationPolicies
        : [],
      rateCommentsId: hotel.rateCommentsId || null,
      priceIsFinal: hotel.priceIsFinal === true,
    };
  }

  createMockOfferId(payload) {
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")
      .slice(0, 24);

    return `mock_${hash}`;
  }

  pickFood(hotel, requestedFood) {
    if (!Array.isArray(hotel.foods) || hotel.foods.length === 0) {
      return null;
    }

    if (requestedFood && hotel.foods.includes(requestedFood)) {
      return requestedFood;
    }

    return hotel.foods[0];
  }

  pickRoomType(hotel, requestedRoomType) {
    if (!Array.isArray(hotel.roomTypes) || hotel.roomTypes.length === 0) {
      return null;
    }

    if (
      requestedRoomType &&
      hotel.roomTypes.some(
        (room) => String(room).toLowerCase() === String(requestedRoomType).toLowerCase()
      )
    ) {
      return hotel.roomTypes.find(
        (room) => String(room).toLowerCase() === String(requestedRoomType).toLowerCase()
      );
    }

    return hotel.roomTypes[0];
  }

  pickAirline(hotel, requestedAirline) {
    if (!Array.isArray(hotel.airlines) || hotel.airlines.length === 0) {
      return null;
    }

    const requestedId = Number(requestedAirline);
    const id =
      requestedId && hotel.airlines.includes(requestedId)
        ? requestedId
        : hotel.airlines[0];

    return airlines.find((airline) => airline.id === id) || null;
  }

  pickOperator(hotel, requestedOperator) {
    if (!Array.isArray(hotel.operators) || hotel.operators.length === 0) {
      return null;
    }

    const requestedId = Number(requestedOperator);
    const id =
      requestedId && hotel.operators.includes(requestedId)
        ? requestedId
        : hotel.operators[0];

    return operators.find((operator) => operator.id === id) || null;
  }
}

module.exports = new OfferService();
