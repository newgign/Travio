// One loopback-only diagnostic; no retries, redirects, business state or dependency checks.
const http = require('node:http');
const errorCodes = new Set(['EADDRINUSE', 'EACCES', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ERR_SOCKET_CLOSED']);
const safeCode = error => errorCodes.has(error?.code) ? error.code : 'HTTP_SOCKET_ERROR';
function serverError(error) {
  return { code: safeCode(error), syscall: ['listen', 'bind', 'accept', 'connect', 'read', 'write'].includes(error?.syscall) ? error.syscall : null,
    message: 'HTTP_SERVER_ERROR' };
}
function probeHealth(port) {
  return new Promise(resolve => {
    let request, settled = false;
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timer); resolve(result);
    };
    // Wall-clock bound includes connection and response body, not just idle socket time.
    const timer = setTimeout(() => {
      finish({ ok: false, status: null, errorCode: 'ETIMEDOUT' });
      request?.destroy();
    }, 3000);
    try {
      request = http.get({ hostname: '127.0.0.1', port, path: '/health', method: 'GET', agent: false }, response => {
        const status = Number.isInteger(response.statusCode) ? response.statusCode : null;
        response.on('error', error => finish({ ok: false, status, errorCode: safeCode(error) }));
        response.on('aborted', () => finish({ ok: false, status, errorCode: 'ECONNRESET' }));
        response.on('end', () => finish({ ok: status !== null && status >= 200 && status < 300, status, errorCode: null }));
        response.resume(); // Never collect/log body, headers, URL or credentials.
      });
      request.on('error', error => finish({ ok: false, status: null, errorCode: safeCode(error) }));
    } catch (error) { finish({ ok: false, status: null, errorCode: safeCode(error) }); }
  });
}
module.exports = { probeHealth, serverError };
