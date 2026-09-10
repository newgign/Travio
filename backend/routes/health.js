const express = require("express");
const router = express.Router();
const systemReadinessService = require("../services/systemReadinessService");
const lifecycleService = require("../services/lifecycleService");

router.get("/live", (req, res) => {
  return res.json({
    status: "ok",
    service: "Travio API",
    release: "3A",
    uptimeSeconds: Math.floor(process.uptime()),
    requestId: req.requestId || null,
  });
});

router.get("/ready", async (req, res) => {
  const database = await systemReadinessService.databaseStatus();
  const lifecycle = lifecycleService.state();
  const ready = database.ok && !lifecycle.shuttingDown;
  const payload = {
    status: lifecycle.shuttingDown ? "draining" : ready ? "ready" : "not_ready",
    service: "Travio API",
    release: "3A",
    database: { ok: database.ok, latencyMs: database.latencyMs },
    lifecycle,
    requestId: req.requestId || null,
  };
  return res.status(ready ? 200 : 503).json(payload);
});

module.exports = router;
