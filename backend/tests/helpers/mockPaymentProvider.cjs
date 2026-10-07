// Test-only synthetic format and HMAC; never a signature algorithm for a real PSP.
const crypto = require('node:crypto');
function createMockProvider(secret) {
  if (typeof secret !== 'string' || !secret.startsWith('synthetic-')) throw Error('Synthetic test secret required');
  const signature = raw => crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return { name: 'synthetic_mock', mode: 'offline-contract',
    sign: signature,
    verifyWebhook(raw, provided) {
      if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/.test(provided)) return false;
      return crypto.timingSafeEqual(Buffer.from(signature(raw), 'hex'), Buffer.from(provided, 'hex'));
    },
    normalizeWebhookEvent(raw) { return JSON.parse(raw.toString('utf8')); },
  };
}
module.exports = { createMockProvider };
