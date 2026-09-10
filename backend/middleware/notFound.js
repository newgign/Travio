module.exports = function notFound(req, res) {
  return res.status(404).json({
    success: false,
    message: "API маршрут не найден",
    code: "ROUTE_NOT_FOUND",
    errors: [],
    requestId: req.requestId || null,
  });
};
