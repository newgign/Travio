const pool = require("../db");
const paymentGatewayService = require("../services/paymentGatewayService");
const notificationService = require("../services/notificationService");
const adminAuditService = require("../services/adminAuditService");
const systemReadinessService = require("../services/systemReadinessService");
const systemEventService = require("../services/systemEventService");
const permissionService = require("../services/permissionService");
const productionGateService = require("../services/productionGateService");
const operationsMonitorService = require("../services/operationsMonitorService");
const reliabilityMonitorService = require("../services/reliabilityMonitorService");
const incidentService = require("../services/incidentService");

const SPRINT_2J_SAFETY_BASELINE = Object.freeze({
  productionSalesEnabled: false,
  realChargesEnabled: false,
  realRefundsEnabled: false,
});

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return String(raw).trim().toLowerCase() === "true";
}

function text(value) {
  return String(value || "").trim();
}

function buildBookingWhere(query = {}) {
  const clauses = [];
  const params = [];

  function add(value) {
    params.push(value);
    return `$${params.length}`;
  }

  const q = text(query.q);
  if (q) {
    const p = add(`%${q}%`);
    clauses.push(`(
      b.id::text ILIKE ${p}
      OR COALESCE(b.provider_booking_id, '') ILIKE ${p}
      OR COALESCE(b.email, '') ILIKE ${p}
      OR COALESCE(u.full_name, '') ILIKE ${p}
      OR COALESCE(NULLIF(b.offer_snapshot->>'name', ''), NULLIF(b.offer_snapshot->>'title', ''), t.hotel, t.title, '') ILIKE ${p}
    )`);
  }

  const status = text(query.status);
  if (status && status !== "all") clauses.push(`b.status = ${add(status)}`);

  const provider = text(query.provider).toLowerCase();
  if (provider && provider !== "all") clauses.push(`LOWER(COALESCE(b.provider, 'legacy')) = ${add(provider)}`);

  const paymentStatus = text(query.paymentStatus).toLowerCase();
  if (paymentStatus && paymentStatus !== "all") clauses.push(`LOWER(COALESCE(p.status, 'none')) = ${add(paymentStatus)}`);

  const refundStatus = text(query.refundStatus).toLowerCase();
  if (refundStatus && refundStatus !== "all") clauses.push(`LOWER(COALESCE(p.refund_status, 'not_requested')) = ${add(refundStatus)}`);

  if (String(query.attention || "").toLowerCase() === "true") {
    clauses.push(`UPPER(COALESCE(b.provider_status, '')) IN ('CONFIRMATION_UNKNOWN','CONFIRMATION_FAILED','RATE_EXPIRED')`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function bookingListSql(where) {
  return `
    SELECT
      b.id,
      b.user_id,
      b.booking_date,
      b.updated_at,
      b.status,
      COALESCE(NULLIF(b.provider, ''), 'legacy') AS provider,
      b.provider_booking_id,
      b.provider_status,
      b.provider_synced_at,
      b.people,
      b.email,
      b.phone,
      b.total_amount,
      COALESCE(NULLIF(b.currency, ''), b.offer_snapshot->>'currency', 'KZT') AS currency,
      COALESCE(
        NULLIF(b.offer_snapshot->>'name', ''),
        NULLIF(b.offer_snapshot->>'title', ''),
        t.hotel,
        t.title,
        'Travio booking #' || b.id
      ) AS hotel,
      COALESCE(NULLIF(b.offer_snapshot->>'country', ''), t.country, '') AS country,
      COALESCE(NULLIF(b.offer_snapshot->>'city', ''), t.city, '') AS city,
      u.full_name AS user_name,
      u.email AS user_email,
      p.id AS payment_id,
      p.status AS payment_status,
      p.gateway_provider,
      p.amount AS payment_amount,
      p.refund_status,
      p.refunded_amount
    FROM bookings b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN tours t ON t.id = b.tour_id
    LEFT JOIN LATERAL (
      SELECT payment.*
      FROM payments payment
      WHERE payment.booking_id = b.id
      ORDER BY payment.id DESC
      LIMIT 1
    ) p ON TRUE
    ${where}
  `;
}

async function getOverview(req, res) {
  try {
    const [bookingStats, paymentStats, refundStats, notificationStats, attention, actions] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'Подтверждена')::int AS confirmed,
          COUNT(*) FILTER (WHERE status = 'Отменена')::int AS cancelled,
          COUNT(*) FILTER (
            WHERE UPPER(COALESCE(provider_status, '')) IN ('CONFIRMATION_UNKNOWN','CONFIRMATION_FAILED','RATE_EXPIRED')
          )::int AS attention,
          COUNT(*) FILTER (WHERE provider = 'hotelbeds')::int AS hotelbeds
        FROM bookings
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
          COUNT(*) FILTER (WHERE status IN ('pending','requires_action'))::int AS pending,
          COUNT(*) FILTER (WHERE refund_status = 'requested')::int AS refund_requested,
          COUNT(*) FILTER (WHERE refund_status = 'refunded')::int AS refunded
        FROM payments
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'requested')::int AS requested,
          COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded
        FROM refund_requests
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
          COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled
        FROM notification_outbox
      `),
      pool.query(`
        SELECT id, status, provider, provider_status, provider_booking_id, email,
               total_amount, currency,
               COALESCE(NULLIF(offer_snapshot->>'name',''), NULLIF(offer_snapshot->>'title',''), 'Travio booking #' || id) AS hotel
        FROM bookings
        WHERE UPPER(COALESCE(provider_status, '')) IN ('CONFIRMATION_UNKNOWN','CONFIRMATION_FAILED','RATE_EXPIRED')
        ORDER BY updated_at DESC, id DESC
        LIMIT 8
      `),
      pool.query(`
        SELECT aa.id, aa.action_type, aa.target_type, aa.target_id, aa.status,
               aa.metadata, aa.created_at, aa.booking_id,
               u.full_name AS admin_name, u.email AS admin_email
        FROM admin_actions aa
        LEFT JOIN users u ON u.id = aa.admin_user_id
        ORDER BY aa.created_at DESC, aa.id DESC
        LIMIT 8
      `),
    ]);

    return res.json({
      bookings: bookingStats.rows[0],
      payments: paymentStats.rows[0],
      refunds: refundStats.rows[0],
      notifications: notificationStats.rows[0],
      attentionBookings: attention.rows,
      recentAdminActions: actions.rows,
    });
  } catch (error) {
    require("../utils/logger").error("ADMIN OVERVIEW ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки операционной панели" });
  }
}

async function getBookings(req, res) {
  try {
    const page = clamp(req.query.page, 1, 100000, 1);
    const limit = clamp(req.query.limit, 5, 100, 25);
    const offset = (page - 1) * limit;
    const built = buildBookingWhere(req.query);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM (${bookingListSql(built.where)}) q`,
      built.params
    );

    const params = [...built.params, limit, offset];
    const result = await pool.query(
      `${bookingListSql(built.where)} ORDER BY b.booking_date DESC, b.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = countResult.rows[0]?.total || 0;
    return res.json({
      items: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    require("../utils/logger").error("ADMIN BOOKINGS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки бронирований CRM" });
  }
}

async function getRefunds(req, res) {
  try {
    const page = clamp(req.query.page, 1, 100000, 1);
    const limit = clamp(req.query.limit, 5, 100, 25);
    const offset = (page - 1) * limit;
    const params = [];
    const clauses = [];
    const status = text(req.query.status).toLowerCase();
    const q = text(req.query.q);

    function add(value) {
      params.push(value);
      return `$${params.length}`;
    }

    if (status && status !== "all") clauses.push(`LOWER(r.status) = ${add(status)}`);
    if (q) {
      const p = add(`%${q}%`);
      clauses.push(`(r.id::text ILIKE ${p} OR r.booking_id::text ILIKE ${p} OR COALESCE(r.idempotency_key,'') ILIKE ${p} OR COALESCE(b.email,'') ILIKE ${p})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM refund_requests r JOIN bookings b ON b.id = r.booking_id ${where}`,
      params
    );

    const queryParams = [...params, limit, offset];
    const result = await pool.query(
      `
      SELECT r.*, b.status AS booking_status, b.provider, b.provider_status,
             b.email, b.total_amount AS booking_total, b.currency AS booking_currency,
             COALESCE(NULLIF(b.offer_snapshot->>'name',''), NULLIF(b.offer_snapshot->>'title',''), 'Travio booking #' || b.id) AS hotel
      FROM refund_requests r
      JOIN bookings b ON b.id = r.booking_id
      ${where}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
      `,
      queryParams
    );

    const total = count.rows[0]?.total || 0;
    return res.json({ items: result.rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    require("../utils/logger").error("ADMIN REFUNDS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки возвратов" });
  }
}

async function getNotifications(req, res) {
  try {
    const page = clamp(req.query.page, 1, 100000, 1);
    const limit = clamp(req.query.limit, 5, 100, 25);
    const offset = (page - 1) * limit;
    const params = [];
    const clauses = [];
    const status = text(req.query.status).toLowerCase();
    const q = text(req.query.q);

    function add(value) {
      params.push(value);
      return `$${params.length}`;
    }

    if (status && status !== "all") clauses.push(`LOWER(n.status) = ${add(status)}`);
    if (q) {
      const p = add(`%${q}%`);
      clauses.push(`(n.id::text ILIKE ${p} OR COALESCE(n.recipient,'') ILIKE ${p} OR COALESCE(n.subject,'') ILIKE ${p} OR COALESCE(n.event_type,'') ILIKE ${p})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM notification_outbox n ${where}`, params);
    const queryParams = [...params, limit, offset];
    const result = await pool.query(
      `
      SELECT n.id, n.booking_id, n.event_type, n.recipient, n.subject, n.status,
             n.provider, n.provider_message_id, n.attempts, n.last_error,
             n.created_at, n.sent_at, n.last_attempt_at, n.next_attempt_at
      FROM notification_outbox n
      ${where}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
      `,
      queryParams
    );

    const total = count.rows[0]?.total || 0;
    return res.json({ items: result.rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    require("../utils/logger").error("ADMIN NOTIFICATIONS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки email-outbox" });
  }
}

async function retryNotification(req, res) {
  try {
    const result = await notificationService.retryForUser(req.params.id, req.user.id, true);
    const ok = !["forbidden", "missing"].includes(result?.status);

    await adminAuditService.safeRecordAction({
      adminId: req.user.id,
      actionType: "notification_retry",
      targetType: "notification",
      targetId: req.params.id,
      status: ok ? "success" : "blocked",
      metadata: { deliveryStatus: result?.status || null },
    });

    if (!ok) return res.status(409).json({ message: "Уведомление нельзя повторить", result });
    return res.json({ success: true, result });
  } catch (error) {
    require("../utils/logger").error("ADMIN NOTIFICATION RETRY ERROR:", { error: error });
    return res.status(500).json({ message: require("../utils/apiResponse").publicMessage(error, "Ошибка повторной доставки") });
  }
}

async function getActions(req, res) {
  try {
    const limit = clamp(req.query.limit, 1, 100, 30);
    const result = await pool.query(
      `
      SELECT aa.*, u.full_name AS admin_name, u.email AS admin_email
      FROM admin_actions aa
      LEFT JOIN users u ON u.id = aa.admin_user_id
      ORDER BY aa.created_at DESC, aa.id DESC
      LIMIT $1
      `,
      [limit]
    );
    return res.json({ items: result.rows });
  } catch (error) {
    require("../utils/logger").error("ADMIN ACTIONS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки журнала администратора" });
  }
}

async function getReadiness(req, res) {
  try {
    const payments = paymentGatewayService.readiness();
    const email = notificationService.channelStatus();
    const hotelbeds = {
      enabled: boolEnv("HOTELBEDS_ENABLED"),
      bookingEnabled: boolEnv("HOTELBEDS_BOOKING_ENABLED"),
      apiKeyConfigured: Boolean(process.env.HOTELBEDS_API_KEY),
      secretConfigured: Boolean(process.env.HOTELBEDS_SECRET),
      mtlsCertConfigured: Boolean(process.env.HOTELBEDS_MTLS_CERT_PATH),
      mtlsKeyConfigured: Boolean(process.env.HOTELBEDS_MTLS_KEY_PATH),
      priceToleranceEnabled: boolEnv("HOTELBEDS_ALLOW_PRICE_TOLERANCE"),
      tolerance: Number(process.env.HOTELBEDS_BOOKING_TOLERANCE || 0),
      bookingEndpoint: /test/i.test(String(process.env.HOTELBEDS_BOOKING_BASE_URL || "")) ? "test" : "custom/live-like",
    };

    const checks = [
      { key: "real_charges", label: "Реальные списания", ready: payments.realChargesEnabled === true, blocker: payments.realChargesEnabled !== true },
      { key: "real_refunds", label: "Реальные возвраты", ready: false, blocker: true },
      { key: "payment_gateway", label: "Платёжный шлюз", ready: payments.mode === "sandbox", blocker: payments.mode !== "sandbox", detail: payments.mode },
      { key: "hotelbeds_booking", label: "Hotelbeds Booking API", ready: hotelbeds.enabled && hotelbeds.bookingEnabled, blocker: !(hotelbeds.enabled && hotelbeds.bookingEnabled), detail: hotelbeds.bookingEndpoint },
      { key: "hotelbeds_mtls", label: "Hotelbeds mTLS", ready: hotelbeds.mtlsCertConfigured && hotelbeds.mtlsKeyConfigured, blocker: !(hotelbeds.mtlsCertConfigured && hotelbeds.mtlsKeyConfigured) },
      { key: "email", label: "Email-канал", ready: email.enabled && email.providerConfigured, blocker: false, detail: email.mode },
      { key: "price_tolerance", label: "Hotelbeds tolerance", ready: hotelbeds.tolerance === 0 && !hotelbeds.priceToleranceEnabled, blocker: false, detail: `${hotelbeds.tolerance}%` },
    ];

    const gate = productionGateService.state();

    return res.json({
      environment: process.env.NODE_ENV || "development",
      productionSalesEnabled: gate.productionSalesEnabled,
      realChargesEnabled: gate.realChargesEnabled,
      realRefundsEnabled: gate.realRefundsEnabled,
      payments,
      email,
      hotelbeds,
      checks,
      gate,
      message: "Sprint 3A — product/customer experience with the Sprint 2N reliability baseline retained. LIVE sales and real money operations remain disabled.",
    });
  } catch (error) {
    require("../utils/logger").error("ADMIN READINESS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка проверки production-readiness" });
  }
}

async function getSystemStatus(req, res) {
  try {
    const status = await systemReadinessService.collect();
    return res.json(status);
  } catch (error) {
    require("../utils/logger").error("ADMIN SYSTEM STATUS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка проверки системного состояния" });
  }
}


async function getSystemMetrics(req, res) {
  try {
    return res.json(operationsMonitorService.collect());
  } catch (error) {
    require("../utils/logger").error("ADMIN SYSTEM METRICS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки operational metrics" });
  }
}

async function getReliabilityDashboard(req, res) {
  try {
    const dashboard = await reliabilityMonitorService.dashboard();
    return res.json(dashboard);
  } catch (error) {
    require("../utils/logger").error("ADMIN RELIABILITY DASHBOARD ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки reliability dashboard" });
  }
}

async function runReliabilityCheck(req, res) {
  try {
    const result = await reliabilityMonitorService.evaluate("admin");
    await adminAuditService.safeRecordAction({
      adminId: req.user.id,
      actionType: "reliability_check",
      targetType: "system",
      targetId: "sprint2n",
      status: result.overallState === "healthy" ? "success" : "attention",
      metadata: { overallState: result.overallState, transitions: result.transitions || [] },
    });
    return res.json({ success: true, result, dashboard: await reliabilityMonitorService.dashboard() });
  } catch (error) {
    require("../utils/logger").error("ADMIN RELIABILITY CHECK ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка проверки reliability" });
  }
}

async function acknowledgeIncident(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Некорректный incident id" });
    const incident = await incidentService.acknowledge(id, req.user.id);
    if (!incident) return res.status(409).json({ message: "Инцидент уже обработан или не найден" });
    await adminAuditService.safeRecordAction({
      adminId: req.user.id,
      actionType: "incident_acknowledge",
      targetType: "operational_incident",
      targetId: String(id),
      status: "success",
      metadata: { incidentKey: incident.incident_key, source: incident.source, severity: incident.severity },
    });
    return res.json({ success: true, incident });
  } catch (error) {
    require("../utils/logger").error("ADMIN INCIDENT ACK ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка подтверждения инцидента" });
  }
}

async function getSystemEvents(req, res) {
  try {
    const limit = clamp(req.query.limit, 1, 200, 50);
    const items = await systemEventService.listRecent({
      limit,
      level: text(req.query.level).toLowerCase(),
      category: text(req.query.category).toLowerCase(),
    });
    return res.json({ items });
  } catch (error) {
    require("../utils/logger").error("ADMIN SYSTEM EVENTS ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка загрузки системного журнала" });
  }
}

async function getPermissions(req, res) {
  return res.json({
    currentRole: req.user?.role || "user",
    currentPermissions: permissionService.permissionsFor(req.user?.role),
    roles: permissionService.describeRoles(),
  });
}

async function runSystemSelfTest(req, res) {
  try {
    const status = await systemReadinessService.collect();
    const event = await systemEventService.safeRecordEvent({
      level: status.safeModeHealthy ? "info" : "warn",
      category: "self_test",
      code: status.safeModeHealthy ? "SELF_TEST_OK" : "SELF_TEST_ATTENTION",
      message: status.safeModeHealthy
        ? "Sprint 3A read-only system self-test completed successfully"
        : "Sprint 3A read-only system self-test found attention items",
      requestId: req.requestId || null,
      userId: req.user?.id || null,
      route: req.originalUrl?.split("?")[0] || null,
      method: req.method,
      statusCode: 200,
      metadata: {
        release: status.release,
        safeModeHealthy: status.safeModeHealthy,
        productionReady: status.productionReady,
        failedChecks: (status.checks || []).filter((item) => !item.ready).map((item) => item.key),
      },
    });

    await adminAuditService.safeRecordAction({
      adminId: req.user.id,
      actionType: "system_self_test",
      targetType: "system",
      targetId: "sprint2n",
      status: status.safeModeHealthy ? "success" : "attention",
      metadata: { eventId: event?.id || null, productionReady: false },
    });

    return res.json({ success: true, status, eventId: event?.id || null });
  } catch (error) {
    require("../utils/logger").error("ADMIN SYSTEM SELF TEST ERROR:", { error: error });
    return res.status(500).json({ message: "Ошибка системного self-test" });
  }
}

module.exports = {
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
};
