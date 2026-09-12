export function stagingTestOffer(tour) {
  return import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED === 'true' &&
    tour?.provider === 'hotelbeds' && tour.priceEnvironment === 'test' &&
    tour.stagingTestAllowed === true && tour.bookingDisabled === true;
}
export function visibleProviderOffer(tour) {
  return tour?.provider === 'hotelbeds' && (tour.priceEnvironment === 'live' || stagingTestOffer(tour));
}
