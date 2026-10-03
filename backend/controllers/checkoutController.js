const offerResolverService = require("../services/offerResolverService");
const offerTokenService = require("../services/offerTokenService");
const checkoutSessionService = require("../services/checkoutSessionService");
const providerManager = require("../providers/providerManager");
const logger = require("../utils/logger");
const hotelbedsBookingService = require("../services/hotelbedsBookingService");

const getCheckout = async (req, res, next) => {
  try {
    const {
      provider = "mock",
      hotelId,
      tourId,
      offerToken,
      people,
      filters = {},
    } = req.body || {};

    let searchFilters = {
      ...filters,
      people: Number(people) || Number(filters.people) || 2,
      nights: Number(filters.nights) || 7,
      children: Number(filters.children) || 0,
    };

    let offer;
    let selectedPriceBeforeCheckRate = null;

    if (offerToken) {
      // Reuse the exact provider rate selected in the search/detail Availability.
      // This is what prevents a second Availability call in the booking funnel.
      offer = offerTokenService.verify(offerToken);
      selectedPriceBeforeCheckRate = Number(offer.price) || null;

      if (provider && String(provider) !== String(offer.provider)) {
        const error = new Error("Поставщик выбранного предложения не совпадает с checkout.");
        error.status = 409;
        error.code = "OFFER_PROVIDER_MISMATCH";
        throw error;
      }

      const selectedHotelId = hotelId ?? tourId;

      if (
        selectedHotelId !== undefined &&
        selectedHotelId !== null &&
        String(selectedHotelId) !== String(offer.providerHotelId)
      ) {
        const error = new Error("Отель выбранного предложения не совпадает с checkout.");
        error.status = 409;
        error.code = "OFFER_HOTEL_MISMATCH";
        throw error;
      }

      searchFilters = {
        ...filters,
        people: Math.max(Number(offer.adults) || 1, 1),
        adults: Math.max(Number(offer.adults) || 1, 1),
        children: Math.max(Number(offer.children) || 0, 0),
        childrenAges: offer.childrenAges || filters.childrenAges || null,
        nights: Math.max(Number(offer.nights) || 1, 1),
        departureDate: offer.departureDate || offer.checkIn || filters.departureDate,
      };
    } else {
      // Direct checkout/reload fallback: this becomes the one Availability call
      // for this new booking attempt.
      offer = await offerResolverService.resolve({
        providerName: provider,
        hotelId: hotelId ?? tourId,
        filters: searchFilters,
      });
      selectedPriceBeforeCheckRate = Number(offer.price) || null;
    }

    providerManager.getProvider(offer.provider);
    if (offer.provider === 'hotelbeds') {
      const environment = require('../config/providers').hotelbeds.environment;
      if (offer.priceEnvironment !== environment) throw Object.assign(new Error('Предложение устарело. Выполните новый поиск.'), { status: 409, code: 'OFFER_ENVIRONMENT_MISMATCH' });
      if (environment !== 'test') throw Object.assign(new Error('Проверка доступна только в TEST.'), { status: 503, code: 'CHECKRATE_TEST_ONLY' });
      if (!offer.rateKey || !offer.providerHotelId || !['BOOKABLE', 'RECHECK'].includes(offer.rateType)
        || !Number.isFinite(Number(offer.price)) || Number(offer.price) <= 0 || !/^[A-Z]{3}$/.test(offer.currency || '')) {
        throw Object.assign(new Error('Выбранное предложение недействительно.'), { status: 409, code: 'OFFER_TOKEN_INVALID' });
      }
      // RECHECK already carries the signed selected identity; do not spend another Availability call.
      if (offerToken && offer.rateType !== 'RECHECK') offer = await providerManager.getProvider('hotelbeds').refreshOffer(offer);
    }
    // Hotelbeds requires CheckRate only when Availability returned RECHECK.
    if (offer.provider === "hotelbeds" && offer.rateType === 'RECHECK') {
      const providerImplementation = providerManager.getProvider("hotelbeds");
      offer = await providerImplementation.checkRateOffer(offer);

      if (offer.recheckRequired) {
        const error = new Error(
          "Hotelbeds не вернул BOOKABLE rate после CheckRate. Выполните новый поиск."
        );
        error.status = 409;
        error.code = "HOTELBEDS_RATE_NOT_BOOKABLE";
        throw error;
      }
    }

    if (offer.provider === "hotelbeds") {
      hotelbedsBookingService.assertOfferSupported(offer);
      offer = { ...offer, bookingDisabled: true };
    }

    if (!Number.isFinite(Number(offer.price)) || Number(offer.price) <= 0 || !/^[A-Z]{3}$/.test(offer.currency || '')) {
      throw Object.assign(new Error('Не удалось проверить стоимость.'), { status: 503, code: 'CHECKRATE_RETRYABLE_ERROR' });
    }

    const adults = Math.max(Number(searchFilters.people) || 1, 1);
    const children = Math.max(Number(searchFilters.children) || 0, 0);
    const travelers = adults + children;
    const subtotal = Number(offer.price) || 0;
    const pricePerPerson = travelers > 0
      ? Math.round((subtotal / travelers) * 100) / 100
      : subtotal;
    const discount = 0;
    const insurance = 0;
    const serviceFee = 0;
    const total = subtotal - discount + insurance + serviceFee;

    const tour = {
      ...offer,
      hotel: offer.name || offer.title,
    };

    const checkoutSession = await checkoutSessionService.create({
      offer: { ...tour, priceConfirmationRequired: selectedPriceBeforeCheckRate !== null && Math.round(selectedPriceBeforeCheckRate * 100) !== Math.round(total * 100) },
      filters: searchFilters,
    });

    logger.info(
      `CHECKOUT READY | ${tour.provider}:${tour.providerHotelId} | rateType=${tour.rateType || "-"} | ${total} ${tour.currency}`
    );

    return res.json({
      tour,
      adults,
      children,
      people: travelers,
      pricePerPerson,
      subtotal,
      discount,
      insurance,
      serviceFee,
      total,
      previousTotal: selectedPriceBeforeCheckRate,
      checkRateStatus: selectedPriceBeforeCheckRate !== null && Math.round(selectedPriceBeforeCheckRate * 100) !== Math.round(total * 100) ? 'PRICE_CHANGED' : 'CONFIRMED',
      priceChangedAtCheckRate:
        selectedPriceBeforeCheckRate !== null &&
        Math.round(selectedPriceBeforeCheckRate * 100) !== Math.round(total * 100),
      checkoutToken: checkoutSession.token,
      checkoutExpiresAt: checkoutSession.expiresAt,
      recheckedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (req.body?.provider === 'hotelbeds' || req.body?.offerToken) {
      const unavailable = ['RATE_NOT_AVAILABLE', 'HOTELBEDS_RECHECK_UNAVAILABLE', 'HOTELBEDS_RATE_NOT_BOOKABLE',
        'HOTELBEDS_AT_HOTEL_UNSUPPORTED', 'OFFER_TOKEN_INVALID', 'OFFER_TOKEN_EXPIRED',
        'OFFER_HOTEL_MISMATCH', 'OFFER_PROVIDER_MISMATCH', 'OFFER_ENVIRONMENT_MISMATCH'].includes(error.code);
      if (typeof res.status === 'function') return res.status(unavailable ? 409 : 503).json({
        checkRateStatus: unavailable ? 'UNAVAILABLE' : 'RETRYABLE_ERROR',
        code: unavailable ? error.code : 'CHECKRATE_RETRYABLE_ERROR',
        message: unavailable ? 'Выбранное предложение больше недоступно. Выберите другой тариф.' : 'Не удалось проверить стоимость. Повторите попытку.',
      });
    }
    next(error);
  }
};

module.exports = {
  getCheckout,
};
