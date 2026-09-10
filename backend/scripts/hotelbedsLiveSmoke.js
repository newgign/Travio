require('dotenv').config();
const client = require('../integrations/hotelbeds/client');
async function main() {
  if (client.config.environment !== 'live' || !client.isConfigured()) {
    console.log('LIVE credentials required. No LIVE request was made.');
    process.exitCode = 1;
    return;
  }
  try { await client.status(); } catch { process.exitCode = 1; }
  console.log(JSON.stringify(client.readiness()));
}
main();
