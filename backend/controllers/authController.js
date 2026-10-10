const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const accountSecurity = require('../services/accountSecurityState');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function credentialInput(body, registration = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.email !== 'string' || body.email.length > 254
    || typeof body.password !== 'string' || Buffer.byteLength(body.password, 'utf8') > (registration ? 72 : 1024)) return false;
  return !registration || (typeof body.full_name === 'string' && body.full_name.length <= 255
    && (body.phone == null || typeof body.phone === 'string' && body.phone.length <= 50));
}

const profileBoundary = require('../utils/profileBoundary');
const buildPublicUser = profileBoundary.publicUser;

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
    if (!credentialInput(req.body, true)) return res.status(400).json({ code: 'AUTH_INPUT_INVALID' });
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
  let enforce = false;
  try {
    enforce = accountSecurity.enforcementMode() === 'enabled';
    if (!credentialInput(req.body)) return res.status(400).json({ code: 'AUTH_INPUT_INVALID' });
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
    const security = enforce ? accountSecurity.securityState(user) : null;
    if (security && !security.isActive) return res.status(401).json({ message: 'Неверный email или пароль' });
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: "Неверный email или пароль" });
    }

    // A successful bcrypt comparison does not authenticate bytes beyond its boundary.
    // Do not mint a general session or silently rehash an ambiguous long credential.
    if (Buffer.byteLength(password, 'utf8') > 72)
      return res.status(409).json({ code: 'PASSWORD_UPDATE_REQUIRED',
        passwordUpdateToken: require('../services/legacyPasswordUpgrade').issue(user) });

    const publicUser = buildPublicUser(user);

    const token = jwt.sign(
      { id: publicUser.id, email: publicUser.email, role: publicUser.role,
        ...(security ? { sessionVersion: security.sessionVersion } : {}) },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.json({
      message: "Вход выполнен",
      token,
      user: publicUser,
    });
  } catch (err) {
    if (enforce || ['SESSION_SECURITY_CONFIG_INVALID', 'ACCOUNT_SECURITY_STATE_UNAVAILABLE'].includes(err.code))
      return res.status(503).json({ code: 'ACCOUNT_SECURITY_STATE_UNAVAILABLE' });
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
    const { fullName, phone, preferredLanguage, emailNotifications, bookingReminders } = profileBoundary.profileInput(req.body);

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
    if (err.code === 'PROFILE_INPUT_INVALID') return res.status(400).json({ code: err.code, field: err.field, message: 'Проверьте поля профиля' });
    require("../utils/logger").error("UPDATE PROFILE ERROR:", { error: err });
    return res.status(500).json({ message: "Ошибка сохранения профиля" });
  }
};

const changePassword = async (req, res) => {
  let enforce = false;
  try {
    enforce = accountSecurity.enforcementMode() === 'enabled';
    if (!req.body || typeof req.body.currentPassword !== 'string' || typeof req.body.newPassword !== 'string'
      || Buffer.byteLength(req.body.currentPassword, 'utf8') > 1024 || Buffer.byteLength(req.body.newPassword, 'utf8') > 72)
      return res.status(400).json({ code: 'AUTH_INPUT_INVALID' });
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Введите текущий и новый пароль" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Новый пароль должен содержать не менее 8 символов" });
    }

    const result = await pool.query(
      enforce ? "SELECT id, password, role, session_version, is_active FROM users WHERE id = $1"
        : "SELECT id, password FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const security = enforce ? accountSecurity.securityState(result.rows[0]) : null;
    if (security && (!security.isActive || security.id !== req.user.id || security.sessionVersion !== req.user.sessionVersion))
      return res.status(401).json({ code: 'SESSION_INVALID' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!valid) {
      return res.status(400).json({ message: "Текущий пароль указан неверно" });
    }

    const hash = await bcrypt.hash(newPassword, 12);

    if (enforce) {
      // One atomic mutation; stale concurrent password/account changes cannot silently win.
      const changed = await pool.query(
        "UPDATE users SET password = $1, session_version = session_version + 1, updated_at = NOW() WHERE id = $2 AND password = $3 AND session_version = $4 AND is_active = TRUE RETURNING id",
        [hash, req.user.id, result.rows[0].password, security.sessionVersion]);
      if (changed.rows.length !== 1) return res.status(401).json({ code: 'SESSION_INVALID' });
    } else {
      await pool.query("UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2", [hash, req.user.id]);
    }

    return res.json({ message: "Пароль изменён", ...(enforce ? { reauthenticationRequired: true } : {}) });
  } catch (err) {
    if (enforce || ['SESSION_SECURITY_CONFIG_INVALID', 'ACCOUNT_SECURITY_STATE_UNAVAILABLE'].includes(err.code))
      return res.status(503).json({ code: 'ACCOUNT_SECURITY_STATE_UNAVAILABLE' });
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
