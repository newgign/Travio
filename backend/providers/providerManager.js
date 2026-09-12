const config = require("../config/providers");
const mock = require("../sources/mock");
const hotelbeds = require("../sources/hotelbeds");

class ProviderManager {
  constructor() {
    this.providers = {};

    this.register("mock", mock);

    if (config.hotelbeds.enabled) {
      this.register("hotelbeds", hotelbeds);
    }
  }

  register(name, provider) {
    if (!name || !provider) {
      throw new Error("Provider name and implementation are required");
    }

    this.providers[name] = provider;
  }

  getProvider(name = config.activeProvider) {
    if (process.env.NODE_ENV === "production" &&
        (name !== "hotelbeds" || (config.hotelbeds.environment !== "live" && !config.hotelbeds.stagingTestAllowed) || config.hotelbeds.configurationErrors.length > 0)) {
      const error = new Error("Поиск предложений временно недоступен.");
      error.status = 503;
      error.code = "PRODUCTION_PROVIDER_REQUIRED";
      throw error;
    }
    const provider = this.providers[name];

    if (!provider) {
      const enabled = this.getProviders().join(", ") || "none";
      const error = new Error(
        `Provider "${name}" not found. Enabled providers: ${enabled}`
      );
      error.status = 400;
      error.code = "PROVIDER_NOT_AVAILABLE";
      throw error;
    }

    return provider;
  }

  getProviders() {
    return Object.keys(this.providers);
  }
}

module.exports = new ProviderManager();
