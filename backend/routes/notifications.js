const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const controller = require("../controllers/notificationController");

const router = express.Router();
router.use(authMiddleware);
router.get("/status", controller.status);
router.get("/", controller.list);
router.post("/test", controller.sendTest);
router.post("/:id/retry", controller.retry);
module.exports = router;
