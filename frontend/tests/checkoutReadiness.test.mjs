import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('6H final checkout review contract offline', async t => {
    const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
        server: { middlewareMode: true, hmr: false }, esbuild: { jsx: 'automatic' } });
    const previousStorage = globalThis.sessionStorage;
    globalThis.sessionStorage = { getItem: () => null };
    try {
        const { createFinalReview, reviewPrerequisite, safeReviewModel } = await server.ssrLoadModule('/src/services/checkoutReadiness.js');
        const { default: View } = await server.ssrLoadModule('/src/components/checkout/FinalReviewStep.jsx');
        const { createBookingReview } = await server.ssrLoadModule('/src/services/bookingService.js');
        const { buildInitialTravelers } = await server.ssrLoadModule('/src/utils/travellerData.js');
        const expiresAt = new Date(Date.now() + 600000).toISOString();
        const guests = () => [{ type: 'AD', firstName: 'Synthetic', lastName: 'AdultOne', roomId: 1 },
            { type: 'AD', firstName: 'Synthetic', lastName: 'AdultTwo', roomId: 1 }, { type: 'CH', firstName: 'Synthetic', lastName: 'Child', age: 8, roomId: 1 }];
        const form = () => ({ phone: '+77000000000', email: 'synthetic@example.invalid', travelers: guests() });
        const checkout = () => ({ checkoutToken: 'synthetic-confirmed', checkoutExpiresAt: expiresAt, total: 1,
            tour: { provider: 'hotelbeds', priceEnvironment: 'test', checkRatePerformed: true, name: 'Stale browser hotel', occupancy: { rooms: 1, adults: 2, children: 1 }, childrenAges: '8' } });
        const model = () => ({ state: 'REVIEW_READY', provider: 'hotelbeds', environment: 'test', expiresAt,
            hotel: 'Synthetic Confirmed Hotel', stay: { checkIn: '2030-01-01', checkOut: '2030-01-03', nights: 2 },
            offer: { room: 'Confirmed Double', board: 'Confirmed Breakfast', price: 110, currency: 'EUR' },
            occupancy: { rooms: 1, adults: 2, children: 1 }, expectedTravelers: 3,
            travelers: guests().map(({ roomId, ...value }) => value), bookingAvailable: false, paymentAvailable: false });
        const response = () => ({ code: 'BOOKING_DISABLED', providerState: 'PROVIDER_NOT_CALLED', review: model() });
        const store = (request = async () => response()) => createFinalReview(request);
        const render = (review = model(), status = 'REVIEW_READY') => renderToStaticMarkup(React.createElement(View, { review, status, back: () => {} }));
        const ready = async () => { const current = store(); const data = form(), offer = checkout(); await current.prepare(offer, data); return { current, data, offer }; };
        await t.test('review unavailable before confirmed CheckRate', async () => { const current = store(() => assert.fail('No premature intent')); const offer = checkout(); offer.tour.checkRatePerformed = false; assert.equal(current.statusFor(offer, form()), 'CHECKRATE_REQUIRED'); await assert.rejects(current.prepare(offer, form()), { code: 'CHECKRATE_REQUIRED' }); });
        await t.test('invalid travellers cannot request ready review', async () => { const current = store(() => assert.fail('Invalid guests must not submit')); const data = form(); data.travelers[0].firstName = ' '; assert.equal(reviewPrerequisite(checkout(), data), 'TRAVELLER_VALIDATION_ERROR'); await assert.rejects(current.prepare(checkout(), data), { code: 'TRAVELLER_VALIDATION_ERROR' }); });
        await t.test('hotel uses server review rather than stale browser search', async () => { const { current, data, offer } = await ready(); assert.equal(current.statusFor(offer, data), 'REVIEW_READY'); const html = render(current.getSnapshot().review); assert.match(html, /Synthetic Confirmed Hotel/); assert.doesNotMatch(html, /Stale browser hotel/); });
        await t.test('confirmed dates and nights displayed', () => { const html = render(); assert.match(html, /2030-01-01/); assert.match(html, /2030-01-03/); assert.match(html, /Ночей/); });
        await t.test('confirmed room and board displayed', () => { assert.match(render(), /Confirmed Double/); assert.match(render(), /Confirmed Breakfast/); });
        await t.test('confirmed price and currency displayed without browser override', () => { const html = render(); assert.match(html, /110/); assert.match(html, /EUR/); });
        await t.test('expected guest count displayed', () => assert.match(render(), /Гости: 3/));
        await t.test('adult and child roles displayed', () => { const html = render(); assert.match(html, /Гость 1 — взрослый/); assert.match(html, /Гость 3 — ребёнок \(8 лет\)/); });
        await t.test('server-normalized entered names displayed', () => { assert.match(render(), /Synthetic AdultOne/); assert.match(render(), /Synthetic Child/); });
        await t.test('DOB absent unless explicitly entered', () => { assert.doesNotMatch(render(), /Дата рождения/); const value = model(); value.travelers[0].birthDate = '2000-02-29'; assert.match(render(value), /2000-02-29/); });
        await t.test('Back invalidates review but preserves draft guest input', async () => { const { current, data, offer } = await ready(); current.invalidate(); assert.equal(current.statusFor(offer, data), 'REVIEW_NOT_READY'); const rows = buildInitialTravelers({ bookingData: data, adults: 2, children: 1, childAges: [8] }); assert.equal(rows[0].lastName, 'AdultOne'); assert.equal(rows[2].age, 8); await current.prepare(offer, data); assert.equal(current.statusFor(offer, data), 'REVIEW_READY'); });
        await t.test('direct-step bypass and refresh cannot manufacture readiness', () => { const current = store(); assert.equal(current.statusFor(checkout(), form()), 'REVIEW_NOT_READY'); const html = render(model(), 'REVIEW_NOT_READY'); assert.doesNotMatch(html, /Synthetic AdultOne|Confirmed Double/); assert.match(html, /пока недоступна/); });
        await t.test('editing guests or selecting a new token invalidates readiness', async () => { const { current, data, offer } = await ready(); data.travelers[0].lastName = 'Edited'; assert.equal(current.statusFor(offer, data), 'REVIEW_NOT_READY'); data.travelers[0].lastName = 'AdultOne'; offer.checkoutToken = 'new-selection'; assert.equal(current.statusFor(offer, data), 'REVIEW_NOT_READY'); });
        await t.test('review projection excludes technical keys and raw payload', () => { const value = { ...model(), rateKey: 'private-rate', checkoutToken: 'private-token', providerHotelId: 'internal-id', rawPayload: 'private-raw' }; const safe = safeReviewModel(value); assert.doesNotMatch(JSON.stringify(safe), /rateKey|checkoutToken|providerHotelId|rawPayload|private-/); assert.doesNotMatch(render(value), /private-|internal-id/); });
        await t.test('booking remains disabled and CheckRate is not a booking', () => { const html = render(); assert.match(html, /disabled=""/); assert.match(html, /Бронирование пока недоступно/); assert.match(html, /не является бронированием/); });
        await t.test('payment unavailable without card fields or fake success', () => { const html = render(); assert.match(html, /Оплата недоступна/); assert.match(html, /Бронь не создана/); assert.doesNotMatch(html, /<input|<form|Оплатить|Забронировать|Подтвердить бронирование|Бронирование подтверждено/); });
        await t.test('raw backend errors remain safe and retryable', async () => { const current = store(async () => { throw Error('private SQL provider stack'); }); await assert.rejects(current.prepare(checkout(), form())); assert.equal(current.getSnapshot().status, 'INTERNAL_RETRYABLE_ERROR'); const html = render(null, current.getSnapshot().status); assert.doesNotMatch(html, /private|SQL|provider|stack|отель недоступен/); assert.match(html, /Повторите попытку/); });
        await t.test('duplicate final validation shares one pending intent request', async () => { let calls = 0, resolve; const wait = new Promise(done => { resolve = done; }); const current = store(async () => { calls++; await wait; return response(); }); const first = current.prepare(checkout(), form()), second = current.prepare(checkout(), form()); assert.equal(first, second); await Promise.resolve(); assert.equal(calls, 1); resolve(); await first; });
        await t.test('late response after Back cannot restore old review', async () => { let resolve; const wait = new Promise(done => { resolve = done; }); const current = store(async () => { await wait; return response(); }); const pending = current.prepare(checkout(), form()); current.invalidate(); resolve(); assert.equal(await pending, null); assert.equal(current.getSnapshot().review, null); });
        await t.test('expired session and changed price without acceptance block readiness', async () => { const offer = checkout(); offer.checkoutExpiresAt = '2000-01-01'; assert.equal(reviewPrerequisite(offer, form()), 'CHECKRATE_REQUIRED'); offer.checkoutExpiresAt = expiresAt; offer.priceChangedAtCheckRate = true; assert.equal(reviewPrerequisite(offer, form()), 'CHECKRATE_REQUIRED'); offer.acceptedPriceToken = offer.checkoutToken; assert.equal(reviewPrerequisite(offer, form()), null); const value = model(); value.expiresAt = '2000-01-01'; assert.throws(() => safeReviewModel(value), { code: 'REVIEW_NOT_READY' }); assert.doesNotMatch(render(value), /Synthetic AdultOne/); });
        await t.test('malformed previews and fake booking success rejected', async () => { for (const patch of [{ code: 'BOOKED' }, { review: null }, { review: { ...model(), travelers: [] } }, { review: { ...model(), bookingAvailable: true } }]) { const current = store(async () => ({ ...response(), ...patch })); await assert.rejects(current.prepare(checkout(), form())); assert.equal(current.getSnapshot().review, null); } });
        await t.test('explicit authenticated preview uses existing intent route and no PII URL', async sub => { let sent; sub.mock.method(globalThis, 'fetch', async (url, options) => { assert.match(url, /\/bookings\/intent$/); assert.doesNotMatch(url, /Synthetic|birthDate|\?/); assert.equal(options.method, 'POST'); sent = JSON.parse(options.body); return { ok: false, status: 503, text: async () => JSON.stringify(response()) }; }); const result = await createBookingReview({ checkoutToken: checkout().checkoutToken, travelers: guests() }); assert.equal(sent.review, true); assert.equal(result.review.state, 'REVIEW_READY'); });
    } finally { await server.close(); if (previousStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previousStorage; }
});
