// Actual server startup with all DB IO replaced before application imports.
const Module = require('node:module');
const path = require('node:path');
const original = Module._load;
const dbFile = path.resolve(__dirname, '../../db.js');
let queries = 0, connects = 0;
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
for (const protocol of ['http', 'https']) for (const method of ['request', 'get'])
  require(protocol)[method] = () => { throw Error('EXTERNAL_HTTP_FORBIDDEN'); };
globalThis.fetch = () => { throw Error('EXTERNAL_FETCH_FORBIDDEN'); };
const runtime = require('../../server');
runtime.server.on('listening', () => process.send({ type: 'listening', address: runtime.server.address(), queries, connects }));
process.on('message', message => {
  if (message === 'stats') process.send({ type: 'stats', queries, connects });
  if (message === 'stop') runtime.shutdown('OFFLINE_TEST');
});
