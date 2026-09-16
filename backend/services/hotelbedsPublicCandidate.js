// Explicit public candidate allowlist. Never spread provider rates or responses.
const fields = ['provider','providerHotelId','id','name','title','country','city','destinationCode','stars','rating','reviewsCount','image',
  'bookingDisabled','stagingTestAllowed','priceEnvironment','occupancy','priceSource','priceBasis','observedAt',
  'price','basePrice','currency','priceIsFinal','nights','adults','children','childrenAges','food','roomType',
  'departureCity','departureDate','checkIn','checkOut','offerId','providerOfferId','rateKey','rateType','recheckRequired',
  'roomCode','roomName','boardCode','boardName','paymentType','packaging','rateClass',
  'images','beachLine','beachType','wifi','pool','spa','gym','kidsClub','aquapark','transfer','parking','privateBeach','animation','restaurant','bar'];
module.exports = offer => Object.fromEntries(fields.flatMap(key => {
  const value=offer[key];
  if (key === 'childrenAges' && Array.isArray(value)) return [[key,value.filter(age => Number.isInteger(age) && age >= 0 && age <= 17)]];
  if (key === 'occupancy' && value) return [[key,Object.fromEntries(['rooms','adults','children'].filter(field => Number.isFinite(value[field])).map(field => [field,value[field]]))]];
  if (key === 'images' && Array.isArray(value)) return [[key,value.filter(image => typeof image === 'string')]];
  // Names/codes and source metadata must never carry arbitrary nested objects.
  return value === null || ['string','boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value)) ? [[key,value]] : [];
}));
