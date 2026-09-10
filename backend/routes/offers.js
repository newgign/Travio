const express = require("express");

const router = express.Router();
const offerController = require("../controllers/offerController");

router.get("/:provider/:hotelId", offerController.getOffer.bind(offerController));
router.post("/recheck", offerController.recheck.bind(offerController));

module.exports = router;
