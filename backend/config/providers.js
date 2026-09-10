require("dotenv").config();



module.exports = {
  activeProvider: process.env.ACTIVE_PROVIDER || "mock",

  google: {
    enabled: process.env.GOOGLE_ENABLED === "true",
    apiKey: process.env.GOOGLE_API_KEY || "",
  },

  foursquare: {
    enabled: process.env.FOURSQUARE_ENABLED === "true",
    apiKey: process.env.FOURSQUARE_API_KEY || "",
  },

  geoapify: {
    enabled: process.env.GEOAPIFY_ENABLED === "true",
    apiKey: process.env.GEOAPIFY_API_KEY || "",
  },

  hotelbeds: require("./hotelbeds").buildConfig(),
};
