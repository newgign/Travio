const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { run } = require('../services/hotelbedsLiveReadOnlyService');

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--preflight', '--availability', '--checkrate'].includes(arg))) {
    console.log(JSON.stringify({status:'BLOCKED',blockers:['UNKNOWN_PROBE_OPTION'],networkAttempted:false}));
    process.exitCode = 1;
    return;
  }
  const result = await run({dryRun:args.includes('--preflight'),availability:args.includes('--availability'),checkRate:args.includes('--checkrate')});
  console.log(JSON.stringify(result, null, 2));
  if (!['READY','PASS'].includes(result.status)) process.exitCode = 1;
}

main().catch(() => {
  console.log(JSON.stringify({status:'FAIL',code:'READ_ONLY_PROBE_FAILED'}));
  process.exitCode = 1;
});
