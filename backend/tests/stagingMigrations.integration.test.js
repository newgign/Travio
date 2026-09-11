// Explicit integration test: isolated PostgreSQL schema, always rolled back.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pool = require('../db');
async function main() {
  const client = await pool.connect();
  const schema = 'staging_test_' + crypto.randomBytes(8).toString('hex');
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    const dir = path.resolve(__dirname, '../../database/migrations');
    const files = fs.readdirSync(dir).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
    await client.query('SELECT 1 FROM bookings LIMIT 1');
    console.log(`PASS: ${files.length} migrations applied to an empty isolated schema; rolled back`);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error(error.code || 'MIGRATION_TEST_FAILED'); process.exitCode = 1; });
