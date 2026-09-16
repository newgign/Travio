import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
const require=createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');

test('3O.1 rate-aware filtering over one actual search response',async t=>{
  Object.assign(process.env,{ACTIVE_PROVIDER:'hotelbeds',HOTELBEDS_ENV:'test',HOTELBEDS_ENABLED:'true',HOTELBEDS_STAGING_TEST_ENABLED:'true',HOTELBEDS_READ_ONLY:'true',HOTELBEDS_BOOKING_ENABLED:'false',HOTELBEDS_LIVE_BOOKING_ENABLED:'false',PRODUCTION_SALES_ENABLED:'false',REAL_CHARGES_ENABLED:'false',REAL_REFUNDS_ENABLED:'false',PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'none',HOT_DEALS_MONITOR_ENABLED:'false',HOTELBEDS_CONTENT_SYNC_ENABLED:'false',HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com',HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com',HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com'});
  process.env.OFFER_TOKEN_SECRET=require('crypto').randomBytes(32).toString('hex');
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'},plugins:[{name:'offline',enforce:'pre',load(id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/context/FavoritesContext.jsx'))return 'export function useFavorites(){return {isFavorite:()=>false,toggleFavorite:async()=>{}}}';
    if(['/components/Navbar.jsx','/components/Footer.jsx'].some(s=>path.endsWith(s)))return 'export default function Empty(){return null}';
  }}]});
  try {
    const {filterOffers,providerQuery,resetOfferFilters}=await server.ssrLoadModule('/src/utils/localOfferFilters.js');
    const {stableSortHotels}=await server.ssrLoadModule('/src/utils/hotelOfferDisplay.js');
    const {default:Card}=await server.ssrLoadModule('/src/components/TourCard.jsx');
    const {default:Details}=await server.ssrLoadModule('/src/pages/TourDetails.jsx');
    const {default:Filters}=await server.ssrLoadModule('/src/components/ResultsFilters.jsx');
    const {offerDetailsLink}=await server.ssrLoadModule('/src/utils/hotTours.js');
    const client=require('../../backend/integrations/hotelbeds/client');
    const catalog=require('../../backend/repositories/providerCatalogRepository');
    const {rate}=require('../../backend/tests/fixtures/hotelbedsSearchQuality');
    const room=(name,board,price,key)=>({code:name,name,rates:[rate(key,price,{boardCode:board,rawSecretMarker:'MUST_NOT_ESCAPE',headers:{Authorization:'MUST_NOT_ESCAPE'}})]});
    const hotels=[
      {code:101,name:'A',currency:'EUR',rooms:[room('Standard','BB','100','a'),room('Standard','AI','120','b'),room('Superior','BB','130','c'),room('Superior','AI','150','d')]},
      {code:102,name:'B',currency:'EUR',rooms:[room('Standard','AI','170','e'),room('Superior','BB','110','f')]},
      {code:103,name:'C',currency:'EUR',rooms:[room('Standard','AI','150','g'),room('Standard','RO','120','h')]},
    ];
    hotels[0].rooms[0].rates.push(...Array.from({length:1000},(_,i)=>rate(`dominated-${i}`,'110',{boardCode:'BB'})));
    const tokens=require('../../backend/services/offerTokenService');
    const originalSign=tokens.sign.bind(tokens);let signingCalls=0;
    t.mock.method(tokens,'sign',offer=>{signingCalls++;return originalSign(offer);});
    const before=JSON.stringify(hotels);let availability=0,checkrate=0,content=0;
    for (const method of ['contentHotels','contentHotelDetails','contentDestinations','contentCountries']) {
      t.mock.method(client,method,async()=>{content++;throw Error('Forbidden Content');});
    }
    t.mock.method(client,'availability',async payload=>{availability++;assert.equal(payload.hotels.hotel.length,3);return {hotels:{hotels}};});
    t.mock.method(client,'checkRates',async()=>{checkrate++;throw Error('Forbidden');});
    t.mock.method(require('../../backend/services/hotelbedsTestAccess'),'assertAvailable',async()=>{});
    t.mock.method(catalog,'findDestinations',async()=>[{code:'CEN',country_code:'PT'}]);
    t.mock.method(catalog,'findHotels',async()=>hotels.map(h=>({provider_hotel_id:String(h.code)})));
    t.mock.method(catalog,'findHotelsByIds',async()=>hotels.map(h=>({provider_hotel_id:String(h.code),stars:4})));
    t.mock.method(require('../../backend/services/priceHistoryService'),'record',async()=>{});
    t.mock.method(require('../../backend/services/hotelbedsMonitorService'),'track',async()=>{});
    const cache=require('../../backend/services/memoryCache');cache.clear();
    const base=new URLSearchParams('provider=hotelbeds&countryCode=PT&destinationCode=CEN&checkIn=2030-04-01&nights=7&adults=2');
    const key=providerQuery(base,true);
    const result=await require('../../backend/services/searchService').search(JSON.parse(key));
    const source=result.data;const first=params=>filterOffers(source,new URLSearchParams(params)).find(h=>h.providerHotelId==='101');
    await t.test('3O.2 compaction reduces signing and preserves all local selection outcomes',()=>{
      assert.equal(signingCalls,11); // 3 compatible top-level offers + 8 survivors, not 1008 candidates.
      const provider=require('../../backend/sources/hotelbeds');
      const offerService=require('../../backend/services/offerService');
      const expanded=hotels.map(h=>({...source.find(o=>o.providerHotelId===String(h.code)),candidateOffers:h.rooms.flatMap(room=>room.rates.map(rate=>offerService.generateOffer(provider.normalizeHotel({...h,rooms:[{...room,rates:[rate]}]},JSON.parse(key),{stars:4}),JSON.parse(key)))).sort((a,b)=>a.price-b.price)}));
      for(const query of ['', 'food=AI', 'roomType=superior', 'food=AI&roomType=superior', 'food=AI&maxPrice=110','food=AI&maxPrice=130','food=AI&sort=priceDesc','stars=4']) {
        const identity=rows=>rows.map(o=>[o.providerHotelId,o.rateKey,o.roomCode,o.boardCode,o.price,o.currency]);
        assert.deepEqual(identity(filterOffers(source,new URLSearchParams(query))),identity(filterOffers(expanded,new URLSearchParams(query))));
      }
      const html=renderToStaticMarkup(React.createElement(MemoryRouter,{},React.createElement(Filters,{currency:'EUR',boards:[{code:'BB'}]})));
      assert.match(html,/Лимит только в EUR/);assert.match(html,/тарифы в других валютах скрыты/);
    });
    await t.test('safe signed candidates, default selection and unique counts',()=>{
      assert.equal(result.meta.total,3);assert.equal(source.length,3);assert.equal(source.find(h=>h.providerHotelId==='101').candidateOffers.length,4);
      assert.equal(first('').price,100);assert.equal(first('').boardCode,'BB');
      for(const hotel of source)for(const candidate of hotel.candidateOffers){
        assert.ok(candidate.offerToken);assert.equal(candidate.candidateOffers,undefined);assert.equal(candidate.candidateHotels,undefined);
        const decoded=require('../../backend/services/offerTokenService').verify(candidate.offerToken);
        for(const key of ['rateKey','roomCode','boardCode','price','currency'])assert.equal(decoded[key],candidate[key]);
        assert.equal(JSON.stringify(decoded).includes('MUST_NOT_ESCAPE'),false);
      }
      assert.equal(JSON.stringify(source).includes('MUST_NOT_ESCAPE'),false);assert.equal(JSON.stringify(hotels),before);
    });
    await t.test('board, room, combined predicates and price select the same candidate',()=>{
      assert.equal(first('food=AI').price,120);assert.equal(first('roomType=sUpErIoR').price,130);
      assert.equal(first('food=AI&roomType=superior').price,150);
      assert.equal(filterOffers(source,new URLSearchParams('food=AI&roomType=superior')).some(h=>h.providerHotelId==='102'),false);
      assert.equal(first('food=AI&maxPrice=110'),undefined);assert.equal(first('food=AI&maxPrice=130').price,120);
      assert.equal(first('stars=4').price,100);
    });
    await t.test('sort uses current rate; reset restores default; sequence stays at one Availability',()=>{
      const query=new URLSearchParams(base);query.set('food','AI');
      const sorted=filterOffers(source,query);assert.deepEqual(sorted.map(h=>h.price),[120,150,170]);assert.deepEqual(sorted.map(h=>h.providerHotelId),['101','103','102']);
      for(const [field,value] of [['sort','priceDesc'],['stars','4'],['roomType','Superior'],['maxPrice','160']]){
        query.set(field,value);filterOffers(source,query);assert.equal(providerQuery(query,true),key);assert.equal(availability,1);assert.equal(checkrate,0);
      }
      const reset=filterOffers(source,resetOfferFilters(query));assert.equal(reset.find(h=>h.providerHotelId==='101').price,100);assert.equal(reset.length,3);
    });
    await t.test('alternate card and Details retain the same signed identity',()=>{
      const selected=first('food=AI');const url=offerDetailsLink(selected);
      const card=renderToStaticMarkup(React.createElement(MemoryRouter,{},React.createElement(Card,{tour:selected})));
      assert.equal((card.match(/<article class="tour-card">/g)||[]).length,1);assert.match(card,/120,00/);assert.match(card,/Всё включено/);
      assert.equal(url.includes(selected.rateKey),false);assert.equal(card.includes(selected.rateKey),false);
      const details=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[{pathname:'/tour/hotelbeds/101',search:'?'+url.split('?')[1],state:{selectedOffer:selected}}]},React.createElement(Routes,{},React.createElement(Route,{path:'/tour/:provider/:id',element:React.createElement(Details)}))));
      assert.match(details,/120,00/);assert.match(details,/Всё включено/);assert.match(details,/Standard/);assert.match(details,/disabled=""[^>]*>Бронирование отключено/);
      assert.equal(availability,1);assert.equal(checkrate,0);
    });
    await t.test('mixed currencies grouped deterministically without conversion',()=>{
      const rows=[{id:1,name:'USD',currency:'USD',price:1},{id:2,name:'EUR high',currency:'EUR',price:200},{id:3,name:'EUR low',currency:'EUR',price:100}];
      assert.deepEqual(stableSortHotels(rows,'priceAsc').map(x=>x.id),[3,2,1]);
      assert.deepEqual(stableSortHotels([...rows].reverse(),'priceDesc').map(x=>x.id),[2,3,1]);
      assert.deepEqual(rows.map(x=>[x.currency,x.price]),[['USD',1],['EUR',200],['EUR',100]]);
      assert.deepEqual(filterOffers(rows,new URLSearchParams('maxPrice=150')).map(x=>x.id),[3]);
      assert.deepEqual(filterOffers([...rows].reverse(),new URLSearchParams('maxPrice=150')).map(x=>x.id),[3]);
      const mixed=[{candidateOffers:[{id:4,boardCode:'BB',currency:'EUR',price:100},{id:4,boardCode:'AI',currency:'USD',price:1}]}];
      assert.equal(filterOffers(mixed,new URLSearchParams('food=AI'))[0].currency,'USD');
      assert.equal(filterOffers(mixed,new URLSearchParams('food=AI&maxPrice=150')).length,0);
    });
    assert.equal(availability,1);assert.equal(checkrate,0);assert.equal(content,0);
    cache.clear();
  } finally {await server.close();}
});
