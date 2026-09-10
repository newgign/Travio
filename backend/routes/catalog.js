const express = require("express");
const catalogController = require("../controllers/catalogController");

const router = express.Router();

router.get("/status", catalogController.status.bind(catalogController));
router.get("/destinations", catalogController.destinations.bind(catalogController));
router.get("/hotels", catalogController.hotels.bind(catalogController));

module.exports = router;
