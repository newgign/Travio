const LIMIT = 20;
const fail = (code, message) => { throw Object.assign(new Error(message), { status: 409, code }); };
module.exports = async function resolve(filters, config, repository) {
  if (!config.stagingTestAllowed || config.environment !== 'test' || filters.stagingTestHotel) return filters;
  if (!filters.country && filters.countryCode) filters={...filters,country:filters.countryCode};
  if (config.maxRetries > 0) fail('TEST_SEARCH_RETRIES_BLOCKED', 'Для ограниченного TEST поиска retries должны быть отключены.');
  // Reuse the existing dates/occupancy validator, without using its diagnostic selection.
  const validated = require('./stagingTestSearch')({ ...filters, stagingTestHotel: '3424' }, config);
  const explicit = String(filters.hotelCodes || filters.hotelCode || '').split(',').filter(Boolean);
  if (explicit.length && !filters.destinationCode) {
    if (explicit.length > LIMIT || explicit.some(code => !/^\d+$/.test(code))) fail('TEST_SEARCH_LIMIT', 'Превышен лимит TEST поиска.');
    return { ...validated, stagingTestHotel: undefined, hotelCodes: explicit, destinationCode: '' };
  }
  const destinations = await repository.findDestinations({ provider: 'hotelbeds' });
  const destination = destinations.find(row => row.code === filters.destinationCode);
  if (!destination) {
    let scopes=[];try { scopes=require('./hotelbedsTestContent').scopes(); } catch { /* No configured selection. */ }
    const allowed=scopes.find(scope=>scope.destinationCode===filters.destinationCode);
    if (allowed && (!filters.country || filters.country===allowed.countryCode)) fail('TEST_CATALOG_EMPTY','Каталог направления пока не загружен');
    fail('TEST_DESTINATION_NOT_LOADED', 'Направление пока не загружено в тестовый каталог');
  }
  if (filters.country && ![destination.country_code, destination.country_name].includes(filters.country)) fail('TEST_DESTINATION_COUNTRY_MISMATCH', 'Направление не соответствует выбранной стране.');
  const hotels = (await repository.findHotels({ provider: 'hotelbeds', countryCode: destination.country_code, destinationCode: destination.code, limit: LIMIT + 1 })).filter(row => String(row.provider_hotel_id) !== '3424');
  if (!hotels.length) fail('TEST_CATALOG_EMPTY', 'Каталог направления пока не загружен');
  if (hotels.length > LIMIT) fail('TEST_SEARCH_LIMIT', 'Направление превышает лимит TEST поиска: 20 отелей.');
  return { ...validated, stagingTestHotel: undefined, destinationCode: '', country: '', city: '', hotelCodes: hotels.map(row => row.provider_hotel_id) };
};
module.exports.LIMIT = LIMIT;
