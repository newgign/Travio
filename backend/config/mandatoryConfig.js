// Offline contract: no dotenv, logger, client, network or credential output.
function productionLike(env = {}) {
  return ['APP_ENV', 'EXPECTED_APP_ENV', 'NODE_ENV'].some(key =>
    ['staging', 'production'].includes(String(env[key] || '').trim().toLowerCase()));
}
function strongSecret(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 32 || value.length > 4096
    || /\s/.test(value) || new Set(value).size < 10) return false;
  // Match placeholder tokens, not ordinary dictionary substrings in random keys.
  return !/(?:^|[_\s-])(?:changeme|change[_-]?me|replace[_-]?me|placeholder|password|example|default|test[_-]?only|your[_-]?secret|generate[_-]a[_-]long)(?:$|[_\s-])/i.test(value);
}
function secretChecks(env) {
  const checks = [];
  for (const name of ['JWT_SECRET', 'OFFER_TOKEN_SECRET']) {
    if (!strongSecret(env[name])) checks.push({ name, code: env[name] ? 'SECRET_WEAK' : 'SECRET_REQUIRED' });
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.OFFER_TOKEN_SECRET)
    checks.push({ name: 'OFFER_TOKEN_SECRET', code: 'SECRET_REUSE_NOT_ALLOWED' });
  return checks;
}
function validate(env = {}) {
  if (!productionLike(env)) return [];
  const checks = secretChecks(env);
  const add = (name, code) => checks.push({ name, code });
  try {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2 || url.hash)
      throw Error();
    const mode = env.DB_SSL_MODE || 'verify-full';
    if (!['verify-full', 'require'].includes(mode) || env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error();
    require('./database').databaseConfig(env); // Existing TLS/target contract; never connects.
  } catch { add('DATABASE_URL', 'DATABASE_CONFIG_INVALID'); }
  try { require('./cors').allowedOrigins(env); } catch { add('CORS_ORIGINS', 'CORS_CONFIG_INVALID'); }
  try { require('./trustedProxy').trustedProxy(env); } catch { add('TRUST_PROXY', 'TRUST_PROXY_INVALID'); }
  try { require('./sessionSecurity').enforcementMode(env); } catch { add('SESSION_STATE_ENFORCEMENT', 'SESSION_CONFIG_INVALID'); }
  for (const name of ['RECONCILIATION_STORAGE_MIGRATION_ENABLED', 'SESSION_SECURITY_MIGRATION_ENABLED'])
    if (env[name] !== undefined && env[name] !== 'false') add(name, 'RUNTIME_MIGRATION_FLAG_BLOCKED');
  const provider = require('./hotelbeds').buildConfig(env);
  if (provider.configurationErrors.length) add('HOTELBEDS_ENV', 'PROVIDER_CONFIG_INVALID');
  if (provider.enabled || provider.bookingEnabled || provider.liveBookingEnabled) {
    if (!provider.apiKey || !provider.secret) add('HOTELBEDS_ENABLED', 'PROVIDER_CREDENTIALS_REQUIRED');
    if (!provider.mtlsCertPath || !provider.mtlsKeyPath) add('HOTELBEDS_ENABLED', 'PROVIDER_MTLS_REQUIRED');
  }
  for (const [flag, key] of [['GOOGLE_ENABLED', 'GOOGLE_API_KEY'], ['FOURSQUARE_ENABLED', 'FOURSQUARE_API_KEY'], ['GEOAPIFY_ENABLED', 'GEOAPIFY_API_KEY']])
    if (env[flag] === 'true' && !env[key]) add(key, 'PROVIDER_CREDENTIALS_REQUIRED');
  if (env.EMAIL_ENABLED === 'true' && env.EMAIL_PROVIDER === 'resend' && (!env.RESEND_API_KEY || !env.EMAIL_FROM))
    add('RESEND_API_KEY', 'EMAIL_CREDENTIALS_REQUIRED');
  if (require('../services/productionGateService').state(env).paymentActivation.status !== 'PASS')
    add('PAYMENTS_MODE', 'LIVE_PAYMENT_CAPABILITY_UNAVAILABLE');
  const publicNames = ['VITE_API_URL', 'VITE_HOTELBEDS_STAGING_TEST_ENABLED', 'VITE_SUPPORT_PHONE', 'VITE_SUPPORT_EMAIL'];
  if (Object.keys(env).some(key => key.startsWith('VITE_') && !publicNames.includes(key)))
    add('VITE_ENV', 'FRONTEND_ENV_BOUNDARY');
  return checks;
}
function assertValid(env = process.env) {
  const checks = validate(env);
  if (checks.length) throw Object.assign(new Error('Mandatory configuration blocked'), { code: 'MANDATORY_CONFIG_BLOCKED', checks });
}
module.exports = { productionLike, strongSecret, secretChecks, validate, assertValid };
