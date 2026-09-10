require("dotenv").config();
const backupSchedulerService = require("../services/backupSchedulerService");
const pool = require("../db");

(async () => {
  try {
    const result = await backupSchedulerService.runNow("cli");
    console.log("Scheduled backup one-shot completed");
    console.table([result]);
  } catch (error) {
    console.error("SCHEDULED BACKUP ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
