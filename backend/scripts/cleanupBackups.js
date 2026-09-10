require("dotenv").config();
const databaseBackupService = require("../services/databaseBackupService");

try {
  const result = databaseBackupService.cleanupRetention();
  console.log("Travio backup retention cleanup completed");
  console.table([result]);
} catch (error) {
  console.error("BACKUP CLEANUP ERROR:", error.message);
  process.exit(1);
}
