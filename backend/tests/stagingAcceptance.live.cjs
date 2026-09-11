// Explicit opt-in only. Creates named test accounts, never bookings or payments.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const API = 'https://asedeliya-staging-api.onrender.com';
const WEB = 'https://asedeliya-staging-web.onrender.com';
const evidence = { at: new Date().toISOString(), api: [], ui: [], accounts: [], errors: [] };
const out = path.join(os.tmpdir(), 'asedeliya-3c-evidence.json');
function save() { fs.writeFileSync(out, JSON.stringify(evidence, null, 2)); }
async function request(label, route, { method = 'GET', body, token, origin = WEB } = {}) {
  if (method !== 'GET' && !/^\/api\/(auth\/(register|login|profile)|travelers)$/.test(route)) throw new Error('Mutation outside acceptance scope');
  const res = await fetch(API + route, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = {}; }
  const leak = /"(?:password|password_hash|jwt_secret|database_url)"\s*:|\$2[aby]\$|\bat .+\.(?:js|cjs):\d+/i.test(text);
  evidence.api.push({ label, route, status: res.status, leak, code: data.code, role: data.user?.role || data.role, language: data.user?.preferred_language, count: Array.isArray(data) ? data.length : Array.isArray(data.data) ? data.data.length : undefined, message: data.message, cors: res.headers.get('access-control-allow-origin') });
  save();
  return { status: res.status, data };
}
async function main() {
  if (process.env.RUN_STAGING_ACCEPTANCE !== 'yes') throw new Error('Set RUN_STAGING_ACCEPTANCE=yes explicitly');
  const { chromium } = require(path.join(os.tmpdir(), 'asedeliya-3c-tools/node_modules/playwright'));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    page.on('pageerror', () => evidence.errors.push({ type: 'uncaught', route: new URL(page.url()).pathname }));
    page.on('console', msg => { if (msg.type() === 'error') evidence.errors.push({ type: 'console', route: new URL(page.url()).pathname, text: msg.text().replace(/Bearer\s+\S+/g, '[REDACTED]').slice(0, 200) }); });
    page.on('requestfailed', req => evidence.errors.push({ type: 'network', url: req.url().split('?')[0], reason: req.failure()?.errorText }));
    page.on('dialog', dialog => dialog.accept());
    const stamp = Date.now();
    const email = `asedeliya.staging.3c.${stamp}.a@example.com`;
    const second = `asedeliya.staging.3c.${stamp}.b@example.com`;
    const password = crypto.randomBytes(24).toString('base64url');
    evidence.accounts.push(email, second);
    await page.goto(WEB + '/register');
    await page.locator('[name=full_name]').fill('Staging Acceptance A');
    await page.locator('[name=email]').fill(email);
    await page.locator('[name=password]').fill(password);
    await page.locator('[name=confirmPassword]').fill(password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/login');
    evidence.ui.push({ label: 'UI registration redirects to login', pass: true });
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(WEB + '/');
    const session = await page.evaluate(() => ({ token: localStorage.getItem('token'), user: JSON.parse(localStorage.getItem('user')) }));
    evidence.ui.push({ label: 'UI login role=user', pass: session.user.role === 'user' });
    await request('health', '/health');
    await request('liveness', '/api/health/live');
    await request('missing registration fields', '/api/auth/register', { method: 'POST', body: {} });
    const badEmail = `asedeliya.staging.3c.${stamp}.invalid`;
    const invalid = await request('malformed email', '/api/auth/register', { method: 'POST', body: { full_name: 'Staging Invalid Email Test', email: badEmail, password } });
    if (invalid.status === 201) evidence.accounts.push(badEmail);
    await request('duplicate normalized email', '/api/auth/register', { method: 'POST', body: { full_name: 'Staging A', email: ` ${email.toUpperCase()} `, password } });
    await request('role injection registration', '/api/auth/register', { method: 'POST', body: { full_name: 'Staging Acceptance B', email: ` ${second.toUpperCase()} `, password, role: 'admin' } });
    const b = await request('normalized login B', '/api/auth/login', { method: 'POST', body: { email: second, password } });
    await request('wrong password', '/api/auth/login', { method: 'POST', body: { email, password: 'staging-deliberately-wrong' } });
    await request('unknown email', '/api/auth/login', { method: 'POST', body: { email: `asedeliya.staging.3c.${stamp}.absent@example.com`, password } });
    await request('profile whitelisted fields / omitted language', '/api/auth/profile', { method: 'PUT', token: session.token, body: { full_name: 'Staging Acceptance A Updated', phone: '', role: 'admin', id: b.data.user.id, permissions: ['*'], password: 'must-be-ignored', email: second } });
    const profile = await request('profile A persisted', '/api/auth/profile', { token: session.token });
    evidence.ui.push({ label: 'profile identity and role immutable, blank phone', pass: profile.data.id === session.user.id && profile.data.role === 'user' && profile.data.email === email && profile.data.phone === null });
    for (const route of ['/api/favorites', '/api/bookings/me', '/api/travelers']) {
      await request('A own list', route, { token: session.token });
      await request('B own list', route, { token: b.data.token });
      await request('anonymous denied', route);
    }
    for (const route of ['/api/admin/overview', '/api/admin/system/status', '/api/admin/providers/hotelbeds', '/api/users', '/api/bookings']) {
      await request('user admin access denied', route, { token: session.token });
      await request('anonymous admin access denied', route);
    }
    await request('invalid token', '/api/favorites', { token: 'invalid.staging.token' });
    await request('payment readiness', '/api/payments/readiness', { token: session.token });
    await request('empty catalog', '/api/catalog/hotels');
    await request('disabled search', '/api/search?country=Turkey&destination=Antalya&departureDate=2026-12-01&nights=7&people=2&children=1&childrenAges=8&food=AI&stars=5');
    await request('bad search', '/api/search?stars=9');
    await request('404', '/api/staging-acceptance-nonexistent');
    for (const origin of [WEB, 'https://example.org', 'http://localhost:5173']) {
      const res = await fetch(API + '/api/auth/login', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
      evidence.api.push({ label: 'preflight', origin, status: res.status, allowOrigin: res.headers.get('access-control-allow-origin'), credentials: res.headers.get('access-control-allow-credentials') });
    }
    for (const [width, height] of [[390,844],[768,1024],[1366,768],[1920,1080]]) {
      await page.setViewportSize({ width, height });
      for (const route of ['/', '/login', '/register', '/results', '/favorites', '/my-bookings', '/profile', '/admin', '/help/booking', '/tour/hotelbeds/acceptance-unavailable']) {
        const response = await page.goto(WEB + route);
        await page.waitForTimeout(500);
        const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, width: document.documentElement.scrollWidth, text: document.body.innerText.slice(-700), loginVisible: !!document.querySelector('input[autocomplete=current-password]') }));
        evidence.ui.push({ label: 'direct document navigation / responsive', route, viewport: `${width}x${height}`, status: response.status(), finalRoute: new URL(page.url()).pathname, ...metrics });
        if (width === 390 || width === 1366) await page.screenshot({ path: path.join(os.tmpdir(), `asedeliya-3c-${width}-${route.replace(/\W/g, '_') || 'home'}.png`), fullPage: true });
        save();
      }
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(WEB + '/profile');
    await page.reload();
    evidence.ui.push({ label: 'profile F5 authentication', pass: new URL(page.url()).pathname === '/profile' });
    const otherTab = await context.newPage();
    await otherTab.goto(WEB + '/my-bookings');
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.waitForURL(WEB + '/');
    await otherTab.waitForTimeout(500);
    evidence.ui.push({ label: 'logout clears already open protected tab', pass: new URL(otherTab.url()).pathname === '/login', actual: new URL(otherTab.url()).pathname });
    await page.goBack();
    await page.waitForTimeout(500);
    evidence.ui.push({ label: 'back after logout protected page denied', pass: !['/profile','/my-bookings'].includes(new URL(page.url()).pathname) });
    await page.goto(WEB + '/profile');
    await page.waitForURL('**/login');
    evidence.ui.push({ label: 'direct profile after logout denied', pass: new URL(page.url()).pathname === '/login' });
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(WEB + '/');
    evidence.ui.push({ label: 'UI repeat login', pass: true });
    await page.evaluate(() => localStorage.setItem('token', 'invalid.staging.token'));
    await page.goto(WEB + '/profile');
    await page.waitForTimeout(1200);
    evidence.ui.push({ label: '401 removes protected page', pass: new URL(page.url()).pathname === '/login', actual: new URL(page.url()).pathname });
    save();
    console.log(JSON.stringify({ evidence: out, accounts: evidence.accounts, apiChecks: evidence.api.length, uiChecks: evidence.ui.length, failures: evidence.ui.filter(x => x.pass === false).map(x => x.label), overflow: evidence.ui.filter(x=>x.overflow).map(x=>[x.route,x.viewport]) }));
  } finally { await browser.close(); save(); }
}
main().catch(error => { evidence.errors.push({ type: 'runner', message: error.message.replace(/Bearer\s+\S+/g, '[REDACTED]').slice(0,300) }); save(); console.error('Acceptance runner interrupted; inspect sanitized evidence.'); process.exitCode = 1; });
