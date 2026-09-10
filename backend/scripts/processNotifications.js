require("dotenv").config();
const pool = require("../db");
const notificationService = require("../services/notificationService");

(async () => {
  const status = notificationService.channelStatus();
  console.log("Email channel:", status);
  const results = await notificationService.processPending({ limit: 50 });
  console.log(`Processed ${results.length} notification(s)`);
  for (const item of results) console.log(`#${item.id}: ${item.status}${item.message ? ` - ${item.message}` : ""}`);
})()
  .catch((error) => {
    console.error("NOTIFICATION PROCESSOR ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch {}
  });
