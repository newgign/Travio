function boolEnv(name, fallback = false, env = process.env) {
  const raw = env[name];
  if (raw === undefined) return fallback;
  return String(raw).trim().toLowerCase() === "true";
}

// Configuration can request capabilities, never assert transaction evidence. No live capability
// is registered in this repository. Partial/pretend activation is an explicit failed gate.
function paymentActivation(env = process.env) {
  const enabled = name => String(env[name] || '').trim().toLowerCase() === 'true';
  const mode = String(env.PAYMENTS_MODE || 'disabled').trim().toLowerCase();
  const provider = String(env.PAYMENTS_PROVIDER || 'none').trim().toLowerCase();
  const requested = ['PRODUCTION_SALES_ENABLED', 'REAL_CHARGES_ENABLED', 'REAL_REFUNDS_ENABLED',
    'PAYMENT_EVIDENCE_VERIFIED'].some(enabled) || !['disabled', 'sandbox'].includes(mode)
    || !['none', 'sandbox'].includes(provider);
  const capability = require('./paymentEvidenceBoundary').capabilities;
  return { status: requested ? 'FAIL' : 'PASS', activationAllowed: false,
    reasonCode: requested ? 'LIVE_PAYMENT_CAPABILITY_UNAVAILABLE' : 'PAYMENTS_DISABLED_SAFE',
    liveEvidenceCapability: Object.values(capability).every(value => value === true) };
}

function state(env = process.env) {
  const requested = {
    productionSales: boolEnv("PRODUCTION_SALES_ENABLED", false, env),
    realCharges: boolEnv("REAL_CHARGES_ENABLED", false, env),
    realRefunds: boolEnv("REAL_REFUNDS_ENABLED", false, env),
  };

  return {
    enforcedSafeMode: true,
    productionSalesEnabled: false,
    realChargesEnabled: false,
    realRefundsEnabled: false,
    requested,
    ignoredLiveRequests: Object.values(requested).some(Boolean),
    paymentActivation: paymentActivation(env),
    message:
      "Sprint 3A hard safety gate: LIVE sales, real charges and real refunds remain disabled in code.",
  };
}

module.exports = { state };
