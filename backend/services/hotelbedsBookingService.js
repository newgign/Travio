const providerConfig = require("../config/providers");
const hotelbedsProvider = require("../sources/hotelbeds");

class HotelbedsBookingService {
  assertBookingAllowed() {
    const config = providerConfig.hotelbeds;

    if (!config.bookingEnabled) {
      const error = new Error(
        "Hotelbeds Booking API отключён. Для TEST-бронирований установите HOTELBEDS_BOOKING_ENABLED=true."
      );
      error.status = 503;
      error.code = "HOTELBEDS_BOOKING_DISABLED";
      throw error;
    }

    require('../integrations/hotelbeds/client').assertBookingTransportConfigured();
    require('../integrations/hotelbeds/client').assertLiveMutationAllowed();
  }

  effectiveTolerance() {
    const config = providerConfig.hotelbeds;
    return config.allowPriceTolerance
      ? Math.max(Number(config.bookingTolerance) || 0, 0)
      : 0;
  }

  assertOfferSupported(offer = {}) {
    const paymentType = String(offer.paymentType || "").toUpperCase();
    const rateType = String(offer.rateType || "BOOKABLE").toUpperCase();

    if (paymentType === "AT_HOTEL") {
      const error = new Error(
        "Этот тариф требует оплаты в отеле (AT_HOTEL) и пока не поддерживается Travio. Выполните новый поиск и выберите другой тариф."
      );
      error.status = 409;
      error.code = "HOTELBEDS_AT_HOTEL_UNSUPPORTED";
      throw error;
    }

    if (rateType === "RECHECK") {
      const error = new Error(
        "Тариф всё ещё требует CheckRate. Выполните новый поиск и повторите оформление."
      );
      error.status = 409;
      error.code = "HOTELBEDS_RATE_NOT_BOOKABLE";
      throw error;
    }
  }

  buildPayload(booking) {
    const offer = booking.offer_snapshot || {};
    const travelers = Array.isArray(booking.travelers) ? booking.travelers : [];
    const rateKey = offer.rateKey || booking.provider_offer_id;

    this.assertOfferSupported(offer);

    if (!rateKey) {
      const error = new Error("В бронировании отсутствует Hotelbeds rateKey");
      error.status = 409;
      error.code = "HOTELBEDS_RATE_KEY_MISSING";
      throw error;
    }

    if (travelers.length === 0) {
      const error = new Error("В бронировании отсутствуют данные туристов");
      error.status = 409;
      error.code = "HOTELBEDS_PAXES_MISSING";
      throw error;
    }

    const sortedTravelers = [...travelers].sort((a, b) => {
      const typeOrder = { AD: 0, CH: 1 };
      const aType = String(a?.type || "AD").toUpperCase() === "CH" ? "CH" : "AD";
      const bType = String(b?.type || "AD").toUpperCase() === "CH" ? "CH" : "AD";

      if (typeOrder[aType] !== typeOrder[bType]) {
        return typeOrder[aType] - typeOrder[bType];
      }

      return Number(a?.order || 0) - Number(b?.order || 0);
    });

    const holder = sortedTravelers.find((item) => item.type === "AD") || sortedTravelers[0];

    const paxes = sortedTravelers.map((traveler) => ({
      roomId: Number(traveler.roomId) || 1,
      type: traveler.type === "CH" ? "CH" : "AD",
      name: String(traveler.firstName || "").trim(),
      surname: String(traveler.lastName || "").trim(),
    }));

    if (paxes.some((pax) => !pax.name || !pax.surname)) {
      const error = new Error("Для Hotelbeds нужны имя и фамилия каждого туриста");
      error.status = 400;
      error.code = "HOTELBEDS_PAX_NAME_REQUIRED";
      throw error;
    }

    const payload = {
      holder: {
        name: String(holder.firstName || booking.first_name || "").trim(),
        surname: String(holder.lastName || booking.last_name || "").trim(),
      },
      rooms: [
        {
          rateKey: String(rateKey),
          paxes,
        },
      ],
      clientReference:
        String(booking.provider_client_reference || `TRAVIO-${booking.id}`).slice(0, 20),
    };

    // Always send tolerance explicitly.
    // Omitting the field is not treated as a strict 0% guard by the provider in TEST;
    // an observed booking was confirmed at ~2% above the quoted amount.
    payload.tolerance = this.effectiveTolerance();



    return payload;
  }

  extractBooking(response) {
    return (
      response?.booking ||
      response?.bookings?.booking ||
      response?.bookings?.[0] ||
      response?.bookings?.bookings?.[0] ||
      null
    );
  }

  extractBookingList(response) {
    const candidates = [
      response?.bookings,
      response?.bookings?.bookings,
      response?.bookings?.booking,
      response?.booking,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }

      if (candidate && typeof candidate === "object" && candidate.reference) {
        return [candidate];
      }
    }

    return [];
  }

  parseBookingObject(booking, response = null, { requireReference = true } = {}) {
    if (!booking) {
      const error = new Error("Hotelbeds вернул ответ без объекта booking.");
      error.status = 502;
      error.code = "HOTELBEDS_BOOKING_RESPONSE_INVALID";
      error.providerResponse = response;
      throw error;
    }

    if (requireReference && !booking.reference) {
      const error = new Error(
        "Hotelbeds вернул ответ без booking reference. Требуется сверка статуса брони."
      );
      error.status = 502;
      error.code = "HOTELBEDS_BOOKING_REFERENCE_MISSING";
      error.providerResponse = response;
      throw error;
    }

    const total = Number(
      booking.totalSellingRate ??
      booking.totalNet ??
      booking.total ??
      booking.totalAmount ??
      booking.hotel?.totalNet ??
      booking.hotel?.total ??
      0
    );

    return {
      reference: booking.reference ? String(booking.reference) : null,
      status: String(booking.status || "UNKNOWN").toUpperCase(),
      clientReference: booking.clientReference || null,
      currency: booking.currency || response?.currency || null,
      total: Number.isFinite(total) && total > 0 ? total : null,
      booking,
      raw: response || { booking },
    };
  }

  parseBookingResponse(response, options = {}) {
    return this.parseBookingObject(this.extractBooking(response), response, options);
  }

  parseCancellationResponse(response) {
    const parsed = this.parseBookingResponse(response, { requireReference: false });
    const booking = parsed.booking || {};
    const candidateFees = [
      booking.cancellationAmount,
      booking.cancellationAmount?.amount,
      booking.cancellationFee,
      booking.cancellationFee?.amount,
      booking.cancellationCost,
      booking.cancellationCost?.amount,
      response?.cancellationAmount,
      response?.cancellationFee,
    ];

    let cancellationFee = null;

    for (const candidate of candidateFees) {
      const number = Number(candidate);
      if (Number.isFinite(number) && number >= 0) {
        cancellationFee = number;
        break;
      }
    }

    return {
      ...parsed,
      cancellationFee,
    };
  }

  dateOnly(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
  }

  addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  async confirm(booking) {
    this.assertBookingAllowed();
    const payload = this.buildPayload(booking);
    const response = await hotelbedsProvider.createBooking(payload);

    return {
      payload,
      ...this.parseBookingResponse(response),
    };
  }

  async reconcile(booking) {
    require("../integrations/hotelbeds/client").assertBookingTransportConfigured();

    const clientReference = String(booking?.provider_client_reference || "").trim();
    if (!clientReference) {
      return { found: false, reason: "client_reference_missing", raw: null };
    }

    const created = this.dateOnly(booking.booking_date || booking.created_at || new Date());
    const start = this.addDays(created, -1);
    const end = this.addDays(created, 1);

    const response = await hotelbedsProvider.listBookings({
      start,
      end,
      filterType: "CREATION",
      status: "ALL",
      from: 1,
      to: 25,
      clientReference,
      extend: true,
    });

    const match = this.extractBookingList(response).find(
      (item) => String(item?.clientReference || "") === clientReference
    );

    if (!match) {
      return {
        found: false,
        clientReference,
        raw: response,
      };
    }

    return {
      found: true,
      source: "booking_list",
      ...this.parseBookingObject(match, response),
    };
  }

  async sync(reference) {
    require("../integrations/hotelbeds/client").assertBookingTransportConfigured();
    const response = await hotelbedsProvider.getBooking(reference);
    return {
      source: "booking_detail",
      ...this.parseBookingResponse(response),
    };
  }

  async syncWithFallback(booking) {
    if (!booking.provider_booking_id) {
      return this.reconcile(booking);
    }

    try {
      return await this.sync(booking.provider_booking_id);
    } catch (error) {
      if (Number(error.status) < 500 || !booking.provider_client_reference) {
        throw error;
      }

      const reconciled = await this.reconcile(booking);
      if (reconciled.found) {
        return {
          ...reconciled,
          source: "booking_list_fallback",
        };
      }

      throw error;
    }
  }

  async simulateCancellation(reference) {
    require("../integrations/hotelbeds/client").assertBookingTransportConfigured();
    const response = await hotelbedsProvider.cancelBooking(reference, {
      simulation: true,
      language: "ENG",
    });

    return this.parseCancellationResponse(response);
  }

  async cancel(reference) {
    this.assertBookingAllowed();
    const response = await hotelbedsProvider.cancelBooking(reference, {
      simulation: false,
      language: "ENG",
    });

    return this.parseCancellationResponse(response);
  }
}

module.exports = new HotelbedsBookingService();
