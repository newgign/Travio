const fs = require("fs");
const path = require("path");
const { assertExecutionAllowed } = require('./lib/sessionSecurityMigrationGuard.cjs');

const migrationsDir = path.resolve(__dirname, "../../database/migrations");

async function migrate(migrationPool, env = process.env, localOptions = {}) {
  // Refuse the whole ordered batch, never skip 021/022 or mark either applied.
  // Guard before pool construction, connection, advisory lock or ledger mutation.
  const commercial = require('./lib/durableCommercialOperationsMigrationGuard.cjs');
  const staging = env.LOCAL_COMMERCIAL_MIGRATION_APPROVAL !== commercial.localApproval && commercial.stagingPath(env);
  let stagingConfig;
  if (env.LOCAL_COMMERCIAL_MIGRATION_APPROVAL === commercial.localApproval) commercial.assertLocalExecutionAllowed(env, migrationPool);
  else if(staging) stagingConfig=commercial.assertStagingConfiguration(env);
  else {
    assertExecutionAllowed(env);
    // Old 021/022 approval never authorizes the newly added 023 batch.
    commercial.assertLocalExecutionAllowed(env, migrationPool);
  }
  if(staging && localOptions.through!==undefined)throw Object.assign(new Error('Staging migration boundary blocked'),{code:'DURABLE_COMMERCIAL_MIGRATION_BLOCKED'});
  migrationPool = migrationPool || (staging ? new (require('pg').Pool)(stagingConfig) : require("../db"));
  if(staging)commercial.assertStagingPool(migrationPool,stagingConfig);
  const client = await migrationPool.connect();

  try {
    // One migration runner per database, including separate deployment processes.
    await client.query('SELECT pg_advisory_lock(319003)');
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
    if(staging) {
      // Ledger metadata only, under the same advisory lock; no CREATE/ALTER/INSERT before validation.
      const history=await client.query('SELECT name FROM public._migrations ORDER BY name');
      commercial.assertStagingLedger(history.rows.map(row=>row.name),env,files);
    } else await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    if (localOptions.through !== undefined) {
      if (env.LOCAL_COMMERCIAL_MIGRATION_APPROVAL !== commercial.localApproval || localOptions.through !== 22)
        throw Object.assign(new Error('Unsupported local migration boundary'), {code:'DURABLE_COMMERCIAL_MIGRATION_BLOCKED'});
      files.splice(22); // Disposable-local upgrade fixture only; never a remote skip policy.
    }

    for (const file of files) {
      const applied = await client.query(
        "SELECT 1 FROM _migrations WHERE name = $1",
        [file]
      );

      if (applied.rows.length > 0) {
        console.log(`✓ ${file} already applied`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      console.log(`→ applying ${file}`);

      await client.query("BEGIN");

      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO _migrations (name) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        console.log(`✓ ${file} applied`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("✓ Travio database is up to date");
  } finally {
    await client.query('SELECT pg_advisory_unlock(319003)').catch(() => {});
    client.release();
    await migrationPool.end();
  }
}

if (require.main === module) migrate().catch((error) => {
  console.error("MIGRATION ERROR:", publicMigrationCode(error));
  process.exit(1);
});

function publicMigrationCode(error) {
  return ['DURABLE_COMMERCIAL_MIGRATION_BLOCKED','RECONCILIATION_MIGRATION_BLOCKED','SESSION_SECURITY_MIGRATION_BLOCKED','RENDER_INTERNAL_TLS_BLOCKED'].includes(error?.code)
    ? error.code : /^\d[A-Z0-9]{4}$/.test(error?.code||'') ? 'MIGRATION_SQL_FAILED' : 'MIGRATION_FAILED';
}
module.exports = { migrate,publicMigrationCode };
