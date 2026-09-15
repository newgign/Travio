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

router.get('/providers/hotelbeds/catalog-plan', requirePermission('admin.system.read'), async (req,res) => {
  if (Object.keys(req.query).length) return res.status(400).json({code:'CATALOG_PLAN_SERVER_ONLY'});
  try {res.json(await require('../services/hotelbedsCatalogPlan').inspect());}
  catch {res.status(503).json({code:'CATALOG_PLAN_UNAVAILABLE'});}
});

router.get('/providers/hotelbeds/access', requirePermission('admin.system.read'), async (req,res) => {
  try { res.json(await require('../services/hotelbedsTestAccess').inspect()); }
  catch { res.status(503).json({code:'HOTELBEDS_ACCESS_UNAVAILABLE'}); }
});
for (const action of ['arm','control']) router.post(`/providers/hotelbeds/access/${action}`, requirePermission('admin.system.selftest'), async (req,res) => {
  const body = req.body;
  if (require('../config/providers').hotelbeds.environment !== 'test' || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k=>!['operation','scopeId'].includes(k))) return res.status(400).json({code:'INVALID_CONTROL_OPERATION'});
  const access = require('../services/hotelbedsTestAccess');
  try { access.controlSpec(body.operation,body.scopeId); } catch {return res.status(400).json({code:'INVALID_CONTROL_OPERATION'});}
  try {
    if (action === 'arm') return res.json(await access.arm(body.operation,body.scopeId));
    const result = body.operation === 'CONTENT'
      ? await require('../services/hotelbedsTestContent').runControl({scopeId:body.scopeId})
      : await require('../services/hotelbedsBookingReadControl').run();
    res.json(result);
  } catch (error) { res.status(503).json({status:'BLOCKED_OR_FAILED',code:['HOTELBEDS_AUTH_BLOCKED','HOTELBEDS_UNKNOWN_BLOCKED','HOTELBEDS_ACCESS_UNAVAILABLE','HOTELBEDS_PERMIT_NOT_ARMABLE','AUTH_ERROR'].includes(error.code)?error.code:'CONTROL_FAILED'}); }
});

router.get('/providers/hotelbeds/content', requirePermission('admin.system.read'), async (req, res, next) => {
  try {
    const service = require('../services/hotelbedsTestContent');
    const config = require('../config/providers').hotelbeds;
    let scopes = [];
    try { scopes = service.scopes(); } catch { /* Unconfigured import remains disabled. */ }
    const repository = require('../repositories/providerCatalogRepository');
    const destinations = await repository.findDestinations({ provider: 'hotelbeds' });
    const counts = await repository.getCounts();
    const readiness = require('../services/testCatalogReadiness')(destinations,scopes);
    const jobs = await require('../db').query("SELECT last_run,last_success,last_error_category,details FROM provider_job_state WHERE job='test_content_import' AND environment=$1", [config.environment]);
    const job = jobs.rows[0];
    const access = config.environment === 'test' ? (await require('../db').query("SELECT details->>'state' AS state FROM provider_job_state WHERE job='hotelbeds_test_access_content' AND environment='test'")).rows[0] : null;
    const lastImport = job ? { last_run: job.last_run, last_success: job.last_success,
      last_error_category: job.last_error_category ? 'CONTENT_IMPORT_FAILED' : null,
      details: { status: ['PASS','EMPTY'].includes(job.details?.status) ? job.details.status : 'NOT RUN',
        upsertedHotels: Number.isInteger(job.details?.upsertedHotels) ? job.details.upsertedHotels : null } } : null;
    res.json({ environment: config.environment, accessState: access?.state || 'UNKNOWN_BLOCKED', enabled: config.stagingTestAllowed && scopes.length > 0, scope: scopes[0] || null,
      scopes: scopes.map(scope => {
        const row=readiness.find(row=>row.code===scope.destinationCode && row.countryCode===scope.countryCode);
        return {...scope,...row,batch:service.batchPlan(row?.hotelCount || 0)};
      }), limits: service.limits,
      destinationsDetail: destinations.map(row=>({code:row.code,countryCode:row.country_code,name:row.name,hotelCount:Number(row.hotel_count)||0})),
      countries: new Set(destinations.map(row => row.country_code).filter(Boolean)).size, ...counts, lastImport });
  } catch (error) { next(error); }
});
router.post('/providers/hotelbeds/content', requirePermission('admin.system.selftest'), async (req, res) => {
  if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key=>!['scopeId','action'].includes(key)) || (req.body.scopeId !== undefined && typeof req.body.scopeId !== 'string') || (req.body.action !== undefined && req.body.action !== 'next'))) return res.status(400).json({ status: 'BLOCKED', code: 'CONTENT_SCOPE_SERVER_ONLY' });
  try {
    const service = require('../services/hotelbedsTestContent');
    const scope = service.selection(process.env, req.body?.scopeId);
    res.json(await service.run({scopeId:scope.id,...(req.body?.action ? {action:req.body.action} : {})}));
  }
  catch (error) { res.status(409).json({ status: 'BLOCKED', code: ['HOTELBEDS_AUTH_BLOCKED','HOTELBEDS_UNKNOWN_BLOCKED'].includes(error.code) ? error.code : 'CONTENT_IMPORT_BLOCKED_OR_FAILED' }); }
});

router.get('/providers/hotelbeds', requirePermission('admin.system.read'), async (req, res, next) => {
  try {
    const client = require('../integrations/hotelbeds/client');
    const jobs = await require('../db').query('SELECT * FROM provider_job_state WHERE environment=$1', [client.config.environment]);
    const tracked = await require('../db').query('SELECT COUNT(*)::int AS count FROM hotelbeds_tracked_searches WHERE environment=$1', [client.config.environment]);
    const readOnly = require(require('../config/providers').hotelbeds.environment === 'test' ? '../services/hotelbedsTestReadOnlyService' : '../services/hotelbedsLiveReadOnlyService');
    res.json({ ...client.readiness(), connection: { ...readOnly.preflight(), ...require('../integrations/hotelbeds/adminCredentialDiagnostics')(client.config) }, liveProbe: readOnly.probeState(),
      bookingDisabled: !client.config.bookingEnabled && !client.config.liveBookingEnabled,
      paymentsDisabled: require('../services/paymentGatewayService').readiness().mode === 'disabled',
      salesReady: false, jobs: jobs.rows, monitor: require('../services/hotelbedsMonitorService').settings(), trackedOffers: tracked.rows[0].count,
      confirmedHotDealsCount: (await require('../services/priceHistoryService').specials()).length });
  } catch (error) { next(error); }
});
router.post('/providers/hotelbeds/probe', requirePermission('admin.system.selftest'), async (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['availability', 'checkRate'].includes(key) || typeof body[key] !== 'boolean')) {
      return res.status(400).json({status:'BLOCKED',blockers:['INVALID_PROBE_OPTIONS'],networkAttempted:false});
    }
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
