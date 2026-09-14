// Offline adapters only; DB writes stay in an isolated, rolled-back local schema.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const safe={NODE_ENV:'production',ACTIVE_PROVIDER:'hotelbeds',HOTELBEDS_ENV:'test',HOTELBEDS_ENABLED:'true',HOTELBEDS_STAGING_TEST_ENABLED:'true',HOTELBEDS_READ_ONLY:'true',HOTELBEDS_READ_RETRIES:'0',HOTELBEDS_API_KEY:'offline-key',HOTELBEDS_API_SECRET:'offline-secret',PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'none',HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com',HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com',HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com',HOTELBEDS_TEST_CONTENT_SCOPES:'PT:CEN,PT:ALT,FR:OTH',HOTELBEDS_TEST_CONTENT_COUNT:'2'};
for(const key of ['HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED','PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOT_DEALS_MONITOR_ENABLED','HOTELBEDS_CONTENT_SYNC_ENABLED'])safe[key]='false';
Object.assign(process.env,safe);
process.env.OFFER_TOKEN_SECRET=require('crypto').randomBytes(32).toString('hex');
const service=require('../services/hotelbedsTestContent');
test('configured scope allowlist is bounded, explicit, fail-closed and legacy compatible',()=>{
  assert.equal(service.scopes(safe).length,3);
  assert.equal(service.selection(safe,'PT:CEN').destinationCode,'CEN');
  for(const id of [undefined,'PT:UNKNOWN','https://invalid',{},'FR:CEN'])assert.throws(()=>service.selection(safe,id));
  for(const list of ['PT:CEN,PT:CEN','PT:CEN,FR:CEN','bad','PT:A1,PT:A2,PT:A3,PT:A4,PT:A5,PT:A6'])assert.throws(()=>service.scopes({...safe,HOTELBEDS_TEST_CONTENT_SCOPES:list}));
  assert.throws(()=>service.scopes({...safe,HOTELBEDS_TEST_CONTENT_COUNT:'21'}));
  assert.equal(service.selection({...safe,HOTELBEDS_TEST_CONTENT_SCOPES:'',HOTELBEDS_TEST_CONTENT_COUNTRY:'PT',HOTELBEDS_TEST_CONTENT_DESTINATION:'CEN'}).id,'PT:CEN');
});
test('admin HTTP accepts only configured scope IDs; catalog API exposes counts without raw data',async t=>{
  const express=require('express'),jwt=require('jsonwebtoken'),repo=require('../repositories/providerCatalogRepository'),pool=require('../db');
  process.env.JWT_SECRET=require('crypto').randomBytes(32).toString('hex');
  t.mock.method(repo,'findDestinations',async()=>[{code:'CEN',country_code:'PT',name:'Centre Portugal',hotel_count:10,raw_data:{hidden:'fixture'}},{code:'ALT',country_code:'PT',name:'Offline alternate',hotel_count:0},{code:'OTH',country_code:'FR',name:'Offline other',hotel_count:3}]);
  t.mock.method(repo,'getCounts',async()=>({hotels:13,destinations:3}));t.mock.method(pool,'query',async()=>({rows:[]}));
  const calls=[];t.mock.method(service,'run',async options=>{calls.push(options);return {status:'PASS'};});
  const app=express();app.use(express.json());app.use('/catalog',require('../routes/catalog'));app.use('/admin',require('../routes/adminOperations'));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base=`http://127.0.0.1:${server.address().port}`;
  try {
    const data=await (await fetch(base+'/catalog/test-options')).json();assert.equal(data.countriesCount,2);assert.equal(data.hotelsCount,13);assert.equal(data.destinations[1].hotelCount,0);assert.equal(JSON.stringify(data).includes('raw_data'),false);
    const headers={'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:1,role:'admin'},process.env.JWT_SECRET)};
    for(const body of [{scopeId:'PT:NOPE'},{scopeId:'PT:CEN',url:'https://invalid'},{scopeId:'PT:CEN',from:101},{scopeId:'PT:CEN',count:20},{scopeId:'PT:CEN',action:'all'},{scopeId:['PT:CEN','PT:ALT']},{scopeId:'PT:CEN',to:200},{scopeId:'PT:CEN',page:2},{scopeId:4},{}]) {
      const response=await fetch(base+'/admin/providers/hotelbeds/content',{method:'POST',headers,body:JSON.stringify(body)});assert.ok([400,409].includes(response.status));
    }
    assert.equal(calls.length,0);
    assert.equal((await fetch(base+'/admin/providers/hotelbeds/content',{method:'POST',headers,body:JSON.stringify({scopeId:'PT:CEN'})})).status,200);
    assert.deepEqual(calls,[{scopeId:'PT:CEN'}]);
    assert.equal((await fetch(base+'/admin/providers/hotelbeds/content',{method:'POST',headers,body:JSON.stringify({scopeId:'PT:CEN',action:'next'})})).status,200);
    assert.deepEqual(calls[1],{scopeId:'PT:CEN',action:'next'});
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('multi-scope imports, catalog counts, search filters, signed details and isolation in local rollback schema',async t=>{
  const pool=require('../db'),repo=require('../repositories/providerCatalogRepository'),config=require('../config/providers').hotelbeds;
  const host=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL).hostname:process.env.DB_HOST||'localhost';
  assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(host));
  const db=await pool.connect(),original=pool.query;
  let clock=Date.now();t.mock.method(Date,'now',()=>clock);
  const fixture=[{code:1,countryCode:'PT',destinationCode:'CEN',name:{content:'Offline CEN A'},categoryCode:'4EST'},{code:2,countryCode:'PT',destinationCode:'CEN',name:{content:'Offline CEN B'},categoryCode:'3EST'},{code:3,countryCode:'PT',destinationCode:'ALT',name:{content:'Offline ALT'}},{code:4,countryCode:'FR',destinationCode:'OTH',name:{content:'Offline OTHER'}}];
  let contentCalls=0;
  const client={contentDestinations:async({countryCodes})=>{contentCalls++;return {destinations:[{code:'CEN',countryCode:'PT',name:{content:'Centre Portugal'}},{code:'ALT',countryCode:'PT',name:{content:'Offline alternate'}},{code:'OTH',countryCode:'FR',name:{content:'Offline other'}}].filter(row=>row.countryCode===countryCodes)};},contentHotels:async({destinationCode})=>{contentCalls++;return {hotels:fixture.filter(row=>row.destinationCode===destinationCode)};}};
  // Import commits release only a savepoint; outer fixture transaction is never committed.
  let savepoint=false;
  const wrapped={query:async(sql,params)=>{
    if(sql==='BEGIN'){savepoint=true;return db.query('SAVEPOINT import_fixture');}
    if(sql==='COMMIT'){savepoint=false;return db.query('RELEASE SAVEPOINT import_fixture');}
    if(sql==='ROLLBACK'){if(savepoint){savepoint=false;return db.query('ROLLBACK TO SAVEPOINT import_fixture');}return {rows:[]};}
    return db.query(sql,params);
  },release(){}};
  try {
    await db.query('BEGIN');await db.query('CREATE SCHEMA sprint3i_fixture');await db.query('SET LOCAL search_path TO sprint3i_fixture');
    const fs=require('fs'),path=require('path'),dir=path.join(__dirname,'../../database/migrations');
    for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())await db.query(fs.readFileSync(path.join(dir,file),'utf8'));
    pool.query=db.query.bind(db);
    for(const scopeId of ['PT:CEN','PT:ALT','FR:OTH','PT:CEN']){
      clock+=61000;const before=contentCalls;
      assert.equal((await service.run({env:safe,scopeId,client,repository:repo,pool:{connect:async()=>wrapped}})).status,'PASS');
      assert.equal(contentCalls-before,2);
    }
    assert.equal((await repo.getCounts()).hotels,4);
    const destinations=await repo.findDestinations({countryCode:'PT'});
    assert.deepEqual(destinations.map(row=>row.code).sort(),['ALT','CEN']);
    assert.equal(destinations.find(row=>row.code==='CEN').hotel_count,2);
    assert.equal((await repo.findHotel('hotelbeds','1')).name,'Offline CEN A');
    await repo.upsertDestination({provider:'hotelbeds',code:'EMPTY',countryCode:'PT',name:'Offline empty'});
    config.environment='live';await repo.upsertHotel({provider:'hotelbeds',providerHotelId:'1',name:'Offline LIVE',destinationCode:'CEN',countryCode:'PT'});config.environment='test';
    const api=require('../integrations/hotelbeds/client'),search=require('../services/searchService'),cache=require('../services/memoryCache');
    t.mock.method(require('../services/priceHistoryService'),'record',async()=>{});
    for(const method of ['contentHotels','contentDestinations','checkRates','createBooking','cancelBooking'])t.mock.method(api,method,async()=>assert.fail('Forbidden operation'));
    t.mock.method(require('../services/paymentGatewayService'),'createIntent',async()=>assert.fail('Forbidden payment'));
    const requests=[];
    const dynamic=code=>({code,currency:'EUR',name:'Dynamic '+code,rooms:[{code:code===1?'SUP':'STD',name:code===1?'Superior Room':'Standard Room',rates:[{rateKey:'offline-'+code,rateType:'BOOKABLE',net:code===1?'120':'80',paymentType:'AT_WEB',boardCode:code===1?'BB':'RO',boardName:code===1?'Breakfast':'Room Only',rooms:1,adults:2,children:0}]}]});
    t.mock.method(api,'availability',async payload=>{requests.push(payload.hotels.hotel);return {hotels:{hotels:[dynamic(4),...payload.hotels.hotel.map(dynamic),dynamic(3424)]}};});
    const query={provider:'hotelbeds',destinationCode:'CEN',country:'PT',departureDate:'2030-04-01',nights:1,people:2};
    async function run(patch={}){cache.clear();return (await search.search({...query,...patch})).data;}
    let offers=await run({hotelCodes:'4',sort:'priceAsc'});assert.deepEqual(offers.map(row=>row.providerHotelId),['2','1']);assert.deepEqual(requests.at(-1),[1,2]);
    assert.deepEqual((await run({sort:'priceDesc'})).map(row=>row.providerHotelId),['1','2']);
    assert.deepEqual((await run({food:'BB'})).map(row=>row.providerHotelId),['1']);
    assert.deepEqual((await run({stars:'4'})).map(row=>row.providerHotelId),['1']);
    assert.deepEqual((await run({roomType:'Superior'})).map(row=>row.providerHotelId),['1']);
    assert.equal(offers[0].bookingDisabled,true);assert.equal(offers[0].nights,1);
    assert.equal(require('../services/offerTokenService').verify(offers[0].offerToken).providerHotelId,'2');
    assert.equal((await require('../sources/hotelbeds').getHotelById('3',{...query,checkIn:query.departureDate})).providerHotelId,'3');
    assert.deepEqual((await run({destinationCode:'ALT'})).map(row=>row.providerHotelId),['3']);
    const before=requests.length;await assert.rejects(run({destinationCode:'EMPTY'}),{code:'TEST_CATALOG_EMPTY'});assert.equal(requests.length,before);
    assert.equal((await run({stagingTestHotel:'3424'}))[0].providerHotelId,'3424');
    clock+=61000;client.contentHotels=async()=>({hotels:[{...fixture[0],destinationCode:'ALT'}]});
    await assert.rejects(service.run({env:safe,scopeId:'PT:ALT',client,repository:repo,pool:{connect:async()=>wrapped}}));
    assert.equal((await repo.findHotel('hotelbeds','1')).destination_code,'CEN');
    cache.clear();
  } finally {config.environment='test';pool.query=original;await db.query('ROLLBACK');db.release();await pool.end();}
});
