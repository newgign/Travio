// Entire suite is offline. HTTP adapters and provider calls never reach Hotelbeds.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const safe = { NODE_ENV:'production', ACTIVE_PROVIDER:'hotelbeds', HOTELBEDS_ENV:'test', HOTELBEDS_ENABLED:'true', HOTELBEDS_STAGING_TEST_ENABLED:'true', HOTELBEDS_READ_ONLY:'true', HOTELBEDS_API_KEY:'offline-key', HOTELBEDS_API_SECRET:'offline-secret', PAYMENTS_MODE:'disabled', PAYMENTS_PROVIDER:'none', HOTELBEDS_TEST_CONTENT_COUNTRY:'PT', HOTELBEDS_TEST_CONTENT_DESTINATION:'AVE', HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com', HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com', HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com' };
for (const key of ['HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED','PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOT_DEALS_MONITOR_ENABLED','HOTELBEDS_CONTENT_SYNC_ENABLED']) safe[key]='false';
Object.assign(process.env,safe);
const service = require('../services/hotelbedsTestContent');
const config = require('../config/hotelbeds').buildConfig(safe);
const resolve = require('../services/hotelbedsTestDestination');
const input = { destinationCode:'AVE', departureDate:'2030-04-01', nights:1, people:2 };

test('bounded Content scope rejects missing/oversized configuration before any adapter', () => {
  assert.equal(service.selection(safe).count,1);
  for (const patch of [{HOTELBEDS_TEST_CONTENT_DESTINATION:''},{HOTELBEDS_TEST_CONTENT_COUNTRY:''},{HOTELBEDS_TEST_CONTENT_COUNT:'21'},{HOTELBEDS_TEST_CONTENT_FROM:'101'},{HOTELBEDS_TEST_CONTENT_DESTINATION:'https://invalid'}]) assert.throws(()=>service.selection({...safe,...patch}),{code:'CONTENT_SCOPE_BLOCKED'});
});
test('Content transport is signed TEST GET only, no mTLS and no arbitrary host/mutations', async () => {
  const client = new service.ContentClient({...config,maxRetries:0,requestIntervalMs:0});
  let calls=0;
  client.contentHttp.defaults.adapter=async request=>{
    calls++;assert.equal(request.baseURL,'https://api.test.hotelbeds.com');assert.equal(request.httpsAgent,undefined);assert.equal(request.maxRedirects,0);
    assert.ok(request.headers['X-Signature']);assert.equal(request.headers.Accept,'application/json');
    return {status:200,data:{hotels:[]},headers:{},config:request};
  };
  await client.contentHotels({from:1,to:1});
  for (const method of ['POST','PUT','PATCH','DELETE']) await assert.rejects(client.performRequest({channel:'content',method,url:'/hotel-content-api/1.0/hotels'}));
  for (const url of ['/hotel-api/1.0/bookings','https://invalid/hotels','/hotel-content-api/1.0/types/facilities']) await assert.rejects(client.request({channel:'content',url}));
  await assert.rejects(client.availability({}));await assert.rejects(client.checkRates('offline'));assert.equal(calls,1);
});
test('destination lookup, invalid/empty/oversized catalog, user occupancy and diagnostic isolation',async()=>{
  let count=2;
  const repo={findDestinations:async()=>[{code:'AVE',country_code:'PT'}],findHotels:async options=>{assert.equal(options.limit,21);return Array.from({length:count},(_,i)=>({provider_hotel_id:String(i+1)}));}};
  const result=await resolve(input,config,repo);assert.deepEqual(result.hotelCodes,['1','2']);assert.equal(result.checkOut,'2030-04-02');assert.equal(result.destinationCode,'');
  await assert.rejects(resolve({...input,destinationCode:'UNKNOWN'},config,repo),{code:'TEST_DESTINATION_NOT_LOADED'});
  count=0;await assert.rejects(resolve(input,config,repo),{code:'TEST_CATALOG_EMPTY'});
  count=21;await assert.rejects(resolve(input,config,repo),{code:'TEST_SEARCH_LIMIT'});
  const diagnostic={...input,stagingTestHotel:'3424'};assert.equal(await resolve(diagnostic,config,repo),diagnostic);
  assert.equal(await resolve(input,{...config,environment:'live'},repo),input);
  await assert.rejects(resolve(input,{...config,maxRetries:1},repo),{code:'TEST_SEARCH_RETRIES_BLOCKED'});
  await assert.rejects(resolve({...input,country:'XX'},config,repo),{code:'TEST_DESTINATION_COUNTRY_MISMATCH'});
});
test('public destination search enriches local metadata; exactly one Availability, zero Content or mutations',async t=>{
  const api=require('../integrations/hotelbeds/client'),repo=require('../repositories/providerCatalogRepository'),search=require('../services/searchService'),cache=require('../services/memoryCache');
  process.env.OFFER_TOKEN_SECRET=require('crypto').randomBytes(32).toString('hex');
  t.mock.method(require('../services/priceHistoryService'),'record',async()=>{});
  t.mock.method(repo,'findDestinations',async()=>[{code:'AVE',country_code:'PT'}]);
  t.mock.method(repo,'findHotels',async()=>[{provider_hotel_id:'1'}]);
  t.mock.method(repo,'findHotelsByIds',async()=>[{provider_hotel_id:'1',name:'Local content fixture',image_url:'https://example.org/offline.jpg',images:[],city:'Local city'}]);
  for(const method of ['contentHotels','contentDestinations','checkRates','createBooking','cancelBooking']) t.mock.method(api,method,async()=>{assert.fail('Forbidden provider call');});
  let calls=0,kind='valid';
  t.mock.method(api,'availability',async request=>{
    calls++;assert.deepEqual(request.hotels.hotel,[1]);
    if(kind==='error')throw Object.assign(Error('Offline timeout'),{code:'TIMEOUT'});
    return {hotels:{hotels:kind==='empty'?[]:[{code:1,name:'Dynamic fixture',currency:'EUR',rooms:[{code:'DBL',name:'Double',rates:[{rateKey:'offline-only',rateType:'BOOKABLE',net:'10',paymentType:'AT_WEB',boardCode:'BB',rooms:1,adults:2,children:0}]}]}]}};
  });
  cache.clear();
  const offers=(await search.search({...input,country:'PT'})).data;assert.equal(calls,1);assert.equal(offers.length,1);assert.equal(offers[0].city,'Local city');assert.equal(offers[0].bookingDisabled,true);assert.equal(offers[0].priceEnvironment,'test');assert.equal(offers[0].price,10);
  assert.equal(require('../services/offerTokenService').verify(offers[0].offerToken).priceEnvironment,'test');
  kind='empty';cache.clear();assert.deepEqual((await search.search(input)).data,[]);
  kind='error';cache.clear();await assert.rejects(search.search(input),{code:'TIMEOUT'});assert.equal(calls,3);cache.clear();
});
test('manual import has exactly two reads, safe output, transactional writes and hard cooldown',async t=>{
  const calls=[];const queries=[];let upserts=0;
  const db={query:async(sql)=>{queries.push(sql);return {rows:sql.includes('pg_try')?[{locked:true}]:[]};},release(){}};
  const client={contentDestinations:async()=>{calls.push('destinations');return {destinations:[{code:'AVE',countryCode:'PT',name:{content:'Provider destination'}}]};},contentHotels:async()=>{calls.push('hotels');return {hotels:[{code:1,name:{content:'Provider hotel'},countryCode:'PT',destinationCode:'AVE'}]};}};
  const repository={upsertDestination:async()=>{},upsertHotel:async()=>{upserts++;}};
  const result=await service.run({env:safe,client,repository,pool:{connect:async()=>db}});
  assert.deepEqual(calls,['destinations','hotels']);assert.equal(upserts,1);assert.ok(queries.includes('BEGIN'));assert.ok(queries.includes('COMMIT'));
  assert.equal(result.status,'PASS');assert.equal(JSON.stringify(result).includes('Provider hotel'),false);
  await assert.rejects(service.run({env:safe,client,repository,pool:{connect:async()=>db}}),{code:'CONTENT_BUSY_OR_COOLDOWN'});
  let time=Date.now();t.mock.method(Date,'now',()=>time);
  time+=61000;
  client.contentHotels=async()=>({hotels:[]});
  assert.equal((await service.run({env:safe,client,repository,pool:{connect:async()=>db}})).status,'EMPTY');
  time+=61000;
  client.contentHotels=async()=>{throw Error('offline raw secret /private/material');};
  await assert.rejects(service.run({env:safe,client,repository,pool:{connect:async()=>db}}),error=>error.message==='CONTENT_IMPORT_FAILED');
  assert.equal(upserts,1);
  t.mock.restoreAll();
});
test('local HTTP catalog is DB-only; admin import requires auth/role and rejects client scope',async t=>{
  const express=require('express'),jwt=require('jsonwebtoken'),repo=require('../repositories/providerCatalogRepository'),pool=require('../db');
  process.env.JWT_SECRET=require('crypto').randomBytes(32).toString('hex');
  t.mock.method(repo,'findDestinations',async()=>[{code:'AVE',name:'Offline destination',country_code:'PT',country_name:'PT',raw_data:{secret:'hidden'}}]);
  t.mock.method(repo,'getCounts',async()=>({hotels:1,destinations:1}));
  t.mock.method(pool,'query',async()=>({rows:[]}));
  let imports=0;t.mock.method(service,'run',async()=>{imports++;return {status:'PASS'};});
  const app=express();app.use(express.json());app.use('/catalog',require('../routes/catalog'));app.use('/admin',require('../routes/adminOperations'));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const options=await (await fetch(base+'/catalog/test-options')).json();assert.equal(options.destinations[0].code,'AVE');assert.equal(JSON.stringify(options).includes('hidden'),false);
    for(const role of [null,'user','admin']) {
      const headers={'Content-Type':'application/json'};if(role)headers.Authorization='Bearer '+jwt.sign({id:1,role},process.env.JWT_SECRET);
      const response=await fetch(base+'/admin/providers/hotelbeds/content',{method:'POST',headers,body:JSON.stringify({url:'https://invalid',destinationCode:'OTHER'})});
      assert.equal(response.status,role===null?401:role==='user'?403:400);
    }
    assert.equal(imports,0);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('PostgreSQL catalog migration preserves TEST and LIVE identity and idempotent upsert; rollback only',async()=>{
  const fs=require('fs'),path=require('path'),pool=require('../db'),repo=require('../repositories/providerCatalogRepository');
  const host=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL).hostname:process.env.DB_HOST||'localhost';
  assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(host),'Local DB only');
  const db=await pool.connect(),original=pool.query;const cfg=require('../config/providers').hotelbeds;
  try {
    await db.query('BEGIN');await db.query('CREATE SCHEMA sprint3g_fixture');await db.query('SET LOCAL search_path TO sprint3g_fixture');
    const dir=path.join(__dirname,'../../database/migrations');
    for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())await db.query(fs.readFileSync(path.join(dir,file),'utf8'));
    pool.query=db.query.bind(db);
    const hotel={provider:'hotelbeds',providerHotelId:'1',name:'Test fixture',destinationCode:'AVE',countryCode:'PT'};
    await repo.upsertHotel(hotel);await repo.upsertHotel(hotel);
    await repo.upsertDestination({provider:'hotelbeds',code:'AVE',countryCode:'PT',name:'Test destination'});
    cfg.environment='live';await repo.upsertHotel({...hotel,name:'Live fixture'});await repo.upsertDestination({provider:'hotelbeds',code:'AVE',countryCode:'PT',name:'Live destination'});
    assert.equal((await repo.findHotel('hotelbeds','1')).name,'Live fixture');
    cfg.environment='test';assert.equal((await repo.findHotel('hotelbeds','1')).name,'Test fixture');assert.equal((await repo.getCounts()).hotels,1);
    assert.equal((await repo.findDestinations({countryCode:'PT'}))[0].name,'Test destination');
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM provider_hotels')).rows[0].n,2);
  } finally {cfg.environment='test';pool.query=original;await db.query('ROLLBACK');db.release();await pool.end();}
});
