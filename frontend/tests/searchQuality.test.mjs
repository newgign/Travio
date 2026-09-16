import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter, Routes, Route} from 'react-router-dom';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');

test('3O offline search quality and exact display snapshot',async t=>{
  Object.assign(process.env,{ACTIVE_PROVIDER:'hotelbeds',HOTELBEDS_ENV:'test',HOTELBEDS_ENABLED:'true',HOTELBEDS_STAGING_TEST_ENABLED:'true',HOTELBEDS_READ_ONLY:'true',
    HOTELBEDS_BOOKING_ENABLED:'false',HOTELBEDS_LIVE_BOOKING_ENABLED:'false',PRODUCTION_SALES_ENABLED:'false',REAL_CHARGES_ENABLED:'false',REAL_REFUNDS_ENABLED:'false',
    PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'none',HOT_DEALS_MONITOR_ENABLED:'false',HOTELBEDS_CONTENT_SYNC_ENABLED:'false',
    HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com',HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com',HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com'});
  process.env.OFFER_TOKEN_SECRET=require('crypto').randomBytes(32).toString('hex');
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,
    server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'},plugins:[{name:'offline-context',enforce:'pre',load(id){
      const path=id.replaceAll('\\','/');
      if(path.endsWith('/context/FavoritesContext.jsx'))return 'export function useFavorites(){return {isFavorite:()=>false,toggleFavorite:async()=>{}}}';
      if(['/components/Navbar.jsx','/components/Footer.jsx'].some(s=>path.endsWith(s)))return 'export default function Component(){return null}';
    }}]});
  try {
    const display=await server.ssrLoadModule('/src/utils/hotelOfferDisplay.js');
    const local=await server.ssrLoadModule('/src/utils/localOfferFilters.js');
    const {default:Card}=await server.ssrLoadModule('/src/components/TourCard.jsx');
    const {default:Details}=await server.ssrLoadModule('/src/pages/TourDetails.jsx');
    const {default:Filters}=await server.ssrLoadModule('/src/components/ResultsFilters.jsx');
    const {default:StayPrice}=await server.ssrLoadModule('/src/components/StayPrice.jsx');
    const {selectedOfferSnapshot}=await server.ssrLoadModule('/src/utils/selectedOfferSnapshot.js');
    const {offerDetailsLink}=await server.ssrLoadModule('/src/utils/hotTours.js');
    const client=require('../../backend/integrations/hotelbeds/client');
    const catalog=require('../../backend/repositories/providerCatalogRepository');
    const search=require('../../backend/services/searchService');
    const fixture=require('../../backend/tests/fixtures/hotelbedsSearchQuality');
    const calls={availability:0,checkrate:0};
    t.mock.method(client,'availability',async request=>{calls.availability++;assert.equal(request.hotels.hotel.length,2);return fixture.response();});
    t.mock.method(client,'checkRates',async()=>{calls.checkrate++;throw Error('Forbidden CheckRate');});
    t.mock.method(require('../../backend/services/hotelbedsTestAccess'),'assertAvailable',async()=>{});
    t.mock.method(catalog,'findDestinations',async()=>[{code:'CEN',country_code:'PT'}]);
    t.mock.method(catalog,'findHotels',async()=>[{provider_hotel_id:'101'},{provider_hotel_id:'102'}]);
    t.mock.method(catalog,'findHotelsByIds',async()=>[{provider_hotel_id:'101',name:'Same hotel name',stars:4},{provider_hotel_id:'102',name:'Same hotel name',stars:null}]);
    t.mock.method(require('../../backend/services/priceHistoryService'),'record',async()=>{});
    t.mock.method(require('../../backend/services/hotelbedsMonitorService'),'track',async()=>{});
    require('../../backend/services/memoryCache').clear();
    const params=new URLSearchParams('provider=hotelbeds&countryCode=PT&destinationCode=CEN&checkIn=2030-04-01&nights=7&adults=2');
    const query=local.providerQuery(params,true);
    const response=await search.search(JSON.parse(query));
    const offers=response.data;
    const render=element=>renderToStaticMarkup(React.createElement(MemoryRouter,{},element));

    await t.test('one initial destination Availability; sequential presentation edits retain exactly one call',()=>{
      assert.equal(calls.availability,1);assert.equal(response.meta.total,2);
      for(const [key,value] of [['sort','priceDesc'],['stars','4'],['food','BB'],['roomType','superior double'],['maxPrice','400']]){
        params.set(key,value);
        assert.equal(local.providerQuery(params,true),query,'same Results fetch dependency');
        local.filterOffers(offers,params);
        assert.equal(calls.availability,1);assert.equal(calls.checkrate,0);
      }
      assert.equal(local.filterOffers(offers,params).length,1);
      params.set('stars','5');assert.equal(local.filterOffers(offers,params).length,0);
      assert.equal(local.filterEmptyMessage,'Нет отелей, соответствующих выбранным фильтрам');
      assert.equal(local.filterOffers(offers,local.resetOfferFilters(params)).length,2);
      assert.equal(local.resetOfferFilters(params).get('nights'),'7');
    });
    await t.test('one card per unique hotel; total/per-night, room, board and disabled BOOKABLE',()=>{
      const html=render(React.createElement('section',{},offers.map(offer=>React.createElement(Card,{key:offer.providerHotelId,tour:offer}))));
      assert.equal((html.match(/<article class="tour-card">/g)||[]).length,2);
      assert.match(html,/318,29/);assert.match(html,/45,47/);assert.match(html,/за 7 ночей/);
      assert.match(html,/Superior DOUBLE/);assert.match(html,/Завтрак/);assert.match(html,/Provider special board/);
      assert.match(html,/Категория не указана/);assert.match(html,/Тариф Hotelbeds: BOOKABLE/);
      assert.equal((html.match(/disabled=""[^>]*>Бронирование недоступно/g)||[]).length,2);
      assert.equal(html.includes('offline-3o-'),false);assert.equal(html.includes('unsplash'),false);
    });
    await t.test('one/seven night arithmetic is unrounded; missing price/currency never becomes zero',()=>{
      assert.equal(display.calculatePricePerNight(75.74,1,'EUR'),75.74);
      assert.equal(display.calculatePricePerNight(1242.02,7,'EUR'),1242.02/7);
      for(const value of [null,undefined,NaN,'',true])assert.equal(display.calculatePricePerNight(value,7,'EUR'),null);
      assert.equal(display.calculatePricePerNight(100,0,'EUR'),null);assert.equal(display.calculatePricePerNight(100,7,null),null);
      const html=render(React.createElement(StayPrice,{offer:{price:75.74,nights:1,currency:'EUR'}}));
      assert.match(html,/75,74/);assert.match(html,/за 1 ночь/);
      assert.equal(display.normalizeBoardDisplay('ZZ',' Provider   board '),'Provider board');
      assert.equal(display.normalizeBoardDisplay('ZZ'),'ZZ');
    });
    await t.test('all local sort orders are deterministic and leave original array untouched',()=>{
      const set=[{id:'2',name:'B',price:200,nights:10,currency:'EUR',stars:3},{id:'1',name:'A',price:100,nights:1,currency:'EUR',stars:5},{id:'3',name:'C',price:100,nights:2,currency:'EUR',stars:null}];
      const before=JSON.stringify(set);
      for(const [sort,ids] of [['priceAsc',['1','3','2']],['priceDesc',['2','1','3']],['pricePerNight',['2','3','1']],['stars',['1','2','3']],['name',['1','2','3']]]){
        assert.deepEqual(display.stableSortHotels(set,sort).map(x=>x.id),ids);
        assert.deepEqual(display.stableSortHotels([...set].reverse(),sort).map(x=>x.id),ids);
      }
      assert.equal(JSON.stringify(set),before);
    });
    await t.test('unknown boards use code identity, room filtering collapses spaces, total filter stays local',()=>{
      assert.equal(local.filterOffers(offers,new URLSearchParams('food=XZ'))[0].providerHotelId,'102');
      assert.equal(local.filterOffers(offers,new URLSearchParams('food=Provider+special+board')).length,0);
      assert.equal(local.filterOffers(offers,new URLSearchParams('roomType=SuPeRiOr+++DoUbLe')).length,2);
      assert.equal(local.filterOffers(offers,new URLSearchParams('maxPrice=100')).length,1);
      const html=render(React.createElement(Filters,{boards:[{code:'XZ',name:'Provider special board'}]}));
      assert.match(html,/<option value="XZ">Provider special board/);assert.match(html,/Цена за весь период/);
    });
    await t.test('Details renders the same signed selected snapshot without provider calls or URL tokens',()=>{
      const offer=offers.find(x=>x.providerHotelId==='101');const url=offerDetailsLink(offer);
      assert.equal(url.includes(offer.rateKey),false);assert.equal(url.includes(offer.offerToken),false);
      assert.equal(selectedOfferSnapshot(offer,'hotelbeds','101',url.split('?')[1]),offer);
      assert.equal(selectedOfferSnapshot(offer,'hotelbeds','102',''),null);
      assert.equal(selectedOfferSnapshot(offer,'hotelbeds','101','nights=1'),null);
      assert.equal(selectedOfferSnapshot(offer,'hotelbeds','101','',Date.parse(offer.observedAt)+900000),null);
      const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[{pathname:'/tour/hotelbeds/101',search:'?'+url.split('?')[1],state:{selectedOffer:offer}}]},
        React.createElement(Routes,{},React.createElement(Route,{path:'/tour/:provider/:id',element:React.createElement(Details)}))));
      assert.match(html,/318,29/);assert.match(html,/45,47/);assert.match(html,/Завтрак/);assert.match(html,/Superior DOUBLE/);
      assert.match(html,/disabled=""[^>]*>Бронирование отключено/);
      assert.equal(calls.availability,1);assert.equal(calls.checkrate,0);
    });
    assert.equal(calls.availability,1);
  } finally {require('../../backend/services/memoryCache').clear();await server.close();}
});
