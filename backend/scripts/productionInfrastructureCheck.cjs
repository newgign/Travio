// Offline read-only dry run. No env autoload, network, subprocess or DB client.
const fs = require('node:fs');
const path = require('node:path');
const { isIP } = require('node:net'); // Pure address parsing only; never open a socket.
const schema = require('./productionInfrastructureEnvSchema.cjs');
const foundation = require('./productionFoundationCheck.cjs');
const base = require('./preProductionCheck.cjs');
const build = require('./lib/foundationBuild.cjs');
const { allowedOrigins } = require('../config/cors');
const root = path.resolve(__dirname, '../..');
function publicTarget(value) {
  try {
    // Narrow production policy: DNS names only, excluding all IP literals (including mapped IPv6).
    // URL validation, never an environment/DB identity classification or DNS lookup.
    return base.publicHttps(value) && !isIP(new URL(value).hostname.replace(/^\[|\]$/g, ''));
  } catch { return false; }
}
const equal = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
};
function expectedManifest() {
  return {
    schemaVersion: 1, environment: 'production', mode: 'DRY_RUN',
    resources: {
      backend: { logicalName: schema.plannedNames.backend, type: 'web', branch: 'main', runtime: 'node',
        healthPath: '/health', readinessPath: '/api/health/ready',
        requiredEnvNames: schema.backendEnvNames, requiredSecretNames: schema.backendSecretNames,
        conditionalSecretNames: schema.conditionalSecretNames },
      frontend: { logicalName: schema.plannedNames.frontend, type: 'static', branch: 'main', runtime: 'static',
        publishDirectory: 'frontend/dist', spaFallbackRequired: true, apiTargetRequired: true,
        requiredEnvNames: schema.frontendEnvNames, requiredSecretNames: [],
        sourceMapsAllowed: false, testDisclosureRequired: true, salesDisabledRequired: true },
      database: { logicalName: schema.plannedNames.database, type: 'database', engine: 'postgresql',
        ownerProvisioningRequired: true, targetAttestationRequired: true, migrationRequired: true,
        backupRequiredBeforeMigration: true },
    },
    connections: { backendDatabase: 'DATABASE_URL', backendCors: 'CORS_ORIGINS', frontendBackend: 'VITE_API_URL' },
    stagingMetadata: { backend: schema.stagingNames[0], frontend: schema.stagingNames[1], databaseIdentityEnvName: 'STAGING_DATABASE_LOGICAL_NAME' },
    requiredAttestationNames: Object.keys(schema.attestations),
    release: { receipt: 'frontend/dist/release.json', schemaVersion: 1, environment: 'production',
      backendRevisionEnvName: 'RELEASE_SHA', expectedRevisionEnvName: 'EXPECTED_RELEASE_SHA', mismatchPolicy: 'BLOCKED' },
    runbook: 'PRODUCTION_FOUNDATION_RUNBOOK.md', ownerTemplate: 'PRODUCTION_OWNER_CONFIGURATION_TEMPLATE.md',
    provisioningOrder: schema.steps,
  };
}
function readManifest() {
  const file = path.join(root, 'production.infrastructure.json');
  if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 32768) throw Error('MANIFEST_INVALID');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
async function check(env = process.env, options = {}) {
  const checks = [];
  const add = (id, ok, pass, fail) => checks.push({ id, status: ok ? 'PASS' : 'BLOCKED', code: ok ? pass : fail });
  const planOnly = options.planOnly === true, migrationReadiness = options.migrationReadiness === true;
  try {
    if (planOnly && migrationReadiness) throw Error('INVALID_MODE');
    const manifest = options.manifest === undefined ? readManifest() : options.manifest;
    // Closed, versioned metadata vocabulary rejects unknown keys and arbitrary secret-bearing values.
    add('RESOURCE_MANIFEST', equal(manifest, expectedManifest()), 'RESOURCE_MANIFEST_VALID', 'RESOURCE_MANIFEST_INVALID');
    const names = Object.values(manifest?.resources || {}).map(resource => resource?.logicalName);
    const staging = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
    const knownStaging = [...staging.matchAll(/^\s+name:\s*([a-z0-9-]+)\s*$/gm)].map(match => match[1]);
    add('STAGING_METADATA', equal(knownStaging, schema.stagingNames), 'STAGING_METADATA_VERIFIED', 'STAGING_METADATA_CHANGED');
    add('RESOURCE_SEPARATION', names.length === 3 && new Set(names).size === 3 &&
      !names.some(name => knownStaging.includes(name) || (env.STAGING_DATABASE_LOGICAL_NAME && name === env.STAGING_DATABASE_LOGICAL_NAME)),
    'RESOURCE_IDENTITIES_DISTINCT', 'STAGING_RESOURCE_REUSE_BLOCKED');
    const source = base.sourceChecks();
    add('SOURCE_SAFETY', source.every(item => item.status === 'PASS'), 'SOURCE_SAFETY_PASS', 'SOURCE_SAFETY_BLOCKED');
    add('PRODUCTION_TEMPLATE', foundation.deploymentChecks().every(item => item.status === 'PASS'), 'PRODUCTION_TEMPLATE_VALID', 'PRODUCTION_TEMPLATE_INVALID');
    const runbook = fs.readFileSync(path.join(root, 'PRODUCTION_FOUNDATION_RUNBOOK.md'), 'utf8');
    add('ROLLBACK_RUNBOOK', runbook.includes('## 5. Rollback contract') &&
      fs.statSync(path.join(root, 'PRODUCTION_OWNER_CONFIGURATION_TEMPLATE.md')).isFile(), 'ROLLBACK_RUNBOOK_PRESENT', 'ROLLBACK_RUNBOOK_MISSING');
    if (!planOnly) {
      add('ENVIRONMENT', env.APP_ENV === 'production' && env.EXPECTED_APP_ENV === 'production', 'PRODUCTION_ENVIRONMENT', 'ENVIRONMENT_INVALID');
      const attested = name => env[name] === schema.attestations[name];
      add('DATABASE_TARGET', attested('PRODUCTION_DATABASE_TARGET_ATTESTED') && attested('PRODUCTION_DATABASE_IDENTITY_ATTESTED'),
        'PRODUCTION_DATABASE_ATTESTED', 'PRODUCTION_DATABASE_NOT_ATTESTED');
      add('DATABASE_DISTINCTNESS', attested('STAGING_DATABASE_IDENTITY_ATTESTED') && attested('DATABASES_CONFIRMED_DISTINCT') &&
        typeof env.STAGING_DATABASE_LOGICAL_NAME === 'string' && /^[a-z][a-z0-9-]{2,79}$/.test(env.STAGING_DATABASE_LOGICAL_NAME) &&
        env.PRODUCTION_DATABASE_LOGICAL_NAME === schema.plannedNames.database &&
        !Object.values(schema.plannedNames).includes(env.STAGING_DATABASE_LOGICAL_NAME),
      'DATABASE_DISTINCTNESS_ATTESTED', 'DATABASE_DISTINCTNESS_NOT_ATTESTED');
      let apiSafe = false, frontendSafe = false;
      try {
        const prod = build.api(env.PRODUCTION_API_URL), stage = build.api(env.STAGING_API_URL);
        apiSafe = publicTarget(prod) && publicTarget(stage) && prod === build.api(env.VITE_API_URL) && new URL(prod).hostname !== new URL(stage).hostname;
      } catch { /* Fixed codes only. */ }
      try {
        const prod = env.PRODUCTION_WEB_ORIGIN, stage = env.STAGING_WEB_ORIGIN;
        frontendSafe = publicTarget(prod) && new URL(prod).origin === prod && publicTarget(stage) &&
          new URL(stage).origin === stage && new URL(prod).hostname !== new URL(stage).hostname && equal(allowedOrigins(env), [prod]);
      } catch { /* Fixed codes only. */ }
      add('API_TARGET', apiSafe, 'PRODUCTION_API_TARGET_VALID', 'PRODUCTION_API_TARGET_NOT_PROVIDED');
      add('FRONTEND_TARGET', frontendSafe, 'PRODUCTION_FRONTEND_TARGET_VALID', 'PRODUCTION_FRONTEND_TARGET_NOT_PROVIDED');
      add('HOTELBEDS', env.ACTIVE_PROVIDER === 'hotelbeds' && env.HOTELBEDS_ENV === 'test' && env.HOTELBEDS_READ_ONLY === 'true',
        'HOTELBEDS_TEST_READ_ONLY', 'HOTELBEDS_UNSAFE');
      add('SALES', ['HOTELBEDS_BOOKING_ENABLED', 'HOTELBEDS_LIVE_BOOKING_ENABLED', 'PRODUCTION_SALES_ENABLED', 'REAL_CHARGES_ENABLED', 'REAL_REFUNDS_ENABLED'].every(key => env[key] === 'false'),
        'SALES_GATES_SAFE', 'SALES_GATES_UNSAFE');
      add('PAYMENTS', env.PAYMENTS_MODE === 'disabled' && env.PAYMENTS_PROVIDER === 'none', 'PAYMENTS_DISABLED', 'PAYMENTS_UNSAFE');
      add('BACKGROUND_JOBS', ['HOT_DEALS_MONITOR_ENABLED', 'HOTELBEDS_CONTENT_SYNC_ENABLED', 'EMAIL_ENABLED', 'DB_BACKUP_AUTO_ENABLED', 'HEALTH_MONITOR_ENABLED', 'RELIABILITY_MONITOR_ENABLED'].every(key => env[key] === 'false'),
        'BACKGROUND_JOBS_DISABLED', 'BACKGROUND_JOBS_UNSAFE');
      add('TEST_DISCLOSURE', env.HOTELBEDS_ENABLED !== 'true' ||
        (env.HOTELBEDS_STAGING_TEST_ENABLED === 'true' && env.VITE_HOTELBEDS_STAGING_TEST_ENABLED === 'true'),
      'TEST_DISCLOSURE_SAFE', 'TEST_DISCLOSURE_MISSING');
      // Preserve 4A semantics, receipt integrity and every inherited 3Z/3Y gate; never echo their env-name IDs.
      const result = await foundation.check(env, { buildDir: options.buildDir });
      add('FOUNDATION', result.status === 'FOUNDATION_PASS', 'FOUNDATION_PASS', 'FOUNDATION_BLOCKED');
      const identity = result.checks.filter(item => ['REVISION_IDENTITY', 'BUILD_REVISION'].includes(item.id));
      add('RELEASE_IDENTITY', identity.length === 2 && identity.every(item => item.status === 'PASS'), 'RELEASE_IDENTITY_ATTESTED', 'RELEASE_IDENTITY_NOT_ATTESTED');
      if (result.summary.warn) checks.push({ id: 'FOUNDATION_WARNINGS', status: 'WARN', code: 'FOUNDATION_WARNINGS_REQUIRE_REVIEW' });
      if (migrationReadiness) {
        add('BACKUP_PREREQUISITE', attested('PRODUCTION_BACKUP_VERIFIED'), 'BACKUP_PREREQUISITE_ATTESTED', 'BACKUP_PREREQUISITE_NOT_ATTESTED');
        add('SCHEMA_LEDGER', attested('PRODUCTION_SCHEMA_LEDGER_REVIEWED'), 'SCHEMA_LEDGER_REVIEWED', 'SCHEMA_LEDGER_NOT_REVIEWED');
        add('MIGRATION_AUTHORIZATION', attested('PRODUCTION_MIGRATION_AUTHORIZATION'), 'MIGRATION_AUTHORIZATION_RECORDED', 'MIGRATION_NOT_AUTHORIZED');
      }
    }
  } catch { add('INFRASTRUCTURE', false, 'VALID', 'OFFLINE_CHECK_FAILED'); }
  const status = checks.some(item => item.status === 'BLOCKED') ? 'BLOCKED' : checks.some(item => item.status === 'WARN') ? 'WARN' : 'PASS';
  return { status, scope: planOnly ? 'OFFLINE_PLAN_ONLY' : migrationReadiness ? 'OFFLINE_MIGRATION_READINESS_ONLY' : 'OFFLINE_OPERATOR_SNAPSHOT_ONLY',
    checks, summary: { pass: checks.filter(c => c.status === 'PASS').length, warn: checks.filter(c => c.status === 'WARN').length, blocked: checks.filter(c => c.status === 'BLOCKED').length },
    ownerProvisioning: 'OWNER_PROVISIONING_REQUIRED', remoteState: 'NOT_QUERIED', databaseState: 'NOT_QUERIED',
    acceptance: 'NOT_RUN', migration: 'NOT_RUN', migrationExecution: 'NOT_AUTHORIZED_BY_THIS_TOOL',
    migrationReadiness: migrationReadiness ? status : 'NOT_EVALUATED', salesActivation: 'NOT_AUTHORIZED' };
}
async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--contract') { console.log(JSON.stringify(schema, null, 2)); return; }
  if (args.length > 1 || (args.length === 1 && !['--plan', '--migration-readiness'].includes(args[0]))) {
    console.log('{"status":"BLOCKED","code":"UNSUPPORTED_ARGUMENT"}'); process.exitCode = 1; return;
  }
  const result = await check(process.env, { planOnly: args[0] === '--plan', migrationReadiness: args[0] === '--migration-readiness' });
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'BLOCKED' ? 1 : 0;
}
if (require.main === module) main().catch(() => { console.log('{"status":"BLOCKED","code":"OFFLINE_CHECK_FAILED"}'); process.exitCode = 1; });
module.exports = { check, main };
