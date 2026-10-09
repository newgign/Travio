const jwt = require("jsonwebtoken");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

module.exports = (req, res, next) => {
  try {
    const authHeader = req.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Требуется авторизация",
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        message: "Требуется авторизация",
      });
    }

    const session = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    // Offer JWTs may share the legacy secret, but are never authentication sessions.
    if (!session || typeof session !== 'object' || session.type !== undefined
      || !Number.isSafeInteger(session.id) || session.id < 1 || !['user', 'admin'].includes(session.role)
      || !Number.isFinite(session.exp)) throw new Error('Invalid session claims');
    req.user = session;

    return next();
  } catch (err) {
    if (err.message === "JWT_SECRET is not configured") {
      console.error(err.message);

      return res.status(500).json({
        message: "Ошибка конфигурации сервера",
      });
    }

    return res.status(401).json({
      message: "Сессия истекла или токен недействителен",
    });
  }
};
