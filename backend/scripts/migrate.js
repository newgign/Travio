const fs = require("fs");
const path = require("path");
const { assertExecutionAllowed } = require('./lib/sessionSecurityMigrationGuard.cjs');

const migrationsDir = path.resolve(__dirname, "../../database/migrations");

async function migrate(migrationPool, env = process.env, localOptions = {}) {
  // Refuse the whole ordered batch, never skip 021/022 or mark either applied.
  // Guard before pool construction, connection, advisory lock or ledger mutation.
  const commercial = require('./lib/durableCommercialOperationsMigrationGuard.cjs');
  if (env.LOCAL_COMMERCIAL_MIGRATION_APPROVAL === commercial.localApproval) commercial.assertLocalExecutionAllowed(env, migrationPool);
  else {
    assertExecutionAllowed(env);
    // Old 021/022 approval never authorizes the newly added 023 batch.
    commercial.assertLocalExecutionAllowed(env, migrationPool);
  }
  migrationPool = migrationPool || require("../db");
  const client = await migrationPool.connect();

  try {
    // One migration runner per database, including separate deployment processes.
    await client.query('SELECT pg_advisory_lock(319003)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

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
  console.error("MIGRATION ERROR:", error.code || "MIGRATION_FAILED");
  process.exit(1);
});

module.exports = { migrate };
