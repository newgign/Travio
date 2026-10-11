// Contract: consume is ONE linearizable decision for a namespaced opaque key.
// Future shared adapters own authoritative time, atomic counter+expiry+decision,
// bounded TTL cleanup, configuration consistency and ambiguous-failure handling.
// No get/increment/expire composition or retry/fallback is permitted here.
const fail = () => { throw Object.assign(new Error('Limiter store contract invalid'), { code: 'LIMITER_STORE_INVALID' }); };
function validateInput(key, { limit, windowMs, now } = {}) {
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)
    || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1
    || !Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + windowMs)) fail();
}
function validateDecision(value, { limit, windowMs }) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(field => !Object.hasOwn(field, 'value'))) fail();
  if (!value || typeof value.allowed !== 'boolean' || typeof value.capacity !== 'boolean'
    || !Number.isSafeInteger(value.remaining) || value.remaining < 0 || value.remaining > limit
    || !Number.isSafeInteger(value.retryAfterMs) || value.retryAfterMs < 1 || value.retryAfterMs > windowMs
    || !Number.isSafeInteger(value.resetAt) || value.resetAt < 0
    || (value.capacity && value.allowed) || (!value.allowed && value.remaining !== 0)
    || Object.keys(value).some(key => !['allowed', 'remaining', 'retryAfterMs', 'resetAt', 'capacity'].includes(key))) fail();
  return value;
}
function createMemoryStore({ maxKeys = 10000 } = {}) {
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1 || maxKeys > 100000) fail();
  const counters = new Map();
  let nextCleanup = 0;
  function cleanup(time, windowMs) {
    for (const [key, item] of counters) if (item.resetAt <= time) counters.delete(key);
    nextCleanup = time + Math.min(30000, windowMs);
  }
  return Object.freeze({
    consume(key, options) {
      validateInput(key, options);
      const { limit, windowMs, now } = options;
      if (now >= nextCleanup) cleanup(now, windowMs);
      let item = counters.get(key);
      if (!item || item.resetAt <= now) {
        if (counters.size >= maxKeys) cleanup(now, windowMs);
        if (!counters.has(key) && counters.size >= maxKeys)
          return Object.freeze({ allowed: false, remaining: 0, retryAfterMs: windowMs, resetAt: now + windowMs, capacity: true });
        item = { count: 0, resetAt: now + windowMs, limit, windowMs };
        counters.set(key, item);
      }
      if (item.limit !== limit || item.windowMs !== windowMs) fail();
      item.count = Math.min(Number.MAX_SAFE_INTEGER, item.count + 1);
      return Object.freeze({ allowed: item.count <= limit, remaining: Math.max(0, limit - item.count),
        retryAfterMs: Math.max(1, Math.min(windowMs, item.resetAt - now)), resetAt: item.resetAt, capacity: false });
    },
    describe: () => Object.freeze({ storage: 'memory', scope: 'process-local', maxKeys, size: counters.size }),
  });
}
module.exports = { createMemoryStore, validateInput, validateDecision };
