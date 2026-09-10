const express = require("express");

const router = express.Router();

const {
  getStats,
} = require("../controllers/dashboardController");

const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

router.get("/stats", authMiddleware, requireRole("admin"), getStats);

module.exports = router;
