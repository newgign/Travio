const express = require("express");

const router = express.Router();

const searchValidator = require("../validators/searchValidator");

const {
  search,
} = require("../controllers/searchController");

router.get("/", require('../middleware/rateLimit').publicRateLimiter, searchValidator, search);

module.exports = router;
