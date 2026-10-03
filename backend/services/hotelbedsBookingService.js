const providerConfig = require("../config/providers");
const hotelbedsProvider = require("../sources/hotelbeds");

class HotelbedsBookingService {
  normalizeIntentTravelers(travelers, occupancy, childAges) {
    const invalid = validationKind => { throw Object.assign(new Error('Проверьте данные гостей.'), {
      code: 'BOOKING_INTENT_TRAVELERS_INVALID', validationKind, status: 409,
    }); };
    if (!Array.isArray(travelers) || travelers.some(value => !value || typeof value !== 'object' || Array.isArray(value))) invalid('TRAVELLER_VALIDATION_ERROR');
    if (travelers.length !== Number(occupancy.adults) + Number(occupancy.children)
      || travelers.filter(value => value.type === 'AD').length !== Number(occupancy.adults)
      || travelers.filter(value => value.type === 'CH').length !== Number(occupancy.children)) invalid('OCCUPANCY_MISMATCH');
    const fields = ['type', 'firstName', 'lastName', 'roomId', 'age', 'birthDate'];
    const normalized = travelers.map(value => {
      if (Object.keys(value).some(key => !fields.includes(key))
        || ['firstName', 'lastName'].some(key => typeof value[key] !== 'string' || !value[key].trim() || value[key].trim().length > 100)
        || (value.roomId !== undefined && value.roomId !== 1)
        || (value.type === 'AD' && value.age !== undefined && value.age !== null)) invalid('TRAVELLER_VALIDATION_ERROR');
      const traveler = { type: value.type, firstName: value.firstName.trim(), lastName: value.lastName.trim(), roomId: 1 };
      // DOB is optional in the current provider payload. Validate explicit input, never manufacture it.
      if (value.birthDate !== undefined && value.birthDate !== '') {
        if (typeof value.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate)
          || !Number.isFinite(Date.parse(value.birthDate)) || new Date(value.birthDate).toISOString().slice(0, 10) !== value.birthDate
          || value.birthDate > new Date().toISOString().slice(0, 10)) invalid('TRAVELLER_VALIDATION_ERROR');
        traveler.birthDate = value.birthDate;
      }
      if (value.type === 'CH') {
        if (!Number.isInteger(value.age) || value.age < 0 || value.age > 17) invalid('TRAVELLER_VALIDATION_ERROR');
        traveler.age = value.age;
      }
      return traveler;
    });
    const suppliedAges = normalized.filter(value => value.type === 'CH').map(value => value.age).sort((a, b) => a - b);
    if (JSON.stringify(suppliedAges) !== JSON.stringify(childAges.map(Number).sort((a, b) => a - b))) invalid('OCCUPANCY_MISMATCH');
    // Existing lead convention: the first adult is the holder. No independent lead identity/flags.
    return normalized;
  }

  prepareIntent(request, session) {
    // Pure validation of an existing server session, never a search offer from the browser.
    const invalid = code => { throw Object.assign(new Error('Данные предложения или туристов недействительны. Перепроверьте предложение.'), { status: 409, code }); };
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const text = value => typeof value === 'string' && value.trim().length > 0;
    const amount = value => ['number', 'string'].includes(typeof value) && text(String(value)) && Number.isFinite(Number(value)) && Number(value) > 0;
    const integer = (value, minimum) => ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= minimum;
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const fields = ['checkoutToken', 'provider', 'hotelId', 'rateKey', 'price', 'currency', 'priceEnvironment', 'acceptedPriceToken', 'travelers', 'review'];
    if (!object(request) || Object.keys(request).some(key => !fields.includes(key)) || !text(request.checkoutToken)
      || (Object.hasOwn(request, 'review') && request.review !== true)
      || !Array.isArray(request.travelers) || !object(session) || session.token !== request.checkoutToken) invalid('BOOKING_INTENT_INVALID');
    const offer = session.offer_snapshot;
    const now = Date.now(), expiresAt = Date.parse(session.expires_at);
    if (session.used_at || !Number.isFinite(expiresAt) || expiresAt <= now) invalid('CHECKOUT_SESSION_EXPIRED');
    if (!object(offer) || offer.checkRatePerformed !== true || !text(offer.checkedRateAt)) invalid('CHECKRATE_CONFIRMATION_REQUIRED');
    const checkedAt = Date.parse(offer.checkedRateAt);
    if (!Number.isFinite(checkedAt) || checkedAt > now || checkedAt >= expiresAt
      || now - checkedAt > require('./checkoutSessionService').getTtlMinutes() * 60000) invalid('CHECKRATE_CONFIRMATION_EXPIRED');
    if (session.provider !== 'hotelbeds' || offer.provider !== 'hotelbeds' || offer.priceEnvironment !== 'test'
      || providerConfig.hotelbeds.environment !== 'test') invalid('BOOKING_INTENT_ENVIRONMENT_MISMATCH');
    if (!text(String(offer.providerHotelId ?? '')) || !text(offer.rateKey) || offer.rateType !== 'BOOKABLE' || offer.recheckRequired !== false
      || String(session.provider_hotel_id) !== String(offer.providerHotelId) || session.provider_offer_id !== offer.rateKey
      || offer.offerId !== offer.rateKey || session.rate_type !== 'BOOKABLE') invalid('BOOKING_INTENT_IDENTITY_MISMATCH');
    if (!amount(offer.price) || !amount(session.total_amount) || !/^[A-Z]{3}$/.test(offer.currency || '')
      || session.currency !== offer.currency || Math.round(Number(session.total_amount) * 100) !== Math.round(Number(offer.price) * 100)) invalid('BOOKING_INTENT_MONEY_MISMATCH');
    const expected = { provider: offer.provider, hotelId: offer.providerHotelId, rateKey: offer.rateKey, currency: offer.currency, priceEnvironment: offer.priceEnvironment };
    for (const [key, value] of Object.entries(expected)) {
      if (Object.hasOwn(request, key) && (!['string', 'number'].includes(typeof request[key]) || String(request[key]) !== String(value))) invalid('BOOKING_INTENT_SELECTION_MISMATCH');
    }
    if (Object.hasOwn(request, 'price') && (!amount(request.price) || Math.round(Number(request.price) * 100) !== Math.round(Number(offer.price) * 100))) invalid('BOOKING_INTENT_PRICE_MISMATCH');
    if (offer.priceConfirmationRequired && request.acceptedPriceToken !== session.token) invalid('RATE_CHANGED');
    if (!text(offer.roomCode) || !text(offer.boardCode) || offer.paymentType !== 'AT_WEB' || offer.packaging !== false
      || !date(offer.checkIn) || !date(offer.checkOut) || !integer(offer.nights, 1)
      || (Date.parse(offer.checkOut) - Date.parse(offer.checkIn)) / 86400000 !== Number(offer.nights)) invalid('BOOKING_INTENT_STAY_INVALID');
    const occupancy = offer.occupancy;
    if (!object(occupancy) || !integer(occupancy.rooms, 1) || Number(occupancy.rooms) !== 1 || !integer(occupancy.adults, 1) || !integer(occupancy.children, 0)
      || Number(occupancy.adults) !== Number(offer.adults) || Number(occupancy.children) !== Number(offer.children)) invalid('BOOKING_INTENT_OCCUPANCY_INVALID');
    const childAges = occupancy.children > 0 ? (Array.isArray(offer.childrenAges) ? offer.childrenAges : typeof offer.childrenAges === 'string' ? offer.childrenAges.split(',') : []) : [];
    if (childAges.length !== Number(occupancy.children) || childAges.some(age => !integer(age, 0) || Number(age) > 17)) invalid('BOOKING_INTENT_OCCUPANCY_INVALID');
    const travelers = this.normalizeIntentTravelers(request.travelers, occupancy, childAges);
    // Reuse the checkout identifier; no new durable idempotency infrastructure or PII output.
    const requestId = require('node:crypto').createHash('sha256').update(session.token).digest('hex').slice(0, 32);
    return { state: 'INTENT_READY', travelers, requestId, provider: offer.provider, hotelId: String(offer.providerHotelId),
      rateKey: offer.rateKey, price: Number(offer.price), currency: offer.currency,
      room: { code: offer.roomCode, name: offer.roomName || offer.roomCode }, board: { code: offer.boardCode, name: offer.boardName || offer.boardCode },
      checkIn: offer.checkIn, checkOut: offer.checkOut, nights: Number(offer.nights),
      occupancy: { rooms: 1, adults: Number(occupancy.adults), children: Number(occupancy.children) },
      expectedTravelers: Number(occupancy.adults) + Number(occupancy.children), environment: 'test' };
  }

  reviewPreview(intent, session) {
    // Called only after prepareIntent: whitelist display fields, never raw offer/payload/identifiers.
    const offer = session.offer_snapshot;
    const label = value => typeof value === 'string' && value.trim() ? value.trim() : null;
    const hotel = label(offer.name) || label(offer.hotel) || label(offer.title);
    const expiresAt = Math.min(Date.parse(session.expires_at), Date.parse(offer.checkedRateAt) + require('./checkoutSessionService').getTtlMinutes() * 60000);
    return { state: 'REVIEW_READY', provider: 'hotelbeds', environment: 'test', expiresAt: new Date(expiresAt).toISOString(),
      hotel: hotel === `Hotelbeds #${intent.hotelId}` ? null : hotel,
      stay: { checkIn: intent.checkIn, checkOut: intent.checkOut, nights: intent.nights },
      offer: { room: offer.roomName === offer.roomCode ? null : label(offer.roomName),
        board: (label(offer.boardName) || label(offer.food)) === offer.boardCode ? null : label(offer.boardName) || label(offer.food),
        price: intent.price, currency: intent.currency },
      occupancy: { ...intent.occupancy }, expectedTravelers: intent.expectedTravelers,
      travelers: intent.travelers.map(value => ({ type: value.type, firstName: value.firstName, lastName: value.lastName,
        ...(value.age !== undefined ? { age: value.age } : {}), ...(value.birthDate ? { birthDate: value.birthDate } : {}) })),
      bookingAvailable: false, paymentAvailable: false };
  }

  intentBoundary(intent) {
    // Validate-only foundation: even a future flag change cannot execute booking here.
    try { this.assertBookingAllowed(); }
    catch (error) { if (error.code !== 'HOTELBEDS_BOOKING_DISABLED') throw error; }
    const { travelers, ...publicIntent } = intent;
    return { ...require('./bookingPaymentRecovery').disabledBoundary('booking', intent.requestId), intent: publicIntent,
      message: 'Предложение проверено. Бронирование и оплата пока недоступны.' };
  }

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
      // Absent/blank/object values are not evidence of a zero cancellation fee.
      if (!['number', 'string'].includes(typeof candidate) || String(candidate).trim() === '') continue;
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

  prepareCancellationIntent(request, booking, access) {
    return require('./refundReadinessService').prepareCancellationIntent(request, booking, access);
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
