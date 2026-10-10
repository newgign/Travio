const jwt = require('jsonwebtoken');
const account = require('./accountSecurityState');
const ttlSeconds = 300;
const type = 'legacy_password_update';
function secret() { if (!process.env.JWT_SECRET) throw Error('UPGRADE_CONFIG_UNAVAILABLE'); return process.env.JWT_SECRET; }
function issue(row) {
  const state = account.securityState(row);
  if (!state.isActive || state.sessionVersion >= 2147483647) throw Error('UPGRADE_ACCOUNT_UNAVAILABLE');
  return jwt.sign({ type, id: state.id, sessionVersion: state.sessionVersion }, secret(), { algorithm: 'HS256', expiresIn: ttlSeconds });
}
function verify(token) {
  if (typeof token !== 'string' || token.length > 4096 || !token) throw Error('INVALID_UPGRADE');
  const value = jwt.verify(token, secret(), { algorithms: ['HS256'] });
  const now = Math.floor(Date.now() / 1000);
  if (!value || value.type !== type || !Number.isSafeInteger(value.id) || value.id < 1
    || !account.validVersion(value.sessionVersion) || value.sessionVersion >= 2147483647
    || !Number.isSafeInteger(value.iat) || !Number.isSafeInteger(value.exp)
    || value.iat > now + 5 || value.exp <= value.iat || value.exp - value.iat > ttlSeconds
    || Object.keys(value).some(key => !['type', 'id', 'sessionVersion', 'iat', 'exp'].includes(key))) throw Error('INVALID_UPGRADE');
  return value;
}
async function update(req, res) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['passwordUpdateToken', 'newPassword'].includes(key))
    || typeof body.newPassword !== 'string' || body.newPassword.length < 8 || Buffer.byteLength(body.newPassword, 'utf8') > 72)
    return res.status(400).json({ code: 'AUTH_INPUT_INVALID' });
  let capability;
  try { capability = verify(body.passwordUpdateToken); }
  catch { return res.status(401).json({ code: 'PASSWORD_UPDATE_INVALID' }); }
  try {
    const pool = require('../db');
    const found = await pool.query('SELECT id, role, password, session_version, is_active FROM users WHERE id = $1 LIMIT 1', [capability.id]);
    if (!found.rows.length) return res.status(401).json({ code: 'PASSWORD_UPDATE_INVALID' });
    const row = found.rows[0], state = account.securityState(row);
    if (!state.isActive || state.id !== capability.id || state.sessionVersion !== capability.sessionVersion)
      return res.status(401).json({ code: 'PASSWORD_UPDATE_INVALID' });
    const hash = await require('bcryptjs').hash(body.newPassword, 12);
    const changed = await pool.query('UPDATE users SET password = $1, session_version = session_version + 1, updated_at = NOW() WHERE id = $2 AND password = $3 AND session_version = $4 AND is_active = TRUE RETURNING id',
      [hash, state.id, row.password, state.sessionVersion]);
    if (changed.rows.length !== 1) return res.status(401).json({ code: 'PASSWORD_UPDATE_INVALID' });
    return res.json({ code: 'PASSWORD_UPDATED', reauthenticationRequired: true });
  } catch { return res.status(503).json({ code: 'PASSWORD_UPDATE_UNAVAILABLE' }); }
}
module.exports = { ttlSeconds, issue, verify, update };
