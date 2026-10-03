import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

test('6E Checkout price confirmation offline behavior', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    server: { middlewareMode: true, hmr: false }, esbuild: { jsx: 'automatic' } });
  try {
    const { createCheckoutReview } = await server.ssrLoadModule('/src/services/checkoutReview.js');
    const { default: Status } = await server.ssrLoadModule('/src/components/checkout/CheckoutRateStatus.jsx');
    const { CheckoutReviewView: View } = await server.ssrLoadModule('/src/components/checkout/ReviewStep.jsx');
    const { default: Payment } = await server.ssrLoadModule('/src/components/checkout/PaymentStep.jsx');
    const { getCheckout } = await server.ssrLoadModule('/src/services/checkoutService.js');
    const { default: PriceLink } = await server.ssrLoadModule('/src/components/checkout/CheckoutPriceLink.jsx');
    const data = (total = 100) => ({ tour: { provider: 'hotelbeds', priceEnvironment: 'test', name: 'Fixture hotel',
      currency: 'EUR', price: total, roomName: 'Confirmed Double', food: 'Confirmed Breakfast', bookingDisabled: true },
      total, subtotal: total, previousTotal: 100, people: 2, checkoutToken: `confirmed-${total}`, priceChangedAtCheckRate: total !== 100 });
    const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
    const view = checkout => render(View, { checkout, bookingData: {}, acceptedPriceToken: null, acceptPrice: () => {}, back: () => {}, next: () => {} });
    const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
    await t.test('CHECKING shows loading and no continue action', () => {
      const html = render(Status, { status: 'CHECKING' }); assert.match(html, /role="status"/); assert.match(html, /Проверяем стоимость/); assert.doesNotMatch(html, /<button/);
    });
    await t.test('successful same-price result becomes CONFIRMED', async () => {
      const store = createCheckoutReview(async () => data()); await store.load(); assert.equal(store.getSnapshot().status, 'CONFIRMED'); assert.equal(store.confirmedCheckout().total, 100);
    });
    await t.test('confirmed UI shows provider price room and board', () => {
      const html = view(data()); assert.match(html, /Confirmed Double/); assert.match(html, /Confirmed Breakfast/); assert.match(html, /EUR/); assert.doesNotMatch(html, /Поставщик изменил/);
    });
    await t.test('price increase displays old and new price and currency', () => {
      const html = view(data(125)); assert.match(html, /Поставщик изменил стоимость/); assert.match(html, /100/); assert.match(html, /125/); assert.match(html, /EUR/); assert.match(html, /Подтверждаю новую стоимость/);
    });
    await t.test('price decrease also requires explicit acceptance', async () => {
      const store = createCheckoutReview(async () => data(90)); await store.load(); assert.equal(store.getSnapshot().status, 'PRICE_CHANGED'); assert.equal(store.confirmedCheckout(), null);
      store.acceptPrice(true); assert.equal(store.confirmedCheckout().total, 90); store.acceptPrice(false); assert.equal(store.confirmedCheckout(), null);
    });
    await t.test('price increase cannot continue until accepted for this checkout token', async () => {
      const store = createCheckoutReview(async () => data(125)); await store.load(); assert.equal(store.confirmedCheckout(), null);
      store.acceptPrice(true); assert.equal(store.confirmedCheckout().acceptedPriceToken, 'confirmed-125');
      assert.match(view(data(125)), /disabled=""/);
    });
    await t.test('unavailable state offers safe return and no retry/booking', async () => {
      const store = createCheckoutReview(async () => { throw { checkRateStatus: 'UNAVAILABLE' }; }); await store.load();
      assert.equal(store.getSnapshot().status, 'UNAVAILABLE'); assert.equal(store.confirmedCheckout(), null);
      const html = render(Status, { status: store.getSnapshot().status }); assert.match(html, /больше недоступно/); assert.match(html, /Назад/); assert.doesNotMatch(html, /Попробовать снова/);
    });
    await t.test('technical error is retryable and never labels offer unavailable', async () => {
      const store = createCheckoutReview(async () => { throw Error('Authorization private SQL stack'); }); await store.load();
      const html = render(Status, { status: store.getSnapshot().status }); assert.match(html, /Попробовать снова/); assert.doesNotMatch(html, /больше недоступно|Authorization|SQL|stack/);
    });
    await t.test('retry clears error and can confirm', async () => {
      let calls = 0; const store = createCheckoutReview(async () => { if (++calls === 1) throw Error('temporary'); return data(); });
      await store.load(); assert.equal(store.getSnapshot().status, 'RETRYABLE_ERROR'); await store.load(); assert.equal(store.getSnapshot().status, 'CONFIRMED'); assert.equal(calls, 2);
    });
    await t.test('repeated clicks/effect loads share one pending request', async () => {
      let calls = 0; const wait = deferred(); const store = createCheckoutReview(async () => { calls++; await wait.promise; return data(); });
      const first = store.load(), second = store.load(); assert.equal(first, second); await Promise.resolve(); assert.equal(calls, 1); wait.resolve(); await first;
    });
    await t.test('old selection response cannot replace a new transition', async () => {
      const wait = deferred(); const old = createCheckoutReview(async () => { await wait.promise; return data(90); });
      const current = createCheckoutReview(async () => data(125)); let updates = 0; const unsubscribe = old.subscribe(() => { updates++; });
      const previous = old.load(); unsubscribe(); await current.load(); const count = updates; wait.resolve(); await previous;
      assert.equal(updates, count); assert.equal(current.getSnapshot().data.total, 125);
    });
    await t.test('retry invalidates acceptance and stale confirmed price', async () => {
      let amount = 125; const store = createCheckoutReview(async () => data(amount)); await store.load(); store.acceptPrice(true);
      amount = 130; const pending = store.load(); assert.equal(store.confirmedCheckout(), null); await pending;
      assert.equal(store.getSnapshot().data.total, 130); assert.equal(store.confirmedCheckout(), null);
    });
    await t.test('malformed successful response cannot become a confirmed stale price', async () => {
      for (const value of [null, {}, { ...data(), total: 'bad' }, { ...data(125), previousTotal: null }, { ...data(), checkoutToken: null }]) {
        const store = createCheckoutReview(async () => value); await store.load(); assert.equal(store.getSnapshot().status, 'RETRYABLE_ERROR'); assert.equal(store.confirmedCheckout(), null);
      }
    });
    await t.test('API errors do not echo provider message/payload; outcomes stay distinct', async sub => {
      for (const outcome of ['UNAVAILABLE', 'RETRYABLE_ERROR']) {
        sub.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: outcome === 'UNAVAILABLE' ? 409 : 503,
          text: async () => JSON.stringify({ checkRateStatus: outcome, message: 'Authorization private SQL stack', secret: 'private' }) }));
        await assert.rejects(getCheckout({}), error => { assert.equal(error.checkRateStatus, outcome); assert.doesNotMatch(error.message, /Authorization|SQL|stack/); assert.equal(error.data, undefined); return true; });
      }
    });
    await t.test('Hotelbeds continuation has no booking or payment action even in development', () => {
      const html = render(Payment, { checkout: { ...data(), tour: { ...data().tour, bookingDisabled: false } }, back: () => {}, onPay: () => assert.fail('Payment forbidden') });
      assert.match(html, /Бронирование пока недоступно/); assert.doesNotMatch(html, /Создать TEST-бронь|onPay|Visa|Оплатить/);
      assert.match(view(data()), /не является подтверждением бронирования/);
    });
    await t.test('signed TEST selection can enter price review without putting token in URL', () => {
      const tour = { ...data().tour, offerToken: 'offline-private-token', providerHotelId: '3424', adults: 2, children: 0, nights: 2 };
      const element = PriceLink({ tour }); assert.equal(element.props.state.selectedOffer, tour);
      const html = renderToStaticMarkup(React.createElement(MemoryRouter, {}, element));
      assert.match(html, /\/checkout\/hotelbeds\/3424/); assert.match(html, /Проверить стоимость/); assert.doesNotMatch(html, /offline-private-token/);
      assert.equal(PriceLink({ tour: { ...tour, priceEnvironment: 'live' } }), null);
      assert.equal(PriceLink({ tour: { ...tour, offerToken: null } }), null);
    });
  } finally { await server.close(); }
});
