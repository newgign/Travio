const diagnostics = require('./lib/backupDiagnostics.cjs');
require("dotenv").config();
const backupSchedulerService = require("../services/backupSchedulerService");
const pool = require("../db");

(async () => {
  try {
    const result = await backupSchedulerService.runNow("cli");
    console.log("Scheduled backup one-shot completed");
    console.table([diagnostics.summary(result)]);
  } catch (error) {
    console.error(JSON.stringify(diagnostics.failure('scheduled')));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
