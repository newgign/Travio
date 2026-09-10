const fs = require("fs");
const path = require("path");
const pool = require("../db");

const migrationsDir = path.resolve(__dirname, "../../database/migrations");

async function migrate() {
  const client = await pool.connect();

  try {
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
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("MIGRATION ERROR:", error);
  process.exit(1);
});
