const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),{Pool}=require('pg');
const safe={NODE_ENV:'production',HOTELBEDS_ENV:'test',HOTELBEDS_ENABLED:'true',HOTELBEDS_STAGING_TEST_ENABLED:'true',HOTELBEDS_READ_ONLY:'true',HOTELBEDS_API_KEY:'offline-key',HOTELBEDS_API_SECRET:'offline-secret',HOTELBEDS_READ_RETRIES:'0',PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'none',HOTELBEDS_TEST_CONTENT_SCOPES:'PT:CEN,PT:ALT'};
for(const key of ['HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED','PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOT_DEALS_MONITOR_ENABLED','HOTELBEDS_CONTENT_SYNC_ENABLED'])safe[key]='false';
Object.assign(process.env,safe);
test('3M / 3M.1 persistent PostgreSQL gates and offline transport',async t=>{
  const base=require('../db'),opts=require('../config/database').databaseConfig();
  const host=opts.connectionString?new URL(opts.connectionString).hostname:opts.host||'localhost';
  assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(host));
  const schema='sprint3m_'+require('crypto').randomBytes(8).toString('hex');
  const fixture=new Pool({...opts,options:`-c search_path=${schema}`,max:5});
  await base.query(`CREATE SCHEMA ${schema}`);
  t.after(async()=>{await fixture.end();await base.query(`DROP SCHEMA ${schema} CASCADE`);await base.end();});
  const dir=path.join(__dirname,'../../database/migrations');
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await fixture.query(fs.readFileSync(path.join(dir,file),'utf8'));
  const module=require('../services/hotelbedsTestAccess'),access=module.create(fixture);
  for(const name of ['begin','finish','inspect','assertAvailable','arm','withControl'])t.mock.method(module,name,access[name]);
  t.mock.method(require('https'),'request',()=>assert.fail('REAL NETWORK FORBIDDEN'));
  const {HotelbedsClient}=require('../integrations/hotelbeds/client');
  const {buildConfig}=require('../config/hotelbeds');
  const service=require('../services/hotelbedsTestContent'),{ContentClient}=service;
  const bookingControl=require('../services/hotelbedsBookingReadControl');
  const config={...buildConfig(safe),requestIntervalMs:0};
  let calls=0,status=200,clock=Date.now();
  t.mock.method(Date,'now',()=>clock);
  function transport(){calls++;if(status!==200)throw {response:{status,data:{rateKey:'secret-rate',raw:'secret-response'},headers:{Authorization:'secret-auth'}}};return {status:200,data:{hotels:{hotels:[]}}};}
  function client(Type=HotelbedsClient,environment='test') {const c=new Type({...config,environment});c.bookingHttp.request=async()=>transport();c.contentHttp.request=async()=>transport();c.getBookingAgent=()=>undefined;return c;}
  const api=client(),content=client(ContentClient);
  const control=(c=api)=>bookingControl.run({env:safe,client:c});
  const state=async key=>(await access.inspect()).circuits[key];
  async function reset(initial='READY') {
    await fixture.query("DELETE FROM provider_job_state WHERE job IN ('hotelbeds_test_access_content','hotelbeds_test_access_booking_read')");
    await access.inspect(); status=200;clock+=61000;
    if(initial==='READY' || initial==='AUTH_BLOCKED'){
      // Explicit established-access fixture; runtime initialization remains UNKNOWN_BLOCKED.
      await fixture.query("UPDATE provider_job_state SET details='{\"state\":\"READY\"}' WHERE job IN ('hotelbeds_test_access_content','hotelbeds_test_access_booking_read')");
    }
    if(initial==='AUTH_BLOCKED'){status=403;await assert.rejects(api.availability({}));await assert.rejects(content.contentHotels());}
    status=200;calls=0;
    await fixture.query("DELETE FROM provider_job_state WHERE job='test_content_import'");
  }
  await t.test('missing identities ignore old READY, block every read and fabricate no auth history',async()=>{
    await reset('UNKNOWN_BLOCKED');
    await fixture.query("INSERT INTO provider_job_state(job,environment,details) VALUES('hotelbeds_test_access','test','{\"state\":\"READY\"}')");
    await fixture.query("DELETE FROM provider_job_state WHERE job IN ('hotelbeds_test_access_content','hotelbeds_test_access_booking_read')");
    for(const fn of [()=>api.status(),()=>api.availability({}),()=>api.checkRates('secret-rate'),()=>content.contentHotels()])await assert.rejects(fn(),{code:'HOTELBEDS_UNKNOWN_BLOCKED'});
    assert.equal(calls,0);
    for(const s of Object.values((await access.inspect()).circuits)){assert.equal(s.state,'UNKNOWN_BLOCKED');assert.equal(s.lastAuthErrorAt,null);assert.equal(s.lastAuthErrorCategory,null);assert.equal(s.lastSuccessAt,null);}
  });
  await t.test('A/B Content 403 persists only Content; Availability and STATUS stay independent',async()=>{
    await reset();status=403;await assert.rejects(content.contentDestinations(),{code:'AUTH_ERROR'});assert.equal(calls,1);
    assert.equal((await module.create(fixture).inspect()).circuits.content.state,'AUTH_BLOCKED');
    await assert.rejects(content.contentHotels(),{code:'HOTELBEDS_AUTH_BLOCKED'});assert.equal(calls,1);
    status=200;await api.availability({});await api.status();assert.equal(calls,3);
    assert.equal((await state('booking_read')).state,'READY');assert.equal((await state('content')).state,'AUTH_BLOCKED');
    assert.equal((await access.inspect()).summary,'PARTIAL');
  });
  await t.test('Availability 403 blocks booking reads while Content remains available',async()=>{
    await reset();status=403;await assert.rejects(api.availability({}));status=200;
    await content.contentHotels();assert.equal(calls,2);assert.equal((await state('content')).state,'READY');
    await assert.rejects(api.availability({}),{code:'HOTELBEDS_AUTH_BLOCKED'});assert.equal(calls,2);
  });
  await t.test('C/D public Availability, diagnostic 3424, CheckRate and ordinary status consume neither permit',async()=>{
    await reset('AUTH_BLOCKED');await access.arm('AVAILABILITY_3424');await access.arm('CONTENT','PT:CEN');
    for(const fn of [()=>api.availability({hotels:{hotel:[3424]}}),()=>api.checkRates('secret-rate'),()=>api.status(),()=>content.contentHotels()])await assert.rejects(fn(),{code:'HOTELBEDS_AUTH_BLOCKED'});
    assert.equal(calls,0);assert.equal((await state('booking_read')).armed,true);assert.equal((await state('content')).armed,true);
  });
  await t.test('E/F/G two consumers get one booking permit; arm zero network; recovery only booking read',async()=>{
    const results=await Promise.allSettled([control(),control(client())]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);
    assert.equal((await state('booking_read')).state,'READY');assert.equal((await state('content')).state,'AUTH_BLOCKED');assert.equal((await state('content')).armed,true);
    assert.throws(()=>api.controlStatus(),{code:'HOTELBEDS_CONTROL_INVALID'});
    await assert.rejects(access.arm('STATUS'),{code:'HOTELBEDS_CONTROL_INVALID'});
  });
  await t.test('H/I auth and non-auth control failures consume permit without recovery',async()=>{
    for(const http of [403,500,401,429]){
      await reset('AUTH_BLOCKED');await access.arm('AVAILABILITY_3424');status=http;
      await assert.rejects(control());assert.equal(calls,1);
      assert.equal((await state('booking_read')).state,'AUTH_BLOCKED');assert.equal((await state('booking_read')).armed,false);
      await assert.rejects(control());assert.equal(calls,1);
    }
  });
  await t.test('UNKNOWN permits recover via validated Availability; invalid response does not prove recovery',async()=>{
    await reset('UNKNOWN_BLOCKED');await access.arm('AVAILABILITY_3424');
    const invalid=client();invalid.bookingHttp.request=async()=>{calls++;return {status:200,data:{}};};
    await assert.rejects(control(invalid),{code:'HOTELBEDS_CONTROL_FAILED'});assert.equal((await state('booking_read')).state,'UNKNOWN_BLOCKED');assert.equal((await state('booking_read')).lastSuccessAt,null);
    await access.arm('AVAILABILITY_3424');await control();assert.equal((await state('booking_read')).state,'READY');assert.equal((await state('content')).state,'UNKNOWN_BLOCKED');
  });
  await t.test('J UTC today / rolling 24h breakdown counts actual transport only',async()=>{
    await reset();await fixture.query("DELETE FROM system_events WHERE category='hotelbeds_test_read'");
    await api.status();await api.availability({});await api.checkRates('secret-rate');await content.contentHotels();
    let result=await access.inspect();assert.equal(result.today,4);assert.equal(result.last24h,4);
    for(const c of ['status','content','availability','checkrate'])assert.equal(result.breakdown[c].today,1);
    await fixture.query("UPDATE system_events SET created_at=date_trunc('day',NOW() AT TIME ZONE 'UTC')-INTERVAL '1 second'");
    result=await access.inspect();assert.equal(result.today,0);assert.equal(result.last24h,4);
    await fixture.query("UPDATE system_events SET created_at=(NOW() AT TIME ZONE 'UTC')-INTERVAL '25 hours'");
    assert.equal((await access.inspect()).last24h,0);
    const ticket=await access.begin('status');await access.finish(ticket,{attempted:false,success:false});assert.equal((await access.inspect()).last24h,0);
  });
  await t.test('3O.2 normalization overflow preserves the completed Availability transport observation',async sub=>{
    await reset();
    const singleton=require('../integrations/hotelbeds/client');
    const catalog=require('../repositories/providerCatalogRepository');
    const cache=require('../services/memoryCache');
    cache.clear();sub.after(()=>cache.clear());
    const {rate,hotel}=require('./fixtures/hotelbedsSearchQuality');
    const {MAX_CANDIDATES_PER_HOTEL}=require('../services/hotelbedsDisplayRates');
    const response={hotels:{hotels:[hotel(101,Array.from({length:MAX_CANDIDATES_PER_HOTEL+1},(_,i)=>rate(`overflow-${i}`,'100',{boardCode:`B${i}`})))]}};
    let availability=0,checkrate=0,contentCalls=0,signing=0;
    sub.mock.method(api.bookingHttp,'request',async options=>{
      assert.equal(options.url,'/hotel-api/1.0/hotels');calls++;
      return {status:200,data:response};
    });
    sub.mock.method(singleton,'availability',async payload=>{
      availability++;
      const result=await api.availability(payload); // Real request/performRequest/finish, stub HTTP only.
      assert.equal((await access.inspect()).breakdown.availability.today,before+1);
      return result;
    });
    sub.mock.method(singleton,'checkRates',async()=>{checkrate++;assert.fail('CheckRate forbidden');});
    for(const name of ['contentHotels','contentHotelDetails','contentDestinations','contentCountries'])sub.mock.method(singleton,name,async()=>{contentCalls++;assert.fail('Content forbidden');});
    sub.mock.method(catalog,'findDestinations',async()=>[{code:'CEN',country_code:'PT'}]);
    sub.mock.method(catalog,'findHotels',async()=>[{provider_hotel_id:'101'}]);
    sub.mock.method(catalog,'findHotelsByIds',async()=>[]);
    sub.mock.method(require('../services/offerTokenService'),'sign',()=>{signing++;assert.fail('Signing after overflow');});
    sub.mock.method(require('../utils/logger'),'error',()=>{});
    const before=(await access.inspect()).breakdown.availability.today;
    await assert.rejects(require('../services/searchService').search({provider:'hotelbeds',countryCode:'PT',destinationCode:'CEN',checkIn:'2030-04-01',nights:7,adults:2}),{
      code:'TEST_CANDIDATE_LIMIT_EXCEEDED',status:422,message:'Слишком много вариантов размещения. Уточните параметры поиска.'
    });
    assert.equal(availability,1);assert.equal(calls,1);assert.equal(checkrate,0);assert.equal(contentCalls,0);assert.equal(signing,0);
    // Recreate the access service to verify persisted state, not an in-memory counter.
    assert.equal((await module.create(fixture).inspect()).breakdown.availability.today,before+1);
  });
  await t.test('K persistence, API and logs omit credentials, rateKey and raw response',async sub=>{
    await reset();status=403;const logs=[];
    sub.mock.method(require('../utils/logger'),'warn',(...args)=>logs.push(args));
    await assert.rejects(api.status());
    const text=JSON.stringify([(await fixture.query('SELECT * FROM provider_job_state')).rows,(await fixture.query('SELECT * FROM system_events')).rows,await access.inspect(),logs]);
    for(const secret of ['offline-key','offline-secret','secret-rate','secret-response','secret-auth','X-Signature','rateKey','PRIVATE KEY'])assert.equal(text.includes(secret),false);
  });
  await t.test('L TEST/LIVE isolation for both circuits and counters',async()=>{
    await reset('AUTH_BLOCKED');const before=JSON.stringify(await access.inspect());await client(HotelbedsClient,'live').status();
    assert.equal(calls,1);assert.equal(JSON.stringify(await access.inspect()),before);
  });
  await t.test('M normal and permitted bounded Content stop at first/second metadata or hotel 403',async()=>{
    for(const controlled of [false,true])for(const failAt of [1,2,3]){
      await reset(controlled?'UNKNOWN_BLOCKED':'READY');const c=client(ContentClient);let count=0;
      c.contentHttp.request=async()=>{count++;if(count===failAt)throw {response:{status:403}};return {status:200,data:count===1?{destinations:[]}:{destinations:[{code:'CEN',countryCode:'PT',name:{content:'Centre'}}]}};};
      if(controlled)await access.arm('CONTENT','PT:CEN');
      await assert.rejects(service[controlled?'runControl':'run']({env:safe,scopeId:'PT:CEN',client:c,pool:fixture}));
      assert.equal(count,failAt);assert.equal((await state('content')).state,'AUTH_BLOCKED');assert.equal((await state('content')).armed,false);assert.equal((await state('content')).inFlight,false);
      if(controlled)assert.equal((await state('content')).lastSuccessAt,null);
    }
  });
  function importClient(failWrite=false) {
    const c=client(ContentClient);
    c.contentHttp.request=async options=>{calls++;return {status:200,data:options.url.endsWith('/destinations')?{destinations:[{code:'CEN',countryCode:'PT',name:{content:'Centre'}}]}:{hotels:[{code:901,name:{content:'Offline'},countryCode:'PT',destinationCode:'CEN'}]}};};
    const repository=failWrite?{upsertDestination:async()=>{throw Error('offline rollback');}}:undefined;
    return {env:safe,scopeId:'PT:CEN',client:c,pool:fixture,repository};
  }
  await t.test('Content full committed import proves recovery only Content; DB rollback is not recovery',async()=>{
    await reset('UNKNOWN_BLOCKED');await access.arm('CONTENT','PT:CEN');
    await assert.rejects(service.runControl(importClient(true)));assert.equal(calls,2);assert.equal((await state('content')).state,'UNKNOWN_BLOCKED');
    assert.equal((await state('content')).lastSuccessAt,null);assert.equal((await fixture.query('SELECT COUNT(*)::int AS n FROM provider_hotels')).rows[0].n,0);
    clock+=61000;await fixture.query("DELETE FROM provider_job_state WHERE job='test_content_import'");
    await access.arm('CONTENT','PT:CEN');assert.equal((await service.runControl(importClient())).status,'PASS');
    assert.equal((await state('content')).state,'READY');assert.equal((await state('booking_read')).state,'UNKNOWN_BLOCKED');assert.equal((await state('content')).lastSuccessCategory,'content');
  });
  await t.test('Content scope matching and concurrent consumers are atomic across DB connections',async()=>{
    await reset('UNKNOWN_BLOCKED');await access.arm('CONTENT','PT:CEN');
    await assert.rejects(service.runControl({...importClient(),scopeId:'PT:ALT'}));assert.equal(calls,0);assert.equal((await state('content')).armed,true);
    const results=await Promise.allSettled([service.runControl(importClient()),service.runControl(importClient())]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,2);assert.equal((await state('content')).state,'READY');
  });
  await t.test('in-flight tokens and simultaneous controls are independent by circuit',async()=>{
    await reset();const ct=await access.begin('content'),bt=await access.begin('availability');
    assert.notEqual(ct.token,bt.token);await assert.rejects(api.status(),{code:'HOTELBEDS_ACCESS_UNAVAILABLE'});assert.equal(calls,0);
    await access.finish(ct,{attempted:false,success:false});await access.finish(bt,{attempted:false,success:false});
    await reset('UNKNOWN_BLOCKED');await access.arm('CONTENT','PT:CEN');await access.arm('AVAILABILITY_3424');
    const results=await Promise.all([service.runControl(importClient()),control()]);
    assert.equal(results.length,2);assert.equal(calls,3);assert.equal((await access.inspect()).summary,'READY');
  });
  await t.test('control context cannot cross circuits or use STATUS; transport bounds remain enforced',async()=>{
    await reset('UNKNOWN_BLOCKED');await access.arm('CONTENT','PT:CEN');
    await assert.rejects(access.withControl('CONTENT','PT:CEN',()=>api.availability({})),{code:'HOTELBEDS_ACCESS_UNAVAILABLE'});
    assert.equal(calls,0);assert.equal((await state('content')).armed,false);assert.equal((await state('content')).inFlight,false);
    await access.arm('AVAILABILITY_3424');
    await assert.rejects(access.withControl('AVAILABILITY_3424',undefined,()=>api.status()),{code:'HOTELBEDS_ACCESS_UNAVAILABLE'});
    assert.equal(calls,0);assert.equal((await state('booking_read')).state,'UNKNOWN_BLOCKED');
    await access.arm('CONTENT','PT:CEN');
    await assert.rejects(access.withControl('CONTENT','PT:CEN',async()=>{for(let n=0;n<4;n++)await content.contentHotels();}),{code:'HOTELBEDS_ACCESS_UNAVAILABLE'});
    assert.equal(calls,3);assert.equal((await state('content')).state,'UNKNOWN_BLOCKED');
    await access.arm('CONTENT','PT:CEN');
    await assert.rejects(access.withControl('CONTENT','PT:CEN',async()=>({status:'PASS'})),{code:'HOTELBEDS_CONTROL_FAILED'});
    assert.equal((await state('content')).inFlight,false);assert.equal((await state('content')).armed,false);
  });
  await t.test('N booking/cancellation/payment safety remains independent of armed controls',async()=>{
    await reset('AUTH_BLOCKED');await access.arm('AVAILABILITY_3424');calls=0;
    await assert.rejects(api.createBooking({}),{code:'HOTELBEDS_READ_ONLY_OPERATION_BLOCKED'});
    await assert.rejects(api.cancelBooking('offline'),{code:'HOTELBEDS_READ_ONLY_OPERATION_BLOCKED'});assert.equal(calls,0);
    assert.equal(require('../services/paymentGatewayService').readiness().mode,'disabled');
  });
  await t.test('admin endpoints enforce roles, operations and configured scope; arm zero network',async sub=>{
    await reset('UNKNOWN_BLOCKED');
    const express=require('express'),jwt=require('jsonwebtoken');
    process.env.JWT_SECRET=require('crypto').randomBytes(32).toString('hex');
    sub.mock.method(base,'query',async()=>({rows:[]}));
    const actualRun=bookingControl.run;sub.mock.method(bookingControl,'run',()=>actualRun({env:safe,client:api}));
    const app=express();app.use(express.json());app.use('/admin',require('../routes/adminOperations'));
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    try {
      const url=`http://127.0.0.1:${server.address().port}/admin/providers/hotelbeds/access`;
      const headers=role=>({'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:1,role},process.env.JWT_SECRET)});
      assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:headers('user')})).status,403);
      for(const action of ['arm','control']){
        assert.equal((await fetch(url+'/'+action,{method:'POST',headers:headers('user'),body:JSON.stringify({operation:'AVAILABILITY_3424'})})).status,403);
        for(const body of [{},{operation:'STATUS'},{operation:'CONTENT'},{operation:'CONTENT',scopeId:'PT:NOPE'},{operation:'AVAILABILITY_3424',scopeId:'PT:CEN'},{operation:'AVAILABILITY_3424',environment:'test'},{operation:'CONTENT',scopeId:'PT:CEN',url:'https://invalid'},[]])
          assert.equal((await fetch(url+'/'+action,{method:'POST',headers:headers('admin'),body:JSON.stringify(body)})).status,400);
      }
      for(const body of [{operation:'AVAILABILITY_3424'},{operation:'CONTENT',scopeId:'PT:CEN'}])assert.equal((await fetch(url+'/arm',{method:'POST',headers:headers('admin'),body:JSON.stringify(body)})).status,200);
      assert.equal(calls,0);
      const inspected=await (await fetch(url,{headers:headers('admin')})).json();assert.equal(inspected.circuits.booking_read.armed,true);assert.equal(inspected.circuits.content.armed,true);
      assert.equal((await fetch(url+'/control',{method:'POST',headers:headers('admin'),body:JSON.stringify({operation:'AVAILABILITY_3424'})})).status,200);assert.equal(calls,1);
      assert.equal((await fetch(url+'/control',{method:'POST',headers:headers('admin'),body:JSON.stringify({operation:'AVAILABILITY_3424'})})).status,503);assert.equal(calls,1);
    } finally {await new Promise(resolve=>server.close(resolve));}
  });
  await t.test('public diagnostic search checks booking circuit before cache and cannot consume permits',async sub=>{
    await reset();
    const config=require('../config/providers').hotelbeds;config.enabled=true;
    const provider=require('../sources/hotelbeds');require('../providers/providerManager').register('hotelbeds',provider);
    const search=require('../services/searchService');require('../services/memoryCache').clear();
    let providerCalls=0;sub.mock.method(provider,'searchHotels',async()=>{providerCalls++;return [];});
    sub.mock.method(require('../services/priceHistoryService'),'record',async()=>{});
    const query={provider:'hotelbeds',stagingTestHotel:'3424',departureDate:'2030-04-01',nights:1,people:2};
    await search.search(query);assert.equal(providerCalls,1);
    status=403;await assert.rejects(content.contentHotels());await search.search(query);assert.equal(providerCalls,1);
    await assert.rejects(api.availability({}));await access.arm('CONTENT','PT:CEN');await access.arm('AVAILABILITY_3424');calls=0;
    await assert.rejects(search.search(query),{code:'HOTELBEDS_AUTH_BLOCKED'});assert.equal(providerCalls,1);assert.equal(calls,0);
    assert.equal((await state('booking_read')).armed,true);assert.equal((await state('content')).armed,true);
  });
  await t.test('O DB failure fails closed; failed observation leaves latch in only its circuit',async()=>{
    const unavailable=module.create({connect:async()=>{throw Error('secret database error');}});
    await assert.rejects(unavailable.begin('status'),{code:'HOTELBEDS_ACCESS_UNAVAILABLE'});
    await reset();await fixture.query('ALTER TABLE system_events RENAME TO events_unavailable');
    await assert.rejects(api.status(),{code:'HOTELBEDS_ACCESS_UNAVAILABLE'});assert.equal(calls,0);
    await fixture.query('ALTER TABLE events_unavailable RENAME TO system_events');
    const ticket=await access.begin('status');await fixture.query('ALTER TABLE system_events RENAME TO events_unavailable');
    await assert.rejects(access.finish(ticket,{attempted:true,success:true,httpStatus:200}),{code:'HOTELBEDS_ACCESS_UNAVAILABLE'});
    await fixture.query('ALTER TABLE events_unavailable RENAME TO system_events');
    assert.equal((await module.create(fixture).inspect()).circuits.booking_read.inFlight,true);
    await assert.rejects(api.status(),{code:'HOTELBEDS_ACCESS_UNAVAILABLE'});assert.equal(calls,0);
    await content.contentHotels();assert.equal(calls,1);
  });
});
