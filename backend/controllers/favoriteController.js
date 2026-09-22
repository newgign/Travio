const pool = require("../db");
const providerManager = require("../providers/providerManager");
const offerService = require("../services/offerService");

function serializeHotelData(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function getFavorites(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT id, provider, provider_hotel_id, hotel_data, created_at
      FROM favorites
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    const data = result.rows.map((row) => ({
      ...serializeHotelData(row.hotel_data),
      favoriteId: row.id,
      provider: row.provider,
      providerHotelId: row.provider_hotel_id,
      id: Number(row.provider_hotel_id) || row.provider_hotel_id,
      favoriteCreatedAt: row.created_at,
    }));

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    require("../utils/logger").error("GET FAVORITES ERROR:", { error: error });

    return res.status(500).json({
      message: "Ошибка загрузки избранного",
    });
  }
}

async function addFavorite(req, res) {
  try {
    const providerName = String(req.body.provider || "mock").trim();
    const hotelId = req.body.hotelId;

    if (!hotelId) {
      return res.status(400).json({
        message: "Не указан отель",
      });
    }

    const provider = providerManager.getProvider(providerName);
    const filters = req.body.filters || {};
    const hotels = providerName === "hotelbeds"
      ? [await provider.getHotelById(hotelId, filters)].filter(Boolean)
      : await provider.searchHotels(filters);

    const hotel = hotels.find(
      (item) =>
        String(item.providerHotelId ?? item.id) === String(hotelId)
    );

    if (!hotel) {
      return res.status(404).json({
        message: "Отель не найден",
      });
    }

    const snapshot = offerService.generateOffer(hotel, {
      people: 2,
      nights: 7,
      ...filters,
    });

    const result = await pool.query(
      `
      INSERT INTO favorites
      (
        user_id,
        provider,
        provider_hotel_id,
        hotel_data
      )
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (user_id, provider, provider_hotel_id)
      DO UPDATE SET
        hotel_data = EXCLUDED.hotel_data
      RETURNING id, provider, provider_hotel_id, hotel_data, created_at
      `,
      [
        req.user.id,
        providerName,
        String(hotel.providerHotelId ?? hotel.id),
        JSON.stringify(snapshot),
      ]
    );

    const row = result.rows[0];

    return res.status(201).json({
      success: true,
      data: {
        ...serializeHotelData(row.hotel_data),
        favoriteId: row.id,
        provider: row.provider,
        providerHotelId: row.provider_hotel_id,
        id: Number(row.provider_hotel_id) || row.provider_hotel_id,
        favoriteCreatedAt: row.created_at,
      },
    });
  } catch (error) {
    require("../utils/logger").error("ADD FAVORITE ERROR:", { error: error });

    if (error.message?.includes('Provider "')) {
      return res.status(400).json({
        message: "Неизвестный поставщик",
      });
    }

    return res.status(500).json({
      message: "Ошибка добавления в избранное",
    });
  }
}

async function deleteFavorite(req, res) {
  try {
    const provider = String(req.params.provider || "mock").trim();
    const hotelId = String(req.params.hotelId || "").trim();

    const result = await pool.query(
      `
      DELETE FROM favorites
      WHERE user_id = $1
        AND provider = $2
        AND provider_hotel_id = $3
      RETURNING id
      `,
      [req.user.id, provider, hotelId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Отель не найден в избранном",
      });
    }

    return res.json({
      success: true,
    });
  } catch (error) {
    require("../utils/logger").error("DELETE FAVORITE ERROR:", { error: error });

    return res.status(500).json({
      message: "Ошибка удаления из избранного",
    });
  }
}

module.exports = {
  getFavorites,
  addFavorite,
  deleteFavorite,
};
