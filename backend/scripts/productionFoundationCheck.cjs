// Read-only operator gate. No dotenv, DB pool, subprocess, network or file writes.
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preProductionCheck.cjs');
const build = require('./lib/foundationBuild.cjs');
const schema = require('./productionFoundationEnvSchema.cjs');
const { allowedOrigins } = require('../config/cors');
const root = path.resolve(__dirname, '../..');
const dist = path.join(root, 'frontend/dist');
function origin(value) {
  if (!base.publicHttps(value) || new URL(value).origin !== value) throw Error('INVALID_ORIGIN');
  return value;
}
function deploymentChecks() {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const pkg = JSON.parse(read('backend/package.json'));
  const migration = read('backend/scripts/migrate.js');
  const plan = JSON.parse(read('render.production.yaml')); // JSON is a YAML subset; intentional dependency-free template.
  const apiService = plan.services?.find(service => service.name === 'asedeliya-production-api');
  const web = plan.services?.find(service => service.name === 'asedeliya-production-web');
  const env = Object.fromEntries((apiService?.envVars || []).map(item => [item.key, item.value]));
  const inherited = require('./preProductionEnvSchema.cjs');
  const safe = Object.entries(inherited.MUST_EQUAL).every(([key, value]) => env[key] === value) &&
    inherited.MUST_BE_FALSE.every(key => env[key] === 'false');
  const secretNames = ['DATABASE_URL', 'JWT_SECRET', 'OFFER_TOKEN_SECRET', 'CORS_ORIGINS', 'RELEASE_SHA'];
  const blueprintSafe = plan.services?.length === 2 && apiService?.branch === 'main' && web?.branch === 'main' &&
    plan.services.every(service => service.autoDeployTrigger === 'off') && !plan.databases &&
    apiService.buildCommand === 'npm --prefix backend ci --omit=dev' && apiService.startCommand === 'npm --prefix backend start' &&
    !apiService.preDeployCommand && apiService.healthCheckPath === '/health' && env.APP_ENV === 'production' && safe &&
    ['EMAIL_ENABLED', 'DB_BACKUP_AUTO_ENABLED', 'HEALTH_MONITOR_ENABLED', 'RELIABILITY_MONITOR_ENABLED', 'HOTELBEDS_ENABLED'].every(key => env[key] === 'false') &&
    secretNames.every(key => apiService.envVars.some(item => item.key === key && item.sync === false && item.value === undefined)) &&
    web.rootDir === 'frontend' && web.staticPublishPath === 'dist' &&
    web.buildCommand === 'npm ci --include=dev && node scripts/validate-staging-env.mjs && npm run build && node ../backend/scripts/createFoundationRelease.cjs' &&
    web.envVars.some(item => item.key === 'APP_ENV' && item.value === 'production') &&
    ['VITE_API_URL', 'RELEASE_SHA'].every(key => web.envVars.some(item => item.key === key && item.sync === false && item.value === undefined)) &&
    web.envVars.every(item => ['APP_ENV', 'NODE_VERSION', 'VITE_API_URL', 'RELEASE_SHA', 'VITE_HOTELBEDS_STAGING_TEST_ENABLED'].includes(item.key)) &&
    web.routes.some(route => route.type === 'rewrite' && route.source === '/*' && route.destination === '/index.html');
  return [
    { id: 'PRODUCTION_BLUEPRINT', status: blueprintSafe ? 'PASS' : 'BLOCKED', code: blueprintSafe ? 'VALID' : 'CONFIG_BLOCKED' },
    { id: 'MIGRATION_ISOLATION', status: pkg.scripts.migrate === 'node scripts/migrate.js' && !pkg.scripts.premigrate && !pkg.scripts.postmigrate &&
      ['pg_advisory_lock(319003)', 'pg_advisory_unlock(319003)', '"BEGIN"', '"COMMIT"', '"ROLLBACK"', 'INSERT INTO _migrations', 'client.release()', 'migrationPool.end()'].every(token => migration.includes(token)) ? 'PASS' : 'BLOCKED', code: 'MIGRATION_SOURCE_CONTRACT' },
  ];
}
async function check(env = process.env, { buildDir = dist } = {}) {
  let checks = [];
  const add = (id, ok, code) => checks.push({ id, status: ok ? 'PASS' : 'BLOCKED', code: ok ? 'VALID' : code });
  try {
    // Reuse every 3Z parser/gate. Replace only its staging-only APP_ENV assertion below.
    checks = (await base.configuration(env)).filter(item => item.id !== 'APP_ENV');
    add('ENVIRONMENT_IDENTITY', ['staging', 'production'].includes(env.APP_ENV) && env.APP_ENV === env.EXPECTED_APP_ENV, 'CONFIG_BLOCKED');
    add('REVISION_IDENTITY', build.revision(env.RELEASE_SHA) && env.RELEASE_SHA === env.EXPECTED_RELEASE_SHA &&
      env.RELEASE_REVISION_ATTESTED === 'I_VERIFIED_SOURCE_AND_BACKEND_REVISION', 'REVISION_NOT_ATTESTED');
    add('ROLLBACK', build.revision(env.PREVIOUS_RELEASE_SHA) && env.PREVIOUS_RELEASE_SHA !== env.RELEASE_SHA &&
      env.ROLLBACK_READY_ATTESTED === 'I_VERIFIED_ROLLBACK_AND_DATA_RECOVERY_PLAN', 'ROLLBACK_NOT_READY');
    if (env.APP_ENV === 'production') {
      add('PRODUCTION_DATABASE', env.PRODUCTION_DATABASE_TARGET_ATTESTED === 'I_VERIFIED_SEPARATE_DURABLE_PRODUCTION_DATABASE', 'DATABASE_TARGET_NOT_ATTESTED');
      add('DATA_RECOVERY', env.BACKUP_RESTORE_READY_ATTESTED === 'I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET', 'ROLLBACK_NOT_READY');
    }
    let target, other, separated = false;
    try {
      const staging = build.api(env.STAGING_API_URL), production = build.api(env.PRODUCTION_API_URL);
      const stagingWeb = origin(env.STAGING_WEB_ORIGIN), productionWeb = origin(env.PRODUCTION_WEB_ORIGIN);
      target = env.APP_ENV === 'production' ? production : staging;
      other = env.APP_ENV === 'production' ? staging : production;
      const targetWeb = env.APP_ENV === 'production' ? productionWeb : stagingWeb;
      const origins = allowedOrigins(env);
      separated = new URL(staging).hostname !== new URL(production).hostname &&
        new URL(stagingWeb).hostname !== new URL(productionWeb).hostname &&
        build.api(env.VITE_API_URL) === target && origins.length === 1 && origins[0] === targetWeb;
    } catch { /* Never emit a supplied URL. */ }
    add('TARGET_SEPARATION', separated, 'BUILD_TARGET_MISMATCH');
    checks.push(...base.sourceChecks(), ...deploymentChecks());
    try {
      const artifact = build.inspect(buildDir);
      const receiptPath = path.join(buildDir, 'release.json');
      if (fs.statSync(receiptPath).size > 4096) throw Error('RECEIPT_SIZE');
      const identity = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      const expected = build.receipt(env, artifact);
      add('BUILD_REVISION', Object.keys(identity).sort().join(',') === Object.keys(expected).sort().join(',') &&
        Object.entries(expected).every(([key, value]) => identity[key] === value), 'REVISION_NOT_ATTESTED');
      add('BUILD_TARGET', separated && build.embedded(artifact.scriptText, target) &&
        !artifact.text.includes(other) && !/https?:\/\/(?:localhost|127\.|\[::1\])/.test(artifact.text), 'BUILD_TARGET_MISMATCH');
      const secrets = Object.entries(env).filter(([key, value]) => /SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL|PRIVATE_KEY/.test(key) && typeof value === 'string' && value.length >= 8).map(([, value]) => value);
      add('BUILD_SECRET_BOUNDARY', !secrets.some(value => artifact.text.includes(value)) &&
        !/DATABASE_URL|JWT_SECRET|OFFER_TOKEN_SECRET|postgres(?:ql)?:\/\/|-----BEGIN.*PRIVATE KEY/.test(artifact.text), 'CONFIG_BLOCKED');
      if (artifact.large) checks.push({ id: 'BUILD_CHUNK_SIZE', status: 'WARN', code: 'MAIN_CHUNK_OVER_500_KB' });
    } catch { add('BUILD_ARTIFACT', false, 'BUILD_TARGET_MISMATCH'); }
  } catch { add('FOUNDATION', false, 'CONFIG_BLOCKED'); }
  const blocked = checks.some(item => item.status === 'BLOCKED');
  const sales = checks.some(item => item.status === 'BLOCKED' && /HOTELBEDS|PAYMENTS|CHARGES|REFUNDS|SALES/.test(item.id));
  return { status: blocked ? 'BLOCKED' : 'FOUNDATION_PASS',
    states: [...new Set([...(blocked ? ['CONFIG_BLOCKED'] : ['FOUNDATION_PASS']),
      ...checks.filter(item => item.status === 'BLOCKED' && ['DATABASE_TARGET_NOT_ATTESTED', 'BUILD_TARGET_MISMATCH', 'REVISION_NOT_ATTESTED', 'ROLLBACK_NOT_READY'].includes(item.code)).map(item => item.code),
      ...(sales ? ['SALES_GATES_UNSAFE'] : []), 'OWNER_ACCEPTANCE_REQUIRED'])],
    checks, summary: { pass: checks.filter(c => c.status === 'PASS').length, warn: checks.filter(c => c.status === 'WARN').length, blocked: checks.filter(c => c.status === 'BLOCKED').length },
    scope: 'OFFLINE_FOUNDATION_ONLY', databaseState: 'NOT_QUERIED', deploymentState: 'NOT_QUERIED', acceptance: 'NOT_RUN', salesActivation: 'NOT_AUTHORIZED' };
}
async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--contract') { console.log(JSON.stringify({ ...schema, inherited: require('./preProductionEnvSchema.cjs') }, null, 2)); return; }
  if (args.length) { console.log('{"status":"BLOCKED","code":"UNSUPPORTED_ARGUMENT"}'); process.exitCode = 1; return; }
  const result = await check(); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'BLOCKED' ? 1 : 0;
}
if (require.main === module) main().catch(() => { console.log('{"status":"BLOCKED","code":"CONFIG_BLOCKED"}'); process.exitCode = 1; });
module.exports = { check, deploymentChecks };
