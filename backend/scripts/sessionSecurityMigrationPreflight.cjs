const { preflight } = require('./lib/sessionSecurityMigrationGuard.cjs');
if (require.main === module) {
  const result = process.argv.length === 2 ? preflight() : { status: 'FAIL', code: 'UNSUPPORTED_ARGUMENT' };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}
module.exports = { preflight };
