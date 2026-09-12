// Missing product identity is not proof of a matching replacement rate.
function ages(value) {
  if (value == null) return null;
  const list = (Array.isArray(value) ? value : String(value).split(',')).map(Number);
  return list.every(x => Number.isInteger(x) && x >= 0 && x <= 17) ? list.sort((a,b)=>a-b) : null;
}
function sameProduct(expected, hotel, room, rate) {
  const equal = (a,b) => a != null && b != null && String(a) === String(b);
  if (!equal(expected.providerHotelId,hotel.code) || !equal(expected.currency,hotel.currency || rate.currency) ||
      !equal(expected.roomCode,room.code) || !equal(expected.boardCode,rate.boardCode) ||
      !equal(expected.rateClass,rate.rateClass) || !equal(expected.paymentType,rate.paymentType) ||
      typeof rate.packaging !== 'boolean' || expected.packaging !== rate.packaging) return false;
  for (const field of ['rooms','adults','children']) {
    if (rate[field] == null || expected.occupancy?.[field] == null || Number(rate[field]) !== Number(expected.occupancy[field])) return false;
  }
  if (Number(rate.children) > 0) {
    const oldAges=ages(expected.childrenAges),newAges=ages(rate.childrenAges);
    if (!oldAges || !newAges || oldAges.length !== Number(rate.children) || JSON.stringify(oldAges)!==JSON.stringify(newAges)) return false;
  }
  return true;
}
function selectCheckedRate(expected, response) {
  const hotels=response.hotel ? [response.hotel] : response.hotels?.hotels || [];
  const matches=hotels.flatMap(hotel=>(hotel.rooms||[]).flatMap(room=>(room.rates||[]).map(rate=>({hotel,room,rate}))))
    .filter(({hotel,room,rate})=>rate.rateKey && sameProduct(expected,hotel,room,rate));
  const exact=matches.filter(x=>x.rate.rateKey===expected.rateKey);
  if (exact.length===1) return exact[0];
  if (matches.length===1) return matches[0];
  throw Object.assign(new Error('Выбранный тариф недоступен. Повторите поиск.'),{status:409,code:'RATE_NOT_AVAILABLE'});
}
module.exports={sameProduct,selectCheckedRate};
