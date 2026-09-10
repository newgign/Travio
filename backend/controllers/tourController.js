const pool = require("../db");
const searchService = require("../services/searchService");
const adminAuditService = require("../services/adminAuditService");

// ======================
// Получить список туров
// ======================
const getTours = async (req, res) => {
  try {
    const {
      country,
      city,
      minPrice,
      maxPrice,
      duration,
    } = req.query;

    let query = "SELECT * FROM tours WHERE 1=1";
    const values = [];

    if (country) {
      values.push(country);
      query += ` AND country = $${values.length}`;
    }

    if (city) {
      values.push(city);
      query += ` AND city = $${values.length}`;
    }

    if (minPrice) {
      values.push(minPrice);
      query += ` AND price >= $${values.length}`;
    }

    if (maxPrice) {
      values.push(maxPrice);
      query += ` AND price <= $${values.length}`;
    }

    if (duration) {
      values.push(duration);
      query += ` AND duration = $${values.length}`;
    }

    query += " ORDER BY price ASC";

    const tours = await pool.query(query, values);

    res.json(tours.rows);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Ошибка сервера",
    });

  }
};

// ======================
// Получить один тур
// ======================
const getTourById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM tours WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Тур не найден",
      });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Ошибка сервера",
    });

  }
};

// ======================
// Создать тур
// ======================
const createTour = async (req, res) => {
  try {

    const {
      country,
      city,
      hotel,
      image,
      price,
      rating,
      duration,
      food,
      description,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO tours
      (
        country,
        city,
        hotel,
        image,
        price,
        rating,
        duration,
        food,
        description
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        country,
        city,
        hotel,
        image,
        price,
        rating,
        duration,
        food,
        description,
      ]
    );

    const created = result.rows[0];
    await adminAuditService.safeRecordAction({
      adminId: req.user.id,
      actionType: "tour_created",
      targetType: "tour",
      targetId: created.id,
      metadata: { hotel: created.hotel, country: created.country, city: created.city },
    });

    res.status(201).json(created);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Ошибка создания тура",
    });

  }
};

// ======================
// Обновить тур
// ======================
const updateTour = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      country,
      city,
      hotel,
      image,
      price,
      rating,
      duration,
      food,
      description,
    } = req.body;

    const result = await pool.query(
      `UPDATE tours
       SET
         country=$1,
         city=$2,
         hotel=$3,
         image=$4,
         price=$5,
         rating=$6,
         duration=$7,
         food=$8,
         description=$9
       WHERE id=$10
       RETURNING *`,
      [
        country,
        city,
        hotel,
        image,
        price,
        rating,
        duration,
        food,
        description,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Тур не найден",
      });
    }

    const updated = result.rows[0];
    await adminAuditService.safeRecordAction({
      adminId: req.user.id,
      actionType: "tour_updated",
      targetType: "tour",
      targetId: updated.id,
      metadata: { hotel: updated.hotel, country: updated.country, city: updated.city },
    });

    res.json(updated);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Ошибка обновления тура",
    });

  }
};

// ======================
// Удалить тур
// ======================
const deleteTour = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM tours WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Тур не найден",
      });
    }

    const deleted = result.rows[0];
    await adminAuditService.safeRecordAction({
      adminId: req.user.id,
      actionType: "tour_deleted",
      targetType: "tour",
      targetId: deleted.id,
      metadata: { hotel: deleted.hotel, country: deleted.country, city: deleted.city },
    });

    res.json({
      message: "Тур удалён",
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Ошибка удаления тура",
    });

  }
};

// ======================
// Новый поиск
// ======================
const searchTours = async (req, res) => {

  try {

    const tours = await searchService.search(req.query);

    res.json(tours);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Ошибка поиска туров",
    });

  }

};

module.exports = {
  getTours,
  getTourById,
  createTour,
  updateTour,
  deleteTour,
  searchTours,
};