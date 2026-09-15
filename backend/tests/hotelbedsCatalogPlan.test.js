const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),{Pool}=require('pg');
const safe={NODE_ENV:'production',ACTIVE_PROVIDER:'hotelbeds',HOTELBEDS_ENV:'test',HOTELBEDS_ENABLED:'true',HOTELBEDS_STAGING_TEST_ENABLED:'true',HOTELBEDS_READ_ONLY:'true',HOTELBEDS_API_KEY:'offline-key',HOTELBEDS_API_SECRET:'offline-secret',HOTELBEDS_READ_RETRIES:'0',PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'none',HOTELBEDS_TEST_CONTENT_SCOPES:'PT:CEN,AE:DXB,TR:AYT'};
for(const key of ['HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED','PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOT_DEALS_MONITOR_ENABLED','HOTELBEDS_CONTENT_SYNC_ENABLED'])safe[key]='false';
Object.assign(process.env,safe);
test('3N planner, HTTP authorization and persisted UI refresh: offline PostgreSQL',async t=>{
  const base=require('../db'),opts=require('../config/database').databaseConfig();
  const host=opts.connectionString?new URL(opts.connectionString).hostname:opts.host||'localhost';
  assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(host));
  const schema='sprint3n_'+require('crypto').randomBytes(8).toString('hex');
  await base.query(`CREATE SCHEMA ${schema}`);
  const fixture=new Pool({...opts,options:`-c search_path=${schema}`,max:6});
  const cleanup=base.query.bind(base);
  t.after(async()=>{await fixture.end();await cleanup(`DROP SCHEMA ${schema} CASCADE`);await base.end();});
  const dir=path.join(__dirname,'../../database/migrations');
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await fixture.query(fs.readFileSync(path.join(dir,file),'utf8'));
  t.mock.method(base,'query',fixture.query.bind(fixture));
  t.mock.method(require('https'),'request',()=>assert.fail('REAL PROVIDER NETWORK FORBIDDEN'));
  const accessModule=require('../services/hotelbedsTestAccess'),access=accessModule.create(fixture);
  for(const name of ['inspect','begin','finish','assertAvailable','withControl','arm'])t.mock.method(accessModule,name,access[name]);
  await access.inspect();
  const content=require('../services/hotelbedsTestContent'),planner=require('../services/hotelbedsCatalogPlan');
  const config=require('../config/hotelbeds').buildConfig(safe);
  const client=new content.ContentClient({...config,requestIntervalMs:0});
  let calls=0,posts=0,clock=Date.now(),mode='two',within=0;
  t.mock.method(Date,'now',()=>clock);
  client.contentHttp.request=async request=>{
    calls++;within++;
    if(request.url.endsWith('/destinations'))return {status:200,data:{destinations:mode==='three' && within===1?[]:[{code:'CEN',countryCode:'PT',name:{content:'Centre Portugal'}}]}};
    const codes=mode==='duplicate'?[1]:mode==='three'?[103]:[101,102];
    return {status:200,data:{hotels:codes.map(code=>({code,countryCode:'PT',destinationCode:'CEN',name:{content:'Offline '+code}}))}};
  };
  const originalRun=content.run;
  t.mock.method(content,'run',async options=>{posts++;within=0;return originalRun({...options,client,pool:fixture});});
  async function count(n){
    await fixture.query("DELETE FROM provider_hotels WHERE destination_code='CEN' AND content_environment='test'");
    await fixture.query("INSERT INTO provider_hotels(provider,provider_hotel_id,country_code,destination_code,name,content_environment) SELECT 'hotelbeds',n::text,'PT','CEN','Offline','test' FROM generate_series(1,$1::int) n",[n]);
  }
  async function states(contentState='READY',bookingState='READY'){
    await fixture.query("UPDATE provider_job_state SET details=jsonb_build_object('state',$1::text) WHERE job='hotelbeds_test_access_content'",[contentState]);
    await fixture.query("UPDATE provider_job_state SET details=jsonb_build_object('state',$1::text) WHERE job='hotelbeds_test_access_booking_read'",[bookingState]);
    clock+=61000;
    await fixture.query("DELETE FROM provider_job_state WHERE job='test_content_import'");
  }
  await fixture.query("INSERT INTO provider_destinations(provider,code,country_code,name,content_environment) VALUES('hotelbeds','CEN','PT','Centre Portugal','test'),('hotelbeds','DXB','AE','Dubai','test'),('hotelbeds','AYT','TR','Antalya','test')");
  const express=require('express'),jwt=require('jsonwebtoken');
  process.env.JWT_SECRET=require('crypto').randomBytes(32).toString('hex');
  const headers=role=>({'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:1,role},process.env.JWT_SECRET)});
  const app=express();app.use(express.json());app.use('/admin',require('../routes/adminOperations'));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  const fetcher=async(route,options={})=>{const response=await fetch(url+route,{...options,headers:headers('admin')});const body=await response.json();if(!response.ok)throw Object.assign(new Error('Offline admin rejected'),{code:body.code});return body;};
  await t.test('0/1/10/11/19/20/21 plans share authoritative importer count and batchPlan',async()=>{
    await states();
    for(const [n,from,to,size] of [[0,1,10,10],[1,2,11,10],[10,11,20,10],[11,12,20,9],[19,20,20,1],[20,null,null,0],[21,null,null,0]]){
      await count(n);const plan=await planner.inspect();const row=plan.scopes.find(s=>s.scopeId==='PT:CEN');
      assert.equal(row.hotelCount,n);assert.equal(row.remaining,Math.max(0,20-n));assert.equal(row.nextFrom,from);assert.equal(row.nextTo,to);assert.equal(row.nextCount,size);
      assert.equal(row.complete,n>=20);assert.equal(row.overCap,n>20);assert.equal(row.state,n>=20?'COMPLETE':n?'READY':'EMPTY');
      assert.equal(row.manualImportAvailable,n<20);assert.equal(row.label,'Centre Portugal');assert.equal(plan.maxRequestsPerImport,content.limits.requests);
    }assert.equal(calls,0);
  });
  await t.test('A/B/C endpoint is admin-only, ignores no overrides, uses allowlist and zero provider calls',async()=>{
    const route='/admin/providers/hotelbeds/catalog-plan';
    assert.equal((await fetch(url+route)).status,401);assert.equal((await fetch(url+route,{headers:headers('user')})).status,403);
    for(const query of ['from=5','count=10','provider=hotelbeds','environment=live','url=bad','scopeId=ZZ:NOPE'])assert.equal((await fetch(url+route+'?'+query,{headers:headers('admin')})).status,400);
    const data=await fetcher(route);assert.deepEqual(data.scopes.map(s=>s.scopeId),['AE:DXB','TR:AYT','PT:CEN']);
    for(const forbidden of ['rateKey','Api-key','X-Signature','offline-secret','quotaRemaining','officialQuota','raw_data'])assert.equal(JSON.stringify(data).includes(forbidden),false);
    assert.equal(calls,0);
    const before=posts;
    await assert.rejects(fetcher('/admin/providers/hotelbeds/content',{method:'POST',body:JSON.stringify({scopeId:'PT:CEN',action:'next',count:10})}));assert.equal(posts,before);
  });
  await t.test('G/H/I/J Content readiness and cooldown are independent of blocked Booking read',async()=>{
    await count(10);
    for(const state of ['UNKNOWN_BLOCKED','AUTH_BLOCKED','READY']){
      await states(state,'AUTH_BLOCKED');const data=await planner.inspect();const row=data.scopes.find(s=>s.scopeId==='PT:CEN');
      assert.equal(row.manualImportAvailable,state==='READY');
      if(state!=='READY'){assert.equal(row.unavailableReason,state);await assert.rejects(content.run({scopeId:'PT:CEN',action:'next'}));}
    }assert.equal(calls,0);
    await fixture.query("INSERT INTO provider_job_state(job,environment,last_run) VALUES('test_content_import','test',$1)",[new Date(clock)]);
    const waiting=await planner.inspect();assert.equal(waiting.cooldown.state,'WAIT');assert.equal(waiting.scopes.find(s=>s.scopeId==='PT:CEN').manualImportAvailable,false);
    await assert.rejects(content.run({scopeId:'PT:CEN',action:'next'}));assert.equal(calls,0);
  });
  await t.test('K COMPLETE/over-cap reject stale ordinary import before transport',async()=>{
    for(const n of [20,21]){await states();await count(n);await assert.rejects(content.run({scopeId:'PT:CEN',action:'next'}));}assert.equal(calls,0);
  });
  await t.test('M/N/O/P UI store refreshes persisted +2/+3 counters and next range without a second import',async()=>{
    const {createHotelbedsAdminStore}=await import('../../frontend/src/services/hotelbedsAdminStore.js');
    await states();await count(10);const store=createHotelbedsAdminStore(fetcher);let notifications=0;
    const unsubscribe=store.subscribe(()=>notifications++);
    await store.refresh();
    for(const [nextMode,cost,expectedCount] of [['two',2,12],['three',3,13]]){
      clock+=61000;await store.refresh();mode=nextMode;
      const before=store.getSnapshot().access.breakdown.content.today,beforePosts=posts,beforeCalls=calls;
      await Promise.all([store.importScope('PT:CEN'),store.importScope('PT:CEN')]);
      const view=store.getSnapshot(),row=view.plan.scopes.find(s=>s.scopeId==='PT:CEN');
      assert.equal(calls-beforeCalls,cost);assert.equal(posts-beforePosts,1);
      assert.equal(view.access.breakdown.content.today,before+cost);assert.equal(view.plan.observed.breakdown.content.today,before+cost);
      assert.equal(row.hotelCount,expectedCount);assert.equal(row.nextFrom,expectedCount+1);assert.equal(view.plan.totals.hotels,expectedCount);
      assert.ok(view.access.circuits.content.lastSuccessAt);assert.equal(view.plan.cooldown.state,'WAIT');
    }
    assert.ok(notifications>3);unsubscribe();
  });
  await t.test('L duplicates/no-growth refresh derives next range from DB, never intended COUNT',async()=>{
    const {createHotelbedsAdminStore}=await import('../../frontend/src/services/hotelbedsAdminStore.js');
    await states();mode='duplicate';const store=createHotelbedsAdminStore(fetcher);await store.refresh();
    const before=store.getSnapshot().plan.scopes.find(s=>s.scopeId==='PT:CEN');await store.importScope('PT:CEN');
    const after=store.getSnapshot().plan.scopes.find(s=>s.scopeId==='PT:CEN');assert.equal(after.hotelCount,before.hotelCount);assert.equal(after.nextFrom,before.nextFrom);
  });
  await t.test('R TEST planner excludes LIVE and unconfigured scopes; LIVE config cannot use planner',async()=>{
    await fixture.query("INSERT INTO provider_hotels(provider,provider_hotel_id,country_code,destination_code,name,content_environment) VALUES('hotelbeds','999','PT','CEN','Offline LIVE','live'),('hotelbeds','998','PT','OTHER','Offline outside','test')");
    const result=await planner.inspect();assert.equal(result.scopes.find(s=>s.scopeId==='PT:CEN').hotelCount,13);assert.equal(result.totals.hotels,13);
    await assert.rejects(planner.inspect({env:{...safe,HOTELBEDS_ENV:'live'}}));
    assert.equal(require('../services/paymentGatewayService').readiness().mode,'disabled');
    await assert.rejects(client.createBooking({}));
  });
});
