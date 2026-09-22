const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function buildPublicUser(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone || null,
    role: row.role || "user",
    preferred_language: row.preferred_language || "ru",
    email_notifications: row.email_notifications !== false,
    booking_reminders: row.booking_reminders !== false,
    created_at: row.created_at,
  };
}

async function bookingStats(userId) {
  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status = 'Подтверждена'
           OR UPPER(COALESCE(provider_status, '')) IN ('CONFIRMED', 'MODIFIED')
      )::int AS confirmed,
      COUNT(*) FILTER (
        WHERE status = 'Отменена'
           OR UPPER(COALESCE(provider_status, '')) IN ('CANCELLED', 'CANCELED')
      )::int AS cancelled,
      COUNT(*) FILTER (
        WHERE UPPER(COALESCE(provider_status, '')) IN
          ('CONFIRMATION_UNKNOWN', 'CONFIRMATION_FAILED', 'RATE_EXPIRED')
      )::int AS attention
    FROM bookings
    WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0] || { total: 0, confirmed: 0, cancelled: 0, attention: 0 };
}

const register = async (req, res) => {
  try {
    const fullName = String(req.body.full_name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const phone = String(req.body.phone || "").trim() || null;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "Укажите имя, email и пароль" });
    }

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Укажите корректный email" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Пароль должен содержать не менее 8 символов" });
    }

    const userExists = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = $1",
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(409).json({ message: "Пользователь с таким email уже существует" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await pool.query(
      `
      INSERT INTO users (full_name, email, password, phone)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id, full_name, email, phone, role,
        preferred_language, email_notifications, booking_reminders, created_at
      `,
      [fullName, email, hashedPassword, phone]
    );

    return res.status(201).json({
      message: "Регистрация успешна",
      user: buildPublicUser(newUser.rows[0]),
    });
  } catch (err) {
    require("../utils/logger").error("REGISTER ERROR:", { error: err });
    return res.status(500).json({ message: "Ошибка регистрации" });
  }
};

const login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Введите email и пароль" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Неверный email или пароль" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: "Неверный email или пароль" });
    }

    const publicUser = buildPublicUser(user);

    const token = jwt.sign(
      { id: publicUser.id, email: publicUser.email, role: publicUser.role },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.json({
      message: "Вход выполнен",
      token,
      user: publicUser,
    });
  } catch (err) {
    require("../utils/logger").error("LOGIN ERROR:", { error: err });
    return res.status(500).json({ message: "Ошибка входа" });
  }
};

const profile = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id, full_name, email, phone, role,
        preferred_language, email_notifications, booking_reminders,
        created_at
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    return res.json({
      ...buildPublicUser(result.rows[0]),
      stats: await bookingStats(req.user.id),
    });
  } catch (err) {
    require("../utils/logger").error("PROFILE ERROR:", { error: err });
    return res.status(500).json({ message: "Ошибка загрузки профиля" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const fullName = String(req.body.full_name || "").trim();
    const phone = String(req.body.phone || "").trim() || null;
    const preferredLanguage = ["ru", "en", "kk"].includes(String(req.body.preferred_language || "ru"))
      ? String(req.body.preferred_language || "ru")
      : "ru";
    const emailNotifications = req.body.email_notifications !== false;
    const bookingReminders = req.body.booking_reminders !== false;

    if (!fullName) {
      return res.status(400).json({ message: "Укажите имя" });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET full_name = $1,
          phone = $2,
          preferred_language = $3,
          email_notifications = $4,
          booking_reminders = $5,
          updated_at = NOW()
      WHERE id = $6
      RETURNING
        id, full_name, email, phone, role,
        preferred_language, email_notifications, booking_reminders,
        created_at
      `,
      [
        fullName,
        phone,
        preferredLanguage,
        emailNotifications,
        bookingReminders,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    return res.json({
      message: "Профиль сохранён",
      user: buildPublicUser(result.rows[0]),
      stats: await bookingStats(req.user.id),
    });
  } catch (err) {
    require("../utils/logger").error("UPDATE PROFILE ERROR:", { error: err });
    return res.status(500).json({ message: "Ошибка сохранения профиля" });
  }
};

const changePassword = async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Введите текущий и новый пароль" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Новый пароль должен содержать не менее 8 символов" });
    }

    const result = await pool.query(
      "SELECT id, password FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!valid) {
      return res.status(400).json({ message: "Текущий пароль указан неверно" });
    }

    const hash = await bcrypt.hash(newPassword, 12);

    await pool.query(
      "UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2",
      [hash, req.user.id]
    );

    return res.json({ message: "Пароль изменён" });
  } catch (err) {
    require("../utils/logger").error("CHANGE PASSWORD ERROR:", { error: err });
    return res.status(500).json({ message: "Ошибка изменения пароля" });
  }
};

module.exports = {
  register,
  login,
  profile,
  updateProfile,
  changePassword,
  buildPublicUser,
};
