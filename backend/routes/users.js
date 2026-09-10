const express = require("express");

const router = express.Router();

const {
  getUsers,
  deleteUser,
} = require("../controllers/userController");

const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

router.use(authMiddleware, requireRole("admin"));

router.get("/", getUsers);
router.delete("/:id", deleteUser);

module.exports = router;
