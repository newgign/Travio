require("dotenv").config();
const pool = require("../db");
const backupService = require("../services/databaseBackupService");

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const apply = args.includes("--apply");
if (!file) {
  console.error("Usage: npm run backup:restore -- <backup-file> [--apply]");
  process.exit(1);
}

(async () => {
  try {
    const result = await backupService.restoreBackup(file, { apply });
    if (!apply) {
      console.log("✓ Restore dry-run passed. Database was NOT changed.");
      console.log("To apply: set ALLOW_DATABASE_RESTORE=true, stop Travio traffic, then rerun with --apply.");
    } else {
      console.log("✓ Restore completed inside a database transaction.");
    }
    console.table([result]);
  } catch (error) {
    console.error("RESTORE ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
