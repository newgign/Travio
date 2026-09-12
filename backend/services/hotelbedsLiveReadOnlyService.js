const { buildConfig } = require('../config/hotelbeds');
const { loadTlsOptions } = require('../integrations/hotelbeds/mtls');
let lastProbe = null;
let adminProbeRunning = false;
let nextAdminProbeAt = 0;
async function runAdminProbe(options = {}) {
  if (adminProbeRunning || Date.now() < nextAdminProbeAt) return {status:'BLOCKED',blockers:['PROBE_RATE_LIMITED'],networkAttempted:false};
  adminProbeRunning = true;
  try {
    const result = await run(options);
    if (result.networkAttempted) nextAdminProbeAt = Date.now() + 60000;
    return result;
  } finally { adminProbeRunning = false; }
}
function probeState() {
  return { scope: 'process', status: lastProbe?.status || 'NOT RUN', timestamp: lastProbe?.timestamp || null,
    lastAvailabilityStatus: lastProbe?.operations.find(x=>x.operation==='availability')?.status || 'NOT RUN' };
}

function preflight(env = process.env, validateTls = loadTlsOptions) {
  const config = buildConfig(env);
  const blockers = [...config.configurationErrors];
  if (config.environment !== 'live') blockers.push('LIVE_ENVIRONMENT_REQUIRED');
  if (!config.enabled) blockers.push('HOTELBEDS_DISABLED');
  if (!config.readOnly) blockers.push('READ_ONLY_MODE_REQUIRED');
  if (!config.apiKey || !config.secret || config.environment !== 'live') blockers.push('LIVE_CREDENTIALS_REQUIRED');
  if (config.bookingEnabled || config.liveBookingEnabled) blockers.push('BOOKING_FLAGS_MUST_BE_DISABLED');
  if (['PRODUCTION_SALES_ENABLED', 'REAL_CHARGES_ENABLED', 'REAL_REFUNDS_ENABLED', 'HOT_DEALS_MONITOR_ENABLED', 'HOTELBEDS_CONTENT_SYNC_ENABLED'].some(key => env[key] === 'true')) blockers.push('SAFETY_FLAGS_MUST_BE_DISABLED');
  if ((env.PAYMENTS_MODE || 'disabled') !== 'disabled' || (env.PAYMENTS_PROVIDER || 'none') !== 'none') blockers.push('PAYMENTS_MUST_BE_DISABLED');
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') blockers.push('TLS_VERIFICATION_REQUIRED');
  let mtlsReady = false;
  if (config.environment === 'live') {
    try { validateTls(config); mtlsReady = true; }
    catch (error) {
      const known = ['HOTELBEDS_MTLS_NOT_CONFIGURED', 'HOTELBEDS_MTLS_FILES_UNREADABLE', 'HOTELBEDS_MTLS_CERT_DATE_INVALID', 'HOTELBEDS_MTLS_KEY_MISMATCH', 'HOTELBEDS_MTLS_MATERIAL_INVALID'];
      blockers.push(known.includes(error.code) ? error.code : 'HOTELBEDS_MTLS_MATERIAL_INVALID');
    }
  } else blockers.push('LIVE_MTLS_REQUIRED');
  return {
    status: blockers.length ? 'BLOCKED' : 'READY',
    environment: config.environment, readOnly: config.readOnly,
    liveCredentialsConfigured: config.environment === 'live' && Boolean(config.apiKey && config.secret),
    apiKeyConfigured: Boolean(config.apiKey), secretConfigured: Boolean(config.secret),
    certificateConfigured: Boolean(config.mtlsCertPath), privateKeyConfigured: Boolean(config.mtlsKeyPath), caConfigured: Boolean(config.mtlsCaPath),
    mtlsReady, blockers: [...new Set(blockers)], networkAttempted: false,
    endpoints: { booking: config.bookingBaseUrl, content: config.contentBaseUrl },
  };
}

function availabilityPayload(env, now = Date.now()) {
  const codes = String(env.HOTELBEDS_LIVE_PROBE_HOTEL_CODES || '').split(',').map(x => x.trim());
  const checkIn = env.HOTELBEDS_LIVE_PROBE_CHECKIN;
  const checkOut = env.HOTELBEDS_LIVE_PROBE_CHECKOUT;
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
  const adults = Number(env.HOTELBEDS_LIVE_PROBE_ADULTS || 2);
  if (!codes.length || codes.length > 5 || codes.some(x => !/^[1-9]\d*$/.test(x) || !Number.isSafeInteger(Number(x))) ||
      !validDate(checkIn) || !validDate(checkOut) || checkIn <= new Date(now).toISOString().slice(0,10) ||
      nights < 1 || nights > 14 || !Number.isInteger(adults) || adults < 1 || adults > 4) {
    throw Object.assign(new Error('Explicit probe hotel codes, future dates and bounded occupancy are required'), { code: 'INVALID_PROBE_PARAMETERS' });
  }
  return { stay: { checkIn, checkOut }, occupancies: [{ rooms: 1, adults, children: 0 }], hotels: { hotel: [...new Set(codes.map(Number))] } };
}

async function run({ env = process.env, availability = false, checkRate = false, dryRun = false, validateTls = loadTlsOptions, createClient } = {}) {
  const result = { ...preflight(env, validateTls), operations: [] };
  if (result.status !== 'READY' || dryRun) return result;
  let payload;
  try { if (availability || checkRate) payload = availabilityPayload(env); }
  catch { return { ...result, status: 'BLOCKED', blockers: ['INVALID_PROBE_PARAMETERS'] }; }
  const config = { ...buildConfig(env), maxRetries: 0 };
  const client = createClient ? createClient(config) : new (require('../integrations/hotelbeds/client').HotelbedsClient)(config);
  const started = Date.now();
  let operation = 'status';
  try {
    result.networkAttempted = true;
    await client.status();
    result.operations.push({ operation, status: 'PASS', httpStatus: client.readiness().httpStatus });
    if (payload) {
      operation = 'availability';
      const response = await client.availability(payload);
      const hotels = response?.hotels?.hotels;
      if (!Array.isArray(hotels)) throw Object.assign(new Error('Invalid availability response'), { code: 'INVALID_PROVIDER_RESPONSE' });
      const entries=hotels.flatMap(hotel=>(hotel.rooms||[]).flatMap(room=>(room.rates||[]).map(rate=>({hotel,room,rate}))));
      result.operations.push({ operation, status: 'PASS', category:hotels.length?'AVAILABLE':'NO_AVAILABILITY', httpStatus: client.readiness().httpStatus, hotelCount: hotels.length, rateCount:entries.length });
      if (checkRate) {
        // Never accept a hand-entered or old rateKey. Recheck one rate from this response only.
        const candidates=entries.filter(({room,rate})=>rate.rateType==='RECHECK' && rate.rateKey &&
          (!env.HOTELBEDS_LIVE_PROBE_ROOM_CODE || room.code===env.HOTELBEDS_LIVE_PROBE_ROOM_CODE) &&
          (!env.HOTELBEDS_LIVE_PROBE_BOARD_CODE || rate.boardCode===env.HOTELBEDS_LIVE_PROBE_BOARD_CODE));
        operation = 'checkrate';
        if (candidates.length>1) throw Object.assign(new Error('Select one product using hotel/room/board filters'),{code:'AMBIGUOUS_RECHECK_SELECTION'});
        if (candidates.length===1) {
          const {hotel,room,rate}=candidates[0];
          const expected={providerHotelId:hotel.code,currency:hotel.currency||rate.currency,roomCode:room.code,boardCode:rate.boardCode,
            rateClass:rate.rateClass,paymentType:rate.paymentType,packaging:rate.packaging,rateKey:rate.rateKey,
            occupancy:payload.occupancies[0],childrenAges:rate.childrenAges};
          if (!payload.hotels.hotel.includes(Number(hotel.code))) throw Object.assign(new Error('Unexpected hotel'),{code:'RATE_NOT_AVAILABLE'});
          const identity=require('./hotelbedsRateIdentity');
          if (!identity.sameProduct(expected,hotel,room,rate)) throw Object.assign(new Error('Missing product identity'),{code:'RATE_NOT_AVAILABLE'});
          const checked = await client.checkRates(rate.rateKey);
          const selected=identity.selectCheckedRate(expected,checked);
          if (!require('./hotelbedsPriceService').extract(selected.rate,selected.hotel.currency||selected.rate.currency)) throw Object.assign(new Error('Invalid price'),{code:'RATE_NOT_AVAILABLE'});
          result.operations.push({ operation, status: 'PASS', httpStatus: client.readiness().httpStatus });
        } else result.operations.push({ operation, status: 'NOT APPLICABLE', reason: 'NO_RECHECK_RATE_IN_CURRENT_RESPONSE' });
      }
    }
    result.status = 'PASS';
  } catch (error) {
    const allowed = ['AUTH_ERROR','RATE_LIMIT','TIMEOUT','PROVIDER_UNAVAILABLE','RATE_NOT_AVAILABLE','INVALID_REQUEST','INVALID_PROVIDER_RESPONSE','AMBIGUOUS_RECHECK_SELECTION'];
    result.status = 'FAIL';
    result.operations.push({ operation, status: 'FAIL', httpStatus: client.readiness().httpStatus, code: allowed.includes(error.code) ? error.code : 'READ_ONLY_REQUEST_FAILED' });
  } finally {
    result.durationMs = Date.now() - started;
    result.hostname = new URL(config.bookingBaseUrl).hostname;
    lastProbe = { ...result, timestamp: new Date().toISOString() };
    client.bookingAgent?.destroy();
  }
  return result;
}

module.exports = { preflight, availabilityPayload, run, runAdminProbe, probeState };
