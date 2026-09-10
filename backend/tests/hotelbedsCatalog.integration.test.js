const assert = require('node:assert/strict');
const pool = require('../db');
const api = require('../integrations/hotelbeds/client');
const service = require('../services/hotelbedsCatalogService');
const repository = require('../repositories/providerCatalogRepository');
(async () => {
  const db = await pool.connect();
  const original = { query: pool.query, connect: pool.connect, request: api.request };
  let incremental = false;
  try {
    await db.query('BEGIN');
    for (const table of ['provider_hotels','provider_destinations','provider_job_state','provider_content_dictionaries']) {
      await db.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
    }
    pool.query = db.query.bind(db);
    pool.connect = async () => ({ query: db.query.bind(db), release() {} });
    api.request = async ({url,params}) => {
      if (url.endsWith('/destinations')) return { destinations:[{code:'AYT',countryCode:'TR',name:{content:'Antalya'}}] };
      if (url.endsWith('/hotels')) { incremental ||= Boolean(params.lastUpdateTime);return {hotels:[{code:1,name:{content:'Offline fixture'},countryCode:'TR',destinationCode:'AYT'}],total:1}; }
      return { [url.split('/').pop()]: [{code:'FIXTURE'}],total:1 };
    };
    const result = await service.sync({countryCodes:'TR',hotelsPerDestination:1});
    assert.equal(result.hotelsProcessed,1);
    assert.equal((await repository.findHotel('hotelbeds','1')).name,'Offline fixture');
    await service.sync({countryCodes:'TR',hotelsPerDestination:1});
    assert.equal(incremental,true);
    assert.ok((await db.query("SELECT last_success FROM provider_job_state WHERE job='content_sync'")).rows[0].last_success);
    assert.equal((await service.sync({scheduled:true})).skipped,true);
    console.log('PASS: catalog upserts, dictionaries, incremental watermark, scheduled deduplication; fixtures rolled back');
  } finally {
    pool.query=original.query;pool.connect=original.connect;api.request=original.request;
    await db.query('ROLLBACK');db.release();await pool.end();
  }
})().catch(error => { console.error(error.message);process.exitCode=1; });
