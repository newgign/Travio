const express = require("express");

const router = express.Router();

const {
  getPayment,
  payBooking,
  getPaymentReadiness,
  createPaymentIntent,
} = require("../controllers/paymentController");

const { requestSandboxRefund, completeSandboxRefund } = require("../controllers/refundController");

const authMiddleware = require("../middleware/authMiddleware");

router.get("/readiness", authMiddleware, getPaymentReadiness);
router.post("/:id/intent", authMiddleware, createPaymentIntent);
router.post("/:id/refund/request", authMiddleware, requestSandboxRefund);
router.post("/:id/refund/complete-sandbox", authMiddleware, completeSandboxRefund);
router.get("/:id", authMiddleware, getPayment);
router.put("/:id/pay", authMiddleware, payBooking);

module.exports = router;
