const assert = require('node:assert/strict');
const pool = require('../db');
const config = require('../config/providers');
const history = require('../services/priceHistoryService');

(async () => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalUrl = config.hotelbeds.environment;
  process.env.HOT_DEAL_MIN_DISCOUNT_PERCENT = '5';
  const originalEnabled = config.hotelbeds.enabled;
  try {
    await client.query('BEGIN');
    // A transaction-local table shadows the real history. Test prices never enter public.price_history.
    await client.query('CREATE TEMP TABLE price_history (LIKE public.price_history INCLUDING ALL) ON COMMIT DROP');
    pool.query = client.query.bind(client);
    config.hotelbeds.environment = 'live';
    config.hotelbeds.enabled = true;
    const offer = { provider: 'hotelbeds', priceEnvironment: 'live', providerHotelId: 'test-only', destinationCode: 'AYT',
      checkIn: '2030-09-10', checkOut: '2030-09-17', nights: 7, roomName: 'Standard',
      roomCode: 'DBL.ST', boardCode: 'BB', adults: 2, children: 0,
      occupancy: { rooms: 1, adults: 2, children: 0 }, currency: 'EUR', rateKey: 'test-only', priceSource: 'net', price: 100 };
    await history.record([offer]);
    assert.equal((await history.specials()).length, 0);
    await client.query("UPDATE price_history SET observed_at = NOW() - INTERVAL '10 minutes'");
    await history.record([{ ...offer, price: 80 }]);
    const specials = await history.specials();
    assert.equal(specials.length, 1);
    assert.equal(specials[0].discountEvidence.originalPrice, 100);
    assert.equal(specials[0].discountEvidence.discountPercent, 20);
    assert.equal(specials[0].discountEvidence.saving, 20);
    await history.record([{ ...offer, price: 110 }]);
    assert.equal((await history.specials()).length, 0);
    config.hotelbeds.environment = 'test';
    assert.equal((await history.specials()).length, 0);
    await client.query('CREATE TEMP TABLE checkout_sessions (LIKE public.checkout_sessions INCLUDING ALL) ON COMMIT DROP');
    const sessions = require('../services/checkoutSessionService');
    const checkout = await sessions.create({offer:{...offer, priceEnvironment:'test', offerId:'offline-session'}});
    const locked = await sessions.lockForBooking(client, checkout.token);
    assert.equal(locked.provider, 'hotelbeds');
    await sessions.markUsed(client, checkout.token);
    await assert.rejects(sessions.lockForBooking(client, checkout.token), {code:'CHECKOUT_SESSION_USED'});
    process.stdout.write('PASS: checkout token consumption is enforced by PostgreSQL; repeated booking rejected\n');
    process.stdout.write('PASS: PostgreSQL recording, actual prior observation selection, discount, price rise, TEST isolation; fixtures rolled back\n');
  } finally {
    pool.query = originalQuery;
    config.hotelbeds.environment = originalUrl;
    config.hotelbeds.enabled = originalEnabled;
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
