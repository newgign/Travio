// Operator-attested target binding, not certificate identity verification.
const crypto = require('node:crypto');
const approval = 'I_APPROVE_RENDER_INTERNAL_TLS_REQUIRE_FOR_VERIFIED_STAGING_TARGET';
function sourceIdentity(conn) {
  return crypto.createHash('sha256').update(JSON.stringify([conn.local ? 'loopback' : conn.host, conn.port, conn.database])).digest('hex');
}
function approvedTarget(env) {
  const reject = () => { throw Object.assign(new Error('Render internal TLS contract blocked'), { code: 'RENDER_INTERNAL_TLS_BLOCKED' }); };
  try {
    if (env.APP_ENV !== 'staging' || env.EXPECTED_APP_ENV !== 'staging' || env.DB_SSL_MODE !== 'require'
      || env.RENDER_INTERNAL_TLS_REQUIRE_APPROVAL !== approval
      || env.BACKUP_RESTORE_READY_ATTESTED !== 'I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET'
      || !/^[a-f0-9]{64}$/.test(env.RECONCILIATION_EXPECTED_DB_IDENTITY || '')
      || env.SESSION_SECURITY_EXPECTED_DB_IDENTITY !== env.RECONCILIATION_EXPECTED_DB_IDENTITY
      || env.DB_SSL_CA_PATH !== undefined || env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return reject();
    if (require('./reconciliationStorage').storageMode(env) !== 'disabled') return reject();
    for (const key of ['PRODUCTION_SALES_ENABLED', 'REAL_CHARGES_ENABLED', 'REAL_REFUNDS_ENABLED', 'HOTELBEDS_BOOKING_ENABLED', 'HOTELBEDS_LIVE_BOOKING_ENABLED']) {
      if (env[key] !== undefined && env[key] !== 'false') return reject();
    }
    if ((env.PAYMENTS_MODE !== undefined && env.PAYMENTS_MODE !== 'disabled')
      || (env.PAYMENTS_PROVIDER !== undefined && env.PAYMENTS_PROVIDER !== 'none')) return reject();
    const raw = env.DATABASE_URL;
    const url = new URL(raw);
    const user = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
    const database = decodeURIComponent(url.pathname.slice(1));
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const local = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !host || local || url.search || url.hash || !user
      || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(database) || /[\p{Cc}\p{Cf}]/u.test(user + password)) return reject();
    const conn = { raw, host, port: url.port || '5432', user, password, database, local, sslMode: 'require' };
    if (sourceIdentity(conn) !== env.RECONCILIATION_EXPECTED_DB_IDENTITY) return reject();
    return conn;
  } catch { return reject(); }
}
module.exports = { approval, sourceIdentity, approvedTarget };
