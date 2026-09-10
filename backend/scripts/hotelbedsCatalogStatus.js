require("dotenv").config();

const providerCatalogRepository = require("../repositories/providerCatalogRepository");
const pool = require("../db");

async function main() {
  try {
    const counts = await providerCatalogRepository.getCounts("hotelbeds");

    console.log("✓ Hotelbeds local catalog");
    console.log(JSON.stringify(counts, null, 2));
  } catch (error) {
    console.error("✗ Hotelbeds catalog status failed");
    console.error(error.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
