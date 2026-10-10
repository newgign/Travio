import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const files = fs.readdirSync(new URL('src', root), { recursive: true }).filter(x => /\.(js|jsx)$/.test(x)).map(x => x.replaceAll('\\', '/'));
const source = files.map(x => read('src/' + x)).join('\n');
test('browser auth security policy offline', async t => {
  const server = await createServer({ root: fileURLToPath(root), configFile: false, server: { middlewareMode: true, hmr: false }, esbuild: { jsx: 'automatic' } });
  const previous = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, window: globalThis.window };
  const local = new Map([['token','LEGACY_TOKEN'],['user','{}'],['theme','dark']]), tab = new Map();
  const storage = map => ({ getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) });
  globalThis.localStorage = storage(local); globalThis.sessionStorage = storage(tab);
  globalThis.window = new EventTarget(); window.location = { href: '/login' };
  const sentinel = 'PRIVATE_SENTINEL_TOKEN', user = { id: 7, role: 'user', full_name: 'Synthetic', email: 'synthetic@example.test' };
  let status = 200, broken = false, observed;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    observed = { url, options }; if (broken) throw Error('PRIVATE_NETWORK');
    return { ok: status === 200, status, text: async () => JSON.stringify(status === 200 ? user : { message: sentinel }) };
  });
  try {
    const session = await server.ssrLoadModule('/src/services/session.js');
    const { authStorage } = await server.ssrLoadModule('/src/services/authStorage.js');
    const { default: authFetch } = await server.ssrLoadModule('/src/services/authFetch.js');
    const p = await server.ssrLoadModule('/src/utils/authPresentation.js');
    const { AuthView } = await server.ssrLoadModule('/src/components/AuthPage.jsx');
    const login = () => session.establishSession(sentinel, user, session.beginAuthAttempt());
    await t.test('legacy persistent token removed without promotion', () => { assert.equal(authStorage.getItem('token'), null); assert.equal(local.has('token'), false); assert.equal(tab.has('token'), false); });
    await t.test('legacy user removed', () => assert.equal(local.has('user'), false));
    await t.test('unrelated preference survives cleanup', () => assert.equal(local.get('theme'), 'dark'));
    await t.test('login token stored in sessionStorage', () => { login(); assert.equal(tab.get('token'), sentinel); });
    await t.test('login never writes persistent token', () => assert.equal(local.has('token'), false));
    await t.test('profile shares tab scope', () => assert.equal(JSON.parse(tab.get('user')).id, 7));
    await t.test('same-tab snapshot reads token', () => assert.equal(session.readSession(session.sessionSnapshot()).token, sentinel));
    await t.test('restoration validates tab token with backend', async () => { session.logout(); tab.set('token', sentinel); tab.set('user', JSON.stringify(user)); await session.ensureSessionValidated(); assert.equal(session.validatedSessionSnapshot().status, 'authenticated'); });
    await t.test('token only in Authorization header', () => { assert.equal(observed.options.headers.Authorization, 'Bearer ' + sentinel); assert.ok(!observed.url.includes(sentinel)); });
    await t.test('restoration prevents redirects carrying bearer', () => assert.equal(observed.options.redirect, 'error'));
    await t.test('logout clears token and profile', () => { session.logout(); assert.equal(tab.size, 0); });
    await t.test('logout URL contains no token', () => assert.equal(window.location.href, '/'));
    for (const code of [401,404]) await t.test(`restoration ${code} clears tab session`, async () => { session.logout(); tab.set('token', sentinel); status = code; await session.ensureSessionValidated(); assert.equal(tab.has('token'), false); });
    for (const code of [403,500]) await t.test(`restoration ${code} retains stored token but hides authority`, async () => { session.logout(); tab.set('token', sentinel); status = code; await session.ensureSessionValidated(); assert.equal(tab.get('token'), sentinel); assert.equal(session.validatedSessionSnapshot().token, null); });
    await t.test('network failure retains storage and hides authority', async () => { session.logout(); tab.set('token', sentinel); broken = true; await session.ensureSessionValidated(); assert.equal(tab.get('token'), sentinel); assert.equal(session.validatedSessionSnapshot().status, 'error'); broken = false; });
    await t.test('API401 clears current token', async () => { status = 401; login(); await assert.rejects(authFetch('/auth/profile')); assert.equal(tab.has('token'), false); });
    await t.test('auth error text never echoes response token', async () => { login(); await assert.rejects(authFetch('/auth/profile'), e => !e.message.includes(sentinel) && !JSON.stringify(e).includes(sentinel)); });
    await t.test('API500 does not clear token', async () => { status = 500; login(); await assert.rejects(authFetch('/auth/profile')); assert.equal(tab.get('token'), sentinel); });
    for (const path of ['https://evil.invalid','//evil.invalid','javascript:alert(1)','data:text/html,x','/%2f%2fevil.invalid','/profile?token='+sentinel,'/profile#'+sentinel,'/../admin'])
      await t.test(`reject unsafe return category ${path.split(':')[0].slice(0,15)}`, () => assert.equal(p.authReturnPath(path), '/'));
    await t.test('internal profile return accepted', () => assert.equal(p.authReturnPath('/profile'), '/profile'));
    await t.test('rendered auth contains no bearer text or DOM attribute', () => { const state = { form: { email: '', password: '' }, errors: {}, busy: false }; const html = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(AuthView, { mode: 'login', state, actions: {} }))); assert.ok(!html.includes(sentinel)); });
    for (const [label, pattern] of [['HTML sink', /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/], ['eval', /\beval\s*\(|new Function\s*\(/], ['string timer', /set(?:Timeout|Interval)\s*\(\s*['"`]/], ['cookie', /document\.cookie/], ['raw token logging', /console\.\w+\([^\n]*(?:token|snapshot)/i]])
      await t.test(`no ${label} in inspected source`, () => assert.doesNotMatch(source, pattern));
    await t.test('auth localStorage access centralized solely for cleanup', () => assert.ok(files.filter(f => f !== 'services/authStorage.js').every(f => !read('src/'+f).includes('localStorage'))));
    await t.test('no third-party executable script or inline boot code', () => { const html = read('index.html'); for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) { assert.doesNotMatch(match[1], /src=["']https?:/); assert.equal(match[2].trim(), ''); } });
    await t.test('no unsafe-eval or inline script policy exemption introduced', () => assert.doesNotMatch(read('index.html'), /unsafe-eval|unsafe-inline/));
    await t.test('new tab without cloned storage is guest', () => { session.logout(); globalThis.sessionStorage = storage(new Map()); assert.equal(session.validatedSessionSnapshot().status, 'guest'); globalThis.sessionStorage = storage(tab); });
    await t.test('blocked storage never falls back to persistent token', () => { const old = globalThis.sessionStorage; globalThis.sessionStorage = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() {} }; assert.equal(authStorage.getItem('token'), null); assert.throws(() => authStorage.setItem('token', sentinel), /AUTH_STORAGE_UNAVAILABLE/); assert.equal(local.has('token'), false); globalThis.sessionStorage = old; });
    const blueprint = fs.readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8').split('name: asedeliya-staging-web')[1];
    for (const directive of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"])
      await t.test(`bounded CSP ${directive.split(' ')[0]} present`, () => assert.ok(blueprint.includes(directive)));
    await t.test('static header baseline denies embedding and MIME sniffing', () => { for (const name of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy']) assert.ok(blueprint.includes(name)); });
    await t.test('policy has no eval or inline exemptions', () => assert.doesNotMatch(blueprint, /unsafe-eval|unsafe-inline/));
    await t.test('blank links have opener and referrer protections when present', () => { for (const match of source.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/g)) { assert.match(match[0], /rel=["'][^"']*noopener/); assert.match(match[0], /rel=["'][^"']*noreferrer/); } });
    await t.test('server secret frontend boundary remains enforced by release guard', () => { const guard = fs.readFileSync(new URL('../../backend/scripts/preProductionCheck.cjs', import.meta.url), 'utf8'); assert.ok(guard.includes('FRONTEND_ENV_BOUNDARY')); assert.ok(guard.includes('FRONTEND_SECRET_BOUNDARY')); assert.doesNotMatch(source, /import\.meta\.env\.(?:VITE_)?(?:JWT_SECRET|OFFER_TOKEN_SECRET|DATABASE_URL)/); });
  } finally { await server.close(); Object.assign(globalThis, previous); }
});
