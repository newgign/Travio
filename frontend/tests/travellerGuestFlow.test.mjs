import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

test('6G traveller data and safe intent flow', async t => {
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null };
    const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
        server: { middlewareMode: true, hmr: false }, esbuild: { jsx: 'automatic' } });
    try {
        const { buildInitialTravelers: rows, validateTravelerForm: validate, normalizeTravelerForm: normalize,
            confirmedOccupancy, createTravellerSubmission, travellerFailureMessage } = await server.ssrLoadModule('/src/utils/travellerData.js');
        const { TravelerFormView: View } = await server.ssrLoadModule('/src/components/checkout/TravelerStep.jsx');
        const { default: Payment } = await server.ssrLoadModule('/src/components/checkout/PaymentStep.jsx');
        const { default: Stepper } = await server.ssrLoadModule('/src/components/checkout/CheckoutStepper.jsx');
        const { createBookingIntent } = await server.ssrLoadModule('/src/services/bookingService.js');
        const options = { bookingData: {}, adults: 2, children: 1, childAges: [8] };
        const form = () => ({ phone: '+77000000000', email: 'synthetic@example.invalid', comment: '', travelers: rows(options).map((value, index) => ({ ...value, firstName: ' Synthetic ', lastName: `Guest${index}` })) });
        const checkout = () => ({ checkoutToken: 'synthetic-confirmed', total: 100, tour: { provider: 'hotelbeds', checkRatePerformed: true,
            currency: 'EUR', occupancy: { rooms: 1, adults: 2, children: 1 }, childrenAges: '8' } });
        const render = (Component, props) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, props)));
        const view = (value = form(), extra = {}) => render(View, { form: value, adults: 2, children: 1, updateContact: () => {}, updateTraveler: () => {}, handleNext: () => {}, ...extra });
        await t.test('rows match confirmed occupancy', () => { const expected = confirmedOccupancy(checkout()); assert.deepEqual(expected, { adults: 2, children: 1, childAges: [8] }); assert.deepEqual(rows({ bookingData: {}, ...expected }).map(value => value.type), ['AD', 'AD', 'CH']); });
        await t.test('adult labels and first adult holder are visible', () => { const html = view(); assert.match(html, /Взрослый 1/); assert.match(html, /Взрослый 2/); assert.match(html, /Первый взрослый/); });
        await t.test('child label and confirmed age are visible', () => { assert.match(view(), /Ребёнок 1/); assert.match(view(), /8 лет/); });
        await t.test('editable guest fields are individually labelled', () => { const html = view(); assert.match(html, /aria-label="Имя гостя 1"/); assert.match(html, /aria-label="Фамилия гостя 3"/); assert.match(html, /value=" Synthetic "/); assert.doesNotMatch(html, /readonly/); });
        await t.test('missing required names are blocked by form validation', () => { const value = form(); value.travelers[0].firstName = ''; value.travelers[1].lastName = ''; const errors = validate(value); assert.ok(errors.traveler_0_firstName); assert.ok(errors.traveler_1_lastName); });
        await t.test('whitespace-only names rejected', () => { const value = form(); value.travelers[2].firstName = ' \t '; assert.ok(validate(value).traveler_2_firstName); });
        await t.test('international names preserved after trim', () => { const value = form(); value.travelers[0].firstName = ' 李–Әлия '; value.travelers[0].lastName = ' O’Connor '; assert.deepEqual(validate(value), {}); assert.equal(normalize(value, 2, 1).travelers[0].firstName, '李–Әлия'); });
        await t.test('empty form invents no names or DOB', () => { assert.ok(rows(options).every(value => value.firstName === '' && value.lastName === '' && value.birthDate === '')); });
        await t.test('missing child age is not silently zero', () => { const value = form(); value.travelers = rows({ ...options, childAges: [] }); assert.equal(value.travelers[2].age, null); assert.ok(validate(value).traveler_2_age); assert.doesNotMatch(view(value), /0 лет/); });
        await t.test('optional DOB remains absent in intent model', () => { assert.ok(normalize(form(), 2, 1).travelers.every(value => !Object.hasOwn(value, 'birthDate'))); assert.match(view(), /Дата рождения \(необязательно\)/); });
        await t.test('explicit optional DOB validates calendar and future', () => { const value = form(); value.travelers[0].birthDate = '2000-02-29'; assert.deepEqual(validate(value), {}); assert.equal(normalize(value, 2, 1).travelers[0].birthDate, '2000-02-29'); for (const date of ['2999-01-01', '2001-02-29']) { value.travelers[0].birthDate = date; assert.ok(validate(value).traveler_0_birthDate); } });
        await t.test('inline validation shown without technical details', () => { const value = form(); value.travelers[0].firstName = ''; const html = view(value, { errors: validate(value) }); assert.match(html, /input-error/); assert.match(html, /Введите имя/); });
        await t.test('valid form moves through intent to disabled boundary', async () => { const value = form(); assert.deepEqual(validate(value), {}); let payload; const submit = createTravellerSubmission(async body => { payload = body; return { code: 'BOOKING_DISABLED', providerState: 'PROVIDER_NOT_CALLED' }; }); assert.equal((await submit({ checkoutToken: checkout().checkoutToken, travelers: normalize(value, 2, 1).travelers })).code, 'BOOKING_DISABLED'); assert.equal(payload.travelers[0].firstName, 'Synthetic'); });
        await t.test('values persist when rows are rebuilt during normal navigation', () => { const value = form(); value.travelers[2].birthDate = '2018-03-04'; const stored = normalize(value, 2, 1); const returned = rows({ ...options, bookingData: stored }); assert.equal(returned[2].birthDate, '2018-03-04'); assert.equal(returned[0].lastName, 'Guest0'); assert.equal(returned[2].age, 8); });
        await t.test('duplicate submission shares one request', async () => { let resolve, calls = 0; const deferred = new Promise(done => { resolve = done; }); const submit = createTravellerSubmission(async () => { calls++; await deferred; return { code: 'BOOKING_DISABLED', providerState: 'PROVIDER_NOT_CALLED' }; }); const first = submit({}), second = submit({}); assert.equal(first, second); await Promise.resolve(); assert.equal(calls, 1); resolve(); await first; });
        await t.test('raw internal errors cannot appear in UI', () => { const message = travellerFailureMessage({ message: 'private SQL stack Synthetic', code: 'OTHER' }); assert.doesNotMatch(message, /private|SQL|stack|Synthetic/); assert.match(view(form(), { submitError: message }), /role="alert"/); assert.notEqual(travellerFailureMessage({ validationKind: 'OCCUPANCY_MISMATCH' }), travellerFailureMessage({ validationKind: 'TRAVELLER_VALIDATION_ERROR' })); });
        await t.test('unconfirmed or unaccepted changed offer cannot supply guest occupancy', () => { const value = checkout(); value.tour.checkRatePerformed = false; assert.equal(confirmedOccupancy(value), null); value.tour.checkRatePerformed = true; value.priceChangedAtCheckRate = true; assert.equal(confirmedOccupancy(value), null); value.acceptedPriceToken = value.checkoutToken; assert.ok(confirmedOccupancy(value)); value.tour.childrenAges = ''; assert.equal(confirmedOccupancy(value), null); });
        await t.test('booking and payment controls remain absent at boundary', () => { const html = render(Payment, { checkout: checkout(), back: () => {}, onPay: () => assert.fail('payment forbidden') }); assert.match(html, /Бронирование пока недоступно/); assert.doesNotMatch(html, /Оплатить|Visa|Создать TEST/); assert.doesNotMatch(render(Stepper, { step: 3, provider: 'hotelbeds' }), /Оплата|Готово/); assert.match(view(form(), { submitting: true }), /<fieldset disabled=""/); });
        await t.test('intent API uses authenticated POST and accepts only safe disabled outcome', async sub => {
            let body;
            sub.mock.method(globalThis, 'fetch', async (url, options) => { assert.match(url, /\/bookings\/intent$/); assert.equal(options.method, 'POST'); body = JSON.parse(options.body); return { ok: false, status: 503, text: async () => JSON.stringify({ code: 'BOOKING_DISABLED', providerState: 'PROVIDER_NOT_CALLED', message: 'private', intent: { travelers: 'private' } }) }; });
            const payload = { checkoutToken: 'synthetic', travelers: normalize(form(), 2, 1).travelers }; assert.deepEqual(await createBookingIntent(payload), { code: 'BOOKING_DISABLED', providerState: 'PROVIDER_NOT_CALLED' }); assert.deepEqual(body, payload);
        });
        await t.test('intent API rejects fake success and strips raw error payload', async sub => {
            sub.mock.method(globalThis, 'fetch', async () => ({ ok: true, text: async () => JSON.stringify({ code: 'BOOKED' }) })); await assert.rejects(createBookingIntent({}), /INVALID_INTENT_RESPONSE/);
            sub.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 409, text: async () => JSON.stringify({ code: 'VALIDATION_ERROR', validationKind: 'TRAVELLER_VALIDATION_ERROR', message: 'private SQL stack' }) }));
            await assert.rejects(createBookingIntent({}), error => { assert.equal(error.validationKind, 'TRAVELLER_VALIDATION_ERROR'); assert.equal(error.data, undefined); assert.doesNotMatch(error.message, /private|SQL|stack/); return true; });
        });
    } finally { await server.close(); if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage; }
});
