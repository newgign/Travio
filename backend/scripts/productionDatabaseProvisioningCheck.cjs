// 4C.1 companion gate: owner metadata only. 4B modes/requirements remain unchanged.
const fs = require('node:fs');
const path = require('node:path');
const infrastructure = require('./productionInfrastructureCheck.cjs');
const inherited = require('./productionInfrastructureEnvSchema.cjs');
const { comparisonKeys } = require('./compareDatabaseTargets.cjs');
const root = path.resolve(__dirname, '../..');
const attestationNames = ['STAGING_DATABASE_IDENTITY_ATTESTED', 'PRODUCTION_DATABASE_IDENTITY_ATTESTED',
  'DATABASES_CONFIRMED_DISTINCT', 'PRODUCTION_DATABASE_TARGET_ATTESTED'];
const attestations = Object.fromEntries(attestationNames.map(name => [name, inherited.attestations[name]]));
const states = ['NOT_PROVISIONED', 'PROVISIONED_UNVERIFIED', 'PROVISIONED_DISTINCTNESS_VERIFIED', 'TARGET_ATTESTED',
  'READ_ONLY_INSPECTION_PENDING', 'READY_FOR_MIGRATION_AUTHORIZATION', 'MIGRATION_AUTHORIZED', 'MIGRATED'];
const exactKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
function validComparison(value) {
  if (!exactKeys(value, comparisonKeys) || !comparisonKeys.every(key => typeof value[key] === 'boolean')) return false;
  const valid = value.STAGING_URL_VALID && value.PRODUCTION_URL_VALID;
  if (!valid) return comparisonKeys.slice(2).every(key => value[key] === false);
  const same = value.HOST_EQUAL && value.PORT_EQUAL && value.DATABASE_EQUAL;
  return value.SAME_DATABASE_IDENTITY === same && value.DATABASES_DISTINCT === !same;
}
function validSnapshot(value) {
  return exactKeys(value, ['schemaVersion', 'environment', 'logicalDatabase', 'logicalStagingDatabase',
    'productionDatabaseCreated', 'comparison', 'attestations', 'migrationAuthorized', 'migrationRun']) &&
    value.schemaVersion === 1 && value.environment === 'production' &&
    value.logicalDatabase === inherited.plannedNames.database && value.logicalStagingDatabase === 'asedeliya-staging-db' &&
    ['productionDatabaseCreated', 'migrationAuthorized', 'migrationRun'].every(key => typeof value[key] === 'boolean') &&
    (value.comparison === null || validComparison(value.comparison)) && exactKeys(value.attestations, attestationNames) &&
    attestationNames.every(name => value.attestations[name] === null || value.attestations[name] === attestations[name]);
}
function readSnapshot(file) {
  const absolute = path.resolve(file);
  // Refuse symlink ancestors as well as the file; never read an unbounded or non-regular input.
  for (let current = absolute; ; current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw Error('INVALID_SNAPSHOT');
    if (current === path.dirname(current)) break;
  }
  const stat = fs.statSync(absolute);
  if (!stat.isFile() || stat.size > 16384) throw Error('INVALID_SNAPSHOT');
  return JSON.parse(fs.readFileSync(absolute, 'utf8').replace(/^\uFEFF/, ''));
}
async function check(snapshot) {
  const checks = [], reachedStates = [];
  let state = 'INVALID_SNAPSHOT';
  const add = (id, ok, pass, fail) => checks.push({ id, status: ok ? 'PASS' : 'BLOCKED', code: ok ? pass : fail });
  try {
    const valid = Boolean(validSnapshot(snapshot));
    add('SNAPSHOT', valid, 'DATABASE_SNAPSHOT_VALID', 'DATABASE_SNAPSHOT_INVALID');
    if (valid) {
      const plan = await infrastructure.check({}, { planOnly: true });
      add('INHERITED_PLAN', plan.status === 'PASS', 'INFRASTRUCTURE_PLAN_PASS', 'INFRASTRUCTURE_PLAN_BLOCKED');
      const created = snapshot.productionDatabaseCreated;
      const identities = ['STAGING_DATABASE_IDENTITY_ATTESTED', 'PRODUCTION_DATABASE_IDENTITY_ATTESTED']
        .every(name => snapshot.attestations[name] === attestations[name]);
      const comparison = snapshot.comparison;
      const compared = comparison?.STAGING_URL_VALID === true && comparison?.PRODUCTION_URL_VALID === true;
      const collision = comparison?.SAME_DATABASE_IDENTITY === true;
      const distinct = compared && !collision && comparison.DATABASES_DISTINCT &&
        snapshot.attestations.DATABASES_CONFIRMED_DISTINCT === attestations.DATABASES_CONFIRMED_DISTINCT;
      const target = snapshot.attestations.PRODUCTION_DATABASE_TARGET_ATTESTED === attestations.PRODUCTION_DATABASE_TARGET_ATTESTED;
      add('PROVISIONING', created, 'DATABASE_PROVISIONED_OWNER_REPORTED', 'DATABASE_NOT_PROVISIONED');
      add('IDENTITIES', created && identities, 'DATABASE_IDENTITIES_ATTESTED', 'DATABASE_PROVISIONED_NOT_ATTESTED');
      add('COMPARISON', compared && !collision, 'DATABASE_COMPARISON_ACCEPTED', collision ? 'DATABASE_IDENTITY_COLLISION' : 'DATABASE_COMPARISON_NOT_VALID');
      add('DISTINCTNESS', created && identities && distinct, 'DATABASE_DISTINCTNESS_CONFIRMED', 'DATABASE_DISTINCTNESS_NOT_ATTESTED');
      add('TARGET', created && identities && distinct && target, 'DATABASE_TARGET_ATTESTED', 'DATABASE_TARGET_NOT_ATTESTED');
      add('MIGRATION_AUTHORIZATION', snapshot.migrationAuthorized === false, 'DATABASE_MIGRATION_NOT_AUTHORIZED', 'DATABASE_MIGRATION_AUTHORIZATION_OUT_OF_SCOPE');
      add('MIGRATION_EXECUTION', snapshot.migrationRun === false, 'DATABASE_MIGRATION_NOT_RUN', 'DATABASE_MIGRATION_REPORTED_OUT_OF_SCOPE');
      if (!created) { state = 'NOT_PROVISIONED'; reachedStates.push(state); }
      else {
        state = 'PROVISIONED_UNVERIFIED'; reachedStates.push(state);
        if (identities && distinct) {
          state = 'PROVISIONED_DISTINCTNESS_VERIFIED'; reachedStates.push(state);
          if (target) { state = 'TARGET_ATTESTED'; reachedStates.push(state); }
        }
      }
      if (snapshot.migrationAuthorized || snapshot.migrationRun) state = 'BLOCKED_OUT_OF_SCOPE';
      else if (checks.every(item => item.status === 'PASS')) { state = 'READ_ONLY_INSPECTION_PENDING'; reachedStates.push(state); }
    }
  } catch { add('OFFLINE_CHECK', false, 'VALID', 'DATABASE_OFFLINE_CHECK_FAILED'); }
  return { status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'BLOCKED',
    scope: 'OFFLINE_OWNER_PROVISIONING_SNAPSHOT_ONLY', state, reachedStates, checks,
    evidence: 'OWNER_REPORTED_NOT_REMOTE_VERIFICATION', databaseState: 'NOT_QUERIED',
    emptyDatabase: 'NOT_VERIFIED', readOnlyInspection: 'NOT_RUN',
    migrationAuthorization: 'NOT_GRANTED_BY_THIS_SCOPE', migrationExecution: 'NOT_RUN_BY_TOOL',
    applicationConnection: 'NOT_CONFIGURED_BY_TOOL', nextAction: 'STOP_OWNER_REVIEW_REQUIRED' };
}
async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--contract') {
    console.log(JSON.stringify({ schemaVersion: 1, attestations, states,
      maximumState: 'READ_ONLY_INSPECTION_PENDING', migrationAuthorized: false, migrationRun: false }, null, 2)); return;
  }
  if (args.length && !(args.length === 2 && args[0] === '--snapshot')) {
    console.log('{"status":"BLOCKED","code":"UNSUPPORTED_ARGUMENT"}'); process.exitCode = 1; return;
  }
  try {
    const result = await check(readSnapshot(args[1] || path.join(root, 'PRODUCTION_DATABASE_OWNER_SNAPSHOT.example.json')));
    console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch { console.log('{"status":"BLOCKED","code":"DATABASE_SNAPSHOT_INVALID"}'); process.exitCode = 1; }
}
if (require.main === module) main().catch(() => { console.log('{"status":"BLOCKED","code":"DATABASE_OFFLINE_CHECK_FAILED"}'); process.exitCode = 1; });
module.exports = { check, main, attestations, states };
