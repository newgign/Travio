const { HotelbedsClient } = require('../integrations/hotelbeds/client');
const limits = Object.freeze({ destinations: 1, destinationRows: 100, destinationWindows: 2, pages: 1, hotels: 20, requests: 3, timeoutMs: 12000, intervalMs: 1000, retries: 0 });
const blocked = code => Object.assign(new Error(code), { code, status: 409 });
function batchPlan(currentCount) {
  if (!Number.isInteger(currentCount) || currentCount < 0) throw blocked('CONTENT_COUNT_INVALID');
  const complete = currentCount >= 20;
  const count = complete ? 0 : Math.min(10, 20 - currentCount);
  return { currentCount, maximum:20, complete, next:complete ? null : {from:currentCount+1,count,to:currentCount+count} };
}
const catalogIds = db => async destinationCode => (await db.query("SELECT provider_hotel_id FROM provider_hotels WHERE provider='hotelbeds' AND content_environment='test' AND destination_code=$1",[destinationCode])).rows.map(row=>String(row.provider_hotel_id));
// Reuse signing, queue, error redaction and HTTP implementation. This instance
// cannot perform even Booking-channel reads; the public provider never uses it.
class ContentClient extends HotelbedsClient {
  assertReadOnlyOperation({ channel, method = 'GET', url }) {
    if (this.config.environment !== 'test' || !this.config.stagingTestAllowed ||
        channel !== 'content' || method !== 'GET' || !['/hotel-content-api/1.0/hotels', '/hotel-content-api/1.0/locations/destinations'].includes(url) ||
        this.config.contentBaseUrl !== 'https://api.test.hotelbeds.com') throw blocked('CONTENT_OPERATION_BLOCKED');
  }
}
function legacySelection(env = process.env) {
  const destinationCode = env.HOTELBEDS_TEST_CONTENT_DESTINATION || '';
  const countryCode = env.HOTELBEDS_TEST_CONTENT_COUNTRY || '';
  const from = Number(env.HOTELBEDS_TEST_CONTENT_FROM || 1);
  const count = Number(env.HOTELBEDS_TEST_CONTENT_COUNT || 1);
  if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z0-9]{2,10}$/.test(destinationCode) || !Number.isInteger(from) || from < 1 || from > 100 ||
      !Number.isInteger(count) || count < 1 || count > limits.hotels) throw blocked('CONTENT_SCOPE_BLOCKED');
  return { countryCode, destinationCode, from, to: from + count - 1, count };
}
function scopes(env = process.env) {
  if (env.HOTELBEDS_TEST_CONTENT_SCOPES === undefined || env.HOTELBEDS_TEST_CONTENT_SCOPES === '') {
    const scope = legacySelection(env);
    return [{ ...scope, id: `${scope.countryCode}:${scope.destinationCode}` }];
  }
  const pairs = env.HOTELBEDS_TEST_CONTENT_SCOPES.split(',').map(value => value.trim());
  if (pairs.length > 5 || !pairs.length || pairs.some(value => !/^[A-Z]{2}:[A-Z0-9]{2,10}$/.test(value)) || new Set(pairs.map(value => value.split(':')[1])).size !== pairs.length) throw blocked('CONTENT_SCOPE_BLOCKED');
  return pairs.map(id => {
    const [country, destination] = id.split(':');
    return { ...legacySelection({...env,HOTELBEDS_TEST_CONTENT_COUNTRY:country,HOTELBEDS_TEST_CONTENT_DESTINATION:destination}), id };
  });
}
function selection(env = process.env, scopeId) {
  const allowed = scopes(env);
  const scope = scopeId === undefined && allowed.length === 1 ? allowed[0] : allowed.find(value => value.id === scopeId);
  if (!scope) throw blocked('CONTENT_SCOPE_BLOCKED');
  return scope;
}
let running = false;
let lastAttempt = 0;
async function run({ env = process.env, scopeId, action, client, repository, pool } = {}) {
  let scope = selection(env, scopeId);
  if (action !== undefined && action !== 'next') throw blocked('CONTENT_SCOPE_BLOCKED');
  const readiness = require('./hotelbedsLiveReadOnlyService').preflight(env, undefined, 'test', false);
  if (readiness.blockers.length) throw blocked('CONTENT_CONFIGURATION_BLOCKED');
  if (running || Date.now() - lastAttempt < 60000) throw blocked('CONTENT_BUSY_OR_COOLDOWN');
  const config = require('../config/hotelbeds').buildConfig(env);
  client ||= new ContentClient({ ...config, maxRetries: 0, requestIntervalMs: limits.intervalMs, timeout: limits.timeoutMs });
  repository ||= require('../repositories/providerCatalogRepository');
  pool ||= require('../db');
  running = true;
  let db;
  let locked = false;
  let attempted = false;
  try {
    db = await pool.connect();
    locked = (await db.query('SELECT pg_try_advisory_lock(319030) AS locked')).rows[0].locked;
    if (!locked) throw blocked('CONTENT_BUSY_OR_COOLDOWN');
    const plan = batchPlan((await catalogIds(db)(scope.destinationCode)).length);
    if (plan.complete) throw blocked('CONTENT_IMPORT_COMPLETE');
    if (action === 'next') scope = {...scope,...plan.next};
    const recent = await db.query("SELECT last_run FROM provider_job_state WHERE job='test_content_import' AND environment='test'");
    if (recent.rows[0]?.last_run && Date.now() - new Date(recent.rows[0].last_run).getTime() < 60000) throw blocked('CONTENT_BUSY_OR_COOLDOWN');
    await db.query("INSERT INTO provider_job_state(job,environment,last_run) VALUES('test_content_import','test',NOW()) ON CONFLICT(job,environment) DO UPDATE SET last_run=NOW()");
    lastAttempt = Date.now(); attempted = true;
    let destination;
    let metadataRequests = 0;
    for (let window = 0; window < limits.destinationWindows && !destination; window++) {
      metadataRequests++;
      const locations = await client.contentDestinations({ countryCodes: scope.countryCode, fields: 'all', language: 'ENG', from: window * limits.destinationRows + 1, to: (window + 1) * limits.destinationRows });
      if (!Array.isArray(locations?.destinations) || locations.destinations.length > limits.destinationRows) throw blocked('CONTENT_RESPONSE_INVALID');
      destination = locations.destinations.find(row => row.code === scope.destinationCode && row.countryCode === scope.countryCode);
    }
    if (!destination) throw blocked('CONTENT_DESTINATION_NOT_IN_PAGE');
    const response = await client.contentHotels({ destinationCode: scope.destinationCode, fields: 'all', language: 'ENG', from: scope.from, to: scope.to });
    if (!Array.isArray(response?.hotels) || response.hotels.length > scope.count) throw blocked('CONTENT_RESPONSE_INVALID');
    const mapper = require('./hotelbedsContentMapper');
    const hotels = response.hotels.map(raw => {
      if (String(raw.destinationCode) !== scope.destinationCode || raw.countryCode !== scope.countryCode || !/^\d+$/.test(String(raw.code)) || !mapper.text(raw.name)) throw blocked('CONTENT_RESPONSE_INVALID');
      return mapper.mapHotel(raw);
    });
    await db.query('BEGIN');
    // Serialize the final union check with other catalog writers as well.
    await db.query('LOCK TABLE provider_hotels IN SHARE ROW EXCLUSIVE MODE');
    const existingIds = await catalogIds(db)(scope.destinationCode);
    if (new Set([...existingIds,...hotels.map(hotel=>String(hotel.providerHotelId))]).size > 20) throw blocked('CONTENT_CATALOG_LIMIT');
    const previousDestination = await db.query("SELECT country_code FROM provider_destinations WHERE provider='hotelbeds' AND content_environment='test' AND code=$1 FOR UPDATE",[scope.destinationCode]);
    if (previousDestination.rows.some(row => row.country_code && row.country_code !== scope.countryCode)) throw blocked('CONTENT_IDENTITY_CONFLICT');
    await repository.upsertDestination(mapper.mapDestination(destination), db);
    for (const hotel of hotels) {
      const previous = await db.query("SELECT destination_code,country_code FROM provider_hotels WHERE provider='hotelbeds' AND content_environment='test' AND provider_hotel_id=$1 FOR UPDATE",[hotel.providerHotelId]);
      if (previous.rows.some(row => row.destination_code !== scope.destinationCode || row.country_code !== scope.countryCode)) throw blocked('CONTENT_IDENTITY_CONFLICT');
      await repository.upsertHotel(hotel, db);
    }
    const result = { status: hotels.length ? 'PASS' : 'EMPTY', environment: 'test', scopeId: scope.id, from:scope.from, count:scope.count, upsertedHotels: hotels.length, requests: metadataRequests + 1 };
    await db.query("UPDATE provider_job_state SET last_success=NOW(),last_error_category=NULL,details=$1::jsonb WHERE job='test_content_import' AND environment='test'", [JSON.stringify(result)]);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    if (db) await db.query('ROLLBACK').catch(() => {});
    if (attempted) await db.query("UPDATE provider_job_state SET last_error_category='CONTENT_IMPORT_FAILED' WHERE job='test_content_import' AND environment='test'").catch(() => {});
    throw blocked('CONTENT_IMPORT_FAILED');
  } finally {
    if (locked) await db.query('SELECT pg_advisory_unlock(319030)').catch(() => {});
    db?.release(); running = false;
  }
}
module.exports = { limits: {...limits, configuredDestinations:5, catalogHotels:20, nextBatchHotels:10}, batchPlan, scopes, selection, run, ContentClient };
