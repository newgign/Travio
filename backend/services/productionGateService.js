function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return String(raw).trim().toLowerCase() === "true";
}

function state() {
  const requested = {
    productionSales: boolEnv("PRODUCTION_SALES_ENABLED"),
    realCharges: boolEnv("REAL_CHARGES_ENABLED"),
    realRefunds: boolEnv("REAL_REFUNDS_ENABLED"),
  };

  return {
    enforcedSafeMode: true,
    productionSalesEnabled: false,
    realChargesEnabled: false,
    realRefundsEnabled: false,
    requested,
    ignoredLiveRequests: Object.values(requested).some(Boolean),
    message:
      "Sprint 3A hard safety gate: LIVE sales, real charges and real refunds remain disabled in code.",
  };
}

module.exports = { state };
