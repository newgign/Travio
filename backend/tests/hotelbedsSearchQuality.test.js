const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./offlineNetwork.cjs');
Object.assign(process.env,{HOTELBEDS_ENV:'test',HOTELBEDS_ENABLED:'true',HOTELBEDS_STAGING_TEST_ENABLED:'true',
  HOTELBEDS_READ_ONLY:'true',HOTELBEDS_BOOKING_ENABLED:'false',HOTELBEDS_LIVE_BOOKING_ENABLED:'false',
  PRODUCTION_SALES_ENABLED:'false',REAL_CHARGES_ENABLED:'false',REAL_REFUNDS_ENABLED:'false',PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'none',
  HOT_DEALS_MONITOR_ENABLED:'false',HOTELBEDS_CONTENT_SYNC_ENABLED:'false',HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com',
  HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com',HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com'});
const {rate,hotel,response}=require('./fixtures/hotelbedsSearchQuality');
const provider=require('../sources/hotelbeds');
const {selectBestDisplayRate,normalizeHotelOffers,normalizeStars}=require('../services/hotelbedsDisplayRates');
const filters={checkIn:'2030-04-01',nights:7,adults:2};
const normalize=h=>provider.normalizeHotel(h,filters,{provider_hotel_id:String(h.code),stars:null});
function freeze(value){if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('3O.2 semantic groups preserve room codes, boards, texts, currencies and rate types',()=>{
  const inputs=freeze([
    hotel(101,[rate('cheap','100'),rate('expensive','110'),rate('ai','120',{boardCode:'AI'}),rate('recheck','105',{rateType:'RECHECK'})]),
    hotel(101,[rate('other-code','130')],'OTHER'),
    {...hotel(101,[rate('usd','100')]),currency:'USD'},
    {...hotel(101,[rate('standard','90')]),rooms:[{code:'DBL',name:'Standard',rates:[rate('standard','90')]}]},
  ]);
  const before=JSON.stringify(inputs);
  const candidates=normalizeHotelOffers(inputs,normalize,'test',true)[0].candidateHotels;
  assert.equal(candidates.length,6);
  assert.equal(candidates.some(o=>o.rateKey==='offline-3o-expensive'),false);
  for(const key of ['cheap','ai','recheck','other-code','usd','standard']) assert.ok(candidates.some(o=>o.rateKey===`offline-3o-${key}`));
  assert.deepEqual(normalizeHotelOffers([...inputs].reverse(),normalize,'test',true)[0].candidateHotels.map(o=>o.rateKey),candidates.map(o=>o.rateKey));
  assert.equal(JSON.stringify(inputs),before);
});

test('3O.2 streaming stress compacts 10000 valid rates to one exact survivor',()=>{
  const source=freeze([hotel(101,Array.from({length:10000},(_,i)=>rate(String(i).padStart(5,'0'),String(100+i))))]);
  const result=normalizeHotelOffers(source,normalize,'test',true);
  assert.equal(result[0].candidateHotels.length,1);
  assert.equal(result[0].candidateHotels[0].rateKey,'offline-3o-00000');
  assert.equal(result[0].candidateHotels[0].price,100);
  const original=freeze({providerHotelId:'1',currency:'EUR',boardCode:'BB',roomCode:'A',roomName:' Standard ',rateType:'BOOKABLE',price:100,rateKey:'a'});
  const duplicate=freeze({...original,roomName:'standard',price:110,rateKey:'b'});
  const tied=freeze({...original,rateKey:'z'});
  const wrapper={rooms:[{rates:[duplicate,tied,original]}]};
  const exact=normalizeHotelOffers([wrapper],h=>h.rooms[0].rates[0],'test',true);
  assert.equal(exact[0].candidateHotels[0],original);
});

test('3O.2 semantic ceilings accept boundaries and fail explicitly without truncation',()=>{
  const {MAX_CANDIDATES_PER_HOTEL:perHotel,MAX_CANDIDATES_PER_RESPONSE:perResponse}=require('../services/hotelbedsDisplayRates');
  const make=(code,count)=>hotel(code,Array.from({length:count},(_,i)=>rate(`bound-${i}`,'100',{boardCode:`B${i}`})));
  assert.equal(normalizeHotelOffers([make(101,perHotel)],normalize,'test',true)[0].candidateHotels.length,perHotel);
  const failure={code:'TEST_CANDIDATE_LIMIT_EXCEEDED',status:422};
  assert.throws(()=>normalizeHotelOffers([make(101,perHotel+1)],normalize,'test',true),failure);
  const full=Array.from({length:perResponse/perHotel},(_,i)=>make(i+1,perHotel));
  assert.equal(normalizeHotelOffers(full,normalize,'test',true).reduce((n,h)=>n+h.candidateHotels.length,0),perResponse);
  assert.throws(()=>normalizeHotelOffers([...full,make(999,1)],normalize,'test',true),failure);
});

test('3O duplicates collapse by hotel identity; same names remain separate',()=>{
  const input=freeze(response());const before=JSON.stringify(input);
  const offers=normalizeHotelOffers(input.hotels.hotels,normalize,'test');
  assert.equal(offers.length,2);assert.deepEqual(offers.map(o=>o.providerHotelId),['101','102']);
  assert.equal(offers[0].price,318.29);assert.equal(offers[1].price,75.74);
  assert.equal(JSON.stringify(input),before);
});
test('3O malformed first price cannot win; wholly invalid hotel is omitted',()=>{
  for(const price of [null,undefined,NaN,Infinity,'',true,[],{},'not-money','-1','0']) {
    assert.equal(normalize(hotel(101,[rate('bad',price),rate('good','10.12')])).rateKey,'offline-3o-good');
    assert.equal(normalize(hotel(101,[rate('bad',price)])),null);
  }
});
test('3O deterministic room, board, type and exact key tie breakers',()=>{
  const candidates=[
    {room:{code:'Z'},rate:rate('z','100')},
    {room:{code:'A'},rate:rate('a','100',{boardCode:'RO'})},
    {room:{code:'A'},rate:rate('b','100',{boardCode:'BB',rateType:'RECHECK'})},
    {room:{code:'A'},rate:rate('d','100')},
    {room:{code:'A'},rate:rate('c','100')},
  ];
  for(let i=0;i<20;i++){
    const shuffled=[...candidates.slice(i%5),...candidates.slice(0,i%5)];if(i%2)shuffled.reverse();
    assert.equal(selectBestDisplayRate(shuffled,'EUR').rate,candidates[4].rate);
  }
});
test('3O selected exact identity and monetary source survive normalization and signing',()=>{
  process.env.OFFER_TOKEN_SECRET=require('crypto').randomBytes(32).toString('hex');
  const source=hotel(101,[rate('low','318.29',{boardCode:'XZ',boardName:'Provider board',rateType:'RECHECK'})]);
  const value=normalize(freeze(source));
  const offer=require('../services/offerService').generateOffer(value,filters);
  const token=require('../services/offerTokenService');const signed=token.verify(token.sign(offer));
  for(const field of ['rateKey','rateType','boardCode','boardName'])assert.equal(signed[field],source.rooms[0].rates[0][field]);
  assert.equal(signed.roomCode,source.rooms[0].code);assert.equal(signed.roomName,source.rooms[0].name);
  assert.equal(signed.currency,'EUR');assert.equal(signed.price,318.29);assert.equal(signed.nights,7);
  assert.equal(offer.bookingDisabled,true);assert.equal(signed.priceEnvironment,'test');
});
test('3O stars are local, nullable and never invented from guest rating',()=>{
  for(const value of [null,undefined,'',0,6,'unknown'])assert.equal(normalizeStars(value),null);
  assert.equal(normalizeStars('4'),4);
  assert.equal(normalize({...hotel(101,[rate('ok','20')]),categoryCode:'5EST',reviewScore:9}).stars,null);
});
test('3O restrictions still exclude packaging and pay-at-hotel rates',()=>{
  assert.equal(normalize(hotel(101,[rate('package','1',{packaging:true}),rate('hotel','2',{paymentType:'AT_HOTEL'}),rate('valid','30')])).price,30);
  assert.equal(normalize(hotel(101,[rate('ok','20')])).bookingDisabled,true);
});
test('3O one and seven night stays retain total without rounding',()=>{
  for(const nights of [1,7]){
    const h=provider.normalizeHotel(hotel(101,[rate('ok','1242.02')]),{...filters,nights});
    const offer=require('../services/offerService').generateOffer(h,{...filters,nights});
    assert.equal(offer.nights,nights);assert.equal(offer.price,1242.02);
  }
});
test('3O TEST destination selection preserves the 20-hotel bound and zero retries',async()=>{
  const resolve=require('../services/hotelbedsTestDestination');
  const config={environment:'test',stagingTestAllowed:true,maxRetries:0};
  let count=20;
  const repository={findDestinations:async()=>[{code:'CEN',country_code:'PT'}],findHotels:async()=>Array.from({length:count},(_,i)=>({provider_hotel_id:String(i+101)}))};
  const input={destinationCode:'CEN',country:'PT',checkIn:'2030-04-01',nights:7,adults:2};
  assert.equal((await resolve(input,config,repository)).hotelCodes.length,20);
  count=21;await assert.rejects(resolve(input,config,repository),{code:'TEST_SEARCH_LIMIT'});
  await assert.rejects(resolve(input,{...config,maxRetries:1},repository),{code:'TEST_SEARCH_RETRIES_BLOCKED'});
});
test('3O duplicate ordering and Details normalization choose identical rate',async t=>{
  const client=require('../integrations/hotelbeds/client');const catalog=require('../repositories/providerCatalogRepository');
  let calls=0;t.mock.method(client,'availability',async()=>{calls++;return response();});
  t.mock.method(catalog,'findHotel',async()=>null);
  const expected=normalizeHotelOffers(response().hotels.hotels,normalize,'test')[0];
  const detail=await provider.getHotelById(101,filters);
  assert.equal(calls,1);for(const field of ['rateKey','roomCode','boardCode','rateType','price','currency'])assert.equal(detail[field],expected[field]);
  const reversed=normalizeHotelOffers(response().hotels.hotels.reverse(),normalize,'test').find(o=>o.providerHotelId==='101');
  assert.equal(reversed.rateKey,expected.rateKey);
});
test('3O.1 candidates include all valid alternate rates across duplicate hotel records',()=>{
  const hotels=freeze([hotel(101,[rate('bb','100'),rate('ai','120',{boardCode:'AI'})]),hotel(101,[rate('superior','130')],'SUP')]);
  const results=normalizeHotelOffers(hotels,normalize,'test',true);
  assert.equal(results.length,1);assert.equal(results[0].price,100);
  assert.deepEqual(results[0].candidateHotels.map(item=>item.price),[100,120,130]);
  const reversed=normalizeHotelOffers([...hotels].reverse(),normalize,'test',true);
  assert.deepEqual(reversed[0].candidateHotels.map(item=>item.rateKey),results[0].candidateHotels.map(item=>item.rateKey));
});
test('3O.1 candidate allowlist excludes arbitrary provider objects and nested metadata',()=>{
  const safe=require('../services/hotelbedsPublicCandidate')({rateKey:'offline-key',boardCode:'AI',price:120,currency:'EUR',headers:{secret:'marker'},rawResponse:'marker',
    roomName:{secret:'marker'},occupancy:{rooms:1,adults:2,children:0,secret:'marker'},images:['local-image',{secret:'marker'}]});
  assert.equal(JSON.stringify(safe).includes('marker'),false);assert.equal(safe.rateKey,'offline-key');assert.equal(safe.boardCode,'AI');
  assert.deepEqual(safe.occupancy,{rooms:1,adults:2,children:0});assert.deepEqual(safe.images,['local-image']);
  assert.deepEqual(require('../services/hotelbedsPublicCandidate')({childrenAges:[5,12]}).childrenAges,[5,12]);
});
