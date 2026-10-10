const diagnostics = require('./lib/backupDiagnostics.cjs');
require("dotenv").config();
const pool = require("../db");
const backupService = require("../services/databaseBackupService");

(async () => {
  try {
    const result = await backupService.createBackup();
    console.log("✓ Travio backup created");
    console.table([diagnostics.summary(result)]);
    if (!result.encrypted) {
      console.warn("! Backup is NOT encrypted. It can contain password hashes and personal booking data.");
    }
  } catch (error) {
    console.error(JSON.stringify(diagnostics.failure('create')));
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
