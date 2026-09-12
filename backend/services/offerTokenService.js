const jwt = require("jsonwebtoken");

class OfferTokenService {
  getSecret() {
    const secret = process.env.OFFER_TOKEN_SECRET || process.env.JWT_SECRET;

    if (!secret) {
      const error = new Error("Не настроен OFFER_TOKEN_SECRET/JWT_SECRET");
      error.status = 500;
      error.code = "OFFER_TOKEN_SECRET_MISSING";
      throw error;
    }

    return secret;
  }

  compactOffer(offer = {}) {
    const fields = [
      "bookingDisabled", "stagingTestAllowed", "priceEnvironment", "occupancy", "priceSource", "providerAmount", "providerCurrency",
      "displayAmount", "displayCurrency", "taxes", "fees", "rateClass", "priceBasis",
      "taxBreakdownAvailable", "observedAt",
      "provider",
      "providerHotelId",
      "id",
      "name",
      "title",
      "country",
      "city",
      "destinationCode",
      "stars",
      "rating",
      "reviewsCount",
      "price",
      "basePrice",
      "currency",
      "priceIsFinal",
      "image",
      "nights",
      "adults",
      "children",
      "childrenAges",
      "food",
      "roomType",
      "departureCity",
      "departureDate",
      "offerId",
      "providerOfferId",
      "rateKey",
      "rateType",
      "recheckRequired",
      "roomCode",
      "roomName",
      "boardCode",
      "boardName",
      "paymentType",
      "packaging",
      "cancellationPolicies",
      "rateComments",
      "rateCommentsId",
      "checkIn",
      "checkOut",
    ];

    const compact = {};

    for (const field of fields) {
      if (offer[field] !== undefined) {
        compact[field] = offer[field];
      }
    }

    return compact;
  }

  sign(offer) {
    const compact = this.compactOffer(offer);

    return jwt.sign(
      {
        type: "travio_provider_offer",
        offer: compact,
      },
      this.getSecret(),
      {
        expiresIn: process.env.OFFER_TOKEN_EXPIRES_IN || "20m",
      }
    );
  }

  verify(token) {
    try {
      const payload = jwt.verify(String(token || ""), this.getSecret());

      if (payload?.type !== "travio_provider_offer" || !payload?.offer) {
        throw new Error("Некорректный тип offer token");
      }

      return payload.offer;
    } catch (error) {
      const wrapped = new Error(
        error.name === "TokenExpiredError"
          ? "Выбранное предложение устарело. Выполните новый поиск."
          : "Выбранное предложение недействительно. Выполните новый поиск."
      );
      wrapped.status = 409;
      wrapped.code =
        error.name === "TokenExpiredError"
          ? "OFFER_TOKEN_EXPIRED"
          : "OFFER_TOKEN_INVALID";
      throw wrapped;
    }
  }
}

module.exports = new OfferTokenService();
