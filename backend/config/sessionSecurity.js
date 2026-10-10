// Explicit rollout, independent of migration presence. Never grants authorization.
function enforcementMode(env = process.env) {
  const mode = env.SESSION_STATE_ENFORCEMENT ?? 'disabled';
  if (!['disabled', 'enabled'].includes(mode)) throw Object.assign(new Error('Session security configuration invalid'),
    { code: 'SESSION_SECURITY_CONFIG_INVALID' });
  return mode;
}
module.exports = { enforcementMode };
