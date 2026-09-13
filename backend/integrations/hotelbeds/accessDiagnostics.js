const reasons = new Set([
  'HBX_API_DISALLOWED', 'HBX_RESOURCE_DISALLOWED', 'HBX_QUOTA_EXCEEDED',
  'HBX_SIGNATURE_FAILED', 'HBX_AUTH_MISSING', 'HBX_RATE_LIMITED', 'HBX_UNKNOWN_AUTH_ERROR',
]);

// Whitelist at the admin boundary; never forward provider strings or headers wholesale.
function publicDiagnostics(value = {}) {
  const result = {};
  if (reasons.has(value.providerReason)) result.providerReason = value.providerReason;
  for (const key of ['rateLimit', 'rateLimitRemaining', 'retryAfterSeconds']) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0) result[key] = value[key];
  }
  return result;
}

function normalizeAccessError(response = {}) {
  if (![401, 403, 429].includes(Number(response.status))) return {};
  const body = response.data;
  const messages = [body?.message, typeof body?.error === 'string' ? body.error : body?.error?.message];
  const rules = [
    [/^access to this api has been disallowed[.!]?$/, 'HBX_API_DISALLOWED'],
    [/^access to this resource has been disallowed[.!]?$/, 'HBX_RESOURCE_DISALLOWED'],
    [/^(?:quota exceeded|(?:daily |request |api )?quota (?:has been )?exceeded|(?:daily |request |api )?quota limit exceeded)[.!]?$/, 'HBX_QUOTA_EXCEEDED'],
    [/^request signature verification failed[.!]?$/, 'HBX_SIGNATURE_FAILED'],
    [/^authorization field missing[.!]?$/, 'HBX_AUTH_MISSING'],
  ];
  let providerReason = Number(response.status) === 429 ? 'HBX_RATE_LIMITED' : 'HBX_UNKNOWN_AUTH_ERROR';
  for (const message of messages) {
    if (typeof message !== 'string' || message.length > 256) continue;
    const match = rules.find(([pattern]) => pattern.test(message.trim().toLowerCase().replace(/\s+/g, ' ')));
    if (match) { providerReason = match[1]; break; }
  }
  const result = { providerReason };
  const headers = response.headers || {};
  const header = name => typeof headers.get === 'function' ? headers.get(name) :
    Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  for (const [field, names] of [
    ['rateLimit', ['x-ratelimit-limit', 'ratelimit-limit']],
    ['rateLimitRemaining', ['x-ratelimit-remaining', 'ratelimit-remaining']],
    ['retryAfterSeconds', ['retry-after']],
  ]) {
    for (const name of names) {
      const value = header(name);
      if ((typeof value === 'string' && /^\d+$/.test(value.trim())) || typeof value === 'number') {
        const number = Number(value);
        if (Number.isSafeInteger(number) && number >= 0) { result[field] = number; break; }
      }
    }
  }
  return publicDiagnostics(result);
}

module.exports = { normalizeAccessError, publicDiagnostics };
