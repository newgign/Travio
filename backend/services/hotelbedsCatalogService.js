const hotelbedsClient = require("../integrations/hotelbeds/client");
const providerCatalogRepository = require("../repositories/providerCatalogRepository");
const mapper = require("./hotelbedsContentMapper");
const {
  getCountryConfig,
  getCountryName,
} = require("../config/providerCountries");

class HotelbedsCatalogService {
  async sync(options = {}) {
    const pool = require('../db');
    const environment = require('../config/providers').hotelbeds.environment;
    const client = await pool.connect();
    let locked = false;
    const started = new Date();
    try {
      locked = (await client.query('SELECT pg_try_advisory_lock(319002) AS locked')).rows[0].locked;
      if (!locked) throw Object.assign(new Error('Catalog sync is already running'), { code: 'SYNC_BUSY' });
      const previous = await client.query("SELECT last_success FROM provider_job_state WHERE job='content_sync' AND environment=$1", [environment]);
      if (options.scheduled && previous.rows[0]?.last_success && Date.now() - new Date(previous.rows[0].last_success).getTime() < 86400000) return { skipped: true };
      const since = options.full ? null : previous.rows[0]?.last_success;
      await client.query(`INSERT INTO provider_job_state(job,environment,last_run) VALUES('content_sync',$1,$2)
        ON CONFLICT(job,environment) DO UPDATE SET last_run=EXCLUDED.last_run`, [environment, started]);
      for (const kind of ['countries', 'rooms', 'boards', 'categories', 'facilities']) {
        for (let from = 1; ; from += 1000) {
          const response = await hotelbedsClient.request({ channel: 'content', url: '/hotel-content-api/1.0/' + (kind === 'countries' ? 'locations/' : 'types/') + kind,
            params: { fields: 'all', language: process.env.HOTELBEDS_CONTENT_LANGUAGE || 'ENG', from, to: from + 999 } });
          const rows = response[kind] || [];
          for (const row of rows) await client.query(`INSERT INTO provider_content_dictionaries(environment,kind,code,data) VALUES($1,$2,$3,$4::jsonb)
            ON CONFLICT(environment,kind,code) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`, [environment,kind,String(row.code) + (row.facilityGroupCode == null ? '' : ':' + row.facilityGroupCode),JSON.stringify(row)]);
          if (rows.length < 1000 || from + 999 >= Number(response.total)) break;
        }
      }
      const result = await this.syncBatch({ ...options, lastUpdateTime: since ? new Date(since).toISOString().slice(0,10) : null });
      await client.query("UPDATE provider_job_state SET last_success=$2,last_error_category=NULL,details=$3::jsonb WHERE job='content_sync' AND environment=$1", [environment,started,JSON.stringify(result)]);
      return result;
    } catch (error) {
      if (locked) await client.query("UPDATE provider_job_state SET last_error_category=$2 WHERE job='content_sync' AND environment=$1", [environment,error.code || 'SYNC_FAILED']).catch(() => {});
      throw error;
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock(319002)').catch(() => {});
      client.release();
    }
  }

  async syncBatch({ countryCodes, hotelsPerDestination = 1000, lastUpdateTime } = {}) {
    const codes = this.normalizeCountryCodes(countryCodes);
    const perDestination = Math.min(
      Math.max(Number(hotelsPerDestination) || 100, 1),
      1000
    );

    const destinationResponse = await hotelbedsClient.contentDestinations({
      fields: "all",
      language: process.env.HOTELBEDS_CONTENT_LANGUAGE || "ENG",
      from: 1,
      to: 1000,
      useSecondaryLanguage: true,
      countryCodes: codes.join(","),
    });

    const rawDestinations = Array.isArray(destinationResponse?.destinations)
      ? destinationResponse.destinations
      : [];

    const mappedDestinations = rawDestinations
      .map((item) => mapper.mapDestination(item))
      .filter((item) => item.code && codes.includes(item.countryCode));

    for (const destination of mappedDestinations) {
      await providerCatalogRepository.upsertDestination(destination);
    }

    const selectedDestinations = this.selectTargetDestinations(
      mappedDestinations,
      codes
    );

    let hotelCount = 0;
    const syncedDestinationCodes = [];

    for (const destination of selectedDestinations) {
      for (let from = 1; ; from += perDestination) {
      const hotelResponse = await hotelbedsClient.contentHotels({
        fields: "all",
        language: process.env.HOTELBEDS_CONTENT_LANGUAGE || "ENG",
        destinationCode: destination.code,
        from,
        to: from + perDestination - 1,
        ...(lastUpdateTime ? { lastUpdateTime } : {}),
        useSecondaryLanguage: true,
      });

      const rawHotels = Array.isArray(hotelResponse?.hotels)
        ? hotelResponse.hotels
        : [];

      for (const rawHotel of rawHotels) {
        const mappedHotel = mapper.mapHotel(rawHotel);

        if (!mappedHotel.providerHotelId || !mappedHotel.name) {
          continue;
        }

        if (!mappedHotel.countryName) {
          mappedHotel.countryName = getCountryName(mappedHotel.countryCode);
        }

        await providerCatalogRepository.upsertHotel(mappedHotel);
        hotelCount += 1;
      }

      if (rawHotels.length < perDestination || from + perDestination - 1 >= Number(hotelResponse.total)) break;
      }
      syncedDestinationCodes.push(destination.code);
      await this.sleep(300);
    }

    const counts = await providerCatalogRepository.getCounts("hotelbeds");

    return {
      countries: codes,
      destinationsReceived: mappedDestinations.length,
      destinationsSelected: selectedDestinations.map((item) => ({
        code: item.code,
        countryCode: item.countryCode,
        name: item.name,
      })),
      syncedDestinationCodes,
      hotelsProcessed: hotelCount,
      catalog: counts,
    };
  }

  selectTargetDestinations(destinations, countryCodes) {
    const result = [];

    for (const countryCode of countryCodes) {
      const countryItems = destinations.filter(
        (item) => item.countryCode === countryCode
      );
      const config = getCountryConfig(countryCode);
      const terms = config?.searchTerms || [];
      const selected = [];

      for (const term of terms) {
        const match = countryItems.find((item) =>
          this.destinationSearchText(item).includes(term.toLowerCase())
        );

        if (match && !selected.some((item) => item.code === match.code)) {
          selected.push(match);
        }
      }

      if (selected.length === 0 && countryItems.length > 0) {
        selected.push(...countryItems.slice(0, 2));
      }

      result.push(...selected.slice(0, 2));
    }

    return result.filter(
      (item, index, array) =>
        array.findIndex((other) => other.code === item.code) === index
    );
  }

  destinationSearchText(destination) {
    const parts = [destination.name];

    for (const zone of destination.zones || []) {
      parts.push(
        typeof zone?.name === "string" ? zone.name : "",
        mapper.text(zone?.description)
      );
    }

    for (const group of destination.groupZones || []) {
      parts.push(
        mapper.text(group?.content),
        typeof group?.name === "string" ? group.name : ""
      );
    }

    return parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  normalizeCountryCodes(countryCodes) {
    const raw =
      countryCodes ||
      process.env.HOTELBEDS_SYNC_COUNTRIES ||
      "EG,TR,AE,TH";

    return [...new Set(
      String(raw)
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    )];
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new HotelbedsCatalogService();
