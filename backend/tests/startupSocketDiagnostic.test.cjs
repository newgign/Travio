const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { probeHealth, serverError } = require('../services/startupSocketDiagnostic');
test('unknown error code/syscall/message are never echoed', () => assert.deepEqual(serverError({ code: 'private-secret', syscall: 'private-path', message: 'private-stack' }), { code: 'HTTP_SOCKET_ERROR', syscall: null, message: 'HTTP_SERVER_ERROR' }));
test('connection failure returns one sanitized result without retry', async t => {
  let count = 0;
  t.mock.method(http, 'get', options => { count++; assert.equal(options.hostname, '127.0.0.1'); assert.equal(options.path, '/health'); const request = new EventEmitter(); queueMicrotask(() => request.emit('error', { code: 'ECONNREFUSED', message: 'private-secret' })); return request; });
  assert.deepEqual(await probeHealth(12345), { ok: false, status: null, errorCode: 'ECONNREFUSED' }); assert.equal(count, 1);
});
test('total timeout destroys stalled request at3000ms without retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let count = 0, destroyed = 0;
  t.mock.method(http, 'get', () => { count++; return Object.assign(new EventEmitter(), { destroy() { destroyed++; } }); });
  const result = probeHealth(12345); t.mock.timers.tick(3000);
  assert.deepEqual(await result, { ok: false, status: null, errorCode: 'ETIMEDOUT' }); assert.equal(count, 1); assert.equal(destroyed, 1);
});
test('non2xx result is truthful and body is not collected', async t => {
  t.mock.method(http, 'get', (options, callback) => { const request = new EventEmitter(); queueMicrotask(() => callback(Object.assign(new EventEmitter(), { statusCode: 503, resume() { this.emit('end'); } }))); return request; });
  assert.deepEqual(await probeHealth(12345), { ok: false, status: 503, errorCode: null });
});
test('synchronous HTTP failure is contained and sanitized', async t => { t.mock.method(http, 'get', () => { throw Error('private-secret'); }); assert.deepEqual(await probeHealth(12345), { ok: false, status: null, errorCode: 'HTTP_SOCKET_ERROR' }); });
