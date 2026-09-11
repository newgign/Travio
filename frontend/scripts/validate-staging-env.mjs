export function validateStagingApiUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Staging requires an absolute HTTPS VITE_API_URL ending in /api'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !/^\/api\/?$/.test(url.pathname) || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')) {
    throw new Error('Staging requires a public HTTPS VITE_API_URL ending in /api');
  }
}
if (process.env.RENDER === 'true') validateStagingApiUrl(process.env.VITE_API_URL);
