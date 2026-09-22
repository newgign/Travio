const sensitiveKey = /secret|password|token|api.?key|authorization|cookie|database.?url|connection.?string|private.?key|passphrase/i;
function cleanText(value) {
  let text = String(value || '');
  for (const [key, secret] of Object.entries(process.env)) {
    if (sensitiveKey.test(key) && secret && secret.length >= 4) text = text.split(secret).join('[redacted]');
  }
  return text
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g, '[redacted-private-key]')
    .replace(/(?:postgres(?:ql)?|https?):\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, '[redacted-auth]')
    .replace(/\b(?:password|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*[^\r\n]+/gi, '[redacted]')
    .replace(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/g, '[redacted-hash]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]');
}
function cleanMeta(meta, seen = new WeakSet()) {
  if (typeof meta === 'string') return cleanText(meta);
  if (!meta || typeof meta !== 'object') return meta;
  if (meta instanceof Date) return Number.isFinite(meta.getTime()) ? meta.toISOString() : null;
  if (Buffer.isBuffer(meta)) return '[binary]';
  // PostgreSQL/Axios errors can carry row details, headers, passwords and response bodies.
  if (meta instanceof Error) return { name: 'Error', code: /^[A-Z0-9_]{2,40}$/.test(meta.code || '') ? cleanText(meta.code) : 'INTERNAL_ERROR' };
  if (seen.has(meta)) return '[circular]';
  seen.add(meta);
  if (Array.isArray(meta)) return meta.map(value => cleanMeta(value, seen));
  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, sensitiveKey.test(key) ? '[redacted]' : cleanMeta(value, seen)]));
}

class Logger {
  constructor() {
    this.service = "travio-api";
    this.release = "3A";
  }

  format(level, message, meta = {}) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      service: this.service,
      release: this.release,
      message: cleanText(message),
      ...cleanMeta(meta),
    };
    if (String(process.env.LOG_FORMAT || "pretty").toLowerCase() === "json") return JSON.stringify(entry);
    const suffix = Object.keys(cleanMeta(meta)).length ? ` | ${JSON.stringify(cleanMeta(meta))}` : "";
    return `[${level.toUpperCase()}] ${entry.ts} ${entry.message}${suffix}`;
  }

  info(message, meta) { console.log(this.format("info", message, meta)); }
  warn(message, meta) { console.warn(this.format("warn", message, meta)); }
  error(message, meta) { console.error(this.format("error", message, meta)); }
}

module.exports = new Logger();
