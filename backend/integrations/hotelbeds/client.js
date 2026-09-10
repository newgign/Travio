const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const axios = require("axios");

const config = require("../../config/providers");

class HotelbedsClient {
  constructor() {
    this.config = config.hotelbeds;

    this.bookingHttp = axios.create({
      baseURL: this.config.bookingBaseUrl,
      timeout: this.config.timeout,
      headers: this.defaultHeaders(),
    });

    this.contentHttp = axios.create({
      baseURL: this.config.contentBaseUrl,
      timeout: this.config.timeout,
      headers: this.defaultHeaders(),
    });

    this.bookingAgent = null;
    this.queue = Promise.resolve();
    this.pending = 0;
    this.lastRequestAt = 0;
    this.health = { providerReachable: false, lastSuccessfulRequest: null, lastErrorCategory: null, httpStatus: null };
  }

  defaultHeaders() {
    return {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
    };
  }

  isConfigured() {
    return Boolean(this.config.apiKey && this.config.secret);
  }

  assertConfigured() {
    if (this.config.configurationErrors.length || (process.env.NODE_ENV === "production" && this.config.environment !== "live")) {
      throw Object.assign(new Error("Hotelbeds configuration is not ready"), { status: 503, code: "HOTELBEDS_INVALID_CONFIG" });
    }
    if (!this.config.enabled) {
      const error = new Error(
        "Hotelbeds provider выключен. Установите HOTELBEDS_ENABLED=true."
      );
      error.status = 503;
      error.code = "HOTELBEDS_DISABLED";
      throw error;
    }

    if (!this.isConfigured()) {
      const error = new Error(
        "Не заданы HOTELBEDS_API_KEY и HOTELBEDS_SECRET."
      );
      error.status = 503;
      error.code = "HOTELBEDS_NOT_CONFIGURED";
      throw error;
    }
  }

  assertBookingTransportConfigured() {
    this.assertConfigured();

    if (!/api-mtls\./i.test(this.config.bookingBaseUrl)) {
      const error = new Error(
        "Hotels Booking API должен использовать HBX mTLS endpoint (TEST: https://api-mtls.test.hotelbeds.com)."
      );
      error.status = 503;
      error.code = "HOTELBEDS_MTLS_ENDPOINT_REQUIRED";
      throw error;
    }

    if (!this.config.mtlsCertPath || !this.config.mtlsKeyPath) {
      const error = new Error(
        "Для Hotels Booking API задайте HOTELBEDS_MTLS_CERT_PATH и HOTELBEDS_MTLS_KEY_PATH."
      );
      error.status = 503;
      error.code = "HOTELBEDS_MTLS_NOT_CONFIGURED";
      throw error;
    }
  }

  getBookingAgent() {
    if (this.bookingAgent) {
      return this.bookingAgent;
    }

    this.assertBookingTransportConfigured();

    const certPath = String(this.config.mtlsCertPath).trim();
    const keyPath = String(this.config.mtlsKeyPath).trim();
    const keyPassphrase = String(this.config.mtlsKeyPassphrase || "");
    const caPath = String(this.config.mtlsCaPath || "").trim();

    try {
      this.bookingAgent = new https.Agent({
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ...(keyPassphrase ? { passphrase: keyPassphrase } : {}),
        ...(caPath ? { ca: fs.readFileSync(caPath) } : {}),
        keepAlive: true,
      });
    } catch (error) {
      const wrapped = new Error(
        `Не удалось прочитать Hotelbeds mTLS сертификат/ключ: ${error.message}`
      );
      wrapped.status = 503;
      wrapped.code = "HOTELBEDS_MTLS_FILES_UNREADABLE";
      throw wrapped;
    }

    return this.bookingAgent;
  }

  createSignature(timestamp = Math.floor(Date.now() / 1000)) {
    this.assertConfigured();

    return crypto
      .createHash("sha256")
      .update(`${this.config.apiKey}${this.config.secret}${timestamp}`)
      .digest("hex");
  }

  createHeaders() {
    const timestamp = Math.floor(Date.now() / 1000);

    return {
      "Api-key": this.config.apiKey,
      "X-Signature": this.createSignature(timestamp),
    };
  }

  readiness() {
    return { environment: this.config.environment, credentialsConfigured: this.isConfigured(),
      enabled: this.config.enabled, liveBookingEnabled: this.config.liveBookingEnabled,
      configurationErrors: this.config.configurationErrors, ...this.health,
      status: !this.health.providerReachable ? 'down' : this.health.lastErrorCategory ? 'degraded' : 'healthy',
      message: !this.isConfigured() && this.config.environment === 'live' ? 'Hotelbeds LIVE credentials are not configured.' : null };
  }

  assertLiveMutationAllowed() {
    if (this.config.environment !== 'live') return;
    if (!this.config.liveBookingEnabled || ['test', 'development'].includes(process.env.NODE_ENV) || process.env.NODE_TEST_CONTEXT) {
      throw Object.assign(new Error('Hotelbeds LIVE booking is disabled'), { status: 503, code: 'HOTELBEDS_LIVE_BOOKING_DISABLED' });
    }
    if (!require('../../services/productionGateService').state().productionSalesEnabled) {
      throw Object.assign(new Error('Real payment gateway is not connected'), { status: 503, code: 'HOTELBEDS_LIVE_BOOKING_BLOCKED_UNTIL_PAYMENT_GATEWAY' });
    }
  }

  async request(options) {
    this.assertConfigured();
    if (this.pending >= 100) throw Object.assign(new Error('Provider queue is full'), { status: 503, code: 'RATE_LIMIT' });
    // Never retry booking or cancellation, including timeouts with an unknown outcome.
    const mutation = options.method === 'DELETE' || (options.method === 'POST' && options.url === '/hotel-api/1.0/bookings');
    if (mutation) this.assertLiveMutationAllowed();
    this.pending += 1;
    const task = this.queue.then(async () => {
      try {
        for (let attempt = 0; ; attempt++) {
          await new Promise(resolve => setTimeout(resolve, Math.max(0, this.lastRequestAt + this.config.requestIntervalMs - Date.now())));
          this.lastRequestAt = Date.now();
          try { return await this.performRequest(options); }
          catch (error) {
            if (mutation || attempt >= this.config.maxRetries || !['RATE_LIMIT', 'TIMEOUT', 'PROVIDER_UNAVAILABLE'].includes(error.code)) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.min(30000, Math.max(error.retryAfterMs || 0, 1000 * 2 ** attempt))));
          }
        }
      } finally { this.pending -= 1; }
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async performRequest({ channel = 'booking', method = 'GET', url, data, params, timeout }) {
    const started = Date.now();
    const category = channel === 'content' ? 'content' : url.endsWith('/hotels') ? 'availability' : url.endsWith('/checkrates') ? 'checkrate' : url.endsWith('/status') ? 'status' : 'booking';
    const logger = require('../../utils/logger');
    try {
      const http = channel === 'booking' ? this.bookingHttp : this.contentHttp;
      const response = await http.request({ method, url, data, params, timeout: timeout || this.config.timeout,
        maxRedirects: 0, headers: this.createHeaders(), ...(channel === 'booking' ? { httpsAgent: this.getBookingAgent() } : {}) });
      if (response.data?.error) throw { response: { status: 502 } };
      this.health = { providerReachable: true, lastSuccessfulRequest: new Date().toISOString(), lastErrorCategory: null, httpStatus: response.status };
      logger.info('Hotelbeds request', { environment: this.config.environment, category, status: response.status, duration: Date.now() - started,
        hotelCount: response.data?.hotels?.hotels?.length });
      return response.data;
    } catch (error) {
      const status = Number(error.response?.status || error.status) || 502;
      const code = [401, 403].includes(status) ? 'AUTH_ERROR' : status === 429 ? 'RATE_LIMIT' :
        ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code) ? 'TIMEOUT' : status >= 500 ? 'PROVIDER_UNAVAILABLE' :
        category === 'checkrate' ? 'RATE_NOT_AVAILABLE' : category === 'booking' && method === 'DELETE' ? 'CANCELLATION_FAILED' :
        category === 'booking' && method === 'POST' ? 'BOOKING_REJECTED' : 'INVALID_REQUEST';
      this.health = { ...this.health, providerReachable: false, lastErrorCategory: code, httpStatus: status };
      logger.warn('Hotelbeds request failed', { environment: this.config.environment, category, status, duration: Date.now() - started, errorCategory: code });
      const wrapped = Object.assign(new Error('Предложение временно недоступно. Повторите поиск позже.'), { status: status >= 500 ? 503 : status === 429 ? 503 : 409, code, provider: 'hotelbeds' });
      const retryAfter = error.response?.headers?.['retry-after'];
      wrapped.retryAfterMs = Math.min(30000, Math.max(0, Number(retryAfter) * 1000 || Date.parse(retryAfter) - Date.now() || 0));
      if (code === "RATE_LIMIT") this.lastRequestAt = Date.now() + Math.max(wrapped.retryAfterMs, 1000);
      throw wrapped;
    }
  }

  status() {
    return this.request({
      channel: "booking",
      method: "GET",
      url: "/hotel-api/1.0/status",
    });
  }

  availability(payload) {
    return this.request({
      channel: "booking",
      method: "POST",
      url: "/hotel-api/1.0/hotels",
      data: payload,
    });
  }

  checkRates(rateKeys) {
    const keys = Array.isArray(rateKeys) ? rateKeys : [rateKeys];

    return this.request({
      channel: "booking",
      method: "POST",
      url: "/hotel-api/1.0/checkrates",
      data: {
        rooms: keys
          .filter(Boolean)
          .map((rateKey) => ({ rateKey: String(rateKey) })),
      },
    });
  }

  createBooking(payload) {
    return this.request({
      channel: "booking",
      method: "POST",
      url: "/hotel-api/1.0/bookings",
      data: payload,
      timeout: this.config.bookingTimeout,
    });
  }

  getBooking(reference) {
    return this.request({
      channel: "booking",
      method: "GET",
      url: `/hotel-api/1.0/bookings/${encodeURIComponent(reference)}`,
      timeout: this.config.bookingTimeout,
    });
  }

  listBookings(params = {}) {
    return this.request({
      channel: "booking",
      method: "GET",
      url: "/hotel-api/1.0/bookings",
      params,
      timeout: this.config.bookingTimeout,
    });
  }

  cancelBooking(reference, { simulation = true, language = "ENG" } = {}) {
    return this.request({
      channel: "booking",
      method: "DELETE",
      url: `/hotel-api/1.0/bookings/${encodeURIComponent(reference)}`,
      params: {
        cancellationFlag: simulation ? "SIMULATION" : "CANCELLATION",
        language,
      },
      timeout: this.config.bookingTimeout,
    });
  }

  contentHotels(params = {}) {
    return this.request({
      channel: "content",
      method: "GET",
      url: "/hotel-content-api/1.0/hotels",
      params,
    });
  }

  contentHotelDetails(hotelCode, params = {}) {
    return this.request({
      channel: "content",
      method: "GET",
      url: `/hotel-content-api/1.0/hotels/${encodeURIComponent(hotelCode)}/details`,
      params,
    });
  }

  contentDestinations(params = {}) {
    return this.request({
      channel: "content",
      method: "GET",
      url: "/hotel-content-api/1.0/locations/destinations",
      params,
    });
  }

  contentCountries(params = {}) {
    return this.request({
      channel: "content",
      method: "GET",
      url: "/hotel-content-api/1.0/locations/countries",
      params,
    });
  }
}

module.exports = new HotelbedsClient();
