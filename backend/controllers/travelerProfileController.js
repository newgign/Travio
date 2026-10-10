const pool = require("../db");

const MAX_SAVED_TRAVELERS = 12;

const { travelerInput: normalizeTraveler, publicTraveler } = require('../utils/profileBoundary');

async function listTravelers(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT id, label, traveler_type, first_name, last_name, birth_date::text AS birth_date, created_at, updated_at
      FROM traveler_profiles
      WHERE user_id = $1
      ORDER BY id ASC
      `,
      [req.user.id]
    );

    return res.json(result.rows.map(publicTraveler));
  } catch (error) {
    if (error.code === 'PROFILE_INPUT_INVALID') return res.status(400).json({ code: error.code, field: error.field, message: '\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043f\u043e\u043b\u044f \u0442\u0443\u0440\u0438\u0441\u0442\u0430' });
    require("../utils/logger").error("LIST TRAVELERS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки сохранённых туристов" });
  }
}

async function createTraveler(req, res) {
  try {
    const traveler = normalizeTraveler(req.body);

    const count = await pool.query(
      "SELECT COUNT(*)::int AS count FROM traveler_profiles WHERE user_id = $1",
      [req.user.id]
    );

    if (Number(count.rows[0]?.count || 0) >= MAX_SAVED_TRAVELERS) {
      return res.status(409).json({
        message: `Можно сохранить не более ${MAX_SAVED_TRAVELERS} туристов`,
      });
    }

    const result = await pool.query(
      `
      INSERT INTO traveler_profiles
        (user_id, label, traveler_type, first_name, last_name, birth_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, label, traveler_type, first_name, last_name, birth_date::text AS birth_date, created_at, updated_at
      `,
      [
        req.user.id,
        traveler.label,
        traveler.travelerType,
        traveler.firstName,
        traveler.lastName,
        traveler.birthDate,
      ]
    );

    return res.status(201).json(publicTraveler(result.rows[0]));
  } catch (error) {
    if (error.code === 'PROFILE_INPUT_INVALID') return res.status(400).json({ code: error.code, field: error.field, message: '\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043f\u043e\u043b\u044f \u0442\u0443\u0440\u0438\u0441\u0442\u0430' });
    require("../utils/logger").error("CREATE TRAVELER ERROR:", { error: error });
    return res.status(error.status || 500).json({
      message: require("../utils/apiResponse").publicMessage(error, "Ошибка сохранения туриста"),
    });
  }
}

async function updateTraveler(req, res) {
  try {
    const traveler = normalizeTraveler(req.body);

    const result = await pool.query(
      `
      UPDATE traveler_profiles
      SET label = $1,
          traveler_type = $2,
          first_name = $3,
          last_name = $4,
          birth_date = $5,
          updated_at = NOW()
      WHERE id = $6 AND user_id = $7
      RETURNING id, label, traveler_type, first_name, last_name, birth_date::text AS birth_date, created_at, updated_at
      `,
      [
        traveler.label,
        traveler.travelerType,
        traveler.firstName,
        traveler.lastName,
        traveler.birthDate,
        req.params.id,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Сохранённый турист не найден" });
    }

    return res.json(publicTraveler(result.rows[0]));
  } catch (error) {
    if (error.code === 'PROFILE_INPUT_INVALID') return res.status(400).json({ code: error.code, field: error.field, message: '\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043f\u043e\u043b\u044f \u0442\u0443\u0440\u0438\u0441\u0442\u0430' });
    require("../utils/logger").error("UPDATE TRAVELER ERROR:", { error: error });
    return res.status(error.status || 500).json({
      message: require("../utils/apiResponse").publicMessage(error, "Ошибка обновления туриста"),
    });
  }
}

async function deleteTraveler(req, res) {
  try {
    const result = await pool.query(
      `
      DELETE FROM traveler_profiles
      WHERE id = $1 AND user_id = $2
      RETURNING id
      `,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Сохранённый турист не найден" });
    }

    return res.json({ success: true });
  } catch (error) {
    if (error.code === 'PROFILE_INPUT_INVALID') return res.status(400).json({ code: error.code, field: error.field, message: '\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043f\u043e\u043b\u044f \u0442\u0443\u0440\u0438\u0441\u0442\u0430' });
    require("../utils/logger").error("DELETE TRAVELER ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка удаления туриста" });
  }
}

module.exports = {
  listTravelers,
  createTraveler,
  updateTraveler,
  deleteTraveler,
  normalizeTraveler,
};
