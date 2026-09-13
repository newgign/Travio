const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildConfig } = require('../config/hotelbeds');
const safe = { NODE_ENV:'production', ACTIVE_PROVIDER:'hotelbeds', HOTELBEDS_ENV:'test', HOTELBEDS_ENABLED:'true',
  HOTELBEDS_STAGING_TEST_ENABLED:'true', HOTELBEDS_READ_ONLY:'true',
  HOTELBEDS_API_KEY:'offline-test-key', HOTELBEDS_API_SECRET:'offline-test-secret',
  HOTELBEDS_BOOKING_ENABLED:'false', HOTELBEDS_LIVE_BOOKING_ENABLED:'false',
  PRODUCTION_SALES_ENABLED:'false', REAL_CHARGES_ENABLED:'false', REAL_REFUNDS_ENABLED:'false',
  HOT_DEALS_MONITOR_ENABLED:'false', HOTELBEDS_CONTENT_SYNC_ENABLED:'false',
  PAYMENTS_MODE:'disabled', PAYMENTS_PROVIDER:'none',
  HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com', HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com',
  HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com',
  HOTELBEDS_TEST_PROBE_HOTEL_CODES:'1', HOTELBEDS_TEST_PROBE_CHECKIN:'2030-01-01', HOTELBEDS_TEST_PROBE_CHECKOUT:'2030-01-02' };
Object.assign(process.env, safe);
const { HotelbedsClient } = require('../integrations/hotelbeds/client');
const service = require('../services/hotelbedsTestReadOnlyService');

test('admin credential fingerprint uses exact effective client credentials and never returns raw values', () => {
  const diagnostics=require('../integrations/hotelbeds/adminCredentialDiagnostics');
  const crypto=require('node:crypto');
  const env={...safe,HOTELBEDS_API_KEY:'fixture-key-with-space ',HOTELBEDS_API_SECRET:'preferred-fixture-secret',HOTELBEDS_SECRET:'legacy-fixture-secret'};
  for(const patch of [{},{HOTELBEDS_API_SECRET:''},{HOTELBEDS_API_SECRET:undefined},{HOTELBEDS_API_SECRET:'  '}]) {
    const config=buildConfig({...env,...patch});const client=new HotelbedsClient(config);
    const d=diagnostics(client.config);
    assert.deepEqual(d,diagnostics(config));
    assert.equal(d.credentialPairFingerprint,crypto.createHash('sha256').update(config.apiKey+'\0'+config.secret).digest('hex').slice(0,12));
    assert.equal(client.createSignature(123),crypto.createHash('sha256').update(config.apiKey+config.secret+'123').digest('hex'));
    assert.equal(d.usingHotelbedsApiSecret,Boolean(({...env,...patch}).HOTELBEDS_API_SECRET));
    assert.equal(d.usingLegacyHotelbedsSecret,!d.usingHotelbedsApiSecret);
    assert.equal(d.apiKeyLength,config.apiKey.length);assert.equal(d.apiSecretLength,config.secret.length);
    for(const value of [env.HOTELBEDS_API_KEY,env.HOTELBEDS_API_SECRET,env.HOTELBEDS_SECRET])assert.equal(JSON.stringify(d).includes(value),false);
    assert.deepEqual(Object.keys(d).sort(),['apiKeyLength','apiSecretLength','credentialPairFingerprint','usingHotelbedsApiSecret','usingLegacyHotelbedsSecret'].sort());
  }
  const original=diagnostics(buildConfig(env)).credentialPairFingerprint;
  assert.notEqual(original,diagnostics(buildConfig({...env,HOTELBEDS_API_KEY:'different-key'})).credentialPairFingerprint);
  assert.notEqual(original,diagnostics(buildConfig({...env,HOTELBEDS_API_SECRET:'different-secret'})).credentialPairFingerprint);
  const live=diagnostics(buildConfig({...env,HOTELBEDS_ENV:'live',HOTELBEDS_LIVE_API_SECRET:'live-fixture'}));
  assert.equal(live.usingHotelbedsApiSecret,false);assert.equal(live.usingLegacyHotelbedsSecret,false);
  assert.equal('credentialPairFingerprint' in service.preflight(safe,()=>{}),false);
  assert.equal('credentialPairFingerprint' in new HotelbedsClient(buildConfig(env)).readiness(),false);
});

test('production TEST requires explicit opt-in; every unsafe flag fails closed; LIVE unaffected', () => {
  for (const flag of [undefined,'false','TRUE']) assert.throws(()=>new HotelbedsClient(buildConfig({...safe,HOTELBEDS_STAGING_TEST_ENABLED:flag})).assertConfigured());
  const c=buildConfig(safe); assert.equal(c.stagingTestAllowed,true); new HotelbedsClient(c).assertConfigured();
  for(const field of ['HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED','PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOT_DEALS_MONITOR_ENABLED','HOTELBEDS_CONTENT_SYNC_ENABLED']) {
    for(const value of ['true',undefined]) assert.equal(buildConfig({...safe,[field]:value}).stagingTestAllowed,false);
  }
  for(const patch of [{PAYMENTS_MODE:'sandbox'},{PAYMENTS_PROVIDER:'sandbox'},{HOTELBEDS_READ_ONLY:'false'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'}]) assert.equal(service.preflight({...safe,...patch},()=>({})).status,'BLOCKED');
  assert.equal(buildConfig({...safe,HOTELBEDS_READ_ONLY:undefined}).readOnly,true);
  const live=buildConfig({HOTELBEDS_ENV:'live',HOTELBEDS_STAGING_TEST_ENABLED:'true'});
  assert.equal(live.stagingTestAllowed,false); assert.equal(live.apiKey,''); assert.equal(live.secret,''); assert.equal(live.bookingBaseUrl,'https://api-mtls.hotelbeds.com');
  assert.ok(buildConfig({...safe,HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.hotelbeds.com'}).configurationErrors.length);
});

test('TEST preflight validates TLS without network and refuses LIVE; parameters never inherit LIVE selection', async () => {
  let calls=0;
  const ready=service.preflight(safe,()=>{calls++;}); assert.equal(ready.status,'READY'); assert.equal(ready.networkAttempted,false); assert.equal(calls,1);
  for(const code of ['HOTELBEDS_MTLS_CERT_DATE_INVALID','HOTELBEDS_MTLS_KEY_MISMATCH','HOTELBEDS_MTLS_MATERIAL_INVALID']) assert.ok(service.preflight(safe,()=>{throw {code};}).blockers.includes(code));
  assert.equal(service.preflight({...safe,HOTELBEDS_ENV:'live'},()=>{}).status,'BLOCKED');
  const result=await service.run({env:{...safe,HOTELBEDS_TEST_PROBE_HOTEL_CODES:'',HOTELBEDS_LIVE_PROBE_HOTEL_CODES:'1'},availability:true,validateTls:()=>{},createClient:()=>{throw Error('network');}});
  assert.equal(result.networkAttempted,false);assert.equal(result.status,'BLOCKED');
});

test('TEST transport only permits status Availability CheckRate; all mutations and Content blocked before network', async () => {
  const c=new HotelbedsClient(buildConfig(safe));let calls=0;
  c.getBookingAgent=()=>undefined;c.bookingHttp.request=async opts=>{calls++;assert.equal(opts.maxRedirects,0);return {status:200,data:{}};};
  for(const options of [{method:'POST',url:'/hotel-api/1.0/bookings'},{method:'DELETE',url:'/hotel-api/1.0/bookings/1'},{method:'GET',url:'/hotel-api/1.0/bookings/1'},{channel:'content',url:'/hotel-content-api/1.0/hotels'}]) {
    await assert.rejects(c.request(options),{code:'HOTELBEDS_READ_ONLY_OPERATION_BLOCKED'});
    await assert.rejects(c.performRequest(options),{code:'HOTELBEDS_READ_ONLY_OPERATION_BLOCKED'});
  }
  assert.equal(calls,0);await c.status();await c.availability({});await c.checkRates('offline');assert.equal(calls,3);
});

test('bounded TEST smoke BOOKABLE skips CheckRate; RECHECK requires actual matching product', async () => {
  for(const rateType of ['BOOKABLE','RECHECK']) {
    const rate={rateKey:'offline-only',rateType,net:'100',rooms:1,adults:2,children:0,boardCode:'BB',rateClass:'NOR',paymentType:'AT_WEB',packaging:false};
    const hotel={code:1,currency:'EUR',rooms:[{code:'DBL',rates:[rate]}]}; const calls=[];
    const result=await service.run({env:safe,checkRate:true,validateTls:()=>{},createClient:()=>({
      status:async()=>calls.push('status'),availability:async()=>{calls.push('availability');return {hotels:{hotels:[hotel]}};},
      checkRates:async key=>{assert.equal(key,rate.rateKey);calls.push('checkrate');return {hotel};},readiness:()=>({httpStatus:200}) })});
    assert.equal(result.status,'PASS');assert.equal(result.environment,'test');assert.deepEqual(calls,rateType==='RECHECK'?['status','availability','checkrate']:['status','availability']);
    assert.deepEqual(result.operations[1].currencies,['EUR']);assert.deepEqual(result.operations[1].priceSources,['net']);assert.equal(JSON.stringify(result).includes(rate.rateKey),false);
  }
});

test('public staging search reaches TEST provider, errors never fall back to mock, local booking blocked before DB', async t => {
  const manager=require('../providers/providerManager');assert.equal(manager.getProvider('hotelbeds').name,'hotelbeds');assert.throws(()=>manager.getProvider('mock'));
  const provider=manager.getProvider('hotelbeds');let calls=0;
  t.mock.method(provider,'searchHotels',async()=>{calls++;throw Object.assign(Error('unavailable'),{code:'AUTH_ERROR'});});
  await assert.rejects(require('../services/searchService').search({publicOnly:'true',hotelCodes:[1]}),{code:'AUTH_ERROR'});assert.equal(calls,1);
  const pool=require('../db');t.mock.method(pool,'connect',()=>{throw Error('Must not access DB');});
  let status,body;const res={status:n=>{status=n;return res;},json:x=>{body=x;}};
  await require('../controllers/bookingController').createBooking({body:{}},res);
  assert.equal(status,503);assert.equal(body.code,'HOTELBEDS_READ_ONLY_OPERATION_BLOCKED');
  assert.equal(require('../services/productionGateService').state().productionSalesEnabled,false);
});

test('provider TEST data passes public search with exact currency/amount, signed labels and isolated cache', async t => {
  const client=require('../integrations/hotelbeds/client');
  const cache=require('../services/memoryCache');cache.clear();
  const rate={rateKey:'offline-search-rate',rateType:'BOOKABLE',net:'123.45',rooms:1,adults:2,children:0,boardCode:'BB',rateClass:'NOR',paymentType:'AT_WEB',packaging:false};
  const filters={publicOnly:'true',hotelCodes:'1',departureDate:'2030-01-01',nights:1,people:2,children:0};
  t.mock.method(client,'availability',async()=>({hotels:{hotels:[{code:1,name:'Offline test hotel',currency:'EUR',destinationCode:'TST',rooms:[{code:'DBL',rates:[rate]}]}]}}));
  t.mock.method(require('../repositories/providerCatalogRepository'),'findHotelsByIds',async()=>[]);
  t.mock.method(require('../services/priceHistoryService'),'record',async offers=>{assert.equal(offers[0].priceEnvironment,'test');});
  t.mock.method(require('../services/hotelbedsMonitorService'),'track',async()=>{});
  process.env.OFFER_TOKEN_SECRET=require('node:crypto').randomBytes(32).toString('hex');
  const result=await require('../services/searchService').search(filters);
  assert.equal(result.data.length,1);
  const offer=result.data[0];assert.equal(offer.price,123.45);assert.equal(offer.currency,'EUR');assert.equal(offer.providerAmount,123.45);assert.equal(offer.priceSource,'net');
  assert.equal(offer.priceEnvironment,'test');assert.equal(offer.bookingDisabled,true);assert.equal(offer.stagingTestAllowed,true);
  const decoded=require('../services/offerTokenService').verify(offer.offerToken);
  assert.equal(decoded.priceEnvironment,'test');assert.equal(decoded.bookingDisabled,true);
  assert.equal(cache.has(JSON.stringify({environment:'test',provider:'hotelbeds',filters})),true);
  assert.equal(cache.has(JSON.stringify({environment:'live',provider:'hotelbeds',filters})),false);cache.clear();
});

test('TEST errors and empty availability cannot manufacture results', async () => {
  for(const code of ['AUTH_ERROR','TIMEOUT','RATE_LIMIT','PROVIDER_UNAVAILABLE']) {
    let calls=0;
    const result=await service.run({env:safe,availability:true,validateTls:()=>{},createClient:()=>({
      status:async()=>{},availability:async()=>{calls++;throw {code};},readiness:()=>({httpStatus:null}) })});
    assert.equal(result.status,'FAIL');assert.equal(calls,1);assert.equal(result.operations[1].code,code);
  }
  const empty=await service.run({env:safe,checkRate:true,validateTls:()=>{},createClient:()=>({
    status:async()=>{},availability:async()=>({hotels:{hotels:[]}}),readiness:()=>({httpStatus:200}),
    checkRates:async()=>{throw Error('Must not recheck empty result');} })});
  assert.equal(empty.operations[1].hotelCount,0);assert.equal(empty.operations[1].status,'EMPTY');assert.equal(empty.operations[2].status,'NOT APPLICABLE');
});

test('frontend TEST display requires public opt-in AND server TEST read-only labels', async () => {
  const fs=require('node:fs');const path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../../frontend/src/utils/providerEnvironment.js'),'utf8');
  for(const enabled of ['true','false']) {
    const module=await import('data:text/javascript;base64,'+Buffer.from(source.replaceAll('import.meta.env',JSON.stringify({VITE_HOTELBEDS_STAGING_TEST_ENABLED:enabled}))).toString('base64'));
    const offer={provider:'hotelbeds',priceEnvironment:'test',stagingTestAllowed:true,bookingDisabled:true};
    assert.equal(module.visibleProviderOffer(offer),enabled==='true');
    for(const patch of [{provider:'mock'},{stagingTestAllowed:false},{bookingDisabled:false}])assert.equal(module.visibleProviderOffer({...offer,...patch}),false);
    assert.equal(module.visibleProviderOffer({...offer,priceEnvironment:'live'}),true);
  }
});

test('admin buttons use boolean-only options and require every TEST safety condition', async () => {
  const fs=require('node:fs');const path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../../frontend/src/utils/hotelbedsProbe.js'),'utf8');
  const {canProbeTest,probeOptions}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.deepEqual(JSON.parse(probeOptions(false).body),{availability:false,checkRate:false});
  assert.deepEqual(JSON.parse(probeOptions(true).body),{availability:true,checkRate:false});
  const ready={environment:'test',stagingTestAllowed:true,connection:{credentialsConfigured:true,mtlsReady:true},bookingDisabled:true,paymentsDisabled:true,salesReady:false};
  assert.equal(canProbeTest(ready),true);
  for(const patch of [{environment:'live'},{stagingTestAllowed:false},{bookingDisabled:false},{paymentsDisabled:false},{salesReady:true},{connection:{credentialsConfigured:true,mtlsReady:false}},{connection:{credentialsConfigured:false,mtlsReady:true}}])assert.equal(canProbeTest({...ready,...patch}),false);
  assert.equal(canProbeTest(null),false);
});

test('admin HTTP handler rejects client environment/selection and forwards only booleans to TEST runner', async t => {
  const router=require('../routes/adminOperations');
  const route=router.stack.find(layer=>layer.route?.path==='/providers/hotelbeds/probe'&&layer.route.methods.post).route;
  assert.equal(route.stack.length,2); // Permission middleware remains before handler; auth/role on router.
  const handler=route.stack.at(-1).handle;
  const calls=[];t.mock.method(service,'runAdminProbe',async options=>{calls.push(options);return {status:'PASS',environment:'test',operations:[]};});
  let code,body;const res={status:n=>{code=n;return res;},json:x=>{body=x;return res;}};
  for(const payload of [{hostname:'example.org'},{environment:'live'},{hotelCodes:[1]},{checkIn:'2030-01-01'},{availability:'true'},{checkRate:1},[]]) {
    await handler({body:payload},res);assert.equal(code,400);assert.equal(body.status,'BLOCKED');
  }
  assert.equal(calls.length,0);
  await handler({body:{availability:false,checkRate:false}},res);
  await handler({body:{availability:true,checkRate:false}},res);
  assert.deepEqual(calls,[{availability:false,checkRate:false},{availability:true,checkRate:false}]);
  assert.equal(body.environment,'test');
});

test('TEST/LIVE status uses signed ordinary host; Availability/CheckRate use mTLS host', async () => {
  for(const environment of ['test','live']) {
    const cfg=environment==='test'?buildConfig(safe):buildConfig({HOTELBEDS_ENV:'live',HOTELBEDS_ENABLED:'true',HOTELBEDS_LIVE_API_KEY:'offline-live-key',HOTELBEDS_LIVE_API_SECRET:'offline-live-secret'});
    const client=new HotelbedsClient(cfg);const requests=[];let agents=0;
    client.getBookingAgent=()=>{agents++;return {offline:true};};
    client.bookingHttp.request=async options=>{requests.push(options);return {status:200,data:{}};};
    await client.status();assert.equal(agents,0);
    assert.equal(requests[0].baseURL,environment==='test'?'https://api.test.hotelbeds.com':'https://api.hotelbeds.com');
    assert.equal(requests[0].headers['X-Signature'],client.createSignature());
    assert.equal(requests[0].headers['Api-key'],cfg.apiKey);
    assert.equal(client.bookingHttp.defaults.headers.Accept,'application/json');
    assert.equal(requests[0].httpsAgent,undefined);
    await client.availability({});await client.checkRates('offline-only');assert.equal(agents,2);
    for(const request of requests.slice(1))assert.equal(request.baseURL,environment==='test'?'https://api-mtls.test.hotelbeds.com':'https://api-mtls.hotelbeds.com');
    assert.ok(requests.every(request=>request.maxRedirects===0));
    await assert.rejects(client.request({method:'GET',url:'https://example.org/hotel-api/1.0/status'}));
    await client.performRequest({method:'GET',url:'/hotel-api/1.0/status',baseURL:'https://example.org'});
    assert.equal(requests.at(-1).baseURL,cfg.baseUrl);
  }
});

test('missing mTLS does not prevent signed status but blocks Availability/CheckRate and their probe', async () => {
  const cfg=buildConfig({...safe,HOTELBEDS_MTLS_CERT_PATH:'',HOTELBEDS_MTLS_KEY_PATH:''});
  const client=new HotelbedsClient(cfg);let calls=0;
  client.bookingHttp.request=async()=>{calls++;return {status:200,data:{}};};
  await client.status();assert.equal(calls,1);
  await assert.rejects(client.availability({}));await assert.rejects(client.checkRates('offline-only'));assert.equal(calls,1);
  const env={...safe,HOTELBEDS_MTLS_CERT_PATH:'',HOTELBEDS_MTLS_KEY_PATH:''};
  const createClient=()=>client;
  const status=await service.run({env,createClient});assert.equal(status.status,'PASS');assert.equal(status.mtlsReady,false);
  assert.equal(status.operations[0].hostname,'api.test.hotelbeds.com');
  const before=calls;const blocked=await service.run({env,availability:true,createClient});
  assert.equal(blocked.status,'BLOCKED');assert.equal(calls,before);
});

test('TEST auth diagnostics use strict reason enum and numeric headers only', () => {
  const {normalizeAccessError,publicDiagnostics}=require('../integrations/hotelbeds/accessDiagnostics');
  for(const [message,reason] of [
    ['Access to this API has been disallowed','HBX_API_DISALLOWED'],
    ['Access to this resource has been disallowed','HBX_RESOURCE_DISALLOWED'],
    ['Quota exceeded','HBX_QUOTA_EXCEEDED'],
    ['Request signature verification failed','HBX_SIGNATURE_FAILED'],
    ['Authorization field missing','HBX_AUTH_MISSING'],
    ['unknown confidential text','HBX_UNKNOWN_AUTH_ERROR'],
  ]) for(const status of [401,403]) {
    assert.deepEqual(normalizeAccessError({status,data:{error:{message}}}),{providerReason:reason});
    assert.deepEqual(normalizeAccessError({status,data:{message}}),{providerReason:reason});
  }
  assert.deepEqual(normalizeAccessError({status:429}),{providerReason:'HBX_RATE_LIMITED'});
  assert.deepEqual(normalizeAccessError({status:500,data:{message:'Quota exceeded'}}),{});
  assert.deepEqual(normalizeAccessError({status:403,data:'Quota exceeded'}),{providerReason:'HBX_UNKNOWN_AUTH_ERROR'});
  assert.deepEqual(normalizeAccessError({status:403,headers:{'X-RateLimit-Limit':'50','X-RateLimit-Remaining':'0','Retry-After':'60','Authorization':'secret'}}),
    {providerReason:'HBX_UNKNOWN_AUTH_ERROR',rateLimit:50,rateLimitRemaining:0,retryAfterSeconds:60});
  for(const value of ['',null,'secret','-1','Infinity','1.2','9007199254740992']) {
    assert.deepEqual(normalizeAccessError({status:403,headers:{'retry-after':value,'x-ratelimit-remaining':value}}),{providerReason:'HBX_UNKNOWN_AUTH_ERROR'});
  }
  assert.deepEqual(publicDiagnostics({providerReason:'raw secret',rawBody:'private',retryAfterSeconds:'secret'}),{});
});

test('actual client-to-TEST-probe error path never exposes raw body/material and invokes status only', async () => {
  const secrets=['offline-api-secret-value','offline-passphrase-value','/private/secret-file','offline-private-key-content'];
  const client=new HotelbedsClient(buildConfig(safe));let calls=0;
  client.bookingHttp.request=async options=>{
    calls++;assert.equal(options.url,'/hotel-api/1.0/status');
    throw {response:{status:403,data:{error:{message:'Access to this API has been disallowed'},raw:secrets,rateKey:'hidden-rate-key'},headers:{'x-ratelimit-remaining':'0','retry-after':'7'}}};
  };
  const result=await service.run({env:safe,validateTls:()=>{},createClient:()=>client});
  assert.equal(calls,1);assert.equal(result.status,'FAIL');
  const operation=result.operations[0];assert.equal(operation.httpStatus,403);assert.equal(operation.code,'AUTH_ERROR');assert.equal(operation.providerReason,'HBX_API_DISALLOWED');
  assert.equal(operation.rateLimitRemaining,0);assert.equal(operation.retryAfterSeconds,7);
  for(const value of [...secrets,'hidden-rate-key',safe.HOTELBEDS_API_KEY,safe.HOTELBEDS_API_SECRET,'Access to this API has been disallowed'])assert.equal(JSON.stringify(result).includes(value),false);
});

test('missing selection blocks before transport while status-only is independent; output omits raw data', async () => {
  const missing={...safe,HOTELBEDS_TEST_PROBE_HOTEL_CODES:''};let calls=0;
  const createClient=()=>{calls++;return {status:async()=>({secret:'never-render-this',rateKey:'never-render-key'}),readiness:()=>({httpStatus:200})};};
  const blocked=await service.run({env:missing,availability:true,validateTls:()=>{},createClient});
  assert.equal(blocked.status,'BLOCKED');assert.equal(blocked.networkAttempted,false);assert.equal(calls,0);
  const status=await service.run({env:missing,availability:false,checkRate:false,validateTls:()=>{},createClient});
  assert.equal(status.status,'PASS');assert.equal(calls,1);assert.deepEqual(status.operations.map(x=>x.operation),['status']);
  for(const value of ['never-render-this','never-render-key','offline-test-secret','offline-test-key'])assert.equal(JSON.stringify(status).includes(value),false);
});
