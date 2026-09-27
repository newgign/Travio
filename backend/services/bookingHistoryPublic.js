// Account history exposes stored facts, never raw provider/payment payloads.
const scalar = value => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
const pick = (value, keys) => Object.fromEntries(keys.filter(key => scalar(value?.[key])).map(key => [key, value[key]]));
const date = value => value instanceof Date ? (Number.isFinite(value.getTime()) ? value.toISOString() : null) : typeof value === 'string' ? value : null;
function publicBooking(row) {
  const offer = pick(row.offer_snapshot, ['name','title','hotel','country','city','image','destinationCode','checkIn','checkOut','check_in','check_out','departureDate','nights','adults','children','rooms','roomName','roomType','roomCode','room_name','room_type','room_code','boardCode','boardName','board_code','board','food','price','currency','priceEnvironment']);
  offer.occupancy = pick(row.offer_snapshot?.occupancy, ['adults','children','rooms']);
  offer.stay = pick(row.offer_snapshot?.stay, ['checkIn','checkOut']);
  const out = pick(row, ['id','provider','provider_hotel_id','tour_id','provider_status','status','people','total_amount','quoted_amount','quoted_currency','provider_client_reference','provider_booking_id','payment_status','gateway_provider','refund_status']);
  out.currency = row.stored_currency === undefined ? row.currency : row.stored_currency;
  if (typeof out.currency !== 'string' || !out.currency) out.currency = typeof offer.currency === 'string' ? offer.currency : null;
  out.offer_snapshot = offer;
  out.search_filters = pick(row.search_filters, ['checkIn','checkOut','departureDate','nights','people','adults','children','rooms']);
  const text = value => typeof value === 'string' ? value : '';
  out.hotel = text(offer.name) || text(offer.title) || text(offer.hotel);
  out.country = text(offer.country); out.city = text(offer.city); out.image = text(offer.image);
  // Some historical snapshots store only an images array; use it, never current tours data.
  if (!out.image && Array.isArray(row.offer_snapshot?.images)) out.image = row.offer_snapshot.images.find(value => typeof value === 'string') || '';
  for (const key of ['booking_date','confirmed_at','cancelled_at','provider_cancelled_at','voucher_generated_at']) out[key] = date(row[key]);
  out.payment_no_real_charge = row.gateway_provider === 'sandbox' && row.payment_metadata?.realCharge === false;
  return out;
}
function publicDetails(booking, events) {
  return { success: true, booking: publicBooking(booking), events: events.map(event => ({...pick(event,['id','event_type']), occurred_at: date(event.occurred_at)})) };
}
module.exports = { publicBooking, publicDetails };
