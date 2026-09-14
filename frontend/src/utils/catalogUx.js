export const catalogEmptyMessage = 'Каталог направления пока не загружен';
export const noRatesMessage = 'На выбранные даты доступных тарифов не найдено';
export function searchQuery(params) {
  const fields=['stagingTestHotel','hotelCodes','checkIn','checkOut','adults','destinationCode','city','departureDate','people','childrenAges','nights','food','rating','maxPrice','stars','beachLine','beachType','roomType'];
  return {...Object.fromEntries(fields.map(key=>[key,params.get(key)||''])),country:params.get('country')||params.get('countryCode')||'',
    provider:params.get('provider')||'hotelbeds',rooms:params.get('rooms')||'1',children:params.get('children')||'0',sort:params.get('sort')||'priceAsc',page:params.get('page')||'1',limit:params.get('limit')||'20'};
}
