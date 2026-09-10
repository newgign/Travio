const fs = require("fs");
const path = require("path");
const pool = require("../db");

const migrationsDir = path.resolve(__dirname, "../../database/migrations");

async function status() {
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  try {
    const result = await pool.query("SELECT name FROM _migrations ORDER BY name");
    const applied = new Set(result.rows.map((row) => row.name));
    const pending = files.filter((file) => !applied.has(file));
    return { ok: pending.length === 0, total: files.length, applied: applied.size, pending };
  } catch (error) {
    return { ok: false, total: files.length, applied: 0, pending: files, error: error.code || error.message };
  }
}

module.exports = { status };
