const { isIP } = require('node:net');
function trustedProxy(env = process.env) {
  const value = env.TRUST_PROXY ?? 'false';
  const reject = () => { throw Object.assign(new Error('Invalid trusted proxy configuration'), { code: 'TRUST_PROXY_INVALID' }); };
  if (typeof value !== 'string') return reject();
  if (value === 'false' || value === '0') return false;
  if (/^[1-8]$/.test(value)) return Number(value);
  if (value === 'loopback') return 'loopback';
  if (typeof value !== 'string' || value.length > 1024) return reject();
  const ranges = value.split(',');
  if (ranges.length > 16) return reject();
  for (const range of ranges) {
    const parts = range.split('/'), family = isIP(parts[0]);
    if (!family || parts.length > 2) return reject();
    if (parts.length === 2 && (!/^\d{1,3}$/.test(parts[1]) || Number(parts[1]) < 1 || Number(parts[1]) > (family === 4 ? 32 : 128))) return reject();
  }
  return ranges;
}
module.exports = { trustedProxy };
