const crypto = require("crypto");
const pool = require("../db");
const config = require("../config/providers");
const offerTokenService = require("./offerTokenService");

function priceEnvironment() {
  return config.hotelbeds.configurationErrors.length ? 'unknown' : config.hotelbeds.environment;
}

// Conservative exact-rate identity: changing rateKeys are NOT assumed equivalent.
// This may miss a discount, but never compares different rate identities.
function fingerprint(offer) {
  const required = ["providerHotelId", "destinationCode", "checkIn", "checkOut", "roomCode", "boardCode", "currency", "rateKey", "priceSource"];
  if (offer.provider !== "hotelbeds" || required.some(key => !offer[key]) ||
      !(Number(offer.nights) > 0) || !(Number(offer.adults) > 0) ||
      offer.occupancy?.rooms !== 1 || offer.occupancy?.adults !== Number(offer.adults) ||
      offer.occupancy?.children !== Number(offer.children) ||
      (Number(offer.children) > 0 && !offer.childrenAges) ||
      !Number.isFinite(Number(offer.price)) || Number(offer.price) <= 0) return null;
  return crypto.createHash("sha256").update(JSON.stringify({
    version: 2, environment: offer.priceEnvironment || priceEnvironment(), provider: offer.provider,
    hotel: String(offer.providerHotelId), destination: offer.destinationCode,
    checkIn: offer.checkIn, checkOut: offer.checkOut, nights: Number(offer.nights),
    room: offer.roomName, roomCode: offer.roomCode, board: offer.boardCode,
    occupancy: offer.occupancy, adults: Number(offer.adults), children: Number(offer.children),
    childrenAges: String(offer.childrenAges || ""), currency: offer.currency,
    rateKey: offer.rateKey, priceSource: offer.priceSource, rateClass: offer.rateClass,
    taxes: offer.taxes, fees: offer.fees,
    paymentType: offer.paymentType, packaging: offer.packaging,
    cancellationPolicies: offer.cancellationPolicies,
  })).digest("hex");
}
function discount(originalPrice, currentPrice) {
  const old = Math.round(Number(originalPrice) * 100);
  const current = Math.round(Number(currentPrice) * 100);
  if (!(old > current && current > 0)) return null;
  const percent = Math.round((old - current) / old * 100);
  if (percent < 1) return null;
  return { originalPrice: old / 100, saving: (old - current) / 100, discountPercent: percent };
}
async function record(offers) {
  const environment = priceEnvironment();
  if (environment === "unknown") return;
  const observations = offers.map(offer => {
    const key = fingerprint(offer);
    if (!key || offer.priceEnvironment !== environment) return null;
    const { offerToken, ...snapshot } = offer;
    void offerToken;
    return { fingerprint: key, environment, price: Number(offer.price), currency: offer.currency, snapshot };
  }).filter(Boolean);
  if (!observations.length) return;
  // One statement; failures are isolated by the search service.
  await pool.query(`
    INSERT INTO price_history (offer_fingerprint, environment, price, currency, offer_snapshot)
    SELECT fingerprint, environment, price, currency, snapshot
    FROM jsonb_to_recordset($1::jsonb) AS x(fingerprint text, environment text, price numeric, currency text, snapshot jsonb)
    WHERE NOT EXISTS (SELECT 1 FROM price_history p WHERE p.offer_fingerprint = x.fingerprint
      AND p.environment = x.environment AND p.price = x.price AND p.observed_at > NOW() - INTERVAL '1 minute')
  `, [JSON.stringify(observations)]);
}
async function specials() {
  // TEST observations must never become public special offers.
  if (require("../integrations/hotelbeds/client").readiness().lastErrorCategory) return [];
  const threshold = Number(process.env.HOT_DEAL_MIN_DISCOUNT_PERCENT);
  if (!(threshold > 0 && threshold <= 100) || priceEnvironment() !== "live" || !config.hotelbeds.enabled) return [];
  const result = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (offer_fingerprint) *
      FROM price_history WHERE environment = 'live' AND provider = 'hotelbeds'
        AND offer_snapshot->>'priceEnvironment' = 'live'
        AND observed_at >= NOW() - INTERVAL '15 minutes'
      ORDER BY offer_fingerprint, observed_at DESC, id DESC
    )
    SELECT current.*, previous.price AS original_price, previous.observed_at AS original_observed_at
    FROM latest current
    JOIN LATERAL (
      SELECT price, observed_at FROM price_history old
      WHERE old.offer_fingerprint = current.offer_fingerprint
        AND old.environment = 'live'
        AND old.observed_at < current.observed_at
        AND old.observed_at >= current.observed_at - INTERVAL '30 days'
        AND old.price <> current.price
      ORDER BY old.observed_at DESC, old.id DESC LIMIT 1
    ) previous ON previous.price > current.price
    WHERE (current.offer_snapshot->>'checkIn')::date >= CURRENT_DATE
    ORDER BY current.observed_at DESC LIMIT 20
  `);
  return result.rows.map(row => {
    const evidence = discount(row.original_price, row.price);
    if (!evidence || evidence.discountPercent < threshold) return null;
    const offer = { ...row.offer_snapshot, priceEnvironment: "live", price: Number(row.price),
      discountEvidence: { source: "price_history", ...evidence, originalObservedAt: row.original_observed_at, observedAt: row.observed_at } };
    return { ...offer, offerToken: offerTokenService.sign(offer) };
  }).filter(Boolean).sort((a, b) => b.discountEvidence.discountPercent - a.discountEvidence.discountPercent).slice(0, 3);
}
module.exports = { fingerprint, discount, record, specials, priceEnvironment };
