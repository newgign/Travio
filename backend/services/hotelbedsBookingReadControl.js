// Explicit admin-only diagnostic. One fixed hotel, one room, two adults, one night.
// STATUS uses a different TLS path and is deliberately not a recovery operation.
async function run({env = process.env,client} = {}) {
  const access = require('./hotelbedsTestAccess');
  const shared = require('./hotelbedsLiveReadOnlyService');
  if (shared.preflight(env,undefined,'test',false).blockers.length) throw access.failure('HOTELBEDS_CONTROL_INVALID');
  const date = days => new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  const payload = shared.availabilityPayload({HOTELBEDS_LIVE_PROBE_HOTEL_CODES:'3424',
    HOTELBEDS_LIVE_PROBE_CHECKIN:date(7),HOTELBEDS_LIVE_PROBE_CHECKOUT:date(8),HOTELBEDS_LIVE_PROBE_ADULTS:'2'});
  client ||= new (require('../integrations/hotelbeds/client').HotelbedsClient)({...require('../config/hotelbeds').buildConfig(env),maxRetries:0});
  if (client.config.environment !== 'test') throw access.failure('HOTELBEDS_CONTROL_INVALID');
  try {
    return await access.withControl('AVAILABILITY_3424',undefined,async()=>{
      const response = await client.availability(payload);
      if (!Array.isArray(response?.hotels?.hotels) || response.hotels.hotels.some(h=>String(h.code)!=='3424')) throw access.failure('HOTELBEDS_CONTROL_FAILED');
      return {status:'PASS',operation:'AVAILABILITY_3424'};
    });
  } finally {client.bookingAgent?.destroy();}
}
module.exports = {run};
