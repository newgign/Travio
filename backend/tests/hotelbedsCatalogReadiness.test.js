const {test}=require('node:test');
const assert=require('node:assert/strict');
const readiness=require('../services/testCatalogReadiness');
test('local counts and configured zero-hotel scopes are READY/EMPTY, never global import failure',()=>{
  const data=readiness([{code:'CEN',country_code:'PT',name:'Centre Portugal',hotel_count:10}],[{countryCode:'PT',destinationCode:'CEN'},{countryCode:'TH',destinationCode:'HKT'}]);
  assert.equal(data.length,2);assert.equal(data[0].state,'READY');assert.equal(data[1].state,'EMPTY');assert.equal(data[1].hotelCount,0);assert.equal(data[1].name,null);assert.equal(data[1].environment,'test');
});
test('configured HKT with no local hotels blocks before provider; ready identity stays local',async t=>{
  Object.assign(process.env,{NODE_ENV:'production',ACTIVE_PROVIDER:'hotelbeds',HOTELBEDS_ENV:'test',HOTELBEDS_ENABLED:'true',HOTELBEDS_STAGING_TEST_ENABLED:'true',HOTELBEDS_READ_ONLY:'true',HOTELBEDS_READ_RETRIES:'0',PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'none',HOTELBEDS_TEST_CONTENT_SCOPES:'PT:CEN,TH:HKT'});
  for(const key of ['HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED','PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOT_DEALS_MONITOR_ENABLED','HOTELBEDS_CONTENT_SYNC_ENABLED'])process.env[key]='false';
  const repo=require('../repositories/providerCatalogRepository'),api=require('../integrations/hotelbeds/client');let calls=0;
  for(const method of ['availability','contentHotels','contentDestinations','status','checkRates','createBooking','cancelBooking'])t.mock.method(api,method,async()=>{calls++;assert.fail('Forbidden provider call');});
  const rows=[{code:'CEN',country_code:'PT',hotel_count:1}];
  t.mock.method(repo,'findDestinations',async()=>rows);
  t.mock.method(repo,'findHotels',async options=>{if(options.destinationCode==='HKT'){assert.equal(options.countryCode,'TH');return [];}assert.equal(options.countryCode,'PT');assert.equal(options.destinationCode,'CEN');return [{provider_hotel_id:'1'}];});
  const query={provider:'hotelbeds',destinationCode:'HKT',country:'TH',checkIn:'2030-04-01',nights:1,people:2};
  await assert.rejects(require('../services/searchService').search(query),{code:'TEST_CATALOG_EMPTY'});assert.equal(calls,0);
  rows.push({code:'HKT',country_code:'TH',hotel_count:0});
  await assert.rejects(require('../services/searchService').search(query),{code:'TEST_CATALOG_EMPTY'});assert.equal(calls,0);
  const resolve=require('../services/hotelbedsTestDestination'),config=require('../config/providers').hotelbeds;
  const ready=await resolve({...query,destinationCode:'CEN',country:'PT',hotelCodes:'999'},config,repo);assert.deepEqual(ready.hotelCodes,['1']);
  await assert.rejects(resolve({...query,destinationCode:'CEN'},config,repo),{code:'TEST_DESTINATION_COUNTRY_MISMATCH'});
  const diagnostic={...query,stagingTestHotel:'3424'};assert.equal(await resolve(diagnostic,config,repo),diagnostic);assert.equal(calls,0);
});
