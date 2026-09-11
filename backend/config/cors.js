function allowedOrigins(env = process.env) {
  const raw = env.CORS_ORIGINS ?? env.CORS_ORIGIN ?? (env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  const origins = raw.split(',').map(value => value.trim()).filter(Boolean);
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('CORS origins must be explicit HTTP(S) origins'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('CORS origins must be explicit HTTP(S) origins without paths');
    }
  }
  return origins;
}
module.exports = { allowedOrigins };
