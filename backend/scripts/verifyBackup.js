require("dotenv").config();
const path = require("path");
const backupService = require("../services/databaseBackupService");

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run backup:verify -- <backup-file>");
  process.exit(1);
}

try {
  const parsed = backupService.parseBackupFile(path.resolve(file));
  console.log("✓ Backup integrity OK");
  console.table([{
    file: parsed.absolute,
    encrypted: Boolean(parsed.envelope.encrypted),
    createdAt: parsed.payload.createdAt,
    release: parsed.payload.release,
    tables: Object.keys(parsed.payload.tables).length,
    checksum: parsed.checksum.slice(0, 16),
  }]);
} catch (error) {
  console.error("BACKUP VERIFY ERROR:", error.message);
  process.exit(1);
}
