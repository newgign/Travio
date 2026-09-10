require("dotenv").config();

const hotelbedsCatalogService = require("../services/hotelbedsCatalogService");
const pool = require("../db");

async function main() {
  try {
    console.log("→ Hotelbeds Content API catalog sync started");
    console.log(
      `  countries: ${process.env.HOTELBEDS_SYNC_COUNTRIES || "EG,TR,AE,TH"}`
    );
    console.log(
      `  hotels per destination: ${process.env.HOTELBEDS_SYNC_HOTELS_PER_DESTINATION || "100"}`
    );

    const result = await hotelbedsCatalogService.sync({
      countryCodes: process.env.HOTELBEDS_SYNC_COUNTRIES,
      hotelsPerDestination:
        process.env.HOTELBEDS_SYNC_HOTELS_PER_DESTINATION || 100,
    });

    console.log("✓ Hotelbeds catalog sync completed");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("✗ Hotelbeds catalog sync failed");
    console.error(error.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
