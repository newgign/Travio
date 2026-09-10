// Explicit provider environment; NODE_ENV never selects LIVE credentials.
function buildConfig(env = process.env) {
  const environment = String(env.HOTELBEDS_ENV || 'test').trim().toLowerCase();
  const live = environment === 'live';
  const baseUrl = live ? 'https://api.hotelbeds.com' : 'https://api.test.hotelbeds.com';
  const bookingBaseUrl = live ? 'https://api-mtls.hotelbeds.com' : 'https://api-mtls.test.hotelbeds.com';
  const errors = [];
  if (!['test', 'live'].includes(environment)) errors.push('INVALID_ENVIRONMENT');
  if (live && env.HOTELBEDS_ENV !== 'live') errors.push('EXPLICIT_LIVE_ENV_REQUIRED');
  for (const [name, expected] of [['HOTELBEDS_BASE_URL', baseUrl], ['HOTELBEDS_CONTENT_BASE_URL', baseUrl], ['HOTELBEDS_BOOKING_BASE_URL', bookingBaseUrl]]) {
    if (env[name] && env[name].replace(/\/$/, '') !== expected) errors.push('ENDPOINT_ENVIRONMENT_MISMATCH');
  }
  return {
    environment, baseUrl, bookingBaseUrl, contentBaseUrl: baseUrl, configurationErrors: errors,
    enabled: env.HOTELBEDS_ENABLED === 'true', bookingEnabled: env.HOTELBEDS_BOOKING_ENABLED === 'true',
    liveBookingEnabled: env.HOTELBEDS_LIVE_BOOKING_ENABLED === 'true',
    // LIVE cannot inherit the legacy TEST credential pair.
    apiKey: live ? env.HOTELBEDS_LIVE_API_KEY || '' : env.HOTELBEDS_API_KEY || '',
    secret: live ? env.HOTELBEDS_LIVE_API_SECRET || '' : env.HOTELBEDS_API_SECRET || env.HOTELBEDS_SECRET || '',
    timeout: Math.max(Number(env.HOTELBEDS_TIMEOUT_MS) || 12000, 1000),
    bookingTimeout: Math.max(Number(env.HOTELBEDS_BOOKING_TIMEOUT_MS) || 65000, 60000),
    allowPriceTolerance: false, bookingTolerance: 0,
    requestIntervalMs: Math.max(Number(env.HOTELBEDS_REQUEST_INTERVAL_MS) || 300, 250),
    maxRetries: Math.min(Math.max(Number(env.HOTELBEDS_READ_RETRIES) || 0, 0), 3),
    mtlsCertPath: env[live ? 'HOTELBEDS_LIVE_MTLS_CERT_PATH' : 'HOTELBEDS_MTLS_CERT_PATH'] || '',
    mtlsKeyPath: env[live ? 'HOTELBEDS_LIVE_MTLS_KEY_PATH' : 'HOTELBEDS_MTLS_KEY_PATH'] || '',
    mtlsKeyPassphrase: env[live ? 'HOTELBEDS_LIVE_MTLS_KEY_PASSPHRASE' : 'HOTELBEDS_MTLS_KEY_PASSPHRASE'] || '',
    mtlsCaPath: env[live ? 'HOTELBEDS_LIVE_MTLS_CA_PATH' : 'HOTELBEDS_MTLS_CA_PATH'] || '',
  };
}
module.exports = { buildConfig };
