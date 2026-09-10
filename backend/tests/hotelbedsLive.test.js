const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.HOTELBEDS_ENV = 'test';
process.env.HOTELBEDS_ENABLED = 'true';
process.env.HOTELBEDS_API_KEY = 'offline-key';
process.env.HOTELBEDS_API_SECRET = 'offline-secret';
process.env.HOTELBEDS_READ_RETRIES = '0';
const { buildConfig } = require('../config/hotelbeds');
const client = require('../integrations/hotelbeds/client');
const provider = require('../sources/hotelbeds');
const pricing = require('../services/hotelbedsPriceService');
const history = require('../services/priceHistoryService');

test('explicit environments and no inherited TEST credentials', () => {
  assert.equal(buildConfig({NODE_ENV:'production'}).environment, 'test');
  const live = buildConfig({HOTELBEDS_ENV:'live', HOTELBEDS_API_KEY:'test', HOTELBEDS_SECRET:'test'});
  assert.equal(live.apiKey, ''); assert.equal(live.secret, '');
  assert.equal(live.baseUrl, 'https://api.hotelbeds.com');
  assert.equal(live.bookingBaseUrl, 'https://api-mtls.hotelbeds.com');
  assert.equal(buildConfig({}).baseUrl, 'https://api.test.hotelbeds.com');
  assert.ok(buildConfig({HOTELBEDS_ENV:'live',HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com'}).configurationErrors.length);
});
test('SHA256 signature uses Unix seconds and backend credentials', () => {
  assert.equal(client.createSignature(1700000000), crypto.createHash('sha256').update('offline-keyoffline-secret1700000000').digest('hex'));
  assert.notEqual(client.createSignature(1700000000), client.createSignature(1700000001));
});
test('selling rate takes priority; hotel currency and missing prices never fabricated', () => {
  assert.equal(pricing.extract({net:'80',sellingRate:'100',commission:'20'}, 'EUR').price,100);
  assert.equal(pricing.extract({net:'80'}, 'USD').price,80);
  assert.equal(pricing.extract({net:'80',hotelMandatory:true}, 'EUR'),null);
  assert.equal(pricing.extract({hotelSellingRate:'100',hotelCurrency:'USD'}, 'EUR'),null);
  assert.equal(pricing.extract({net:'100'}, undefined),null);
  assert.equal(pricing.extract({net:'-1'}, 'EUR'),null);
  assert.equal(pricing.extract({net:'100', taxes:{taxes:[{amount:'10',included:false}]}}, 'EUR').price,100);
  assert.throws(()=>require('../services/currencyService').quote(100,'EUR','KZT'),{code:'FX_NOT_CONFIGURED'});
});
test('LIVE mutations blocked at transport even with flag in automated tests', async () => {
  const prior=client.config;
  client.config={...prior,environment:'live',liveBookingEnabled:true};
  try { await assert.rejects(client.createBooking({}),{code:'HOTELBEDS_LIVE_BOOKING_DISABLED'}); }
  finally {client.config=prior;}
});
test('provider failures sanitized and mutations not retried', async () => {
  const original=client.bookingHttp.request, originalAgent=client.getBookingAgent;
  let count=0;client.getBookingAgent=()=>undefined;
  client.bookingHttp.request=async()=>{count++;throw {response:{status:503,data:{secret:'must-not-escape'}}};};
  try {
    await assert.rejects(client.createBooking({}),e=>e.code==='PROVIDER_UNAVAILABLE'&&!JSON.stringify(e).includes('must-not-escape'));
    assert.equal(count,1);assert.equal(client.readiness().lastErrorCategory,'PROVIDER_UNAVAILABLE');
  } finally {client.bookingHttp.request=original;client.getBookingAgent=originalAgent;}
});
test('production mock and TEST requests fail closed', () => {
  const prior=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try {
    const manager=require('../providers/providerManager');
    assert.throws(()=>manager.getProvider('mock'),{code:'PRODUCTION_PROVIDER_REQUIRED'});
    assert.throws(()=>manager.getProvider('hotelbeds'),{code:'PRODUCTION_PROVIDER_REQUIRED'});
  } finally {process.env.NODE_ENV=prior;}
});
test('offer identity separates environments and cancellation conditions', () => {
  const offer={provider:'hotelbeds',priceEnvironment:'live',providerHotelId:'1',destinationCode:'AYT',checkIn:'2030-01-01',checkOut:'2030-01-08',
    nights:7,roomCode:'DBL',boardCode:'RO',adults:2,children:0,occupancy:{rooms:1,adults:2,children:0},currency:'EUR',rateKey:'exact',priceSource:'net',price:100};
  assert.ok(history.fingerprint(offer));
  assert.equal(history.fingerprint(offer),history.fingerprint({...offer,price:80}));
  assert.notEqual(history.fingerprint(offer),history.fingerprint({...offer,priceEnvironment:'test'}));
  assert.notEqual(history.fingerprint(offer),history.fingerprint({...offer,rateClass:'NRF'}));
  assert.equal(history.discount(null,80),null);
  assert.deepEqual(history.discount(100,80),{originalPrice:100,saving:20,discountPercent:20});
});
test('CheckRate updates price and policies but rejects a different product', async () => {
  const original=client.checkRates;
  const offer={rateKey:'old',recheckRequired:true,roomCode:'DBL',boardCode:'BB',currency:'EUR',price:100,occupancy:{rooms:1,adults:2,children:0}};
  let code='DBL';
  client.checkRates=async()=>({hotel:{currency:'EUR',rooms:[{code,rates:[{rateKey:'new',rateType:'BOOKABLE',boardCode:'BB',rooms:1,adults:2,children:0,net:'90',sellingRate:'120',cancellationPolicies:[{amount:'120',from:'2030-01-01'}]}]}]}});
  try {
    const result=await provider.checkRateOffer(offer);assert.equal(result.price,120);assert.equal(result.cancellationPolicies[0].amount,'120');
    code='SUITE';await assert.rejects(provider.checkRateOffer(offer),{code:'RATE_NOT_AVAILABLE'});
  } finally {client.checkRates=original;}
});
test('rooms are not silently ignored and child ages required', () => {
  const filters={hotelCodes:[1],checkIn:'2030-01-01',checkOut:'2030-01-08',adults:2};
  assert.equal(provider.buildAvailabilityRequest(filters).stay.checkOut,'2030-01-08');
  assert.throws(()=>provider.buildAvailabilityRequest({...filters,rooms:2}),{code:'INVALID_REQUEST'});
  assert.throws(()=>provider.buildAvailabilityRequest({...filters,children:1}),{code:'HOTELBEDS_CHILD_AGES_REQUIRED'});
});
test('central contacts use real defaults and accept deployment overrides', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../frontend/src/config/site.js'), 'utf8');
  const read = new Function('env', source.replace('export const site =', 'return').replaceAll('import.meta.env', 'env'));
  const site = read({});
  assert.equal(site.supportPhone.replace(/[^+\d]/g, ''), '+77076306135');
  assert.equal(site.supportEmail, 'newgign@gmail.com');
  assert.equal(read({VITE_SUPPORT_EMAIL:' support@example.org '}).supportEmail, 'support@example.org');
});
