const { isIP } = require('node:net');
function canonicalIp(value) {
  if (typeof value !== 'string' || value.includes('%') || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  const ipv6 = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = ipv6.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
  if (!mapped) return ipv6;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}
function getClientNetworkIdentity(req) {
  const peer = canonicalIp(req.socket?.remoteAddress);
  const direct = { ip: peer || 'unknown', source: 'socket', trustedProxy: false, forwardedChainLength: 0 };
  if (!peer) return direct;
  try {
    const trust = req.app?.get('trust proxy fn');
    if (typeof trust !== 'function' || !trust(req.socket.remoteAddress, 0)) return direct;
    // Express resolves the chain right-to-left, stopping at the first untrusted hop.
    const raw = req.get?.('x-forwarded-for');
    if (raw && (raw.length > 2048 || raw.split(',').length > 16)) return direct;
    const chain = req.ips;
    if (!Array.isArray(chain) || chain.length > 16 || chain.some(ip => !canonicalIp(ip))) return direct;
    const ip = canonicalIp(req.ip);
    if (!ip) return direct;
    return { ip, source: chain.length ? 'forwarded' : 'socket', trustedProxy: true, forwardedChainLength: chain.length };
  } catch { return direct; }
}
module.exports = { canonicalIp, getClientNetworkIdentity };
