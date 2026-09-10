const logger = require("../utils/logger");
const ApiResponse = require("../utils/apiResponse");

function classify(err) {
  if (!err) return { status: 500, code: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" };
  if (err.type === "entity.too.large") return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Тело запроса слишком большое" };
  if (err instanceof SyntaxError && "body" in err) return { status: 400, code: "INVALID_JSON", message: "Некорректный JSON" };
  if (/CORS: origin not allowed/i.test(String(err.message || ""))) return { status: 403, code: "CORS_ORIGIN_DENIED", message: "Источник запроса не разрешён" };
  return {
    status: Number(err.status || err.statusCode) || 500,
    code: err.code || (Number(err.status || err.statusCode) === 404 ? "NOT_FOUND" : "INTERNAL_ERROR"),
    message: err.message || "Внутренняя ошибка сервера",
  };
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const info = classify(err);
  logger.error(`${info.code} | ${req.method} ${req.originalUrl || req.url} | ${req.requestId || "no-request-id"} | ${err.stack || err.message || err}`);

  const payload = ApiResponse.error(
    info.status >= 500 && process.env.NODE_ENV === "production" ? "Внутренняя ошибка сервера" : info.message,
    process.env.NODE_ENV === "development" && info.status >= 500 ? [err.stack] : [],
    info.code
  );
  payload.requestId = req.requestId || null;

  return res.status(info.status).json(payload);
}

module.exports = errorHandler;
