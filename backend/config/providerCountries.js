const COUNTRIES = {
  EG: {
    code: "EG",
    ru: "Египет",
    searchTerms: ["sharm", "hurghada"],
  },
  TR: {
    code: "TR",
    ru: "Турция",
    searchTerms: ["antalya", "belek"],
  },
  AE: {
    code: "AE",
    ru: "ОАЭ",
    searchTerms: ["dubai", "abu dhabi"],
  },
  TH: {
    code: "TH",
    ru: "Таиланд",
    searchTerms: ["phuket", "pattaya"],
  },
};

const COUNTRY_NAME_TO_CODE = Object.values(COUNTRIES).reduce((acc, item) => {
  acc[item.ru.toLowerCase()] = item.code;
  acc[item.code.toLowerCase()] = item.code;
  return acc;
}, {});

function getCountryCode(value) {
  const key = String(value || "").trim().toLowerCase();
  return COUNTRY_NAME_TO_CODE[key] || String(value || "").trim().toUpperCase();
}

function getCountryName(code) {
  return COUNTRIES[String(code || "").trim().toUpperCase()]?.ru || String(code || "").trim();
}

function getCountryConfig(code) {
  return COUNTRIES[String(code || "").trim().toUpperCase()] || null;
}

module.exports = {
  COUNTRIES,
  getCountryCode,
  getCountryName,
  getCountryConfig,
};
