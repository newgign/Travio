const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
process.env.NODE_ENV='production';process.env.HOTELBEDS_ENV='live';process.env.HOTELBEDS_ENABLED='true';
process.env.HOTELBEDS_BASE_URL='https://api.hotelbeds.com';
process.env.HOTELBEDS_CONTENT_BASE_URL='https://api.hotelbeds.com';
process.env.HOTELBEDS_BOOKING_BASE_URL='https://api-mtls.hotelbeds.com';
process.env.OFFER_TOKEN_SECRET=crypto.randomBytes(32).toString('hex');
const config=require('../config/providers');
const client=require('../integrations/hotelbeds/client');
const pool=require('../db');
const offer={provider:'hotelbeds',priceEnvironment:'live',providerHotelId:'1',destinationCode:'AYT',checkIn:'2030-01-01',checkOut:'2030-01-03',nights:2,roomCode:'DBL',boardCode:'BB',rateClass:'NOR',paymentType:'AT_WEB',packaging:false,adults:2,children:0,occupancy:{rooms:1,adults:2,children:0},currency:'EUR',priceSource:'net',price:100,rateKey:'offline-only'};

test('TEST signed offer rejected at LIVE checkout before provider request',async t=>{
  const manager=require('../providers/providerManager');
  t.mock.method(manager,'getProvider',()=>({name:'hotelbeds',refreshOffer(){throw new Error('Must reject before refresh');}}));
  const token=require('../services/offerTokenService').sign({...offer,priceEnvironment:'test'});
  let error;
  await require('../controllers/checkoutController').getCheckout({body:{provider:'hotelbeds',offerToken:token}},{},e=>{error=e;});
  assert.equal(error.code,'OFFER_ENVIRONMENT_MISMATCH');
});

test('cache separates environment/provider and all supplied search filters; LIVE error cannot use TEST cache',async t=>{
  const cache=require('../services/memoryCache');cache.clear();
  const manager=require('../providers/providerManager');
  const filters={provider:'hotelbeds',hotelCodes:[1],destinationCode:'AYT',checkIn:'2030-01-01',checkOut:'2030-01-03',rooms:1,adults:2,children:1,childrenAges:'8',food:'BB',stars:5};
  cache.set(JSON.stringify({environment:'test',provider:'hotelbeds',filters}),{data:['TEST-only']});
  let calls=0;
  t.mock.method(manager,'getProvider',()=>({name:'hotelbeds',searchHotels:async()=>{calls++;throw Object.assign(new Error('Unavailable'),{code:'AUTH_ERROR'});}}));
  await assert.rejects(require('../services/searchService').search(filters));assert.equal(calls,1);
  const keys=[];t.mock.method(cache,'set',key=>keys.push(JSON.parse(key)));
  t.mock.method(manager,'getProvider',()=>({name:'hotelbeds',searchHotels:async()=>[]}));
  await require('../services/searchService').search(filters);
  assert.equal(keys[0].environment,'live');assert.equal(keys[0].provider,'hotelbeds');assert.deepEqual(keys[0].filters,filters);cache.clear();
});

test('history records only matching environment; hot deals require prior LIVE observation',async t=>{
  const history=require('../services/priceHistoryService');const writes=[];
  t.mock.method(pool,'query',async(sql,params)=>{writes.push({sql,params});return {rows:[]};});
  await history.record([{...offer,priceEnvironment:'test'},{...offer,provider:'mock'},offer]);
  const rows=JSON.parse(writes[0].params[0]);assert.equal(rows.length,1);assert.equal(rows[0].environment,'live');
  assert.notEqual(history.fingerprint(offer),history.fingerprint({...offer,priceEnvironment:'test'}));
  process.env.HOT_DEAL_MIN_DISCOUNT_PERCENT='10';client.health.lastErrorCategory=null;
  assert.deepEqual(await history.specials(),[]);
  assert.match(writes[1].sql,/old\.environment = 'live'/);assert.match(writes[1].sql,/old\.observed_at < current\.observed_at/);
  client.health.lastErrorCategory='AUTH_ERROR';const before=writes.length;assert.deepEqual(await history.specials(),[]);assert.equal(writes.length,before);
});

test('CheckRate validates product even with unchanged key; children ages and currency cannot change',()=>{
  const {selectCheckedRate}=require('../services/hotelbedsRateIdentity');
  const rate={...offer,rooms:1,adults:2,children:0};const hotel={code:1,currency:'EUR',rooms:[{code:'DBL',rates:[rate]}]};
  assert.equal(selectCheckedRate(offer,{hotel}).rate.rateKey,offer.rateKey);
  for(const patch of [{boardCode:'AI'},{rooms:2},{adults:3},{children:1},{paymentType:'AT_HOTEL'},{packaging:true},{rateClass:'NRF'}]) assert.throws(()=>selectCheckedRate(offer,{hotel:{...hotel,rooms:[{code:'DBL',rates:[{...rate,...patch}]}]}}));
  assert.throws(()=>selectCheckedRate(offer,{hotel:{...hotel,currency:'USD'}}));
  const childOffer={...offer,occupancy:{rooms:1,adults:2,children:1},childrenAges:'8'};
  assert.throws(()=>selectCheckedRate(childOffer,{hotel:{...hotel,rooms:[{code:'DBL',rates:[{...rate,children:1,childrenAges:'9'}]}]}}));
});

test('BOOKABLE performs no CheckRate even with stale recheckRequired flag',async t=>{
  t.mock.method(client,'checkRates',()=>{throw new Error('Unnecessary CheckRate');});
  const bookable={...offer,rateType:'BOOKABLE',recheckRequired:true};
  assert.equal(await require('../sources/hotelbeds').checkRateOffer(bookable),bookable);
});

test('every HTTP request creates a signature; auth/TLS/timeout/429/5xx fail closed without leaking logs',async t=>{
  const {HotelbedsClient}=require('../integrations/hotelbeds/client');const {buildConfig}=require('../config/hotelbeds');
  const c=new HotelbedsClient(buildConfig({HOTELBEDS_ENV:'live',HOTELBEDS_ENABLED:'true',HOTELBEDS_LIVE_API_KEY:'isolated-key',HOTELBEDS_LIVE_API_SECRET:'isolated-secret'}));
  c.getBookingAgent=()=>undefined;
  let signatures=0;const original=c.createSignature.bind(c);c.createSignature=timestamp=>{signatures++;return original(timestamp);};
  const logs=[];const logger=require('../utils/logger');t.mock.method(logger,'info',(...args)=>logs.push(args));t.mock.method(logger,'warn',(...args)=>logs.push(args));
  let requests=0;
  for(const error of [{response:{status:401}},{response:{status:403}},{code:'CERT_HAS_EXPIRED'},{code:'ECONNABORTED'},{response:{status:429,headers:{'retry-after':'1'}}},{response:{status:503}}]) {
    c.bookingHttp.request=async options=>{requests++;assert.equal(options.maxRedirects,0);assert.ok(options.headers['X-Signature']);throw error;};
    await assert.rejects(c.performRequest({url:'/hotel-api/1.0/status'}));
  }
  assert.equal(requests,6);assert.equal(signatures,6);
  const text=JSON.stringify(logs);for(const value of ['isolated-key','isolated-secret','X-Signature','Api-key'])assert.equal(text.includes(value),false);
});
