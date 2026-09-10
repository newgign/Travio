const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  listTravelers,
  createTraveler,
  updateTraveler,
  deleteTraveler,
} = require("../controllers/travelerProfileController");

const router = express.Router();

router.use(authMiddleware);
router.get("/", listTravelers);
router.post("/", createTraveler);
router.put("/:id", updateTraveler);
router.delete("/:id", deleteTraveler);

module.exports = router;
