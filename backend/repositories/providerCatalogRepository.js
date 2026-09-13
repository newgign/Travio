const pool = require("../db");
const { getCountryCode } = require("../config/providerCountries");

class ProviderCatalogRepository {
  async upsertDestination(destination, executor = pool) {
    const result = await executor.query(
      `
      INSERT INTO provider_destinations
      (
        provider,
        code,
        country_code,
        country_name,
        name,
        zones,
        group_zones,
        raw_data,
        content_environment,
        last_synced_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,NOW(),NOW())
      ON CONFLICT (provider, code, content_environment)
      DO UPDATE SET
        country_code = EXCLUDED.country_code,
        country_name = EXCLUDED.country_name,
        name = EXCLUDED.name,
        zones = EXCLUDED.zones,
        group_zones = EXCLUDED.group_zones,
        raw_data = EXCLUDED.raw_data,
        content_environment = EXCLUDED.content_environment,
        last_synced_at = NOW(),
        updated_at = NOW()
      RETURNING *
      `,
      [
        destination.provider,
        destination.code,
        destination.countryCode || null,
        destination.countryName || null,
        destination.name || destination.code,
        JSON.stringify(destination.zones || []),
        JSON.stringify(destination.groupZones || []),
        JSON.stringify(destination.rawData || {}),
        require("../config/providers").hotelbeds.environment,
      ]
    );

    return result.rows[0];
  }

  async upsertHotel(hotel, executor = pool) {
    const result = await executor.query(
      `
      INSERT INTO provider_hotels
      (
        provider,
        provider_hotel_id,
        country_code,
        country_name,
        destination_code,
        zone_code,
        city,
        name,
        category_code,
        stars,
        latitude,
        longitude,
        address,
        postal_code,
        description,
        website,
        email,
        phone,
        image_url,
        images,
        facilities,
        rooms,
        board_codes,
        raw_data,
        content_environment,
        last_synced_at,
        updated_at
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb,$24::jsonb,$25,NOW(),NOW()
      )
      ON CONFLICT (provider, provider_hotel_id, content_environment)
      DO UPDATE SET
        country_code = EXCLUDED.country_code,
        country_name = EXCLUDED.country_name,
        destination_code = EXCLUDED.destination_code,
        zone_code = EXCLUDED.zone_code,
        city = EXCLUDED.city,
        name = EXCLUDED.name,
        category_code = EXCLUDED.category_code,
        stars = EXCLUDED.stars,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        address = EXCLUDED.address,
        postal_code = EXCLUDED.postal_code,
        description = EXCLUDED.description,
        website = EXCLUDED.website,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        image_url = EXCLUDED.image_url,
        images = EXCLUDED.images,
        facilities = EXCLUDED.facilities,
        rooms = EXCLUDED.rooms,
        board_codes = EXCLUDED.board_codes,
        raw_data = EXCLUDED.raw_data,
        content_environment = EXCLUDED.content_environment,
        last_synced_at = NOW(),
        updated_at = NOW()
      RETURNING *
      `,
      [
        hotel.provider,
        String(hotel.providerHotelId),
        hotel.countryCode || null,
        hotel.countryName || null,
        hotel.destinationCode || null,
        hotel.zoneCode ?? null,
        hotel.city || null,
        hotel.name,
        hotel.categoryCode || null,
        Number(hotel.stars) || 0,
        hotel.latitude ?? null,
        hotel.longitude ?? null,
        hotel.address || null,
        hotel.postalCode || null,
        hotel.description || null,
        hotel.website || null,
        hotel.email || null,
        hotel.phone || null,
        hotel.imageUrl || null,
        JSON.stringify(hotel.images || []),
        JSON.stringify(hotel.facilities || []),
        JSON.stringify(hotel.rooms || []),
        JSON.stringify(hotel.boardCodes || []),
        JSON.stringify(hotel.rawData || {}),
        require("../config/providers").hotelbeds.environment,
      ]
    );

    return result.rows[0];
  }

  async findDestinations({ provider = "hotelbeds", country, countryCode } = {}) {
    const params = [provider, require("../config/providers").hotelbeds.environment];
    const conditions = ["provider = $1", "content_environment = $2"];

    const code = countryCode || (country ? getCountryCode(country) : "");

    if (code) {
      params.push(code);
      conditions.push(`country_code = $${params.length}`);
    }

    const result = await pool.query(
      `
      SELECT *, (SELECT COUNT(*)::int FROM provider_hotels h
        WHERE h.provider=provider_destinations.provider
          AND h.content_environment=provider_destinations.content_environment
          AND h.destination_code=provider_destinations.code
          AND h.country_code=provider_destinations.country_code) AS hotel_count
      FROM provider_destinations
      WHERE ${conditions.join(" AND ")}
      ORDER BY name ASC
      `,
      params
    );

    return result.rows;
  }

  async findHotels({
    provider = "hotelbeds",
    country,
    countryCode,
    city,
    destinationCode,
    limit = 2000,
  } = {}) {
    const params = [provider, require("../config/providers").hotelbeds.environment];
    const conditions = ["provider = $1", "content_environment = $2"];

    const code = countryCode || (country ? getCountryCode(country) : "");

    if (code) {
      params.push(code);
      conditions.push(`country_code = $${params.length}`);
    }

    if (destinationCode) {
      params.push(String(destinationCode).trim().toUpperCase());
      conditions.push(`destination_code = $${params.length}`);
    }

    if (city) {
      params.push(`%${String(city).trim().toLowerCase()}%`);
      conditions.push(`LOWER(COALESCE(city, '')) LIKE $${params.length}`);
    }

    params.push(Math.min(Math.max(Number(limit) || 2000, 1), 2000));

    const result = await pool.query(
      `
      SELECT *
      FROM provider_hotels
      WHERE ${conditions.join(" AND ")}
      ORDER BY stars DESC, name ASC
      LIMIT $${params.length}
      `,
      params
    );

    return result.rows;
  }

  async findHotel(provider, providerHotelId) {
    const result = await pool.query(
      `
      SELECT *
      FROM provider_hotels
      WHERE provider = $1 AND provider_hotel_id = $2 AND content_environment = $3
      LIMIT 1
      `,
      [provider, String(providerHotelId), require("../config/providers").hotelbeds.environment]
    );

    return result.rows[0] || null;
  }

  async findHotelsByIds(provider, ids = []) {
    const normalized = [...new Set(ids.map(String).filter(Boolean))];

    if (normalized.length === 0) {
      return [];
    }

    const result = await pool.query(
      `
      SELECT *
      FROM provider_hotels
      WHERE provider = $1
        AND provider_hotel_id = ANY($2::text[]) AND content_environment = $3
      `,
      [provider, normalized, require("../config/providers").hotelbeds.environment]
    );

    return result.rows;
  }

  async getCounts(provider = "hotelbeds") {
    const [destinations, hotels] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count FROM provider_destinations WHERE provider = $1 AND content_environment = $2`,
        [provider, require("../config/providers").hotelbeds.environment]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM provider_hotels WHERE provider = $1 AND content_environment = $2`,
        [provider, require("../config/providers").hotelbeds.environment]
      ),
    ]);

    return {
      provider,
      destinations: destinations.rows[0]?.count || 0,
      hotels: hotels.rows[0]?.count || 0,
    };
  }
}

module.exports = new ProviderCatalogRepository();
