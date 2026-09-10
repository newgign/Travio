const pool = require("../db");
const logger = require("../utils/logger");

async function safeRecord({ operation, status, artifactName = null, checksum = null, metadata = {} }) {
  try {
    const result = await pool.query(`
      INSERT INTO maintenance_runs (operation, status, artifact_name, checksum, metadata, completed_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
      RETURNING *
    `, [operation, status, artifactName, checksum, JSON.stringify(metadata || {})]);
    return result.rows[0] || null;
  } catch (error) {
    logger.warn(`MAINTENANCE RUN WRITE FAILED | ${error.message}`);
    return null;
  }
}

module.exports = { safeRecord };
