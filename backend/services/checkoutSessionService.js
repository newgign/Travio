const crypto = require("crypto");
const pool = require("../db");

class CheckoutSessionService {
  getTtlMinutes() {
    return Math.max(Number(process.env.CHECKOUT_SESSION_TTL_MINUTES) || 20, 5);
  }

  async create({ offer, filters = {} }) {
    if (!offer?.provider || !offer?.providerHotelId || !offer?.offerId) {
      const error = new Error("Невозможно создать checkout-сессию: предложение неполное");
      error.status = 500;
      error.code = "CHECKOUT_SESSION_INVALID_OFFER";
      throw error;
    }

    const token = crypto.randomUUID();
    const ttlMinutes = this.getTtlMinutes();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await pool.query(
      `
      INSERT INTO checkout_sessions
      (
        token,
        provider,
        provider_hotel_id,
        provider_offer_id,
        rate_type,
        currency,
        total_amount,
        offer_snapshot,
        search_filters,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
      `,
      [
        token,
        String(offer.provider),
        String(offer.providerHotelId),
        String(offer.offerId),
        offer.rateType || null,
        offer.currency || "KZT",
        Number(offer.price) || 0,
        JSON.stringify(offer),
        JSON.stringify(filters),
        expiresAt,
      ]
    );

    return {
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async lockForBooking(client, token) {
    const normalizedToken = String(token || "").trim();

    if (!normalizedToken) {
      const error = new Error("Checkout-сессия не указана. Вернитесь к проверке тура.");
      error.status = 400;
      error.code = "CHECKOUT_SESSION_REQUIRED";
      throw error;
    }

    const result = await client.query(
      `
      SELECT *
      FROM checkout_sessions
      WHERE token = $1
      FOR UPDATE
      `,
      [normalizedToken]
    );

    const session = result.rows[0];

    if (!session) {
      const error = new Error("Checkout-сессия не найдена. Перепроверьте предложение.");
      error.status = 404;
      error.code = "CHECKOUT_SESSION_NOT_FOUND";
      throw error;
    }

    if (session.used_at) {
      const error = new Error("Эта checkout-сессия уже использована. Создайте новую заявку.");
      error.status = 409;
      error.code = "CHECKOUT_SESSION_USED";
      throw error;
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      const error = new Error("Цена устарела. Вернитесь назад и перепроверьте предложение.");
      error.status = 409;
      error.code = "CHECKOUT_SESSION_EXPIRED";
      throw error;
    }

    require("../providers/providerManager").getProvider(session.provider);
    if (session.provider === "hotelbeds" && session.offer_snapshot?.priceEnvironment !== require("../config/providers").hotelbeds.environment) {
      throw Object.assign(new Error("Предложение устарело. Выполните новый поиск."), { status: 409, code: "OFFER_ENVIRONMENT_MISMATCH" });
    }
    return session;
  }

  async markUsed(client, token) {
    await client.query(
      `UPDATE checkout_sessions SET used_at = NOW() WHERE token = $1`,
      [token]
    );
  }
}

module.exports = new CheckoutSessionService();
