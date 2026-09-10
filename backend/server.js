const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");
const notFound = require("./middleware/notFound");
const requestTelemetry = require("./middleware/requestTelemetry");
const securityHeaders = require("./middleware/securityHeaders");
const { apiRateLimiter, authRateLimiter } = require("./middleware/rateLimit");
const lifecycleService = require("./services/lifecycleService");
const healthMonitorService = require("./services/healthMonitorService");
const backupSchedulerService = require("./services/backupSchedulerService");
const reliabilityMonitorService = require("./services/reliabilityMonitorService");

const authRoutes = require("./routes/auth");
const tourRoutes = require("./routes/tours");
const searchRoutes = require("./routes/search");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const checkoutRoutes = require("./routes/checkoutRoutes");
const dashboardRoutes = require("./routes/dashboard");
const userRoutes = require("./routes/users");
const favoriteRoutes = require("./routes/favorites");
const travelerRoutes = require("./routes/travelers");
const notificationRoutes = require("./routes/notifications");
const offerRoutes = require("./routes/offers");
const catalogRoutes = require("./routes/catalog");
const adminOperationsRoutes = require("./routes/adminOperations");
const healthRoutes = require("./routes/health");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const trustProxy = String(process.env.TRUST_PROXY || "false").trim();
if (trustProxy === "true") app.set("trust proxy", 1);
else if (/^\d+$/.test(trustProxy) && Number(trustProxy) > 0) app.set("trust proxy", Number(trustProxy));

app.disable("x-powered-by");
app.use(requestTelemetry);
app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS: origin not allowed"));
  },
  credentials: true,
}));
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || "1mb" }));

// Health probes deliberately bypass rate limiting so an orchestrator can always inspect the process.
app.use("/api/health", healthRoutes);
app.use("/api", apiRateLimiter);
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/special-offers", require("./routes/specialOffers"));
app.use("/api/offers", offerRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/tours", tourRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/travelers", travelerRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminOperationsRoutes);

app.get("/", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "OK",
      name: "Travio API",
      version: "3A",
      message: "Travio Backend работает 🚀",
      database: result.rows[0].now,
      uptime: Math.floor(process.uptime()),
      requestId: req.requestId || null,
    });
  } catch (error) {
    next(error);
  }
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server started on port ${PORT} | Sprint 3A`, { port: Number(PORT), environment: process.env.NODE_ENV || "development" });
  healthMonitorService.start();
  backupSchedulerService.start();
  reliabilityMonitorService.start();
  require("./services/hotelbedsMonitorService").start();
});
server.on("error", (error) => logger.error(error.stack || error.message));

let shutdownPromise = null;
function shutdownGraceMs() {
  const value = Number(process.env.SHUTDOWN_GRACE_MS || 10000);
  return Number.isFinite(value) && value >= 1000 ? Math.floor(value) : 10000;
}

function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;
  lifecycleService.beginShutdown(signal);
  healthMonitorService.stop();
  backupSchedulerService.stop();
  reliabilityMonitorService.stop();
  require("./services/hotelbedsMonitorService").stop();
  logger.info(`${signal} received. Travio is draining requests...`, { signal });

  shutdownPromise = new Promise((resolve) => {
    const forceTimer = setTimeout(() => {
      logger.error(`Graceful shutdown exceeded ${shutdownGraceMs()} ms; forcing exit.`);
      process.exit(1);
    }, shutdownGraceMs());
    forceTimer.unref?.();

    server.close(async (closeError) => {
      if (closeError) logger.error(closeError.stack || closeError.message);
      try {
        await pool.end();
        clearTimeout(forceTimer);
        logger.info("Server stopped cleanly; PostgreSQL pool closed.", { signal });
        resolve();
        process.exit(closeError ? 1 : 0);
      } catch (error) {
        logger.error(error.stack || error.message);
        clearTimeout(forceTimer);
        resolve();
        process.exit(1);
      }
    });

    server.closeIdleConnections?.();
  });

  return shutdownPromise;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.error(`UNHANDLED REJECTION | ${reason?.stack || reason}`);
  shutdown("unhandledRejection");
});
process.on("uncaughtException", (error) => {
  logger.error(`UNCAUGHT EXCEPTION | ${error?.stack || error}`);
  shutdown("uncaughtException");
});

module.exports = { app, server, shutdown };
