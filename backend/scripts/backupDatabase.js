require("dotenv").config();
const pool = require("../db");
const backupService = require("../services/databaseBackupService");

(async () => {
  try {
    const result = await backupService.createBackup();
    console.log("✓ Travio backup created");
    console.table([{
      file: result.file,
      encrypted: result.encrypted,
      tables: result.tableCount,
      checksum: result.checksum.slice(0, 16),
    }]);
    if (!result.encrypted) {
      console.warn("! Backup is NOT encrypted. It can contain password hashes and personal booking data.");
    }
  } catch (error) {
    console.error("BACKUP ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
