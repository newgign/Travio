// Activation is deliberately unavailable until the read API integration is approved.
function storageMode(env = process.env) {
  const mode = env.RECONCILIATION_STORAGE_MODE ?? 'disabled';
  if (mode !== 'disabled') throw Object.assign(new Error('Reconciliation activation blocked'), { code: 'RECONCILIATION_ACTIVATION_BLOCKED' });
  return mode;
}
module.exports = { storageMode };
