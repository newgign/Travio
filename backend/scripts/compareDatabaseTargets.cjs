// LOCAL PARSE ONLY. No dotenv, filesystem, DNS, DB driver, subprocess or network.
const comparisonKeys = [
  'STAGING_URL_VALID', 'PRODUCTION_URL_VALID', 'HOST_EQUAL', 'PORT_EQUAL',
  'DATABASE_EQUAL', 'USER_EQUAL', 'SAME_DATABASE_IDENTITY', 'DATABASES_DISTINCT',
];
function identity(raw) {
  try {
    if (typeof raw !== 'string' || !raw || raw.length > 8192 || /[\s\\\p{Cc}\p{Cf}]/u.test(raw)) return null;
    const url = new URL(raw);
    // Query/fragment parameters can override libpq identity or TLS. Never silently ignore them.
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || raw.includes('?') || raw.includes('#') || !url.hostname) return null;
    const user = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!user || /[\p{Cc}\p{Cf}]/u.test(user + password) || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(database)) return null;
    // WHATWG's HTTP host parser canonicalizes DNS case, trailing-dot handling below,
    // IPv4 spelling and IPv6 compression locally. It performs no DNS resolution.
    const host = new URL(`http://${url.host}`).hostname.toLowerCase().replace(/\.$/, '');
    if (!host || host.includes('%')) return null;
    if (!host.startsWith('[') && (host.length > 253 || !host.split('.').every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) return null;
    const port = url.port ? Number(url.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host, port, database, user };
  } catch { return null; }
}
function compare(env = process.env) {
  const staging = identity(env.STAGING_DATABASE_URL), production = identity(env.PRODUCTION_DATABASE_URL);
  const valid = Boolean(staging && production);
  const same = key => valid && staging[key] === production[key];
  // User/password changes never make the same host+port+database a distinct database.
  // Different endpoints can still alias one server: owner resource evidence remains mandatory.
  const sameDatabase = same('host') && same('port') && same('database');
  return {
    status: valid && !sameDatabase ? 'PASS' : 'BLOCKED',
    code: !valid ? 'DATABASE_URL_INVALID' : sameDatabase ? 'DATABASE_IDENTITY_COLLISION' : 'DISTINCT_CANDIDATES_REQUIRE_OWNER_ATTESTATION',
    scope: 'LOCAL_URL_COMPARISON_ONLY',
    comparison: {
      STAGING_URL_VALID: Boolean(staging), PRODUCTION_URL_VALID: Boolean(production),
      HOST_EQUAL: same('host'), PORT_EQUAL: same('port'), DATABASE_EQUAL: same('database'), USER_EQUAL: same('user'),
      SAME_DATABASE_IDENTITY: sameDatabase, DATABASES_DISTINCT: valid && !sameDatabase,
    },
    remoteOwnership: 'NOT_VERIFIED', databaseState: 'NOT_QUERIED',
  };
}
function main(args = process.argv.slice(2), env = process.env) {
  const result = args.length ? { status: 'BLOCKED', code: 'UNSUPPORTED_ARGUMENT' } : compare(env);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}
if (require.main === module) main();
module.exports = { compare, comparisonKeys, main };
