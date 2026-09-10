const crypto = require('crypto');
const pool = require('../db');
const config = require('../config/providers').hotelbeds;
const provider = require('../sources/hotelbeds');
const history = require('./priceHistoryService');
const offers = require('./offerService');
const logger = require('../utils/logger');
let timer;
let contentTimer;
let running = false;
function settings() {
  return { enabled: process.env.HOT_DEALS_MONITOR_ENABLED === 'true',
    interval: Math.max(Number(process.env.HOT_DEALS_MONITOR_INTERVAL_MS) || 900000, 60000),
    limit: Math.min(Math.max(Number(process.env.HOT_DEALS_MONITOR_MAX_SEARCHES) || 5, 1), 20) };
}
async function track(offer) {
  if (offer.provider !== 'hotelbeds' || offer.priceEnvironment !== 'live') return;
  const filters = { hotelCodes: [offer.providerHotelId], checkIn: offer.checkIn, checkOut: offer.checkOut,
    nights: offer.nights, adults: offer.adults, children: offer.children, childrenAges: offer.childrenAges,
    food: offer.boardCode, roomType: offer.roomCode, country: offer.country, city: offer.city };
  const key = crypto.createHash('sha256').update(JSON.stringify(filters)).digest('hex');
  await pool.query(`INSERT INTO hotelbeds_tracked_searches(fingerprint, environment, filters)
    VALUES($1, 'live', $2::jsonb) ON CONFLICT(fingerprint) DO UPDATE SET last_viewed_at = NOW()`, [key, JSON.stringify(filters)]);
}
async function run() {
  if (running || !settings().enabled || config.environment !== 'live') return;
  running = true;
  let client;
  let locked = false;
  try {
    client = await pool.connect();
    locked = (await client.query('SELECT pg_try_advisory_lock(319001) AS locked')).rows[0].locked;
    if (!locked) return;
    const state = await client.query("SELECT last_run FROM provider_job_state WHERE job='price_monitor' AND environment='live'");
    if (state.rows[0]?.last_run && Date.now() - new Date(state.rows[0].last_run).getTime() < settings().interval) return;
    await client.query(`INSERT INTO provider_job_state(job,environment,last_run) VALUES('price_monitor','live',NOW())
      ON CONFLICT(job,environment) DO UPDATE SET last_run=NOW()`);
    const tracked = await client.query(`SELECT filters FROM hotelbeds_tracked_searches WHERE environment='live'
      AND last_viewed_at > NOW() - INTERVAL '7 days' AND (filters->>'checkIn')::date >= CURRENT_DATE
      ORDER BY last_viewed_at DESC LIMIT $1`, [settings().limit]);
    let count = 0;
    for (const { filters } of tracked.rows) {
      const hotels = await provider.searchHotels(filters);
      await history.record(hotels.map(hotel => offers.generateOffer(hotel, filters)));
      count += hotels.length;
    }
    await client.query(`UPDATE provider_job_state SET last_success=NOW(), last_error_category=NULL, details=$1::jsonb
      WHERE job='price_monitor' AND environment='live'`, [JSON.stringify({ searches: tracked.rows.length, offers: count })]);
  } catch (error) {
    logger.warn('Price monitor failed', { code: error.code || 'MONITOR_FAILED' });
    if (client && locked) await client.query("UPDATE provider_job_state SET last_error_category=$1 WHERE job='price_monitor' AND environment='live'", [error.code || 'MONITOR_FAILED']).catch(() => {});
  } finally {
    if (client) { if (locked) await client.query('SELECT pg_advisory_unlock(319001)').catch(() => {}); client.release(); }
    running = false;
  }
}
function start() {
  if (!contentTimer && process.env.HOTELBEDS_CONTENT_SYNC_ENABLED === "true") {
    contentTimer = setInterval(() => require("./hotelbedsCatalogService").sync({ scheduled: true }).catch(error => logger.warn("Content sync failed", { code: error.code || "SYNC_FAILED" })), 86400000);
    contentTimer.unref?.();
  }
  if (timer || !settings().enabled) return;
  timer = setInterval(run, settings().interval); timer.unref?.();
}
function stop() { clearInterval(timer); clearInterval(contentTimer); timer = null; contentTimer = null; }
module.exports = { settings, track, run, start, stop };
