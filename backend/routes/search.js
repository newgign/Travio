const express = require("express");

const router = express.Router();

const searchValidator = require("../validators/searchValidator");

const {
  search,
} = require("../controllers/searchController");

router.get("/", searchValidator, search);

module.exports = router;