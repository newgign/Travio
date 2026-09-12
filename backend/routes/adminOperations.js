const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const requirePermission = require("../middleware/requirePermission");
const {
  getOverview,
  getBookings,
  getRefunds,
  getNotifications,
  retryNotification,
  getActions,
  getReadiness,
  getSystemStatus,
  getSystemMetrics,
  getReliabilityDashboard,
  runReliabilityCheck,
  acknowledgeIncident,
  getSystemEvents,
  getPermissions,
  runSystemSelfTest,
} = require("../controllers/adminOperationsController");

router.use(authMiddleware, requireRole("admin"));
router.use(requirePermission("admin.operations.read"));

router.get('/providers/hotelbeds', requirePermission('admin.system.read'), async (req, res, next) => {
  try {
    const client = require('../integrations/hotelbeds/client');
    const jobs = await require('../db').query('SELECT * FROM provider_job_state WHERE environment=$1', [client.config.environment]);
    const tracked = await require('../db').query('SELECT COUNT(*)::int AS count FROM hotelbeds_tracked_searches WHERE environment=$1', [client.config.environment]);
    const readOnly = require(require('../config/providers').hotelbeds.environment === 'test' ? '../services/hotelbedsTestReadOnlyService' : '../services/hotelbedsLiveReadOnlyService');
    res.json({ ...client.readiness(), connection: readOnly.preflight(), liveProbe: readOnly.probeState(),
      bookingDisabled: !client.config.bookingEnabled && !client.config.liveBookingEnabled,
      paymentsDisabled: require('../services/paymentGatewayService').readiness().mode === 'disabled',
      salesReady: false, jobs: jobs.rows, monitor: require('../services/hotelbedsMonitorService').settings(), trackedOffers: tracked.rows[0].count,
      confirmedHotDealsCount: (await require('../services/priceHistoryService').specials()).length });
  } catch (error) { next(error); }
});
router.post('/providers/hotelbeds/probe', requirePermission('admin.system.selftest'), async (req, res) => {
  try {
    const service = require(require('../config/providers').hotelbeds.environment === 'test' ? '../services/hotelbedsTestReadOnlyService' : '../services/hotelbedsLiveReadOnlyService');
    res.json(await service.runAdminProbe({ availability: req.body?.availability === true, checkRate: req.body?.checkRate === true }));
  } catch { res.status(503).json({status:'FAIL',code:'READ_ONLY_PROBE_FAILED'}); }
});
router.get("/overview", getOverview);
router.get("/bookings", getBookings);
router.get("/refunds", getRefunds);
router.get("/notifications", getNotifications);
router.post("/notifications/:id/retry", retryNotification);
router.get("/actions", getActions);
router.get("/readiness", getReadiness);
router.get("/system/status", requirePermission("admin.system.read"), getSystemStatus);
router.get("/system/metrics", requirePermission("admin.system.read"), getSystemMetrics);
router.get("/system/reliability", requirePermission("admin.system.read"), getReliabilityDashboard);
router.post("/system/reliability/check", requirePermission("admin.system.selftest"), runReliabilityCheck);
router.post("/system/incidents/:id/acknowledge", requirePermission("admin.system.incidents"), acknowledgeIncident);
router.get("/system/events", requirePermission("admin.system.read"), getSystemEvents);
router.get("/system/permissions", requirePermission("admin.system.read"), getPermissions);
router.post("/system/self-test", requirePermission("admin.system.selftest"), runSystemSelfTest);

module.exports = router;
