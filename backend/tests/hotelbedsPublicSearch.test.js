const {test}=require('node:test');
const assert=require('node:assert/strict');
const select=require('../services/stagingTestSearch');
const cfg={stagingTestAllowed:true,environment:'test'};
const input={stagingTestHotel:'3424',departureDate:'2030-04-01',checkOut:'2030-04-03',people:'3',rooms:'1',children:'1',childrenAges:'8'};

test('explicit TEST selection preserves user stay/occupancy and bypasses unrelated destination mapping',()=>{
  const value=select({...input,country:'unrelated',destinationCode:'OTHER',hotelCodes:'999'},cfg);
  assert.equal(value.hotelCodes,'3424');assert.equal(value.country,'');assert.equal(value.destinationCode,'');
  assert.equal(value.checkIn,'2030-04-01');assert.equal(value.checkOut,'2030-04-03');assert.equal(value.nights,2);
  assert.equal(value.adults,3);assert.equal(value.children,1);assert.equal(value.childrenAges,'8');assert.equal(value.rooms,1);
  const ordinary={country:'Turkey'};assert.equal(select(ordinary,cfg),ordinary);
  assert.throws(()=>select(input,{...cfg,environment:'live'}));assert.throws(()=>select(input,{...cfg,stagingTestAllowed:false}));
  for(const patch of [{stagingTestHotel:'999'},{rooms:'2'},{people:'0',adults:'0'},{childrenAges:''},{childrenAges:'8.5'},{checkOut:'2030-03-01'},{departureDate:'2020-01-01'},{departureDate:'2030-02-31'},{checkOut:'',nights:'bad'}])assert.throws(()=>select({...input,...patch},cfg),{code:'INVALID_STAGING_TEST_SEARCH'});
});

test('known TEST hotel follows real search normalization/signing/detail adapters, never booking or CheckRate',async t=>{
  Object.assign(process.env,{NODE_ENV:'production',ACTIVE_PROVIDER:'hotelbeds',HOTELBEDS_ENV:'test',HOTELBEDS_ENABLED:'true',HOTELBEDS_STAGING_TEST_ENABLED:'true',HOTELBEDS_READ_ONLY:'true',PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'none',HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com',HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com',HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com'});
  for(const key of ['HOTELBEDS_BOOKING_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED','PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOT_DEALS_MONITOR_ENABLED','HOTELBEDS_CONTENT_SYNC_ENABLED'])process.env[key]='false';
  process.env.OFFER_TOKEN_SECRET=require('node:crypto').randomBytes(32).toString('hex');
  const client=require('../integrations/hotelbeds/client'),catalog=require('../repositories/providerCatalogRepository'),cache=require('../services/memoryCache');
  t.mock.method(catalog,'findHotels',async()=>{throw Error('No catalog scan');});
  t.mock.method(catalog,'findHotelsByIds',async()=>[]);t.mock.method(catalog,'findHotel',async()=>null);
  t.mock.method(require('../services/priceHistoryService'),'record',async()=>{});
  const calls=[];let resultKind='valid';
  const rate={rateKey:'offline-fixture-only',rateType:'BOOKABLE',net:'145.67',paymentType:'AT_WEB',packaging:false,rateClass:'NOR',boardCode:'BB',boardName:'Breakfast',rooms:1,adults:3,children:1,cancellationPolicies:[],taxes:{taxes:[]}};
  t.mock.method(client,'availability',async payload=>{calls.push(payload);if(resultKind==='error')throw Object.assign(Error('Provider unavailable'),{code:'TIMEOUT'});return {hotels:{hotels:resultKind==='empty'?[]:[{code:3424,name:'Provider fixture hotel',currency:resultKind==='unsupported'?null:'EUR',rooms:[{code:'DBL',name:'Double',rates:[rate]}]}]}};});
  for(const method of ['createBooking','cancelBooking','checkRates'])t.mock.method(client,method,async()=>{throw Error('Forbidden '+method);});
  t.mock.method(require('../services/paymentGatewayService'),'createIntent',async()=>{throw Error('Forbidden payment');});
  cache.clear();const search=require('../services/searchService');
  const response=await search.search({...input,publicOnly:'true'});
  assert.equal(response.data.length,1);const offer=response.data[0];
  assert.equal(offer.price,145.67);assert.equal(offer.currency,'EUR');assert.equal(offer.priceSource,'net');assert.equal(offer.priceEnvironment,'test');assert.equal(offer.bookingDisabled,true);
  assert.equal(offer.roomCode,'DBL');assert.equal(offer.boardCode,'BB');assert.ok(offer.observedAt);
  assert.deepEqual(calls[0].stay,{checkIn:input.departureDate,checkOut:input.checkOut});assert.deepEqual(calls[0].hotels,{hotel:[3424]});
  assert.deepEqual(calls[0].occupancies,[{rooms:1,adults:3,children:1,paxes:[{type:'CH',age:8}]}]);
  assert.equal(require('../services/offerTokenService').verify(offer.offerToken).priceEnvironment,'test');
  const detail=await require('../services/offerResolverService').resolve({providerName:'hotelbeds',hotelId:3424,filters:{...input,checkIn:input.departureDate}});
  assert.equal(detail.providerHotelId,'3424');assert.equal(detail.price,offer.price);assert.equal(detail.bookingDisabled,true);
  for(const kind of ['empty','unsupported','error']){resultKind=kind;cache.clear();if(kind==='error')await assert.rejects(search.search(input),{code:'TIMEOUT'});else assert.equal((await search.search(input)).data.length,0);}
  cache.clear();
});
