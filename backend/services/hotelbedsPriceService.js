const currencyService = require('./currencyService');
function extract(rate = {}, currency) {
  // sellingRate includes commission and is mandatory when hotelMandatory=true.
  // hotelSellingRate belongs to hotelCurrency and must not be relabelled.
  const source = rate.sellingRate != null ? 'sellingRate' : 'net';
  if ((rate.hotelMandatory === true || rate.commission != null) && source !== 'sellingRate') return null;
  const raw = rate[source];
  if (!['number', 'string'].includes(typeof raw) || (typeof raw === 'string' && !/^\d+(\.\d+)?$/.test(raw.trim()))) return null;
  const amount = Number(raw);
  if (!(amount > 0) || !Number.isFinite(amount) || !/^[A-Z]{3}$/.test(String(currency))) return null;
  return { ...currencyService.quote(amount, currency), price: amount, basePrice: amount, displayedPrice: amount,
    priceSource: source, currency, priceBasis: 'stay',
    providerNet: rate.net == null ? null : Number(rate.net),
    hotelSellingRate: rate.hotelSellingRate ?? null, hotelCurrency: rate.hotelCurrency ?? null,
    taxes: rate.taxes || null, fees: rate.fees || null,
    commission: rate.commission ?? null, rateClass: rate.rateClass || null,
    taxBreakdownAvailable: Boolean(rate.taxes),
  };
}
module.exports = { extract };
