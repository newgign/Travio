const router = require("express").Router();
const history = require("../services/priceHistoryService");
router.get("/", async (req, res) => {
  try { res.json({ success: true, data: await history.specials() }); }
  catch { res.status(503).json({ success: false, message: "Не удалось загрузить предложения. Попробуйте позже." }); }
});
module.exports = router;
