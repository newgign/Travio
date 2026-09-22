// Operator release contract, not a replacement for runtime configuration parsing.
module.exports = {
  REQUIRED_SECRET: ['DATABASE_URL', 'JWT_SECRET'],
  REQUIRED_NON_SECRET: ['CORS_ORIGINS', 'VITE_API_URL'],
  MUST_EQUAL: {
    NODE_ENV: 'production', ACTIVE_PROVIDER: 'hotelbeds', HOTELBEDS_ENV: 'test',
    HOTELBEDS_READ_ONLY: 'true', PAYMENTS_MODE: 'disabled', PAYMENTS_PROVIDER: 'none',
  },
  MUST_BE_FALSE: [
    'HOTELBEDS_BOOKING_ENABLED', 'HOTELBEDS_LIVE_BOOKING_ENABLED', 'PRODUCTION_SALES_ENABLED',
    'REAL_CHARGES_ENABLED', 'REAL_REFUNDS_ENABLED', 'HOT_DEALS_MONITOR_ENABLED',
    'HOTELBEDS_CONTENT_SYNC_ENABLED',
  ],
  OPTIONAL: {
    APP_ENV: 'If supplied, staging/test only; absent means the staging contract selected by this CLI.',
    OFFER_TOKEN_SECRET: 'Secret; runtime falls back to JWT_SECRET. Any explicit value must be strong.',
    OFFER_SECRET: 'Unused by runtime; not an alias for OFFER_TOKEN_SECRET.',
    HOTELBEDS_ENABLED: 'Boolean, default false; TEST reads require separate owner authorization.',
    HOTELBEDS_STAGING_TEST_ENABLED: 'Boolean, default false; never enables booking.',
    HOTELBEDS_READ_RETRIES: 'Integer 0..3, default 0; no probe is performed.',
    HOTELBEDS_API_KEY: 'Secret; required only if Hotelbeds reads are enabled.',
    HOTELBEDS_API_SECRET: 'Secret; HOTELBEDS_SECRET is the legacy fallback.',
    DB_SSL_MODE: 'Runtime default verify-full; source backup require exception does not apply.',
    DB_SSL_CA_PATH: 'Optional readable trusted CA file; contents never emitted.',
    VITE_HOTELBEDS_STAGING_TEST_ENABLED: 'Must match backend TEST disclosure intent at build time.',
    EMAIL_ENABLED: 'Must remain false/absent for this release.',
    DB_BACKUP_AUTO_ENABLED: 'Must remain false/absent for this release.',
    HEALTH_MONITOR_ENABLED: 'Must remain false for blueprint staging; absent is not treated as false.',
    RELIABILITY_MONITOR_ENABLED: 'Must remain false for blueprint staging; absent is not treated as false.',
    RATE_LIMIT_ENABLED: 'Default true; cannot be disabled in this release.',
    REQUEST_BODY_LIMIT: 'Default 1mb; explicit value must be a positive size no greater than 1mb.',
    TRUST_PROXY: 'Render blueprint uses 1; requires deployment topology review.',
  },
};
