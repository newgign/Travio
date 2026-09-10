require("dotenv").config();
const pool = require("../db");
const reliabilityMonitorService = require("../services/reliabilityMonitorService");
const incidentService = require("../services/incidentService");

(async () => {
  try {
    const result = await reliabilityMonitorService.evaluate("cli");
    const counts = await incidentService.counts();
    console.log(`Travio Sprint 3A reliability: ${String(result.overallState).toUpperCase()}`);
    console.table((result.components || []).map((item) => ({
      component: item.label,
      state: item.state.toUpperCase(),
      detail: item.detail,
    })));
    console.table([counts]);
  } catch (error) {
    console.error("RELIABILITY CHECK ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
