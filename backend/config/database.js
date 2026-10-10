const fs = require('fs');

function databaseConfig(env = process.env) {
  const connectionString = String(env.DATABASE_URL || '').trim();
  const mode = env.DB_SSL_MODE || (connectionString ? 'verify-full' : 'disable');
  if (!['disable', 'verify-full', 'require'].includes(mode)) throw new Error('Invalid DB_SSL_MODE');
  if (mode === 'require') require('./renderInternalTls.cjs').approvedTarget(env);
  if (connectionString) {
    let url;
    try { url = new URL(connectionString); } catch { throw new Error('Invalid DATABASE_URL'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid DATABASE_URL protocol');
    // pg connection-string SSL options can override the explicit verified TLS config.
    if ([...url.searchParams.keys()].some(key => /^ssl/i.test(key))) {
      throw new Error('Configure database TLS with DB_SSL_MODE/DB_SSL_CA_PATH, not DATABASE_URL SSL parameters');
    }
  }
  return {
    ...(connectionString ? { connectionString } : {
      host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER,
      password: env.DB_PASSWORD, database: env.DB_NAME,
    }),
    ssl: mode === 'disable' ? false : {
      rejectUnauthorized: mode !== 'require',
      ...(env.DB_SSL_CA_PATH ? { ca: fs.readFileSync(env.DB_SSL_CA_PATH, 'utf8') } : {}),
    },
    connectionTimeoutMillis: 5000,
  };
}
module.exports = { databaseConfig };
