const pool = require("../db");

// ======================================
// Dashboard statistics
// ======================================

const getStats = async (req, res) => {
  try {

    const tours = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM tours
    `);

    const users = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM users
    `);

    const bookings = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM bookings
    `);

    const revenue = await pool.query(`
      SELECT
      COALESCE(SUM(amount), 0)::bigint AS total
      FROM payments
      WHERE status = 'paid'
    `);

    res.json({

      tours: tours.rows[0].total,

      users: users.rows[0].total,

      bookings: bookings.rows[0].total,

      revenue: revenue.rows[0].total,

    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Ошибка получения статистики",
    });

  }
};

module.exports = {
  getStats,
};