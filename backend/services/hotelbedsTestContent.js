const { HotelbedsClient } = require('../integrations/hotelbeds/client');
const limits = Object.freeze({ destinations: 1, destinationRows: 100, pages: 1, hotels: 20, requests: 2, timeoutMs: 12000, intervalMs: 1000, retries: 0 });
const blocked = code => Object.assign(new Error(code), { code, status: 409 });
// Reuse signing, queue, error redaction and HTTP implementation. This instance
// cannot perform even Booking-channel reads; the public provider never uses it.
class ContentClient extends HotelbedsClient {
  assertReadOnlyOperation({ channel, method = 'GET', url }) {
    if (this.config.environment !== 'test' || !this.config.stagingTestAllowed ||
        channel !== 'content' || method !== 'GET' || !['/hotel-content-api/1.0/hotels', '/hotel-content-api/1.0/locations/destinations'].includes(url) ||
        this.config.contentBaseUrl !== 'https://api.test.hotelbeds.com') throw blocked('CONTENT_OPERATION_BLOCKED');
  }
}
function selection(env = process.env) {
  const destinationCode = env.HOTELBEDS_TEST_CONTENT_DESTINATION || '';
  const countryCode = env.HOTELBEDS_TEST_CONTENT_COUNTRY || '';
  const from = Number(env.HOTELBEDS_TEST_CONTENT_FROM || 1);
  const count = Number(env.HOTELBEDS_TEST_CONTENT_COUNT || 1);
  if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z0-9]{2,10}$/.test(destinationCode) || !Number.isInteger(from) || from < 1 || from > 100 ||
      !Number.isInteger(count) || count < 1 || count > limits.hotels) throw blocked('CONTENT_SCOPE_BLOCKED');
  return { countryCode, destinationCode, from, to: from + count - 1, count };
}
let running = false;
let lastAttempt = 0;
async function run({ env = process.env, client, repository, pool } = {}) {
  const scope = selection(env);
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
    const recent = await db.query("SELECT last_run FROM provider_job_state WHERE job='test_content_import' AND environment='test'");
    if (recent.rows[0]?.last_run && Date.now() - new Date(recent.rows[0].last_run).getTime() < 60000) throw blocked('CONTENT_BUSY_OR_COOLDOWN');
    await db.query("INSERT INTO provider_job_state(job,environment,last_run) VALUES('test_content_import','test',NOW()) ON CONFLICT(job,environment) DO UPDATE SET last_run=NOW()");
    lastAttempt = Date.now(); attempted = true;
    const locations = await client.contentDestinations({ countryCodes: scope.countryCode, fields: 'all', language: 'ENG', from: 1, to: limits.destinationRows });
    if (!Array.isArray(locations?.destinations) || locations.destinations.length > limits.destinationRows) throw blocked('CONTENT_RESPONSE_INVALID');
    const destination = locations.destinations.find(row => row.code === scope.destinationCode && row.countryCode === scope.countryCode);
    if (!destination) throw blocked('CONTENT_DESTINATION_NOT_IN_PAGE');
    const response = await client.contentHotels({ destinationCode: scope.destinationCode, fields: 'all', language: 'ENG', from: scope.from, to: scope.to });
    if (!Array.isArray(response?.hotels) || response.hotels.length > scope.count) throw blocked('CONTENT_RESPONSE_INVALID');
    const mapper = require('./hotelbedsContentMapper');
    const hotels = response.hotels.map(raw => {
      if (String(raw.destinationCode) !== scope.destinationCode || raw.countryCode !== scope.countryCode || !/^\d+$/.test(String(raw.code)) || !mapper.text(raw.name)) throw blocked('CONTENT_RESPONSE_INVALID');
      return mapper.mapHotel(raw);
    });
    await db.query('BEGIN');
    await repository.upsertDestination(mapper.mapDestination(destination), db);
    for (const hotel of hotels) {
      await repository.upsertHotel(hotel, db);
    }
    const result = { status: hotels.length ? 'PASS' : 'EMPTY', environment: 'test', upsertedHotels: hotels.length, requests: 2 };
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
module.exports = { limits, selection, run, ContentClient };
