// Owner-only diagnostic. Never execute remotely as part of offline verification.
const db = require('./lib/dbContinuity.cjs');
const { assertHistory } = require('./lib/backupMigrationState.cjs');
function target(env, intent) {
  const reject = () => { throw new db.ContinuityError('STAGING_IDENTITY_BLOCKED'); };
  if (intent !== '--staging-read-only' || env.APP_ENV !== 'staging' || env.EXPECTED_APP_ENV !== 'staging'
    || env.NODE_ENV !== 'test' || !/^[a-f0-9]{64}$/.test(env.RECONCILIATION_EXPECTED_DB_IDENTITY || '')) reject();
  let conn;
  try { conn = db.connection(env); } catch { reject(); }
  if (conn.sslMode !== 'verify-full' || [conn.host, conn.database, env.ENVIRONMENT, env.HOTELBEDS_ENV].some(v => /prod|live/i.test(v || ''))
    || ['PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED'].some(k => env[k] !== undefined && env[k] !== 'false')
    || db.sourceIdentity(conn) !== env.RECONCILIATION_EXPECTED_DB_IDENTITY) reject();
  return conn;
}
async function inspect({ env = process.env, intent, factory } = {}) {
  const conn = target(env, intent); // All identity checks before constructing any DB client.
  return db.withClient(conn, async client => {
    await client.query('BEGIN READ ONLY');
    try {
      const known = db.migrationInventory().migrations;
      const rows = (await client.query('SELECT name FROM public._migrations ORDER BY id')).rows;
      const applied = assertHistory(rows.map(row => row.name), known);
      await client.query('COMMIT');
      return { environment: 'staging', sourceIdentitySha256: db.sourceIdentity(conn), expectedTargetMatch: true,
        migrations: { applied, pending: known.slice(applied.length), count: applied.length } };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  }, factory);
}
if (require.main === module) db.cli(async log => {
  if (process.argv.length !== 3) throw new db.ContinuityError('STAGING_IDENTITY_BLOCKED');
  log(await inspect({ intent: process.argv[2] }));
}).then(code => { process.exitCode = code; });
module.exports = { target, inspect };
