// No FX provider is configured. Preserve the supplier amount and currency.
function quote(amount, currency, targetCurrency = currency) {
  if (!(Number(amount) > 0) || !/^[A-Z]{3}$/.test(String(currency))) throw new Error('Invalid provider money');
  if (targetCurrency !== currency) throw Object.assign(new Error('Currency conversion is unavailable'), { code: 'FX_NOT_CONFIGURED', status: 503 });
  return { providerAmount: Number(amount), providerCurrency: currency, displayAmount: Number(amount), displayCurrency: currency,
    fxRate: null, fxRateTimestamp: null, fxSource: null };
}
module.exports = { quote };
