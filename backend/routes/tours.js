const express = require("express");
const router = express.Router();

const {
  getTours,
  getTourById,
  createTour,
  deleteTour,
  updateTour,
  searchTours,
} = require("../controllers/tourController");

const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

router.get("/search", searchTours);
router.get("/", getTours);
router.get("/:id", getTourById);

router.post("/", authMiddleware, requireRole("admin"), createTour);
router.put("/:id", authMiddleware, requireRole("admin"), updateTour);
router.delete("/:id", authMiddleware, requireRole("admin"), deleteTour);

module.exports = router;
