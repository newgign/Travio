// Existing users is the sole source of authority. No cache or parallel session store.
const { enforcementMode } = require('../config/sessionSecurity');
const validVersion = value => Number.isInteger(value) && value >= 1 && value <= 2147483647;
function securityState(row) {
  if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || !['user', 'admin'].includes(row.role)
    || !validVersion(row.session_version) || typeof row.is_active !== 'boolean')
    throw Object.assign(new Error('Account security state unavailable'), { code: 'ACCOUNT_SECURITY_STATE_UNAVAILABLE' });
  return Object.freeze({ id: row.id, role: row.role, sessionVersion: row.session_version, isActive: row.is_active });
}
async function authenticate(session) {
  const result = await require('../db').query('SELECT id, role, session_version, is_active FROM users WHERE id = $1 LIMIT 1', [session.id]);
  if (!result.rows.length) return null;
  const state = securityState(result.rows[0]);
  if (state.id !== session.id || !state.isActive || !validVersion(session.sessionVersion)
    || session.sessionVersion !== state.sessionVersion) return null;
  // JWT email/role/extras are snapshots, not current server authority.
  return Object.freeze({ id: state.id, role: state.role, sessionVersion: state.sessionVersion });
}
module.exports = { enforcementMode, securityState, authenticate, validVersion };
