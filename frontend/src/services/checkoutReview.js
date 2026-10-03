// One review transition owns one pending request. Completed offers are never globally cached.
export function createCheckoutReview(request) {
  let state = { status: 'CHECKING', data: null, acceptedPriceToken: null };
  let pending = null;
  const listeners = new Set();
  const publish = next => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    load() {
      if (pending) return pending;
      publish({ status: 'CHECKING', data: null, acceptedPriceToken: null });
      pending = Promise.resolve().then(request).then(data => {
        if (!data?.tour || !data.checkoutToken || !Number.isFinite(Number(data.total)) || Number(data.total) <= 0
          || !/^[A-Z]{3}$/.test(data.tour.currency || '')) throw Error('INVALID_CHECKOUT');
        const status = data.priceChangedAtCheckRate ? 'PRICE_CHANGED' : 'CONFIRMED';
        if (status === 'PRICE_CHANGED' && (!Number.isFinite(Number(data.previousTotal)) || Number(data.previousTotal) <= 0)) throw Error('INVALID_PREVIOUS_PRICE');
        publish({ status, data, acceptedPriceToken: null });
      }).catch(error => {
        publish({ status: error.checkRateStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'RETRYABLE_ERROR', data: null, acceptedPriceToken: null });
      }).finally(() => { pending = null; });
      return pending;
    },
    acceptPrice(accepted) {
      if (state.status === 'PRICE_CHANGED') publish({ ...state, acceptedPriceToken: accepted ? state.data.checkoutToken : null });
    },
    confirmedCheckout() {
      if (!state.data || !['CONFIRMED', 'PRICE_CHANGED'].includes(state.status)
        || (state.status === 'PRICE_CHANGED' && state.acceptedPriceToken !== state.data.checkoutToken)) return null;
      return { ...state.data, acceptedPriceToken: state.acceptedPriceToken };
    },
  };
}
