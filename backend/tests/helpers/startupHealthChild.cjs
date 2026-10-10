// Actual server startup with all DB IO replaced before application imports.
const Module = require('node:module');
const path = require('node:path');
const original = Module._load;
const dbFile = path.resolve(__dirname, '../../db.js');
let queries = 0, connects = 0, probes = 0, external = 0;
const diagnostics = [];
// Strict production startup contract uses synthetic independent keys and a non-routable URL.
process.env.JWT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
process.env.OFFER_TOKEN_SECRET = require('node:crypto').randomBytes(32).toString('hex');
process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@database.invalid/test';
process.env.DB_SSL_MODE = 'verify-full';
const pool = {
  async query() { queries++; throw Error('OFFLINE_DATABASE_UNAVAILABLE'); },
  async connect() { connects++; throw Error('OFFLINE_DATABASE_FORBIDDEN'); },
  async end() {},
  on() {},
};
Module._load = function(name, parent, ...args) {
  if (Module._resolveFilename(name, parent) === dbFile) return pool;
  if (name === 'pg') throw Error('REAL_PG_IMPORT_FORBIDDEN');
  return original.call(this, name, parent, ...args);
};
for (const protocol of ['http', 'https']) for (const method of ['request', 'get']) {
  const originalMethod = require(protocol)[method];
  require(protocol)[method] = (options, ...args) => {
    if (protocol === 'http' && method === 'get' && options?.hostname === '127.0.0.1'
      && String(options.port) === process.env.PORT && options.path === '/health' && options.method === 'GET') {
      probes++; return originalMethod(options, ...args);
    }
    external++; throw Error('EXTERNAL_HTTP_FORBIDDEN');
  };
}
globalThis.fetch = () => { throw Error('EXTERNAL_FETCH_FORBIDDEN'); };
const logger = require('../../utils/logger');
for (const level of ['info', 'error']) {
  const log = logger[level].bind(logger);
  logger[level] = (name, metadata) => {
    if (['startup_socket_bound', 'startup_self_probe', 'server_socket_error'].includes(name)) {
      diagnostics.push({ name, metadata });
      if (name === 'startup_self_probe') process.send({ type: 'probe', diagnostics, probes, external, queries, connects });
    }
    log(name, metadata);
  };
}
const runtime = require('../../server');
runtime.server.on('listening', () => process.send({ type: 'listening', address: runtime.server.address(), queries, connects }));
process.on('message', message => {
  if (message === 'stats') process.send({ type: 'stats', queries, connects, probes, external });
  if (message === 'serverError') {
    runtime.server.emit('error', Object.assign(Error('private-marker Authorization secret'), { code: 'EADDRINUSE', syscall: 'listen', stack: 'private-stack', address: 'private-address' }));
    process.send({ type: 'diagnostics', diagnostics });
  }
  if (message === 'stop') runtime.shutdown('OFFLINE_TEST');
});
