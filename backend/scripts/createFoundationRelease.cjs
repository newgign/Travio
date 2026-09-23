// Explicit local build step; writes public-safe identity only, never a deployment.
const fs = require('node:fs');
const path = require('node:path');
const build = require('./lib/foundationBuild.cjs');
const dist = path.resolve(__dirname, '../../frontend/dist');
function create(env = process.env, dir = dist) {
  const value = build.receipt(env, build.inspect(dir));
  // Refuse overwrite. A fresh Vite build clears the old receipt before this step.
  fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
  return { status: 'RELEASE_RECEIPT_CREATED' };
}
if (require.main === module) {
  try {
    if (process.argv.length !== 2) throw Error('ARGS');
    console.log(JSON.stringify(create()));
  } catch { console.log('{"status":"BLOCKED","code":"RELEASE_RECEIPT_NOT_CREATED"}'); process.exitCode = 1; }
}
module.exports = { create };
