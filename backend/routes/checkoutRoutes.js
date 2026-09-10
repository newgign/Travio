const express = require("express");

const router = express.Router();

const {
  getCheckout,
} = require("../controllers/checkoutController");

router.post("/review", getCheckout);

module.exports = router;