import { confirmedOccupancy, validateTravelerForm } from '../utils/travellerData';

const fail = code => Object.assign(new Error('CHECKOUT_REVIEW_NOT_READY'), { code });
const calendarDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const text = value => typeof value === 'string' && value.trim() !== '';

export function reviewPrerequisite(checkout, data) {
    const occupancy = confirmedOccupancy(checkout);
    if (!occupancy || checkout.tour.priceEnvironment !== 'test'
        || !Number.isFinite(Date.parse(checkout.checkoutExpiresAt)) || Date.parse(checkout.checkoutExpiresAt) <= Date.now()) return 'CHECKRATE_REQUIRED';
    if (!data || typeof data.phone !== 'string' || typeof data.email !== 'string' || !Array.isArray(data.travelers)
        || data.travelers.length !== occupancy.adults + occupancy.children
        || data.travelers.some(value => !value || !['AD', 'CH'].includes(value.type) || !text(value.firstName) || !text(value.lastName))
        || data.travelers.filter(value => value.type === 'AD').length !== occupancy.adults) return 'TRAVELLER_VALIDATION_ERROR';
    const ages = data.travelers.filter(value => value.type === 'CH').map(value => value.age).sort((a, b) => a - b);
    if (JSON.stringify(ages) !== JSON.stringify([...occupancy.childAges].sort((a, b) => a - b))
        || Object.keys(validateTravelerForm(data)).length) return 'TRAVELLER_VALIDATION_ERROR';
    return null;
}

// Explicit projection: raw server payload and technical identifiers never become display state.
export function safeReviewModel(value) {
    const integer = (number, minimum) => Number.isSafeInteger(number) && number >= minimum;
    if (!value || value.state !== 'REVIEW_READY' || value.provider !== 'hotelbeds' || value.environment !== 'test'
        || value.bookingAvailable !== false || value.paymentAvailable !== false
        || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()
        || !calendarDate(value.stay?.checkIn) || !calendarDate(value.stay?.checkOut) || !integer(value.stay.nights, 1)
        || (Date.parse(value.stay.checkOut) - Date.parse(value.stay.checkIn)) / 86400000 !== value.stay.nights
        || typeof value.offer?.price !== 'number' || !Number.isFinite(value.offer.price) || value.offer.price <= 0
        || !/^[A-Z]{3}$/.test(value.offer.currency || '') || value.occupancy?.rooms !== 1
        || !integer(value.occupancy.adults, 1) || !integer(value.occupancy.children, 0)
        || value.expectedTravelers !== value.occupancy.adults + value.occupancy.children
        || !Array.isArray(value.travelers) || value.travelers.length !== value.expectedTravelers
        || value.travelers.filter(guest => guest?.type === 'AD').length !== value.occupancy.adults
        || value.travelers.filter(guest => guest?.type === 'CH').length !== value.occupancy.children) throw fail('REVIEW_NOT_READY');
    const label = item => { if (item === null) return null; if (!text(item)) throw fail('REVIEW_NOT_READY'); return item.trim(); };
    const travelers = value.travelers.map(guest => {
        if (!text(guest.firstName) || !text(guest.lastName) || guest.firstName.trim().length > 100 || guest.lastName.trim().length > 100
            || (guest.type === 'CH' && (!integer(guest.age, 0) || guest.age > 17))
            || (guest.birthDate !== undefined && (!calendarDate(guest.birthDate) || guest.birthDate > new Date().toISOString().slice(0, 10)))) throw fail('REVIEW_NOT_READY');
        return { type: guest.type, firstName: guest.firstName.trim(), lastName: guest.lastName.trim(),
            ...(guest.type === 'CH' ? { age: guest.age } : {}), ...(guest.birthDate ? { birthDate: guest.birthDate } : {}) };
    });
    return { state: 'REVIEW_READY', provider: 'hotelbeds', environment: 'test', expiresAt: value.expiresAt,
        hotel: label(value.hotel), stay: { checkIn: value.stay.checkIn, checkOut: value.stay.checkOut, nights: value.stay.nights },
        offer: { room: label(value.offer.room), board: label(value.offer.board), price: value.offer.price, currency: value.offer.currency },
        occupancy: { rooms: 1, adults: value.occupancy.adults, children: value.occupancy.children },
        expectedTravelers: value.expectedTravelers, travelers, bookingAvailable: false, paymentAvailable: false };
}

const guestModel = values => values.map(value => ({ type: value.type, firstName: value.firstName.trim(), lastName: value.lastName.trim(),
    ...(value.type === 'CH' ? { age: value.age } : {}), ...(value.birthDate ? { birthDate: value.birthDate } : {}) }));
const identity = (checkout, data) => JSON.stringify([checkout.checkoutToken, checkout.acceptedPriceToken || null, guestModel(data.travelers)]);

// Reuse the checkout review external-store pattern for this single authenticated intent transition.
// Binding lives in memory only and is invalidated by edits/back, selection changes and expiration.
export function createFinalReview(request) {
    let state = { status: 'REVIEW_NOT_READY', review: null }, pending = null, binding = null, revision = 0;
    const listeners = new Set();
    const publish = next => { state = next; listeners.forEach(listener => listener()); };
    return {
        getSnapshot: () => state,
        subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
        invalidate() { revision++; pending = null; binding = null; publish({ status: 'REVIEW_NOT_READY', review: null }); },
        statusFor(checkout, data) {
            const missing = reviewPrerequisite(checkout, data);
            if (missing) return missing;
            return state.review && binding === identity(checkout, data) && Date.parse(state.review.expiresAt) > Date.now() ? 'REVIEW_READY' : 'REVIEW_NOT_READY';
        },
        prepare(checkout, data) {
            const missing = reviewPrerequisite(checkout, data);
            if (missing) { this.invalidate(); return Promise.reject(fail(missing)); }
            const key = identity(checkout, data);
            if (pending && binding === key) return pending;
            const current = ++revision;
            const submitted = data.travelers.map(value => ({ ...value }));
            binding = key;
            publish({ status: 'CHECKING', review: null });
            pending = Promise.resolve().then(() => request({ checkoutToken: checkout.checkoutToken, travelers: submitted,
                ...(checkout.acceptedPriceToken ? { acceptedPriceToken: checkout.acceptedPriceToken } : {}) })).then(result => {
                if (current !== revision) return null;
                if (result?.code !== 'BOOKING_DISABLED' || result.providerState !== 'PROVIDER_NOT_CALLED') throw fail('REVIEW_NOT_READY');
                const review = safeReviewModel(result.review);
                const occupancy = confirmedOccupancy(checkout);
                if (JSON.stringify(review.travelers) !== JSON.stringify(guestModel(submitted))
                    || review.occupancy.adults !== occupancy.adults || review.occupancy.children !== occupancy.children) throw fail('REVIEW_NOT_READY');
                publish({ status: 'REVIEW_READY', review });
                return review;
            }).catch(error => {
                if (current === revision) publish({ status: ['VALIDATION_ERROR', 'CHECKRATE_REQUIRED', 'REVIEW_NOT_READY'].includes(error.code) ? 'REVIEW_NOT_READY'
                    : error.validationKind ? 'TRAVELLER_VALIDATION_ERROR' : 'INTERNAL_RETRYABLE_ERROR', review: null });
                throw error;
            }).finally(() => { if (current === revision) pending = null; });
            return pending;
        },
    };
}
