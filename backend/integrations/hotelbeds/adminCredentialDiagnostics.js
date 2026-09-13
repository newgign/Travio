const crypto = require('node:crypto');

// Only the protected admin route calls this; use the client's frozen effective config.
module.exports = function adminCredentialDiagnostics(config) {
  return {
    apiKeyLength: config.apiKey.length,
    apiSecretLength: config.secret.length,
    credentialPairFingerprint: crypto.createHash('sha256').update(config.apiKey + '\0' + config.secret).digest('hex').slice(0, 12),
    usingHotelbedsApiSecret: config.secretSource === 'api',
    usingLegacyHotelbedsSecret: config.secretSource === 'legacy',
  };
};
