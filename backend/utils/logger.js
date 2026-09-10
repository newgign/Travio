function cleanMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    if (/secret|password|token|api.?key|authorization|cookie/i.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value instanceof Error
      ? { name: value.name, message: value.message, code: value.code || null }
      : value;
  }
  return out;
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
      message: String(message || ""),
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
