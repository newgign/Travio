const pricing = require("../services/hotelbedsPriceService");
const hotelbedsClient = require("../integrations/hotelbeds/client");
const providerCatalogRepository = require("../repositories/providerCatalogRepository");

class HotelbedsProvider {
  get name() {
    return "hotelbeds";
  }

  async searchHotels(filters = {}) {
    const preparedFilters = await this.prepareFilters(filters);
    const request = this.buildAvailabilityRequest(preparedFilters);
    const response = await hotelbedsClient.availability(request);
    const hotels = response?.hotels?.hotels || [];

    const contentRows = await providerCatalogRepository.findHotelsByIds(
      "hotelbeds",
      hotels.map((hotel) => String(hotel.code))
    );

    const contentById = new Map(
      contentRows.map((row) => [String(row.provider_hotel_id), row])
    );

    return hotels
      .map((hotel) =>
        this.normalizeHotel(
          hotel,
          preparedFilters,
          contentById.get(String(hotel.code)) || null
        )
      )
      .filter(Boolean);
  }

  async getHotelById(id, filters = {}) {
    const content = await providerCatalogRepository.findHotel(
      "hotelbeds",
      String(id)
    );

    const preparedFilters = {
      ...filters,
      hotelCodes: [id],
      destinationCode: undefined,
      country: filters.country || content?.country_name || "",
      city: filters.city || content?.city || "",
    };

    const request = this.buildAvailabilityRequest(preparedFilters);
    const response = await hotelbedsClient.availability(request);
    const hotel = response?.hotels?.hotels?.[0];

    return hotel
      ? this.normalizeHotel(hotel, preparedFilters, content)
      : null;
  }

  async checkRate(rateKey) {
    return hotelbedsClient.checkRates(rateKey);
  }

  async checkRateOffer(offer) {
    if (!offer?.rateKey) {
      const error = new Error("Hotelbeds rateKey отсутствует");
      error.status = 400;
      error.code = "HOTELBEDS_RATE_KEY_REQUIRED";
      throw error;
    }

    if (offer.rateType !== 'RECHECK') {
      return offer;
    }

    const response = await hotelbedsClient.checkRates(offer.rateKey);
    const hotel = response?.hotel || response?.hotels?.hotels?.[0] || null;
    const candidates = [];

    for (const room of hotel?.rooms || []) {
      for (const rate of room.rates || []) {
        candidates.push({ room, rate });
      }
    }

    if (candidates.length === 0) {
      const error = new Error(
        "Hotelbeds CheckRate не вернул доступный тариф. Выполните новый поиск."
      );
      error.status = 409;
      error.code = "HOTELBEDS_RECHECK_UNAVAILABLE";
      throw error;
    }

    const selected = require('../services/hotelbedsRateIdentity').selectCheckedRate(offer, response);
    if (!selected) throw Object.assign(new Error("Выбранный тариф недоступен"), { status: 409, code: "RATE_NOT_AVAILABLE" });
    const priceDetails = pricing.extract(selected.rate, hotel?.currency || selected.rate.currency || offer.currency);
    if (!priceDetails) throw Object.assign(new Error("Цена тарифа недоступна"), { status: 409, code: "RATE_NOT_AVAILABLE" });
    const selectedPrice = priceDetails.price;

    if (String(selected.rate.paymentType || offer.paymentType || "").toUpperCase() === "AT_HOTEL") {
      const error = new Error(
        "Этот тариф требует оплаты в отеле (AT_HOTEL) и пока не поддерживается Travio. Выберите другой тариф."
      );
      error.status = 409;
      error.code = "HOTELBEDS_AT_HOTEL_UNSUPPORTED";
      throw error;
    }

    return {
      ...offer,
      ...priceDetails,
      providerOfferId: selected.rate.rateKey,
      offerId: selected.rate.rateKey,
      rateKey: selected.rate.rateKey,
      rateType: selected.rate.rateType || "BOOKABLE",
      recheckRequired:
        String(selected.rate.rateType || "").toUpperCase() === "RECHECK",
      price: selectedPrice,
      basePrice: selectedPrice,
      currency:
        hotel?.currency || selected.rate.currency || offer.currency || "EUR",
      roomCode: selected.room.code || offer.roomCode || null,
      roomName: selected.room.name || offer.roomName || selected.room.code || null,
      boardCode: selected.rate.boardCode || offer.boardCode || null,
      boardName: selected.rate.boardName || offer.boardName || null,
      paymentType: selected.rate.paymentType || offer.paymentType || null,
      packaging: Boolean(selected.rate.packaging),
      cancellationPolicies: Array.isArray(selected.rate.cancellationPolicies)
        ? selected.rate.cancellationPolicies
        : [],
      rateComments: selected.rate.rateComments ?? null,
      rateCommentsId: selected.rate.rateCommentsId ?? null,
      checkRatePerformed: true,
      checkedRateAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
    };
  }

  async refreshOffer(offer) {
    const response = await hotelbedsClient.availability(this.buildAvailabilityRequest({
      hotelCodes: [offer.providerHotelId], checkIn: offer.checkIn, checkOut: offer.checkOut,
      nights: offer.nights, adults: offer.adults, children: offer.children, childrenAges: offer.childrenAges,
      rooms: offer.occupancy?.rooms || 1,
    }));
    const hotel = response?.hotels?.hotels?.find(item => String(item.code) === String(offer.providerHotelId));
    const room = hotel?.rooms?.find(item => String(item.code) === String(offer.roomCode));
    const rate = room?.rates?.find(item => item.rateKey === offer.rateKey);
    if (!rate || rate.packaging || rate.paymentType === 'AT_HOTEL') throw Object.assign(new Error('Выбранный тариф больше недоступен. Выполните новый поиск.'), { status: 409, code: 'RATE_NOT_AVAILABLE' });
    const money = pricing.extract(rate, hotel.currency || rate.currency);
    if (!money) throw Object.assign(new Error('Цена тарифа недоступна'), { status: 409, code: 'RATE_NOT_AVAILABLE' });
    return { ...offer, ...money, rateType: rate.rateType, recheckRequired: rate.rateType === 'RECHECK',
      cancellationPolicies: rate.cancellationPolicies || [], rateComments: rate.rateComments || null,
      observedAt: new Date().toISOString() };
  }

  async createBooking(payload) {
    return hotelbedsClient.createBooking(payload);
  }

  async getBooking(reference) {
    return hotelbedsClient.getBooking(reference);
  }

  async listBookings(params = {}) {
    return hotelbedsClient.listBookings(params);
  }

  async cancelBooking(reference, options = {}) {
    return hotelbedsClient.cancelBooking(reference, options);
  }

  async prepareFilters(filters = {}) {
    filters = await require("../services/hotelbedsTestDestination")(filters, require("../config/providers").hotelbeds, providerCatalogRepository);
    const explicitHotelCodes = this.parseHotelCodes(
      filters.hotelCodes || filters.hotelCode
    );
    const destinationCode = String(filters.destinationCode || "")
      .trim()
      .toUpperCase();

    if (explicitHotelCodes.length > 0 || destinationCode) {
      return filters;
    }

    const catalogHotels = await providerCatalogRepository.findHotels({
      provider: "hotelbeds",
      country: filters.country,
      city: filters.city,
      limit: 2000,
    });

    if (catalogHotels.length === 0) {
      const error = new Error(
        "Локальный каталог Hotelbeds пуст для выбранного направления. Выполните npm run hotelbeds:sync-catalog."
      );
      error.status = 409;
      error.code = "HOTELBEDS_CATALOG_EMPTY";
      throw error;
    }

    return {
      ...filters,
      hotelCodes: catalogHotels.map((item) => item.provider_hotel_id),
    };
  }

  buildAvailabilityRequest(filters = {}) {
    const adults = Math.max(Number(filters.people || filters.adults || 2), 1);
    const children = Math.max(Number(filters.children || 0), 0);
    const nights = Math.max(Number(filters.nights || 1), 1);
    const checkIn = String(filters.checkIn || filters.departureDate || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
      const error = new Error(
        "Для Hotelbeds укажите дату заезда: departureDate=YYYY-MM-DD."
      );
      error.status = 400;
      error.code = "HOTELBEDS_CHECKIN_REQUIRED";
      throw error;
    }

    if (children > 0 && !filters.childrenAges) {
      const error = new Error(
        "Для поиска Hotelbeds с детьми необходимо передать childrenAges."
      );
      error.status = 400;
      error.code = "HOTELBEDS_CHILD_AGES_REQUIRED";
      throw error;
    }

    const checkOut = filters.checkOut || this.addDays(checkIn, nights);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) throw Object.assign(new Error("Некорректные даты проживания"), { status: 400, code: "INVALID_REQUEST" });
    const hotelCodes = this.parseHotelCodes(filters.hotelCodes || filters.hotelCode);
    const destinationCode = String(filters.destinationCode || "").trim().toUpperCase();

    if (hotelCodes.length === 0 && !destinationCode) {
      const error = new Error(
        "Для Hotelbeds не удалось определить отели или destinationCode."
      );
      error.status = 400;
      error.code = "HOTELBEDS_LOCATION_REQUIRED";
      throw error;
    }

    const occupancy = {
      rooms: Number(filters.rooms || 1),
      adults,
      children,
    };

    if (children > 0) {
      const ages = String(filters.childrenAges)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 17);

      if (ages.length !== children) {
        const error = new Error(
          "Количество childrenAges должно совпадать с children."
        );
        error.status = 400;
        error.code = "HOTELBEDS_CHILD_AGES_INVALID";
        throw error;
      }

      occupancy.paxes = ages.map((age) => ({ type: "CH", age }));
    }

    if (occupancy.rooms !== 1) throw Object.assign(new Error("Бронирование нескольких номеров пока недоступно"), { status: 400, code: "INVALID_REQUEST" });
    const payload = {
      stay: {
        checkIn,
        checkOut,
      },
      occupancies: [occupancy],
    };

    if (hotelCodes.length > 0) {
      payload.hotels = {
        hotel: hotelCodes.slice(0, 2000),
      };
    } else {
      payload.destination = {
        code: destinationCode,
      };
    }

    return payload;
  }

  normalizeHotel(hotel, filters = {}, content = null) {
    // Static metadata must belong to this exact provider hotel, never a prior selection.
    if (content && String(content.provider_hotel_id) !== String(hotel.code)) content = null;
    const candidates = [];

    for (const room of hotel.rooms || []) {
      for (const rate of room.rates || []) {
        candidates.push({ room, rate });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sprint 2F supports agency/web payment rates. AT_HOTEL needs a separate
    // payment-data flow and is intentionally excluded until that flow exists.
    const supportedCandidates = candidates.filter(
      ({ rate }) => String(rate.paymentType || "").toUpperCase() !== "AT_HOTEL" && !rate.packaging &&
        Boolean(rate.rateKey) && Boolean(pricing.extract(rate, hotel.currency || rate.currency))
    );

    if (supportedCandidates.length === 0) {
      return null;
    }

    const requestedRoom = String(filters.roomType || filters.roomCode || "");
    if (requestedRoom) {
      for (let i = supportedCandidates.length - 1; i >= 0; i--) {
        if (supportedCandidates[i].room.code !== requestedRoom) supportedCandidates.splice(i, 1);
      }
      if (!supportedCandidates.length) return null;
    }
    const requestedFood = String(filters.food || "").trim().toUpperCase();
    const compatible = requestedFood
      ? supportedCandidates.filter(
          ({ rate }) => String(rate.boardCode || "").toUpperCase() === requestedFood
        )
      : supportedCandidates;

    if (requestedFood && compatible.length === 0) {
      return null;
    }

    const pool = compatible.length > 0 ? compatible : supportedCandidates;
    pool.sort((a, b) => this.getRatePrice(a.rate) - this.getRatePrice(b.rate));

    const selected = pool[0];
    const priceDetails = pricing.extract(selected.rate, hotel.currency || selected.rate.currency);
    const selectedPrice = priceDetails.price;
    const selectedBoard = selected.rate.boardCode || null;
    const selectedRoomCode = selected.room.code || null;

    const boardCodes = this.unique([
      selectedBoard,
      ...candidates.map(({ rate }) => rate.boardCode),
    ]);

    const roomCodes = this.unique([
      selectedRoomCode,
      ...candidates.map(({ room }) => room.code),
    ]);

    const images = this.jsonArray(content?.images);
    const facilities = this.jsonArray(content?.facilities);
    const facilityInfo = this.normalizeFacilities(facilities);

    return {
      provider: "hotelbeds",
      providerHotelId: String(hotel.code),
      id: String(hotel.code),
      name: content?.name || hotel.name || `Hotelbeds #${hotel.code}`,
      title: content?.name || hotel.name || `Hotelbeds #${hotel.code}`,
      brand: null,

      country: content?.country_name || filters.country || "",
      city: content?.city || hotel.destinationName || filters.city || "",
      airport: null,
      destinationCode:
        content?.destination_code ||
        hotel.destinationCode ||
        filters.destinationCode ||
        null,

      latitude: this.toNumberOrNull(content?.latitude ?? hotel.latitude),
      longitude: this.toNumberOrNull(content?.longitude ?? hotel.longitude),

      stars:
        Number(content?.stars) ||
        this.parseStars(hotel.categoryCode, hotel.categoryName),
      rating: Number(hotel.reviewScore || 0),
      reviewsCount: Number(hotel.reviewCount || 0),

      price: selectedPrice,
      basePrice: selectedPrice,
      ...priceDetails,
      observedAt: new Date().toISOString(),
      occupancy: { rooms: Number(selected.rate.rooms), adults: Number(selected.rate.adults), children: Number(selected.rate.children) },
      currency: priceDetails.currency,
      priceIsFinal: true,
      bookingDisabled: hotelbedsClient.config.readOnly || !hotelbedsClient.config.bookingEnabled,
      stagingTestAllowed: hotelbedsClient.config.stagingTestAllowed,
      priceEnvironment: require("../services/priceHistoryService").priceEnvironment(),

      image: content?.image_url || images[0] || null,
      images,

      beachLine: 0,
      beachType: null,

      foods: boardCodes,
      roomTypes: roomCodes,
      amenities: facilityInfo.names,

      wifi: facilityInfo.flags.wifi,
      pool: facilityInfo.flags.pool,
      spa: facilityInfo.flags.spa,
      gym: facilityInfo.flags.gym,
      kidsClub: facilityInfo.flags.kidsClub,
      aquapark: facilityInfo.flags.aquapark,
      transfer: false,
      parking: facilityInfo.flags.parking,
      privateBeach: facilityInfo.flags.privateBeach,
      animation: facilityInfo.flags.animation,
      restaurant: facilityInfo.flags.restaurant,
      bar: facilityInfo.flags.bar,

      operators: [],
      airlines: [],

      description: content?.description || "",
      address: content?.address || "",
      website: content?.website || "",
      phone: content?.phone || "",
      email: content?.email || "",
      staticFacilities: facilities,

      providerOfferId: selected.rate.rateKey,
      rateKey: selected.rate.rateKey,
      rateType: selected.rate.rateType || "BOOKABLE",
      recheckRequired:
        String(selected.rate.rateType || "").toUpperCase() === "RECHECK",
      roomCode: selectedRoomCode,
      roomName: selected.room.name || selectedRoomCode,
      boardCode: selectedBoard,
      boardName: selected.rate.boardName || selectedBoard,
      paymentType: selected.rate.paymentType || null,
      packaging: Boolean(selected.rate.packaging),
      cancellationPolicies: Array.isArray(selected.rate.cancellationPolicies)
        ? selected.rate.cancellationPolicies
        : [],
      rateCommentsId: selected.rate.rateCommentsId || null,
      rateComments: selected.rate.rateComments ?? null,
      checkIn: filters.checkIn || filters.departureDate || null,
      checkOut: filters.checkOut || this.addDays(
        filters.checkIn || filters.departureDate,
        Math.max(Number(filters.nights || 1), 1)
      ),
    };
  }

  normalizeFacilities(facilities = []) {
    const active = facilities.filter((facility) => {
      if (!facility || typeof facility !== "object") return false;
      if (facility.indYesOrNo === false || facility.indLogic === false) return false;
      return true;
    });

    const names = this.unique(
      active.map((facility) => {
        const description = facility.description;
        if (typeof description === "string") return description.trim();
        if (description && typeof description === "object") {
          return String(description.content || description.description || "").trim();
        }
        return "";
      })
    ).slice(0, 14);

    const text = names.join(" | ").toLowerCase();
    const has = (...terms) => terms.some((term) => text.includes(term));

    return {
      names,
      flags: {
        wifi: has("wi-fi", "wifi", "internet access", "wireless internet"),
        pool: has("pool", "swimming pool", "indoor pool", "outdoor pool", "children's pool"),
        spa: has("spa", "sauna", "massage", "wellness"),
        gym: has("gym", "fitness"),
        kidsClub: has("kids club", "children's club", "children club"),
        aquapark: has("waterpark", "water park", "aqua park", "waterslide"),
        parking: has("car park", "parking", "garage"),
        privateBeach: has("private beach"),
        animation: has("entertainment programme", "animation"),
        restaurant: has("restaurant"),
        bar: has("bar", "poolside snack bar"),
      },
    };
  }

  getRatePrice(rate = {}) {
    return Number(rate.sellingRate ?? rate.net ?? 0) || 0;
  }

  parseHotelCodes(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(",");

    return raw
      .map((item) => Number(String(item).trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  parseStars(categoryCode, categoryName) {
    const text = `${categoryCode || ""} ${categoryName || ""}`;
    const match = text.match(/([1-5])/);
    return match ? Number(match[1]) : 0;
  }

  unique(values) {
    return [...new Set(values.filter(Boolean).map((value) => String(value)))];
  }

  toNumberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  jsonArray(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  addDays(dateString, days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ""))) {
      return null;
    }

    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }
}

module.exports = new HotelbedsProvider();
