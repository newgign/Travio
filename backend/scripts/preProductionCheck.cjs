// Read-only, offline operator gate. No dotenv, app imports, DB client or subprocess execution.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const schema = require('./preProductionEnvSchema.cjs');
const { allowedOrigins } = require('../config/cors');
const { databaseConfig } = require('../config/database');
const { buildConfig } = require('../config/hotelbeds');
const { migrationInventory } = require('./lib/dbContinuity.cjs');
const root = path.resolve(__dirname, '../..');
const norm = value => String(value || '').trim().toLowerCase();
function strongSecret(value) {
  return typeof value === 'string' && value.trim() === value && value.length >= 32 &&
    new Set(value).size >= 10 && !/placeholder|change.?me|replace.?me|your.?secret|generate.?a.?long|example|default|password/i.test(value);
}
function publicHttps(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password &&
      !/^(localhost$|0\.0\.0\.0$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) &&
      !(host.includes(':') && /^(::|fc|fd|fe80:)/.test(host)) &&
      !host.endsWith('.localhost') && !host.endsWith('.local');
  } catch { return false; }
}
async function configuration(env) {
  const checks = [];
  const add = (id, ok, reason = 'INVALID_CONFIGURATION') => checks.push({ id, status: ok ? 'PASS' : 'BLOCKED', code: ok ? 'VALID' : reason });
  for (const [key, value] of Object.entries(schema.MUST_EQUAL)) {
    // NODE_ENV/provider selector and boolean flags are case-sensitive at runtime.
    add(key, env[key] === value, env[key] ? 'UNSAFE_CONFIGURATION' : 'CONFIG_NOT_PROVIDED');
  }
  for (const key of schema.MUST_BE_FALSE) add(key, env[key] === 'false', env[key] ? 'UNSAFE_CONFIGURATION' : 'CONFIG_NOT_PROVIDED');
  add('APP_ENV', !env.APP_ENV || ['staging', 'test'].includes(norm(env.APP_ENV)));
  add('JWT_SECRET', strongSecret(env.JWT_SECRET), env.JWT_SECRET ? 'WEAK_SECRET' : 'CONFIG_NOT_PROVIDED');
  add('OFFER_TOKEN_SECRET', strongSecret(env.OFFER_TOKEN_SECRET || env.JWT_SECRET), 'WEAK_OR_MISSING_EFFECTIVE_SECRET');
  if (env.OFFER_SECRET) checks.push({ id: 'OFFER_SECRET', status: 'WARN', code: 'UNUSED_ENV_NAME' });
  let dbValid = false;
  const attestation = env.PREPROD_RENDER_INTERNAL_DB_ATTESTATION;
  const ownerAttested = attestation === 'I_VERIFIED_DATABASE_URL_MATCHES_RENDER_INTERNAL_URL';
  const attestationValid = attestation === undefined || ownerAttested;
  let internalException = false;
  try {
    const db = databaseConfig(env), url = new URL(env.DATABASE_URL);
    // Operator provenance only; never infer private networking from a hostname.
    internalException = env.DB_SSL_MODE === 'disable' && db.ssl === false && ownerAttested;
    dbValid = Boolean(attestationValid && url.hostname && url.username && url.pathname.length > 1 && !url.hash &&
      (db.ssl?.rejectUnauthorized || internalException));
  } catch { /* Never emit configuration exceptions or URLs. */ }
  add('DATABASE_URL', dbValid, env.DATABASE_URL ? 'INVALID_DATABASE_CONFIGURATION' : 'CONFIG_NOT_PROVIDED');
  if (dbValid && internalException) checks[checks.length - 1].code = 'OWNER_ATTESTED_RENDER_INTERNAL_DATABASE';
  let corsValid = false;
  try { const origins = allowedOrigins(env); corsValid = origins.length > 0 && origins.every(publicHttps); } catch { /* fixed output */ }
  add('CORS_ORIGINS', Boolean(env.CORS_ORIGINS) && corsValid, env.CORS_ORIGINS ? 'INVALID_PUBLIC_ORIGIN' : 'CONFIG_NOT_PROVIDED');
  let apiValid = false;
  try {
    const { validateStagingApiUrl } = await import(pathToFileURL(path.join(root, 'frontend/scripts/validate-staging-env.mjs')).href);
    validateStagingApiUrl(env.VITE_API_URL);
    apiValid = publicHttps(env.VITE_API_URL) && env.VITE_API_URL === env.VITE_API_URL.trim();
  } catch { /* fixed output */ }
  add('VITE_API_URL', apiValid, env.VITE_API_URL ? 'INVALID_PUBLIC_API_URL' : 'CONFIG_NOT_PROVIDED');
  const provider = buildConfig(env);
  add('HOTELBEDS_CONFIG', provider.configurationErrors.length === 0 && provider.environment === 'test' && provider.readOnly);
  for (const key of ['HOTELBEDS_ENABLED', 'HOTELBEDS_STAGING_TEST_ENABLED']) add(key, env[key] === undefined || ['true', 'false'].includes(env[key]));
  add('HOTELBEDS_READ_RETRIES', env.HOTELBEDS_READ_RETRIES === undefined || /^[0-3]$/.test(env.HOTELBEDS_READ_RETRIES));
  add('HOTELBEDS_CREDENTIALS', !provider.enabled || Boolean(provider.apiKey && provider.secret), 'CONFIG_NOT_PROVIDED');
  add('TEST_BUILD_DISCLOSURE', (env.VITE_HOTELBEDS_STAGING_TEST_ENABLED === 'true') === provider.stagingTestRequested);
  for (const key of ['EMAIL_ENABLED', 'DB_BACKUP_AUTO_ENABLED']) add(key, env[key] === undefined || env[key] === 'false', 'UNEXPECTED_BACKGROUND_ACTIVITY');
  for (const key of ['HEALTH_MONITOR_ENABLED', 'RELIABILITY_MONITOR_ENABLED']) add(key, env[key] === 'false', 'BACKGROUND_JOB_NOT_DISABLED');
  add('TLS_VERIFICATION', env.NODE_TLS_REJECT_UNAUTHORIZED !== '0');
  add('RATE_LIMIT_ENABLED', env.RATE_LIMIT_ENABLED === undefined || env.RATE_LIMIT_ENABLED === 'true');
  const body = String(env.REQUEST_BODY_LIMIT || '1mb').match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb)?$/i);
  const bytes = body ? Number(body[1]) * ({ b: 1, kb: 1024, mb: 1048576 }[(body[2] || 'b').toLowerCase()]) : 0;
  add('REQUEST_BODY_LIMIT', bytes > 0 && bytes <= 1048576);
  // Output contains fixed identifiers/statuses only, never supplied values (including unknown keys).
  add('FRONTEND_ENV_BOUNDARY', Object.keys(env).every(key => !/^VITE_/.test(key) ||
    ['VITE_API_URL', 'VITE_HOTELBEDS_STAGING_TEST_ENABLED', 'VITE_SUPPORT_PHONE', 'VITE_SUPPORT_EMAIL'].includes(key)));
  return checks;
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('UNEXPECTED_SYMLINK');
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
function sourceChecks() {
  const checks = [], read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const add = (id, ok) => checks.push({ id, status: ok ? 'PASS' : 'BLOCKED', code: ok ? 'SOURCE_CONTRACT_PRESENT' : 'SOURCE_CONTRACT_CHANGED' });
  const inventory = migrationInventory();
  const files = fs.readdirSync(path.join(root, 'database/migrations')).filter(file => file.endsWith('.sql')).sort();
  add('MIGRATION_INVENTORY', files.length === 20 && files.every((file, i) => file === inventory.migrations[i] && file.startsWith(String(i + 1).padStart(3, '0') + '_')) && new Set(files).size === 20 && inventory.tables.length === 23 && inventory.indexes.length === 72);
  const server = read('backend/server.js'), pkg = JSON.parse(read('backend/package.json'));
  add('STARTUP', pkg.scripts.start === 'node server.js' && !pkg.scripts.prestart && !pkg.scripts.poststart && !/scripts\/|\b(?:TRUNCATE|DROP\s+(?:TABLE|DATABASE)|migrate\s*\(|seed\s*\()/i.test(server));
  const runtimeFiles = ['backend/server.js', ...['routes', 'controllers', 'services', 'middleware', 'providers', 'integrations'].flatMap(dir => walk(path.join(root, 'backend', dir)).filter(f => /\.(js|cjs)$/.test(f)).map(f => path.relative(root, f)))];
  const runtime = runtimeFiles.map(read).join('\n');
  add('BACKUP_HTTP_ISOLATION', !/scripts[\\/](?:dbRestore|dbBackup)|require\([^\n]*dbContinuity|express\.static|\.sendFile\(|\.download\(/.test(runtime));
  add('BACKUP_GIT_IGNORE', /^backend\/backups\//m.test(read('.gitignore')));
  add('PUBLIC_ARTIFACT_ISOLATION', ['frontend/public', 'frontend/dist'].every(dir => walk(path.join(root, dir)).every(file => !/\.(dump|backup|sql|pem|key|p12|pfx)$|\.manifest\.json$|\.backup\.json$/i.test(file))));
  const gate = require('../services/productionGateService').state();
  add('PRODUCTION_GATE', gate.enforcedSafeMode && !gate.productionSalesEnabled && !gate.realChargesEnabled && !gate.realRefundsEnabled && read('backend/services/paymentGatewayService.js').includes('productionGateService.state()'));
  add('SECURITY_MIDDLEWARE', /app.use\(securityHeaders\)/.test(server) && /app.use\(requestTelemetry\)/.test(server) && /apiRateLimiter/.test(server) && /authRateLimiter, authRoutes/.test(server));
  add('SHUTDOWN_CONTRACT', ['SIGTERM', 'SIGINT', 'server.close(', 'pool.end()', 'forceTimer', 'closeIdleConnections', 'backupSchedulerService.stop()', 'hotelbedsMonitorService'].every(token => server.includes(token)));
  const front = walk(path.join(root, 'frontend/src')).filter(file => /\.(js|jsx|mjs)$/.test(file)).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  // Admin diagnostics may display an env NAME, never read a server env value.
  add('FRONTEND_SECRET_BOUNDARY', !/(?:process|import\.meta)\.env(?:\.|\[)[^\n;]*(?:DATABASE_URL|JWT_SECRET|OFFER_TOKEN_SECRET|HOTELBEDS_API_SECRET|REAL_CHARGES_ENABLED|PRODUCTION_SALES_ENABLED)|-----BEGIN.*PRIVATE KEY|postgres(?:ql)?:\/\//.test(front));
  add('SPA_ROUTES', read('frontend/src/App.jsx').includes('path="*"') && read('render.yaml').includes('destination: /index.html'));
  add('SOURCEMAPS_DISABLED', !/sourcemap\s*:\s*(?:true|['"](?:inline|hidden))/.test(read('frontend/vite.config.js')));
  return checks;
}
function buildChecks(env) {
  const files = walk(path.join(root, 'frontend/dist'));
  const checks = [];
  const add = (id, ok) => checks.push({ id, status: ok ? 'PASS' : 'BLOCKED', code: ok ? 'BUILD_CONTRACT_PRESENT' : 'BUILD_CONTRACT_MISSING' });
  const scripts = files.filter(file => file.endsWith('.js'));
  const text = files.filter(file => /\.(js|css|html)$/.test(file)).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  add('BUILD_PRESENT', scripts.length > 0 && files.some(file => path.basename(file) === 'index.html'));
  add('BUILD_NO_SOURCEMAPS', !files.some(file => file.endsWith('.map')) && !/sourceMappingURL/.test(text));
  add('BUILD_API_EMBEDDED', publicHttps(env.VITE_API_URL) && text.includes(String(env.VITE_API_URL).replace(/\/$/, '')) && !/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/api/.test(text));
  const secrets = Object.entries(env).filter(([key, value]) => /SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL|PRIVATE_KEY/.test(key) && typeof value === 'string' && value.length >= 8).map(([, value]) => value);
  add('BUILD_NO_SECRETS', !secrets.some(value => text.includes(value)) && !/DATABASE_URL|JWT_SECRET|OFFER_TOKEN_SECRET|postgres(?:ql)?:\/\//.test(text));
  if (scripts.some(file => fs.statSync(file).size > 500000)) checks.push({ id: 'BUILD_CHUNK_SIZE', status: 'WARN', code: 'MAIN_CHUNK_OVER_500_KB' });
  return checks;
}
async function check(env = process.env, { includeSource = true, includeBuild = false } = {}) {
  let checks;
  try { checks = [...await configuration(env), ...(includeSource ? sourceChecks() : []), ...(includeBuild ? buildChecks(env) : [])]; }
  catch { checks = [{ id: 'PREFLIGHT', status: 'BLOCKED', code: 'OFFLINE_CHECK_FAILED' }]; }
  const status = checks.some(c => c.status === 'BLOCKED') ? 'BLOCKED' : checks.some(c => c.status === 'WARN') ? 'WARN' : 'PASS';
  return { status, scope: 'OFFLINE_CONFIGURATION_AND_SOURCE_ONLY', checks,
    summary: { pass: checks.filter(c => c.status === 'PASS').length, warn: checks.filter(c => c.status === 'WARN').length, blocked: checks.filter(c => c.status === 'BLOCKED').length },
    acceptance: 'NOT_RUN', databaseState: 'NOT_QUERIED', notes: ['SCHEMA_AND_MIGRATION_LEDGER_REQUIRE_SEPARATE_OWNER_CHECK', 'BROWSER_AND_DEPLOYMENT_ACCEPTANCE_REQUIRED'] };
}
async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--contract') { console.log(JSON.stringify(schema, null, 2)); return; }
  if (args.length && !(args.length === 1 && args[0] === '--build')) { console.log(JSON.stringify({ status: 'BLOCKED', code: 'UNSUPPORTED_ARGUMENT' })); process.exitCode = 1; return; }
  const result = await check(process.env, { includeBuild: args[0] === '--build' }); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'BLOCKED' ? 1 : 0;
}
if (require.main === module) main().catch(() => { console.log('{"status":"BLOCKED","code":"OFFLINE_CHECK_FAILED"}'); process.exitCode = 1; });
module.exports = { check, configuration, sourceChecks, strongSecret, publicHttps };
