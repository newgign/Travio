const express = require("express");

const router = express.Router();

const {

    getHotels

} = require("../controllers/hotelController");

router.get("/", getHotels);

module.exports = router;