const pricing = require('./hotelbedsPriceService');

const compareText = (a, b) => String(a ?? '') < String(b ?? '') ? -1 : String(a ?? '') > String(b ?? '') ? 1 : 0;
const normalizedCode = value => String(value ?? '').trim().toUpperCase();
function compareIdentity(a, b) {
  for (const field of ['roomCode', 'boardCode', 'rateType']) {
    const result = compareText(normalizedCode(a[field]), normalizedCode(b[field]));
    if (result) return result;
  }
  // Private comparison only: never add rate identity to labels or URLs.
  return compareText(a.rateKey, b.rateKey);
}
function compareOffers(a, b) {
  // Different currencies are not comparable prices; group them deterministically.
  return compareText(a.currency, b.currency) || a.price - b.price || compareIdentity(a, b);
}
function selectBestDisplayRate(candidates, currency) {
  return candidates.map(({room, rate}, index) => ({room, rate, index,
    money: pricing.extract(rate, currency || rate.currency),
  })).filter(item => item.money && item.rate.rateKey)
    .sort((a, b) => compareOffers(
      {...a.money, ...a.rate, price:a.money.price, currency:a.money.currency, roomCode:a.room.code},
      {...b.money, ...b.rate, price:b.money.price, currency:b.money.currency, roomCode:b.room.code}
    ) || a.index - b.index)[0] || null;
}
const MAX_CANDIDATES_PER_HOTEL = 256;
const MAX_CANDIDATES_PER_RESPONSE = 4096;
function candidateGroup(offer) {
  const roomText = String(offer.roomName || offer.roomType || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return JSON.stringify([offer.currency, offer.boardCode ?? null, offer.roomCode ?? null, roomText, offer.rateType ?? null]);
}
function candidateLimitError() {
  const error = new Error('Слишком много вариантов размещения. Уточните параметры поиска.');
  error.code = 'TEST_CANDIDATE_LIMIT_EXCEEDED';
  error.status = 422;
  return error;
}
function* normalizationInputs(hotel, retainCandidates) {
  if (!retainCandidates) { yield hotel; return; }
  for (const room of hotel.rooms || []) for (const rate of room.rates || []) {
    yield {...hotel, rooms:[{...room, rates:[rate]}]};
  }
}
function normalizeHotelOffers(hotels, normalize, environment, retainCandidates=false) {
  const unique = new Map();
  let candidateCount = 0;
  for (const hotel of hotels) {
    for (const input of normalizationInputs(hotel, retainCandidates)) {
      const offer = normalize(input);
      if (!offer) continue;
      const identity = JSON.stringify(['hotelbeds', environment, String(offer.providerHotelId)]);
      if (!unique.has(identity)) unique.set(identity, new Map());
      const groups = unique.get(identity);
      const key = retainCandidates ? candidateGroup(offer) : 'default';
      const previous = groups.get(key);
      if (!previous) {
        candidateCount++;
        if (retainCandidates && (groups.size >= MAX_CANDIDATES_PER_HOTEL || candidateCount > MAX_CANDIDATES_PER_RESPONSE)) throw candidateLimitError();
      }
      if (!previous || compareOffers(offer, previous) < 0) groups.set(key, offer);
    }
  }
  return [...unique.values()].map(groups => {
    const candidates = [...groups.values()];
    candidates.sort(compareOffers);
    return retainCandidates ? {...candidates[0],candidateHotels:candidates} : candidates[0];
  });
}
function normalizeStars(value) {
  if (value == null || value === '') return null;
  const stars = Number(value);
  return Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;
}
module.exports = { selectBestDisplayRate, normalizeHotelOffers, normalizeStars, MAX_CANDIDATES_PER_HOTEL, MAX_CANDIDATES_PER_RESPONSE };
