import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
createRequire(import.meta.url)('../../backend/tests/offlineNetwork.cjs');

test('5E auth session and account security offline', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, server: { middlewareMode: true, hmr: false }, esbuild: { jsx: 'automatic' } });
  const previous = { storage: globalThis.sessionStorage, window: globalThis.window };
  const memory = new Map();
  globalThis.sessionStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  globalThis.window = new EventTarget(); window.location = { href: '/' };
  const userA = { id: 7, full_name: 'Fixture A', email: 'a@example.test', role: 'user' };
  const userB = { ...userA, id: 8, full_name: 'Fixture B', email: 'b@example.test' };
  const requests = [], navigations = [];
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  let reply = async path => path === '/auth/login' ? { user: userA, token: 'offline-session-a' } : path === '/auth/register' ? { user: userA } : path === '/auth/password' ? { message: 'ok' } : path === '/favorites' ? { success: true, data: [] } : path === '/bookings/me' ? [] : userA;
  let responseStatus = 200;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const parsed = new URL(url, 'http://localhost');
    assert.ok(['http://localhost', 'http://localhost:5000'].includes(parsed.origin), 'external request forbidden');
    const path = parsed.pathname.replace(/^\/api/, '');
    assert.ok(['/auth/profile', '/auth/login', '/auth/register', '/auth/password', '/favorites', '/bookings/me'].includes(path), 'unexpected API request');
    assert.equal(parsed.search, '');
    requests.push({ path, options });
    const status = responseStatus, body = await reply(path, options);
    return { ok: status >= 200 && status < 300, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body), json: async () => body };
  });
  try {
    const session = await server.ssrLoadModule('/src/services/session.js');
    const { default: authFetch } = await server.ssrLoadModule('/src/services/authFetch.js');
    const { default: ProtectedRoute } = await server.ssrLoadModule('/src/components/ProtectedRoute.jsx');
    const { default: Boundary, SessionStatus } = await server.ssrLoadModule('/src/components/SessionBoundary.jsx');
    const { default: AuthPage, AuthView } = await server.ssrLoadModule('/src/components/AuthPage.jsx');
    const { createAuthFormStore } = await server.ssrLoadModule('/src/services/authFormStore.js');
    const { createProfileStore } = await server.ssrLoadModule('/src/services/profileStore.js');
    const { ProfileView } = await server.ssrLoadModule('/src/pages/Profile.jsx');
    const { createFavoritesStore, FavoritesProvider } = await server.ssrLoadModule('/src/context/FavoritesContext.jsx');
    const { bookingHistory } = await server.ssrLoadModule('/src/services/bookingHistory.js');
    const { default: Navbar } = await server.ssrLoadModule('/src/components/Navbar.jsx');
    const presentation = await server.ssrLoadModule('/src/utils/authPresentation.js');
    const render = (component, props = {}, child) => renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(component, props, child)));
    const privateMarker = React.createElement('p', {}, 'PRIVATE_ACCOUNT_CONTENT');
    const source = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');
    const snapshot = session.validatedSessionSnapshot;
    const guest = () => session.logout();
    const stored = (user = userA, token = 'offline-session-a') => { guest(); memory.set('token', token); memory.set('user', JSON.stringify(user)); window.dispatchEvent(new Event('storage')); };
    const login = (user = userA, token = 'offline-session-a') => session.establishSession(token, user, session.beginAuthAttempt());
    const form = (mode = 'login') => createAuthFormStore({ mode, returnTo: '/profile', onSuccess: (...args) => navigations.push(args) });
    const fill = (store, mode = 'login') => Object.entries({ email: ' a@example.test ', password: '  synthetic password  ', ...(mode === 'register' ? { full_name: 'Fixture', phone: '', confirmPassword: '  synthetic password  ' } : {}) }).forEach(([key, value]) => store.edit(key, value));
    const authHtml = (store, mode = 'login') => render(AuthView, { mode, state: store.getSnapshot(), actions: store });
    const header = () => render(FavoritesProvider, {}, React.createElement(Navbar));
    const originalReply = reply;

    await t.test('guest resolves without bootstrap network', async () => { const n = requests.length; guest(); assert.equal(snapshot().status, 'guest'); await session.ensureSessionValidated(); assert.equal(requests.length, n); });
    await t.test('restored token and spoofed admin remain UNKNOWN without private identity', () => { stored({ ...userA, role: 'admin' }); assert.equal(snapshot().status, 'unknown'); assert.equal(snapshot().user, null); assert.equal(snapshot().token, null); assert.doesNotMatch(render(ProtectedRoute, { adminOnly: true }, privateMarker), /PRIVATE_ACCOUNT_CONTENT/); });
    await t.test('bootstrap deduplicates pending reads and hides private content', async () => {
      const gate = deferred(); reply = async () => { await gate.promise; return userA; };
      const n = requests.length, first = session.ensureSessionValidated(); assert.equal(first, session.ensureSessionValidated());
      assert.equal(snapshot().status, 'bootstrapping'); assert.match(render(Boundary, {}, privateMarker), /role="status"/); assert.doesNotMatch(render(Boundary, {}, privateMarker), /PRIVATE_ACCOUNT_CONTENT/);
      await Promise.resolve(); assert.equal(requests.length, n + 1); assert.equal(requests.at(-1).path, '/auth/profile');
      gate.resolve(); await first; reply = originalReply;
      assert.equal(snapshot().status, 'authenticated'); assert.equal(snapshot().user.role, 'user');
      assert.match(render(ProtectedRoute, {}, privateMarker), /PRIVATE_ACCOUNT_CONTENT/); assert.doesNotMatch(render(ProtectedRoute, { adminOnly: true }, privateMarker), /PRIVATE_ACCOUNT_CONTENT/);
    });
    await t.test('validated rerenders never repeat bootstrap GET', async () => { const n = requests.length; await session.ensureSessionValidated(); await session.ensureSessionValidated(); assert.equal(requests.length, n); });
    await t.test('Profile consumes bootstrap response once instead of duplicate startup GET', async () => { const n = requests.length; const s = createProfileStore({ token: 'offline-session-a' }); await s.load(); assert.equal(s.getSnapshot().status, 'ready'); assert.equal(requests.length, n); await s.load(); assert.equal(requests.length, n + 1); });
    await t.test('restored profile seed cannot cross user switch', async () => { stored(); await session.ensureSessionValidated(); login(userB, 'offline-session-b'); assert.equal(session.takeRestoredProfile('offline-session-a'), null); assert.equal(session.takeRestoredProfile('offline-session-b'), null); });
    await t.test('login-confirmed session skips unnecessary bootstrap', async () => { guest(); login(); const n = requests.length; await session.ensureSessionValidated(); assert.equal(requests.length, n); assert.equal(snapshot().status, 'authenticated'); });
    await t.test('reload module forgets trust and revalidates stored identity', async () => { const fresh = await server.ssrLoadModule('/src/services/session.js?5e-reload'); assert.equal(fresh.validatedSessionSnapshot().status, 'unknown'); const n = requests.length; await fresh.ensureSessionValidated(); assert.equal(requests.length, n + 1); assert.equal(fresh.validatedSessionSnapshot().status, 'authenticated'); });
    await t.test('malformed cached user is restored from authorized server response', async () => { stored(); memory.set('user', '{bad'); assert.equal(snapshot().status, 'unknown'); await session.ensureSessionValidated(); assert.equal(snapshot().user.id, 7); });
    for (const status of [401, 404]) await t.test(`bootstrap ${status} invalidates session and exposes safe sign-in notice`, async () => {
      stored(); responseStatus = status; reply = async () => ({ message: 'PRIVATE_SQL_JWT' }); await session.ensureSessionValidated(); responseStatus = 200; reply = originalReply;
      assert.equal(snapshot().status, 'guest'); assert.equal(memory.has('token'), false); assert.equal(memory.has('user'), false);
      const html = render(AuthPage, { mode: 'login' }); assert.match(html, /Сессия завершена/); assert.doesNotMatch(html, /PRIVATE_SQL_JWT|offline-session/);
      const n = requests.length; await session.ensureSessionValidated(); assert.equal(requests.length, n);
    });
    for (const failure of ['server', 'network', 'json', 'identity']) await t.test(`bootstrap ${failure} fails closed with explicit retry, retains stored session`, async () => {
      stored(); if (failure === 'server') responseStatus = 500;
      reply = async () => { if (failure === 'network') throw Error('PRIVATE_NETWORK'); return failure === 'json' ? 'PRIVATE_NOT_JSON' : {}; };
      await session.ensureSessionValidated(); assert.equal(snapshot().status, 'error'); assert.ok(memory.has('token')); assert.equal(snapshot().user, null);
      const html = render(SessionStatus, { status: 'error' }); assert.match(html, /Повторить/); assert.doesNotMatch(html, /PRIVATE_|offline-session/);
      const n = requests.length; await session.ensureSessionValidated(); assert.equal(requests.length, n);
      responseStatus = 200; reply = originalReply; await session.ensureSessionValidated({ retry: true }); assert.equal(snapshot().status, 'authenticated'); assert.equal(requests.length, n + 1);
    });
    await t.test('late bootstrap cannot restore identity after logout', async () => { stored(); const gate = deferred(); reply = async () => { await gate.promise; return userA; }; const op = session.ensureSessionValidated(); await Promise.resolve(); guest(); gate.resolve(); await op; assert.equal(snapshot().status, 'guest'); assert.equal(memory.size, 0); reply = originalReply; });
    await t.test('late old bootstrap cannot overwrite newer login', async () => { stored(); const gate = deferred(); reply = async () => { await gate.promise; return userA; }; const op = session.ensureSessionValidated(); await Promise.resolve(); login(userB, 'offline-session-b'); gate.resolve(); await op; assert.equal(snapshot().user.id, 8); reply = originalReply; });
    await t.test('storage identity changes revoke UI trust until validation', async () => { login(); memory.set('user', JSON.stringify(userB)); window.dispatchEvent(new Event('storage')); assert.equal(snapshot().status, 'unknown'); assert.equal(snapshot().user, null); await session.ensureSessionValidated(); assert.equal(snapshot().user.id, 7); });

    for (const mode of ['login', 'register']) {
      await t.test(`${mode} accessible render, native Enter form, autocomplete and show/hide`, async () => { guest(); const html = authHtml(form(mode), mode); assert.match(html, /<form/); assert.match(html, /type="submit"/); assert.match(html, /type="email"/); assert.match(html, /for="auth-email"/); assert.match(html, /type="password"/); assert.match(html, /aria-label="Показать: Пароль"/); assert.match(html, /aria-pressed="false"/); assert.match(html, mode === 'login' ? /autoComplete="current-password"/ : /autoComplete="new-password"/); const code = await source('components/AuthPage.jsx'); assert.match(code, /onSubmit=\{submit\}/); assert.match(code, /visible \? 'text' : 'password'/); });
      await t.test(`${mode} validation blocks dispatch and associates errors`, async () => { const s = form(mode), n = requests.length; await s.submit(); assert.equal(requests.length, n); assert.match(authHtml(s, mode), /aria-invalid="true"/); assert.match(authHtml(s, mode), /aria-describedby="auth-email-error"/); if (mode === 'register') { fill(s, mode); s.edit('confirmPassword', 'mismatch'); await s.submit(); assert.ok(s.getSnapshot().errors.confirmPassword); assert.equal(requests.length, n); } });
      await t.test(`${mode} one submit, email trim, password unchanged, success clears passwords`, async () => {
        guest(); const s = form(mode), disconnect = s.connect(); fill(s, mode); const gate = deferred(); reply = async path => { await gate.promise; return originalReply(path); };
        const n = requests.length, op = s.submit(); assert.equal(op, s.submit()); assert.equal(s.getSnapshot().pending, true); assert.match(authHtml(s, mode), /disabled=""/);
        await Promise.resolve(); assert.equal(requests.length, n + 1); const request = requests.at(-1); const payload = JSON.parse(request.options.body);
        assert.equal(payload.email, 'a@example.test'); assert.ok(payload.password === '  synthetic password  '); assert.equal(request.options.headers.Authorization, undefined); assert.equal(request.options.redirect, 'error');
        assert.equal(payload.confirmPassword, undefined); assert.equal(payload.role, undefined);
        gate.resolve(); await op; reply = originalReply; assert.equal(s.getSnapshot().form.password, ''); assert.equal(s.getSnapshot().pending, false);
        if (mode === 'login') { assert.equal(snapshot().status, 'authenticated'); assert.equal(navigations.at(-1)[0], '/profile'); }
        else { assert.equal(memory.size, 0); assert.equal(navigations.at(-1)[0], '/login'); assert.equal(s.getSnapshot().form.confirmPassword, ''); }
        assert.doesNotMatch(authHtml(s, mode), /offline-session|synthetic password/); disconnect(); guest();
      });
      for (const code of mode === 'login' ? [401, 500] : [409, 500]) await t.test(`${mode} ${code} has fixed safe error without response echo`, async () => { const s = form(mode); fill(s, mode); responseStatus = code; reply = async () => ({ message: 'PRIVATE_SQL_JWT' }); await s.submit(); responseStatus = 200; reply = originalReply; assert.equal(s.getSnapshot().error, presentation.authError(mode, code)); assert.match(authHtml(s, mode), /role="alert"/); assert.doesNotMatch(authHtml(s, mode), /PRIVATE_SQL_JWT/); });
      await t.test(`authenticated ${mode} does not show duplicate credential form`, () => { login(); assert.doesNotMatch(render(AuthPage, { mode }), /<form|type="password"/); guest(); });
    }
    await t.test('password and tokens never logged or persisted as form data', async () => { const logs = []; const log = t.mock.method(console, 'log', (...args) => logs.push(args)); const warn = t.mock.method(console, 'warn', (...args) => logs.push(args)); const error = t.mock.method(console, 'error', (...args) => logs.push(args)); try { const s = form(); fill(s); await s.submit(); assert.equal(logs.length, 0); assert.ok(![...memory.values()].join('').includes('synthetic password')); assert.deepEqual([...memory.keys()].sort(), ['token', 'user']); } finally { log.mock.restore(); warn.mock.restore(); error.mock.restore(); guest(); } });

    for (const path of ['/profile', '/favorites', '/my-bookings', '/my-bookings/12']) await t.test(`protected ${path} guest/unknown never renders private child`, () => { guest(); assert.doesNotMatch(render(ProtectedRoute, {}, privateMarker), /PRIVATE_ACCOUNT_CONTENT/); stored(); assert.doesNotMatch(render(ProtectedRoute, {}, privateMarker), /PRIVATE_ACCOUNT_CONTENT/); assert.equal(presentation.authReturnPath(path, 'user'), path); guest(); });
    await t.test('actual Favorites route is covered by root bootstrap boundary', async () => { const main = await source('main.jsx'); assert.match(main, /<SessionBoundary>[\s\S]*<FavoritesProvider>[\s\S]*<BrowserRouter>/); const app = await source('App.jsx'); assert.match(app, /path="\/favorites" element={<Favorites/); for (const path of ['profile', 'my-bookings', 'my-bookings/:bookingId']) assert.ok(app.includes(`path="/${path}"`)); });
    await t.test('only server-confirmed admin renders admin route', async () => { stored({ ...userA, role: 'admin' }); await session.ensureSessionValidated(); assert.doesNotMatch(render(ProtectedRoute, { adminOnly: true }, privateMarker), /PRIVATE_ACCOUNT_CONTENT/); login({ ...userA, role: 'admin' }); assert.match(render(ProtectedRoute, { adminOnly: true }, privateMarker), /PRIVATE_ACCOUNT_CONTENT/); guest(); });
    for (const value of ['https://external.invalid', '//external.invalid', 'javascript:alert(1)', 'data:text/html,x', '/%2f%2fevil', '/profile?token=x', '/profile#fragment', '/my-bookings/../admin']) await t.test(`unsafe return target rejected: ${value.split(':')[0]}`, () => assert.equal(presentation.authReturnPath(value, 'user'), '/'));

    await t.test('logout synchronously clears Profile, Favorites, history, dirty data and banners', async () => {
      login(); const profile = createProfileStore({ token: 'offline-session-a' }), disconnectProfile = profile.connect();
      const favorites = createFavoritesStore({ token: 'offline-session-a', userId: 7, loadData: async () => [{ id: 1, name: 'Private favorite' }] }), disconnectFavorites = favorites.connect();
      const history = bookingHistory('offline-session-a', 7);
      await Promise.all([profile.load(), favorites.load(), history.ensureListLoaded()]); profile.edit('full_name', 'Private draft'); profile.editPassword('currentPassword', 'private');
      const n = requests.length; guest(); assert.equal(memory.has('token'), false); assert.equal(memory.has('user'), false); assert.equal(requests.length, n);
      const p = profile.getSnapshot(); assert.equal(p.user, null); assert.equal(p.draft, null); assert.equal(p.dirty, false); assert.equal(p.password.currentPassword, ''); assert.equal(p.message + p.passwordMessage + p.saveError + p.passwordError, '');
      assert.deepEqual(favorites.getSnapshot().items, []); assert.deepEqual(favorites.getSnapshot().pending, []); assert.deepEqual(history.list.getSnapshot().items, []); assert.notEqual(history.list.getSnapshot().status, 'ready');
      guest(); assert.equal(memory.size, 0); disconnectProfile(); disconnectFavorites();
    });
    for (const initial of ['empty', 'ready', 'error', 'pending']) await t.test(`same-token user switch isolates ${initial} account state`, async () => {
      login(); const gate = deferred();
      const favorites = createFavoritesStore({ token: 'offline-session-a', userId: 7, loadData: async () => { if (initial === 'pending') await gate.promise; if (initial === 'error') throw Error('private'); return initial === 'empty' ? [] : [{ id: 1 }]; } }); const disconnect = favorites.connect();
      reply = async path => { if (path !== '/bookings/me') return originalReply(path); if (initial === 'pending') await gate.promise; if (initial === 'error') throw Error('private'); return initial === 'empty' ? [] : [{ id: 12 }]; };
      const oldHistory = bookingHistory('offline-session-a', 7); const historyLoad = oldHistory.ensureListLoaded();
      const profile = createProfileStore({ token: 'offline-session-a', api: { getProfile: async () => { if (initial === 'pending') await gate.promise; if (initial === 'error') throw Error('private'); return userA; } } }); const disconnectProfile = profile.connect();
      const loads = [favorites.load(), profile.load(), historyLoad]; if (initial !== 'pending') await Promise.all(loads); else await Promise.resolve();
      login(userB); gate.resolve(); await Promise.all(loads);
      reply = originalReply;
      assert.deepEqual(oldHistory.list.getSnapshot().items, []); assert.notEqual(oldHistory.list.getSnapshot().status, 'error');
      assert.deepEqual(favorites.getSnapshot().items, []); assert.equal(profile.getSnapshot().user, null); assert.notEqual(profile.getSnapshot().status, 'error');
      const b = createFavoritesStore({ token: 'offline-session-a', userId: 8, loadData: async () => [] }); assert.equal(b.getSnapshot().status, 'loading'); await b.load(); assert.equal(b.getSnapshot().status, 'ready');
      const next = bookingHistory('offline-session-a', 8); assert.notEqual(next, oldHistory); assert.equal(next.list.getSnapshot().status, 'loading'); const n = requests.length; await next.ensureListLoaded(); assert.equal(requests.length, n + 1);
      const pb = createProfileStore({ token: 'offline-session-a', api: { getProfile: async () => userB } }); await pb.load(); assert.equal(pb.getSnapshot().user.id, 8);
      disconnect(); disconnectProfile(); guest();
    });
    await t.test('pending favorite mutation is cleared and late completion discarded on logout', async () => { login(); const s = createFavoritesStore({ token: 'offline-session-a', userId: 7, loadData: async () => [{ id: 1 }] }); const disconnect = s.connect(); await s.load(); const gate = deferred(); const op = s.mutate('1', () => gate.promise, () => [{ id: 99 }]); await Promise.resolve(); guest(); assert.deepEqual(s.getSnapshot().pending, []); gate.resolve({}); await op; assert.deepEqual(s.getSnapshot().items, []); disconnect(); });
    await t.test('pending profile/password success cannot publish into next identity', async () => { login(); const gate = deferred(); const s = createProfileStore({ token: 'offline-session-a', api: { getProfile: async () => userA, changePassword: () => gate.promise } }); const disconnect = s.connect(); await s.load(); for (const key of ['currentPassword', 'newPassword', 'confirmPassword']) s.editPassword(key, 'synthetic-password'); const op = s.savePassword(); await Promise.resolve(); login(userB); gate.resolve({ message: 'ok' }); await op; assert.equal(s.getSnapshot().passwordMessage, ''); assert.equal(s.getSnapshot().passwordBusy, false); assert.equal(snapshot().user.id, 8); disconnect(); guest(); });

    await t.test('401 own API clears session, no automatic retry, safe notice', async () => { login(); responseStatus = 401; const n = requests.length; await assert.rejects(authFetch('/auth/profile'), error => error.status === 401 && error.code === 'AUTH_REQUIRED' && !error.data); responseStatus = 200; assert.equal(snapshot().status, 'guest'); assert.match(snapshot().notice, /Сессия завершена/); await session.ensureSessionValidated(); assert.equal(requests.length, n + 1); });
    await t.test('500 own API retains validated session and hides auth error payload', async () => { login(); responseStatus = 500; reply = async () => ({ message: 'PRIVATE_SQL_JWT' }); await assert.rejects(authFetch('/auth/profile'), error => error.message === 'AUTH_REQUEST_FAILED' && !error.data); responseStatus = 200; reply = originalReply; assert.equal(snapshot().status, 'authenticated'); });
    await t.test('late 401 from previous token never logs out new user', async () => { login(); responseStatus = 401; const gate = deferred(); reply = async () => { await gate.promise; return {}; }; const op = authFetch('/auth/profile'); login(userB, 'offline-session-b'); gate.resolve(); await assert.rejects(op); responseStatus = 200; reply = originalReply; assert.equal(snapshot().user.id, 8); guest(); });
    await t.test('late 401 from previous identity with same token cannot clear new user', async () => { login(); responseStatus = 401; const gate = deferred(); reply = async () => { await gate.promise; return {}; }; const op = authFetch('/auth/profile'); login(userB); gate.resolve(); await assert.rejects(op); responseStatus = 200; reply = originalReply; assert.equal(snapshot().user.id, 8); assert.ok(memory.has('token')); guest(); });
    await t.test('API bearer only targets own base and cannot follow redirects', async () => { login(); await authFetch('/auth/profile'); const req = requests.at(-1); assert.ok(req.options.headers.Authorization?.startsWith('Bearer ')); assert.equal(req.options.redirect, 'error'); guest(); await authFetch('/auth/profile'); assert.equal(requests.at(-1).options.headers.Authorization, undefined); });
    for (const target of ['https://external.invalid/x', '//external.invalid/x', '/\\external.invalid', '/../outside', '/%2e%2e/outside', '/%2fexternal.invalid']) await t.test(`API rejects unsafe target ${target}`, async () => { login(); const n = requests.length; await assert.rejects(authFetch(target), /INVALID_API_PATH/); assert.equal(requests.length, n); guest(); });

    await t.test('password form is separate, isolated payload, deduplicated and clears inputs', async () => {
      login(); const s = createProfileStore({ token: 'offline-session-a' }); await s.load(); const n = requests.length; await s.savePassword(); assert.equal(requests.length, n);
      s.edit('full_name', 'Unsaved draft'); for (const key of ['currentPassword', 'newPassword', 'confirmPassword']) s.editPassword(key, '  synthetic password  ');
      const op = s.savePassword(); assert.equal(op, s.savePassword()); await op; const req = requests.at(-1); assert.equal(req.path, '/auth/password'); assert.equal(req.options.method, 'PUT'); assert.deepEqual(Object.keys(JSON.parse(req.options.body)).sort(), ['currentPassword', 'newPassword']);
      assert.equal(s.getSnapshot().password.newPassword, ''); assert.equal(s.getSnapshot().draft.full_name, 'Unsaved draft'); assert.equal(s.getSnapshot().dirty, true);
      const html = render(ProfileView, { state: s.getSnapshot(), actions: s }); assert.equal((html.match(/<form/g) || []).length, 2); assert.match(html, /Пароль изменён/); assert.match(html, /autoComplete="new-password"/); assert.match(html, /aria-label="Показать: Текущий пароль"/); guest();
    });
    await t.test('password failure fixed safe text and empty sensitive inputs', async () => { login(); const s = createProfileStore({ token: 'offline-session-a' }); await s.load(); for (const key of ['currentPassword', 'newPassword', 'confirmPassword']) s.editPassword(key, 'synthetic-password'); responseStatus = 400; reply = async () => ({ message: 'PRIVATE_SQL_JWT' }); await s.savePassword(); responseStatus = 200; reply = originalReply; assert.match(s.getSnapshot().passwordError, /Проверьте текущий пароль/); assert.equal(s.getSnapshot().password.currentPassword, ''); assert.doesNotMatch(render(ProfileView, { state: s.getSnapshot(), actions: s }), /PRIVATE_SQL_JWT/); guest(); });
    await t.test('guest/authenticated/logout header uses current validated identity only', () => { guest(); assert.match(header(), /href="\/login"/); assert.match(header(), /href="\/register"/); login(); assert.match(header(), /Fixture A/); assert.match(header(), /Выйти/); assert.doesNotMatch(header(), /href="\/login"|href="\/admin"/); guest(); assert.doesNotMatch(header(), /Fixture A|Выйти/); stored(); assert.doesNotMatch(render(Boundary, {}, React.createElement(FavoritesProvider, {}, React.createElement(Navbar))), /Fixture A|href="\/login"/); guest(); });
    await t.test('responsive and accessibility source contracts retain 320/390/768/1440 layouts', async () => { const auth = await source('styles/Auth.css'), profile = await source('styles/Profile.css'), navbar = await source('styles/Navbar.css'); assert.match(auth, /max-width:360px/); assert.match(auth, /max-width:600px/); assert.match(auth, /min-width:0/); assert.match(auth, /:focus-visible/); assert.match(profile, /max-width:1024px/); assert.match(profile, /max-width:600px/); assert.match(profile, /minmax\(0,1fr\)/); assert.match(navbar, /max-width:1040px/); assert.match(navbar, /overflow-y:auto/); });
    await t.test('auth implementation has no raw UI errors, secret logging, polling or provider imports', async () => { const files = ['services/session.js', 'services/authFormStore.js', 'components/AuthPage.jsx', 'components/SessionBoundary.jsx', 'pages/Profile.jsx']; for (const path of files) assert.doesNotMatch(await source(path), /console\.|setInterval|\{error\.message\}|hotelbeds|paymentService|offerResolver|URLSearchParams/); });
    await t.test('all observed network is mocked own account API; no external/provider service', () => { assert.ok(requests.length > 0); assert.ok(requests.every(r => ['/auth/profile', '/auth/login', '/auth/register', '/auth/password', '/favorites', '/bookings/me'].includes(r.path))); });
  } finally { globalThis.sessionStorage = previous.storage; globalThis.window = previous.window; await server.close(); }
});
