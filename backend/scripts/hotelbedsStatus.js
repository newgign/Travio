require("dotenv").config();

const hotelbedsClient = require("../integrations/hotelbeds/client");

async function main() {
  if (!hotelbedsClient.config.enabled) {
    console.error("HOTELBEDS_ENABLED=false. Сначала включите Hotelbeds в backend/.env");
    process.exitCode = 1;
    return;
  }

  if (!hotelbedsClient.isConfigured()) {
    console.error("Не заполнены HOTELBEDS_API_KEY / HOTELBEDS_SECRET в backend/.env");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await hotelbedsClient.status();

    console.log("✓ Hotelbeds API доступен");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("✗ Hotelbeds status failed");
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
