const diagnostics = require('./lib/backupDiagnostics.cjs');
require("dotenv").config();
const databaseBackupService = require("../services/databaseBackupService");

try {
  const result = databaseBackupService.cleanupRetention();
  console.log("Travio backup retention cleanup completed");
  console.table([diagnostics.summary(result)]);
} catch (error) {
  console.error(JSON.stringify(diagnostics.failure('cleanup')));
  process.exit(1);
}
