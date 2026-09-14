const {test}=require('node:test');
const assert=require('node:assert/strict');
const safe = { NODE_ENV:'production', ACTIVE_PROVIDER:'hotelbeds', HOTELBEDS_ENV:'test', HOTELBEDS_ENABLED:'true', HOTELBEDS_STAGING_TEST_ENABLED:'true', HOTELBEDS_READ_ONLY:'true', HOTELBEDS_API_KEY:'offline-key', HOTELBEDS_API_SECRET:'offline-secret', PAYMENTS_MODE:'disabled', PAYMENTS_PROVIDER:'none', HOTELBEDS_TEST_CONTENT_COUNTRY:'PT', HOTELBEDS_TEST_CONTENT_DESTINATION:'AVE', HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com', HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com', HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com' };
for (const key of ['HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED','PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOT_DEALS_MONITOR_ENABLED','HOTELBEDS_CONTENT_SYNC_ENABLED']) safe[key]='false';
Object.assign(process.env,safe);
const service=require('../services/hotelbedsTestContent');
test('3L plans are bounded and complete at twenty',()=>{
  for(const [current,from,count] of [[0,1,10],[1,2,10],[10,11,10],[19,20,1]]) {
    assert.deepEqual(service.batchPlan(current).next,{from,count,to:from+count-1});
    assert.ok(current+count<=20);
  }
  for(const n of [20,21])assert.equal(service.batchPlan(n).next,null);
});
test('3L next action uses locked catalog count, complete makes zero calls, final union fails closed',async t=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  for(const mode of ['next','complete','overflow','repeat']) {
    now+=61000;
    const calls=[],writes=[],queries=[];
    let count=mode==='complete'?20:10;
    const db={release(){},query:async(sql)=>{
      queries.push(sql);
      if(sql.includes('pg_try'))return {rows:[{locked:true}]};
      if(sql.startsWith('SELECT provider_hotel_id'))return {rows:Array.from({length:count},(_,i)=>({provider_hotel_id:String(i+1)}))};
      if(sql==='BEGIN'&&mode==='overflow')count=19; // Concurrent catalog growth before final transaction.
      return {rows:[]};
    }};
    const client={contentDestinations:async()=>{calls.push('metadata');return {destinations:[{code:'AVE',countryCode:'PT',name:{content:'Offline'}}]};},contentHotels:async params=>{
      calls.push(params);
      return {hotels:[mode==='repeat'?1:20,mode==='repeat'?2:21].map(code=>({code,destinationCode:'AVE',countryCode:'PT',name:{content:'Offline '+code}}))};
    }};
    const options={env:{...safe,HOTELBEDS_TEST_CONTENT_SCOPES:''},action:'next',client,pool:{connect:async()=>db},repository:{upsertDestination:async()=>{},upsertHotel:async row=>writes.push(row.providerHotelId)}};
    if(['complete','overflow'].includes(mode)) {
      await assert.rejects(service.run(options));assert.equal(writes.length,0);
      if(mode==='complete')assert.equal(calls.length,0);
      else assert.ok(queries.includes('ROLLBACK'));
    } else {
      assert.equal((await service.run(options)).status,'PASS');
      assert.equal(calls.length,2);assert.equal(calls[1].from,11);assert.equal(calls[1].to,20);
      assert.equal(writes.length,2);
    }
    assert.ok(queries.filter(sql=>sql.startsWith('SELECT provider_hotel_id')).every(sql=>sql.includes("content_environment='test'")&&sql.includes("provider='hotelbeds'")));
  }
});
