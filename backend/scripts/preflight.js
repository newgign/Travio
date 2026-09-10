require("dotenv").config();
const pool = require("../db");
const readiness = require("../services/systemReadinessService");
const migrationStatus = require("../services/migrationStatusService");

(async () => {
  try {
    const [status, migrations] = await Promise.all([readiness.collect(), migrationStatus.status()]);
    const rows = [...status.checks, {
      key: "migrations",
      label: "Database migrations",
      ready: migrations.ok,
      blocker: !migrations.ok,
      detail: migrations.ok ? `${migrations.applied}/${migrations.total} applied` : `${migrations.pending.length} pending`,
    }];
    console.table(rows.map((item) => ({
      check: item.label,
      status: item.ready ? "OK" : item.blocker ? "BLOCKED" : "WARN",
      detail: item.detail || "",
    })));
    console.log(`Safe mode: ${status.safeModeHealthy ? "HEALTHY" : "ATTENTION"}`);
    console.log("Production: BLOCKED BY DESIGN in Sprint 3A; real charges/refunds remain OFF.");
    if (rows.some((item) => item.blocker && !item.ready)) process.exitCode = 1;
  } catch (error) {
    console.error("PREFLIGHT ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
