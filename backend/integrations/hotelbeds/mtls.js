const fs = require('node:fs');
const crypto = require('node:crypto');
const tls = require('node:tls');

function legacyCode(code) {
  if (['CERT_NOT_CONFIGURED', 'KEY_NOT_CONFIGURED'].includes(code)) return 'HOTELBEDS_MTLS_NOT_CONFIGURED';
  if (['CERT_READ_FAILED', 'KEY_READ_FAILED'].includes(code)) return 'HOTELBEDS_MTLS_FILES_UNREADABLE';
  if (['CERT_EXPIRED', 'CERT_NOT_YET_VALID'].includes(code)) return 'HOTELBEDS_MTLS_CERT_DATE_INVALID';
  if (code === 'KEY_CERT_MISMATCH') return 'HOTELBEDS_MTLS_KEY_MISMATCH';
  return 'HOTELBEDS_MTLS_MATERIAL_INVALID';
}

// Only this internal function holds material. Public diagnostics contain boolean/enum fields.
function inspect(config, now) {
  const diagnostics = {
    certificateConfigured: Boolean(String(config.mtlsCertPath || '').trim()),
    privateKeyConfigured: Boolean(String(config.mtlsKeyPath || '').trim()),
    certificateReadable: false, privateKeyReadable: false,
    certificateValid: false, privateKeyDecryptable: false, keyMatchesCertificate: false,
    mtlsReady: false, mtlsErrorCode: 'NONE',
  };
  const fail = code => ({ diagnostics: { ...diagnostics, mtlsErrorCode: code } });
  let cert, key, ca, certificate, privateKey;
  // Read each independently so a cert failure does not misreport key readability.
  if (diagnostics.certificateConfigured) try { cert = fs.readFileSync(String(config.mtlsCertPath).trim()); diagnostics.certificateReadable = true; } catch { /* Safe code below. */ }
  if (diagnostics.privateKeyConfigured) try { key = fs.readFileSync(String(config.mtlsKeyPath).trim()); diagnostics.privateKeyReadable = true; } catch { /* Safe code below. */ }
  if (!diagnostics.certificateConfigured) return fail('CERT_NOT_CONFIGURED');
  if (!diagnostics.privateKeyConfigured) return fail('KEY_NOT_CONFIGURED');
  if (!diagnostics.certificateReadable) return fail('CERT_READ_FAILED');
  if (!diagnostics.privateKeyReadable) return fail('KEY_READ_FAILED');
  try { certificate = new crypto.X509Certificate(cert); } catch { return fail('CERT_INVALID'); }
  if (now < Date.parse(certificate.validFrom)) return fail('CERT_NOT_YET_VALID');
  if (now >= Date.parse(certificate.validTo)) return fail('CERT_EXPIRED');
  diagnostics.certificateValid = true;
  try { privateKey = crypto.createPrivateKey({ key, ...(config.mtlsKeyPassphrase ? { passphrase: config.mtlsKeyPassphrase } : {}) }); }
  catch { return fail('KEY_DECRYPT_FAILED'); }
  diagnostics.privateKeyDecryptable = true;
  try { diagnostics.keyMatchesCertificate = certificate.checkPrivateKey(privateKey); }
  catch { return fail('TLS_CONFIG_INVALID'); }
  if (!diagnostics.keyMatchesCertificate) return fail('KEY_CERT_MISMATCH');
  try {
    if (config.mtlsCaPath) ca = fs.readFileSync(String(config.mtlsCaPath).trim());
    const options = { cert, key, ...(ca ? { ca } : {}),
      ...(config.mtlsKeyPassphrase ? { passphrase: config.mtlsKeyPassphrase } : {}),
      rejectUnauthorized: true, minVersion: 'TLSv1.2' };
    tls.createSecureContext(options);
    diagnostics.mtlsReady = true;
    return { diagnostics, options };
  } catch { return fail('TLS_CONFIG_INVALID'); }
}

function diagnoseTls(config, now = Date.now()) {
  return inspect(config, now).diagnostics;
}
function loadTlsOptions(config, now = Date.now()) {
  const result = inspect(config, now);
  if (!result.diagnostics.mtlsReady) throw Object.assign(new Error('Hotelbeds mTLS configuration is not ready'), {
    status: 503, code: legacyCode(result.diagnostics.mtlsErrorCode),
  });
  return result.options;
}
module.exports = { loadTlsOptions, diagnoseTls, legacyCode };
