import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const require = createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');
const { evaluate } = require('../../backend/services/paymentReconciliation');
const operations = require('../../backend/services/reconciliationOperationsReadModel');
const { normalizeEvent } = require('../../backend/services/paymentProviderContract');
const event = type => normalizeEvent({ eventId: 'synthetic_event', provider: 'synthetic_mock', paymentId: 'synthetic_payment', requestId: 'a'.repeat(32), type, amount: '10.00', currency: 'EUR' });
const decision = extra => evaluate({ intent: { state: 'PAYMENT_INTENT_READY', reviewState: 'REVIEW_READY', requestId: 'a'.repeat(32), amount: '10.00', currency: 'EUR' },
  provider: 'synthetic_mock', providerPaymentId: 'synthetic_payment', paymentState: 'PAYMENT_OUTCOME_UNKNOWN', booking: { state: 'BOOKING_CONFIRMED', providerResultObserved: true }, ...extra });

test('7E read-only admin reconciliation offline', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, server: { middlewareMode: true, hmr: false }, esbuild: { jsx: 'automatic' } });
  const previous = { storage: globalThis.sessionStorage, window: globalThis.window };
  const memory = new Map();
  globalThis.sessionStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  globalThis.window = new EventTarget(); window.location = { href: '/' };
  let networkCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    networkCalls++;
    assert.equal(options.method, 'GET');
    assert.match(url, /\/api\/admin\/reconciliation(?:\?|\/[a-f0-9]{64}$)/);
    const detailRequest = /\/reconciliation\/[a-f0-9]{64}$/.test(url);
    return { ok: !detailRequest, status: detailRequest ? 404 : 200, text: async () => JSON.stringify(detailRequest ? { code: 'RECONCILIATION_CASE_NOT_FOUND' } : { source: 'unavailable', items: [] }) };
  });
  try {
    const service = await server.ssrLoadModule('/src/services/reconciliationService.js');
    const stores = await server.ssrLoadModule('/src/services/reconciliationStore.js');
    const presentation = await server.ssrLoadModule('/src/utils/reconciliationPresentation.js');
    const { ReconciliationView } = await server.ssrLoadModule('/src/components/admin/ReconciliationCenter.jsx');
    const { default: ProtectedRoute } = await server.ssrLoadModule('/src/components/ProtectedRoute.jsx');
    const session = await server.ssrLoadModule('/src/services/session.js');
    const admin = { status: 'authenticated', token: 'synthetic_session', user: { id: 1, role: 'admin' } };
    const rows = operations.list([decision()]).items;
    const detail = operations.detail([decision()], rows[0].caseId);
    const available = { source: 'available', items: rows };
    const store = options => stores.createReconciliationStore({ readSession: () => admin, subscribeSession: () => () => {}, loadList: async () => available, loadDetail: async () => detail, ...options });
    const html = s => renderToStaticMarkup(React.createElement(ReconciliationView, { state: s.getSnapshot(), actions: s }));
    const guard = () => renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(ProtectedRoute, { adminOnly: true }, React.createElement('p', {}, 'PRIVATE_RECONCILIATION'))));
    const login = role => { session.logout(); session.establishSession('synthetic_session', { id: 1, role }, session.beginAuthAttempt()); };
    const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };

    await t.test('validated admin route permits content', () => { login('admin'); assert.match(guard(), /PRIVATE_RECONCILIATION/); assert.equal(stores.adminAccess(admin), true); });
    await t.test('normal user route denies content and makes no read', async () => { login('user'); assert.doesNotMatch(guard(), /PRIVATE_RECONCILIATION/); let reads = 0; const s = store({ readSession: () => ({ ...admin, user: { id: 1, role: 'user' } }), loadList: async () => { reads++; return available; } }); await s.load(); assert.equal(reads, 0); assert.equal(s.getSnapshot().status, 'denied'); });
    await t.test('guest denied before data read', async () => { session.logout(); assert.doesNotMatch(guard(), /PRIVATE_RECONCILIATION/); const s = store({ readSession: () => ({ status: 'guest', user: null, token: null }), loadList: () => assert.fail('Guest read') }); await s.load(); assert.match(html(s), /Доступ разрешён только администратору/); });
    await t.test('unvalidated cached admin cannot pass guard', () => { memory.set('token', 'untrusted'); memory.set('user', JSON.stringify({ id: 1, role: 'admin' })); window.dispatchEvent(new Event('storage')); assert.doesNotMatch(guard(), /PRIVATE_RECONCILIATION/); });
    await t.test('runtime service reports unavailable with no fabricated cases', async () => { assert.deepEqual(await service.readReconciliationList(), { source: 'unavailable', items: [] }); await assert.rejects(service.readReconciliationDetail(rows[0].caseId), { status: 404 }); });
    await t.test('loading state visible while request pending', async () => { const gate = deferred(), s = store({ loadList: () => gate.promise }); const task = s.load(); assert.match(html(s), /role="status".*Загрузка/); gate.resolve(available); await task; });
    await t.test('safe queue renders semantic table and readable labels', async () => { const s = store(); await s.load(); const out = html(s); assert.match(out, /<table>/); assert.match(out, /<caption>Случаи для проверки/); assert.match(out, /Результат платежа неизвестен/); assert.doesNotMatch(out.replace(/<[^>]*>/g, ""), /PAYMENT_OUTCOME_UNKNOWN/); });
    await t.test('priority is visible text and keyboard-accessible case button', async () => { const s = store(); await s.load(); assert.match(html(s), />Высокий</); assert.match(html(s), /type="button".*aria-label="Открыть случай/); });
    await t.test('recommended provider verification is text only', async () => { const s = store(); await s.load(); const out = html(s); assert.match(out, /Проверить статус у платёжного провайдера/); assert.doesNotMatch(out, /<button[^>]*>Проверить статус/); });
    await t.test('priority category and status filters work on safe rows', async () => { const s = store(); await s.load(); for (const [key, value] of [['priority', 'LOW'], ['category', 'REFUND_REVIEW_REQUIRED'], ['status', 'COMPENSATION_REQUIRED']]) { s.filter(key, value); assert.match(html(s), /Нет случаев по выбранным фильтрам/); s.filter(key, ''); } assert.match(html(s), /<table>/); });
    await t.test('manual and compensation filters distinguish flags', async () => { const s = store(); await s.load(); s.filter('manualReviewRequired', 'false'); assert.match(html(s), /Нет случаев по выбранным фильтрам/); s.filter('manualReviewRequired', 'true'); s.filter('compensationRequired', 'false'); assert.match(html(s), /<table>/); });
    await t.test('identical duplicate rows collapse safely', async () => { const s = store({ loadList: async () => ({ source: 'available', items: [rows[0], rows[0]] }) }); await s.load(); assert.equal(s.getSnapshot().items.length, 1); assert.equal((html(s).match(/aria-label="Открыть случай/g) || []).length, 1); });
    await t.test('contradictory duplicate family fails closed', async () => { const s = store({ loadList: async () => ({ source: 'available', items: [rows[0], { ...rows[0], priority: 'LOW' }] }) }); await s.load(); assert.equal(s.getSnapshot().status, 'error'); });
    await t.test('case opens and normalized timeline renders', async () => { const evidence = decision({ event: event('payment.unknown') }); const data = operations.list([evidence]), d = operations.detail([evidence], data.items[0].caseId); const s = store({ loadList: async () => ({ source: 'available', ...data }), loadDetail: async () => d }); await s.load(); await s.open(data.items[0].caseId); assert.match(html(s), /<ol>/); assert.match(html(s), /Неизвестный результат/); assert.match(html(s), /Порядок отображения не означает/); });
    await t.test('money consistency checks render without invented amounts', async () => { const s = store(); await s.load(); await s.open(rows[0].caseId); assert.match(html(s), /Проверка суммы/); assert.match(html(s), /Проверка валюты/); assert.match(html(s), /Нет сведений/); assert.equal(presentation.consistencyLabel(false), 'Не совпадает'); assert.equal(presentation.consistencyLabel(true), 'Совпадает'); });
    await t.test('raw secrets and PII cannot enter list or detail rendering', async () => { const marker = 'private-sensitive-marker'; const polluted = { ...rows[0], rawWebhook: marker, signature: marker, Authorization: marker, card: marker, email: marker }; const d = { ...detail, token: marker, passport: marker, timeline: detail.timeline.map(e => ({ ...e, raw: marker, webhookSecret: marker })) }; const s = store({ loadList: async () => ({ source: 'available', items: [polluted] }), loadDetail: async () => d }); await s.load(); await s.open(rows[0].caseId); assert.doesNotMatch(JSON.stringify(s.getSnapshot()) + html(s), /private-sensitive-marker|rawWebhook|webhookSecret|passport|Authorization/); });
    await t.test('unsafe free text in required enums rejected', () => { assert.throws(() => presentation.safeRow({ ...rows[0], reasonCode: 'private-sensitive-marker' })); assert.throws(() => presentation.safeDetail({ ...detail, timeline: [{ ...detail.timeline[0], eventType: { toString: () => 'payment.pending', secret: 'private' } }] }, detail.caseId)); });
    await t.test('empty available source is distinct from unavailable', async () => { const s = store({ loadList: async () => ({ source: 'available', items: [] }) }); await s.load(); assert.match(html(s), /Нет случаев для проверки/); assert.equal(s.getSnapshot().status, 'empty'); });
    await t.test('unavailable source renders truthful message', async () => { const s = store({ loadList: service.readReconciliationList }); await s.load(); assert.match(html(s), /Источник данных сверки пока не подключён/); assert.doesNotMatch(html(s), /<table>/); });
    await t.test('unavailable response with rows rejected', async () => { const s = store({ loadList: async () => ({ source: 'unavailable', items: rows }) }); await s.load(); assert.equal(s.getSnapshot().status, 'error'); });
    await t.test('request errors never expose backend message or stack', async () => { const s = store({ loadList: () => { throw Error('private-sensitive-marker'); } }); await s.load(); assert.match(html(s), /Не удалось загрузить/); assert.doesNotMatch(html(s), /private-sensitive-marker|stack/); });
    await t.test('detail 404 uses safe not-found state', async () => { const s = store({ loadDetail: service.readReconciliationDetail }); await s.load(); await s.open(rows[0].caseId); assert.match(html(s), /Случай не найден/); });
    await t.test('detail forbidden clears queue and detail', async () => { const s = store({ loadDetail: async () => { throw { status: 403, message: 'private' }; } }); await s.load(); await s.open(rows[0].caseId); assert.equal(s.getSnapshot().status, 'denied'); assert.equal(s.getSnapshot().items.length, 0); assert.equal(s.getSnapshot().detail, null); });
    await t.test('late read after account change never reveals old cases', async () => { let identity = admin; const gate = deferred(); const s = store({ readSession: () => identity, loadList: () => gate.promise }); const task = s.load(); identity = { ...admin, user: { id: 2, role: 'admin' } }; gate.resolve(available); await task; assert.equal(s.getSnapshot().status, 'denied'); assert.equal(s.getSnapshot().items.length, 0); });
    await t.test('closing detail ignores its pending response', async () => { const gate = deferred(); const s = store({ loadDetail: () => gate.promise }); await s.load(); const task = s.open(rows[0].caseId); s.close(); gate.resolve(detail); await task; assert.equal(s.getSnapshot().detailStatus, 'idle'); assert.equal(s.getSnapshot().detail, null); });
    await t.test('detail must match requested case family', () => assert.throws(() => presentation.safeDetail(detail, 'f'.repeat(64))));
    await t.test('compensation is recommendation without refund cancel retry resolve controls', async () => { const evidence = decision({ paymentState: 'PAYMENT_CAPTURED', previousEvidence: [event('payment.captured')], booking: { state: 'BOOKING_FAILED_FINAL', providerResultObserved: false } }); const data = operations.list([evidence]); const s = store({ loadList: async () => ({ source: 'available', ...data }), loadDetail: async () => operations.detail([evidence], data.items[0].caseId) }); await s.load(); await s.open(data.items[0].caseId); const out = html(s); assert.match(out, /Проверить необходимость возврата/); const buttons = out.match(/<button[^>]*>[\s\S]*?<\/button>/g).join(' '); assert.doesNotMatch(buttons, /Возврат|Отменить|Повторить|Завершить|Refund|Cancel|Retry|Resolved/); });
    await t.test('navigation stays inside guarded Admin and responsive focus styles exist', async () => { const source = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8'); assert.match(await source('components/admin/Sidebar.jsx'), /reconciliation.*Сверка платежей/); assert.match(await source('pages/AdminPanel.jsx'), /tab === "reconciliation"/); assert.match(await source('App.jsx'), /ProtectedRoute adminOnly/); assert.match(await source('styles/ReconciliationCenter.css'), /:focus-visible/); assert.match(await source('styles/ReconciliationCenter.css'), /@media/); });
    await t.test('runtime transport is authenticated GET only with four intercepted reads', async () => { const source = await readFile(new URL('../src/services/reconciliationService.js', import.meta.url), 'utf8'); assert.match(source, /authFetch/); assert.doesNotMatch(source, /POST|PUT|PATCH|DELETE/); assert.equal(networkCalls, 4); });
  } finally {
    await server.close(); globalThis.sessionStorage = previous.storage; globalThis.window = previous.window;
  }
});

