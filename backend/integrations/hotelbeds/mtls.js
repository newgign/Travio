const fs = require('node:fs');
const crypto = require('node:crypto');
const tls = require('node:tls');

function failure(code) {
  return Object.assign(new Error('Hotelbeds mTLS configuration is not ready'), { status: 503, code });
}

function loadTlsOptions(config, now = Date.now()) {
  if (!config.mtlsCertPath || !config.mtlsKeyPath) throw failure('HOTELBEDS_MTLS_NOT_CONFIGURED');
  let cert, key, ca;
  try {
    cert = fs.readFileSync(String(config.mtlsCertPath).trim());
    key = fs.readFileSync(String(config.mtlsKeyPath).trim());
    if (config.mtlsCaPath) ca = fs.readFileSync(String(config.mtlsCaPath).trim());
  } catch {
    throw failure('HOTELBEDS_MTLS_FILES_UNREADABLE');
  }
  try {
    const certificate = new crypto.X509Certificate(cert);
    if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) throw failure('HOTELBEDS_MTLS_CERT_DATE_INVALID');
    const privateKey = crypto.createPrivateKey({ key, ...(config.mtlsKeyPassphrase ? { passphrase: config.mtlsKeyPassphrase } : {}) });
    if (!certificate.checkPrivateKey(privateKey)) throw failure('HOTELBEDS_MTLS_KEY_MISMATCH');
    const options = {
      cert, key, ...(ca ? { ca } : {}),
      ...(config.mtlsKeyPassphrase ? { passphrase: config.mtlsKeyPassphrase } : {}),
      rejectUnauthorized: true, minVersion: 'TLSv1.2',
    };
    tls.createSecureContext(options);
    return options;
  } catch (error) {
    if (String(error.code).startsWith('HOTELBEDS_MTLS_')) throw error;
    throw failure('HOTELBEDS_MTLS_MATERIAL_INVALID');
  }
}

module.exports = { loadTlsOptions };
