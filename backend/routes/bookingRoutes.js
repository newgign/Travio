const express = require("express");

const router = express.Router();

const {
  createBooking,
  getBookings,
  getMyBookings,
  getMyBookingDetails,
  updateBookingStatus,
  deleteBooking,
} = require("../controllers/bookingController");

const {
  confirmProviderBooking,
  syncProviderBooking,
  simulateProviderCancellation,
  cancelProviderBooking,
} = require("../controllers/providerBookingController");

const { getVoucher, downloadVoucherPdf } = require("../controllers/voucherController");

const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

router.post("/", authMiddleware, createBooking);
router.get("/me", authMiddleware, getMyBookings);
router.get("/:id/details", authMiddleware, getMyBookingDetails);
router.get("/:id/voucher", authMiddleware, getVoucher);
router.get("/:id/voucher.pdf", authMiddleware, downloadVoucherPdf);

router.post("/:id/provider/confirm", authMiddleware, confirmProviderBooking);
router.post("/:id/provider/sync", authMiddleware, syncProviderBooking);
router.post("/:id/provider/cancel/simulate", authMiddleware, simulateProviderCancellation);
router.post("/:id/provider/cancel", authMiddleware, cancelProviderBooking);

router.get("/", authMiddleware, requireRole("admin"), getBookings);
router.put("/:id", authMiddleware, requireRole("admin"), updateBookingStatus);
router.delete("/:id", authMiddleware, requireRole("admin"), deleteBooking);

module.exports = router;
