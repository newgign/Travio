const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { buildConfig } = require('../config/hotelbeds');
const { HotelbedsClient } = require('../integrations/hotelbeds/client');
const { loadTlsOptions } = require('../integrations/hotelbeds/mtls');
const { preflight, availabilityPayload, run } = require('../services/hotelbedsLiveReadOnlyService');
const env = {
  NODE_ENV:'production', HOTELBEDS_ENV:'live', HOTELBEDS_ENABLED:'true', HOTELBEDS_READ_ONLY:'true',
  HOTELBEDS_LIVE_API_KEY:'offline-key', HOTELBEDS_LIVE_API_SECRET:'offline-secret',
  HOTELBEDS_LIVE_MTLS_CERT_PATH:'offline-cert', HOTELBEDS_LIVE_MTLS_KEY_PATH:'offline-key-file',
};
const validTls = () => ({});

test('LIVE defaults read-only, TEST behavior unchanged, credentials never inherit', () => {
  assert.equal(buildConfig({HOTELBEDS_ENV:'live'}).readOnly,true);
  assert.equal(buildConfig({HOTELBEDS_ENV:'test'}).readOnly,false);
  assert.equal(buildConfig({HOTELBEDS_ENV:'live',HOTELBEDS_API_KEY:'test',HOTELBEDS_SECRET:'test'}).apiKey,'');
});

test('read-only allowlist blocks bookings/cancellation/direct transport/unknown paths before network', async () => {
  const client = new HotelbedsClient(buildConfig(env));
  let calls=0;
  client.bookingHttp.request=async()=>{calls++;return {data:{},status:200};};
  client.getBookingAgent=()=>undefined;
  for(const [method,url] of [['POST','/hotel-api/1.0/bookings'],['post','/hotel-api/1.0/bookings/'],['DELETE','/hotel-api/1.0/bookings/1'],['PUT','/hotel-api/1.0/bookings/1'],['GET','/hotel-api/1.0/bookings'],['GET','https://example.org'],['POST','/hotel-api/1.0/hotels?bypass=1']]) {
    await assert.rejects(client.request({method,url}),{code:'HOTELBEDS_READ_ONLY_OPERATION_BLOCKED'});
    await assert.rejects(client.performRequest({method,url}),{code:'HOTELBEDS_READ_ONLY_OPERATION_BLOCKED'});
  }
  await assert.rejects(client.cancelBooking('fixture',{simulation:true}),{code:'HOTELBEDS_READ_ONLY_OPERATION_BLOCKED'});
  assert.equal(calls,0);
  await client.status();await client.availability({});await client.checkRates('offline-rate');
  assert.equal(calls,3);
  client.assertReadOnlyOperation({channel:'content',method:'GET',url:'/hotel-content-api/1.0/types/boards'});
  assert.throws(()=>client.assertReadOnlyOperation({channel:'content',method:'POST',url:'/hotel-content-api/1.0/hotels'}));
  assert.equal(require('../services/productionGateService').state().productionSalesEnabled,false);
});

test('preflight blocks missing secrets/TLS, TEST URLs and unsafe flags without leaking paths', async () => {
  let calls=0;
  const createClient=()=>{calls++;throw new Error('Must not create transport');};
  for(const patch of [
    {HOTELBEDS_ENV:'test'}, {HOTELBEDS_LIVE_API_KEY:''}, {HOTELBEDS_LIVE_API_SECRET:''},
    {HOTELBEDS_ENABLED:'false'}, {HOTELBEDS_READ_ONLY:'false'}, {HOTELBEDS_BOOKING_ENABLED:'true'},
    {HOTELBEDS_LIVE_BOOKING_ENABLED:'true'}, {PRODUCTION_SALES_ENABLED:'true'}, {REAL_CHARGES_ENABLED:'true'},
    {HOT_DEALS_MONITOR_ENABLED:'true'}, {HOTELBEDS_CONTENT_SYNC_ENABLED:'true'}, {PAYMENTS_MODE:'sandbox'},
    {HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com'}, {NODE_TLS_REJECT_UNAUTHORIZED:'0'},
  ]) {
    const result=await run({env:{...env,...patch},validateTls:validTls,createClient});
    assert.equal(result.status,'BLOCKED');assert.equal(result.networkAttempted,false);
  }
  const result=preflight(env,()=>{throw new Error('/private/secret-key-file');});
  assert.equal(JSON.stringify(result).includes('/private'),false);
  assert.equal(JSON.stringify(result).includes('offline-secret'),false);
  assert.equal(calls,0);
  assert.equal((await run({env,validateTls:validTls,createClient,dryRun:true})).status,'READY');
  assert.equal(calls,0);
});

test('probe selection is explicit, bounded and rejects invalid calendar dates', () => {
  const selection={HOTELBEDS_LIVE_PROBE_HOTEL_CODES:'1,2',HOTELBEDS_LIVE_PROBE_CHECKIN:'2030-01-01',HOTELBEDS_LIVE_PROBE_CHECKOUT:'2030-01-03'};
  const now=Date.parse('2029-01-01');
  assert.equal(availabilityPayload(selection,now).occupancies[0].children,0);
  for(const patch of [{HOTELBEDS_LIVE_PROBE_HOTEL_CODES:''},{HOTELBEDS_LIVE_PROBE_HOTEL_CODES:'1,2,3,4,5,6'},{HOTELBEDS_LIVE_PROBE_CHECKIN:'2030-02-30'},{HOTELBEDS_LIVE_PROBE_CHECKOUT:'2030-01-30'},{HOTELBEDS_LIVE_PROBE_ADULTS:'2.5'}]) assert.throws(()=>availabilityPayload({...selection,...patch},now),{code:'INVALID_PROBE_PARAMETERS'});
});

test('status/Availability/CheckRate probe uses current rate only, no payload logs or retries', async () => {
  const calls=[];
  const createClient=config=>{
    assert.equal(config.maxRetries,0);
    return {readiness:()=>({httpStatus:200}),status:async()=>calls.push('status'),
      availability:async()=>{calls.push('availability');return {hotels:{hotels:[{code:1,currency:'EUR',rooms:[{code:'DBL',rates:[{boardCode:'BB',rateClass:'NOR',paymentType:'AT_WEB',packaging:false,rooms:1,adults:2,children:0,net:'100',rateType:'RECHECK',rateKey:'sensitive-offline-rate'}]}]}]}};},
      checkRates:async key=>{assert.equal(key,'sensitive-offline-rate');calls.push('checkrate');return {hotel:{code:1,currency:'EUR',rooms:[{code:'DBL',rates:[{boardCode:'BB',rateClass:'NOR',paymentType:'AT_WEB',packaging:false,rooms:1,adults:2,children:0,net:'105',rateType:'BOOKABLE',rateKey:'checked-offline'}]}]}};}};
  };
  const future=new Date();future.setUTCDate(future.getUTCDate()+30);const checkIn=future.toISOString().slice(0,10);future.setUTCDate(future.getUTCDate()+2);
  const configured={...env,HOTELBEDS_LIVE_PROBE_HOTEL_CODES:'1',HOTELBEDS_LIVE_PROBE_CHECKIN:checkIn,HOTELBEDS_LIVE_PROBE_CHECKOUT:future.toISOString().slice(0,10)};
  const result=await run({env:configured,validateTls:validTls,createClient,checkRate:true});
  assert.equal(result.status,'PASS');assert.deepEqual(calls,['status','availability','checkrate']);
  assert.equal(JSON.stringify(result).includes('sensitive-offline-rate'),false);
  const failure=await run({env,validateTls:validTls,createClient:()=>({readiness:()=>({httpStatus:401}),status:async()=>{throw Object.assign(new Error('offline-secret'),{code:'AUTH_ERROR'});}})});
  assert.equal(failure.status,'FAIL');assert.equal(failure.operations[0].code,'AUTH_ERROR');assert.equal(JSON.stringify(failure).includes('offline-secret'),false);
});

test('mTLS validates temporary cert/key, expiry and readable material; TLS verification is explicit', t => {
  const openssl=process.platform==='win32'?'C:\\Program Files\\Git\\usr\\bin\\openssl.exe':'openssl';
  if(cp.spawnSync(openssl,['version'],{windowsHide:true}).status!==0) return t.skip('OpenSSL is required only to generate temporary TLS test material');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asedeliya-mtls-test-'));
  const key=path.join(dir,'fixture.key'),cert=path.join(dir,'fixture.crt');
  try {
    cp.execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{stdio:'ignore',windowsHide:true});
    const config={mtlsCertPath:cert,mtlsKeyPath:key};
    const options=loadTlsOptions(config);assert.equal(options.rejectUnauthorized,true);assert.equal(options.minVersion,'TLSv1.2');
  const certificate=new crypto.X509Certificate(fs.readFileSync(cert));
    assert.throws(()=>loadTlsOptions(config,Date.parse(certificate.validFrom)-1),{code:'HOTELBEDS_MTLS_CERT_DATE_INVALID'});
    assert.throws(()=>loadTlsOptions(config,Date.parse(certificate.validTo)+1),{code:'HOTELBEDS_MTLS_CERT_DATE_INVALID'});
    assert.throws(()=>loadTlsOptions({...config,mtlsKeyPath:path.join(dir,'absent.key')}),error=>error.code==='HOTELBEDS_MTLS_FILES_UNREADABLE'&&!error.message.includes(dir));
    const originalKey=fs.readFileSync(key);
    fs.writeFileSync(key,crypto.createPrivateKey(originalKey).export({type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase:'offline-fixture-passphrase'}));
    assert.throws(()=>loadTlsOptions(config),{code:'HOTELBEDS_MTLS_MATERIAL_INVALID'});
    assert.equal(loadTlsOptions({...config,mtlsKeyPassphrase:'offline-fixture-passphrase'}).rejectUnauthorized,true);
    const different=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
    fs.writeFileSync(key,different);
    assert.throws(()=>loadTlsOptions(config),{code:'HOTELBEDS_MTLS_KEY_MISMATCH'});
    fs.writeFileSync(key,'invalid');assert.throws(()=>loadTlsOptions(config),{code:'HOTELBEDS_MTLS_MATERIAL_INVALID'});
  } finally {
    // Only the exact files created above, no recursive filesystem operation.
    for(const file of [key,cert])if(fs.existsSync(file))fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});

test('empty/BOOKABLE/invalid Availability never invokes CheckRate, booking or payment', async t => {
  let mutations=0;
  t.mock.method(require('../services/paymentGatewayService'),'createIntent',async()=>{mutations++;throw new Error('Forbidden payment');});
  const future=new Date();future.setUTCDate(future.getUTCDate()+30);const checkIn=future.toISOString().slice(0,10);future.setUTCDate(future.getUTCDate()+1);
  const configured={...env,HOTELBEDS_LIVE_PROBE_HOTEL_CODES:'1',HOTELBEDS_LIVE_PROBE_CHECKIN:checkIn,HOTELBEDS_LIVE_PROBE_CHECKOUT:future.toISOString().slice(0,10)};
  for(const response of [{hotels:{hotels:[]}},{hotels:{hotels:[{code:1,rooms:[{rates:[{rateType:'BOOKABLE',rateKey:'offline-only'}]}]}]}},{}]) {
    let checks=0;
    const result=await run({env:configured,validateTls:validTls,checkRate:true,createClient:()=>({
      readiness:()=>({httpStatus:200}),status:async()=>({}),availability:async()=>response,
      checkRates:async()=>{checks++;throw new Error('Unnecessary checkrate');},
      createBooking:async()=>{mutations++;throw new Error('Forbidden booking');},cancelBooking:async()=>{mutations++;throw new Error('Forbidden cancellation');}
    })});
    assert.equal(checks,0);assert.equal(result.status,response.hotels?'PASS':'FAIL');
  }
  assert.equal(mutations,0);
});

test('admin probe serializes requests and reports process-scoped readiness safely', async () => {
  const service=require('../services/hotelbedsLiveReadOnlyService');
  let release;const wait=new Promise(resolve=>{release=resolve;});
  const first=service.runAdminProbe({env,validateTls:validTls,createClient:()=>({status:()=>wait,readiness:()=>({httpStatus:200})})});
  const blocked=await service.runAdminProbe({env,validateTls:validTls});
  assert.equal(blocked.status,'BLOCKED');assert.equal(blocked.networkAttempted,false);
  release();await first;
  assert.equal(service.probeState().status,'PASS');assert.equal(service.probeState().scope,'process');
  assert.equal((await service.runAdminProbe()).status,'BLOCKED');
  const ready=preflight(env,validTls);
  for(const field of ['apiKeyConfigured','secretConfigured','certificateConfigured','privateKeyConfigured','caConfigured','mtlsReady'])assert.equal(typeof ready[field],'boolean');
});
