// Form rows follow the confirmed offer; the backend independently verifies the session.
export function confirmedOccupancy(checkout) {
    const tour = checkout?.tour;
    const occupancy = tour?.occupancy;
    const integer = (value, minimum) => ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= minimum;
    if (!checkout?.checkoutToken || tour?.provider !== 'hotelbeds' || tour.checkRatePerformed !== true
        || (checkout.priceChangedAtCheckRate && checkout.acceptedPriceToken !== checkout.checkoutToken)
        || !integer(occupancy?.rooms, 1) || Number(occupancy.rooms) !== 1 || !integer(occupancy?.adults, 1)
        || !integer(occupancy?.children, 0)) return null;
    const raw = tour.childrenAges;
    const childAges = Array.isArray(raw) ? raw : typeof raw === 'string' && raw !== '' ? raw.split(',') : [];
    if (childAges.length !== Number(occupancy.children) || childAges.some(age => !integer(age, 0) || Number(age) > 17)) return null;
    return { adults: Number(occupancy.adults), children: Number(occupancy.children), childAges: childAges.map(Number) };
}

export function buildInitialTravelers({ bookingData = {}, adults, children, childAges }) {
    return Array.from({ length: adults + children }, (_, index) => {
        const type = index < adults ? 'AD' : 'CH';
        const previous = bookingData.travelers?.[index];
        const saved = previous?.type === type ? previous : index === 0 ? bookingData : {};
        return { type, firstName: saved.firstName || '', lastName: saved.lastName || '', birthDate: saved.birthDate || '',
            age: type === 'CH' ? childAges[index - adults] ?? null : null, roomId: 1 };
    });
}

export function validateTravelerForm(form) {
    const errors = {};
    if (!form.phone.trim()) errors.phone = 'Введите телефон';
    if (!form.email.trim()) errors.email = 'Введите Email';
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Некорректный Email';
    form.travelers.forEach((traveler, index) => {
        for (const [field, label] of [['firstName', 'имя'], ['lastName', 'фамилию']]) {
            if (!traveler[field].trim()) errors[`traveler_${index}_${field}`] = `Введите ${label}`;
            else if (traveler[field].trim().length > 100) errors[`traveler_${index}_${field}`] = 'Не более 100 символов';
        }
        if (traveler.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(traveler.birthDate)
            || !Number.isFinite(Date.parse(traveler.birthDate)) || new Date(traveler.birthDate).toISOString().slice(0, 10) !== traveler.birthDate
            || traveler.birthDate > new Date().toISOString().slice(0, 10))) errors[`traveler_${index}_birthDate`] = 'Проверьте дату рождения';
        if (traveler.type === 'CH' && (!Number.isInteger(traveler.age) || traveler.age < 0 || traveler.age > 17)) errors[`traveler_${index}_age`] = 'Возраст ребёнка не подтверждён. Вернитесь к поиску.';
    });
    return errors;
}

export function normalizeTravelerForm(form, adults, children) {
    const travelers = form.travelers.map(value => ({ type: value.type, firstName: value.firstName.trim(), lastName: value.lastName.trim(),
        roomId: 1, ...(value.type === 'CH' ? { age: value.age } : {}), ...(value.birthDate ? { birthDate: value.birthDate } : {}) }));
    const holder = travelers.find(value => value.type === 'AD');
    return { ...form, phone: form.phone.trim(), email: form.email.trim(), travelers,
        firstName: holder?.firstName || '', lastName: holder?.lastName || '', birthDate: holder?.birthDate || '', adults, children, people: adults + children };
}

// Share a pending submission; no booking/payment fallback or provider error text.
export function createTravellerSubmission(request) {
    let pending;
    return payload => {
        if (pending) return pending;
        pending = Promise.resolve().then(() => request(payload)).then(result => {
            if (result?.code !== 'BOOKING_DISABLED' || result?.providerState !== 'PROVIDER_NOT_CALLED') throw Error('INVALID_INTENT_RESPONSE');
            return { code: 'BOOKING_DISABLED' };
        }).finally(() => { pending = null; });
        return pending;
    };
}

export function travellerFailureMessage(error) {
    if (error?.validationKind === 'OCCUPANCY_MISMATCH') return 'Состав гостей не соответствует предложению. Вернитесь к поиску.';
    if (error?.validationKind === 'TRAVELLER_VALIDATION_ERROR') return 'Проверьте данные гостей.';
    if (error?.code === 'VALIDATION_ERROR') return 'Предложение устарело или недействительно. Вернитесь к поиску.';
    if (error?.code === 'AUTH_REQUIRED') return 'Войдите в аккаунт, чтобы продолжить.';
    return 'Не удалось проверить данные. Повторите попытку позже.';
}
