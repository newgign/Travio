// Explicit declarations, never discovery of hosting fleet size or WEB_CONCURRENCY.
function configuration(env = process.env) {
  const topology = env.ABUSE_PROTECTION_TOPOLOGY ?? 'single_instance';
  const store = env.RATE_LIMIT_STORE ?? 'memory';
  if (topology !== 'single_instance' || store !== 'memory')
    throw Object.assign(new Error('Abuse protection configuration blocked'), { code: 'ABUSE_PROTECTION_BLOCKED' });
  return Object.freeze({ topology, store, scope: 'process-local' });
}
module.exports = { configuration };
