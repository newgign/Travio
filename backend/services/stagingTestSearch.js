// Explicit evaluation selection only; never a fallback for normal destination search.
module.exports = function stagingTestSearch(filters, config, now = Date.now()) {
  if (!filters.stagingTestHotel) return filters;
  const fail = () => { throw Object.assign(new Error('Hotelbeds TEST: проверьте отель, будущие даты и состав гостей.'), {status:400,code:'INVALID_STAGING_TEST_SEARCH'}); };
  if (!config.stagingTestAllowed || config.environment !== 'test' || filters.stagingTestHotel !== '3424') fail();
  const checkIn = filters.checkIn || filters.departureDate;
  const nights = Number(filters.nights || 1);
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  if (!date(checkIn) || checkIn <= new Date(now).toISOString().slice(0,10)) fail();
  if (!filters.checkOut && (!Number.isInteger(nights) || nights < 1 || nights > 14)) fail();
  const checkOut = filters.checkOut || new Date(Date.parse(checkIn) + nights * 86400000).toISOString().slice(0,10);
  const stay = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
  const adults = Number(filters.adults || filters.people || 2), children = Number(filters.children || 0), rooms = Number(filters.rooms || 1);
  if (!date(checkOut) || !Number.isInteger(stay) || stay < 1 || stay > 14 || rooms !== 1 || !Number.isInteger(adults) || adults < 1 || adults > 6 || !Number.isInteger(children) || children < 0 || children > 3) fail();
  const ages = String(filters.childrenAges || '').split(',');
  if (children && (ages.length !== children || ages.some(age => !/^\d{1,2}$/.test(age.trim()) || Number(age) > 17))) fail();
  return { ...filters, provider:'hotelbeds', hotelCodes:'3424', hotelCode:undefined, destinationCode:'', country:'', city:'', checkIn, departureDate:checkIn, checkOut, nights:stay, people:adults, adults, rooms, children };
};
