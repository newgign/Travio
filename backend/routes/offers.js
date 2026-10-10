const express = require("express");

const router = express.Router();
const offerController = require("../controllers/offerController");

const publicLimit = require('../middleware/rateLimit').publicRateLimiter;
router.get("/:provider/:hotelId", publicLimit, offerController.getOffer.bind(offerController));
router.post("/recheck", publicLimit, offerController.recheck.bind(offerController));

module.exports = router;
