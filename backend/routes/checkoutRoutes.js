const express = require("express");

const router = express.Router();

const {
  getCheckout,
} = require("../controllers/checkoutController");

router.post("/review", require('../middleware/rateLimit').publicRateLimiter, getCheckout);

module.exports = router;
