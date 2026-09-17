import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const require = createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');

test('3R Details exact candidate, presentation and offline interaction flow', async t => {
  Object.assign(process.env, {
    ACTIVE_PROVIDER:'hotelbeds', HOTELBEDS_ENV:'test', HOTELBEDS_ENABLED:'true', HOTELBEDS_STAGING_TEST_ENABLED:'true',
    HOTELBEDS_READ_ONLY:'true', HOTELBEDS_BOOKING_ENABLED:'false', HOTELBEDS_LIVE_BOOKING_ENABLED:'false',
    PRODUCTION_SALES_ENABLED:'false', REAL_CHARGES_ENABLED:'false', REAL_REFUNDS_ENABLED:'false',
    PAYMENTS_MODE:'disabled', PAYMENTS_PROVIDER:'none', HOT_DEALS_MONITOR_ENABLED:'false', HOTELBEDS_CONTENT_SYNC_ENABLED:'false',
    HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com', HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com',
    HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com',
  });
  process.env.OFFER_TOKEN_SECRET = require('crypto').randomBytes(32).toString('hex');
  let unexpectedFetch = 0;
  t.mock.method(globalThis, 'fetch', async () => { unexpectedFetch++; throw Error('Unexpected network'); });
  const server = await createServer({
    root:fileURLToPath(new URL('..',import.meta.url)), configFile:false,
    server:{middlewareMode:true,hmr:false}, esbuild:{jsx:'automatic'},
    define:{'import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED':'"true"'},
    plugins:[{name:'offline-details',enforce:'pre',load(id) {
      const path=id.replaceAll('\\','/');
      if(path.endsWith('/context/FavoritesContext.jsx')) return 'export function useFavorites(){return {isFavorite:()=>false,toggleFavorite:async()=>{}}}';
      if(['/components/Navbar.jsx','/components/Footer.jsx'].some(s=>path.endsWith(s))) return 'export default function Empty(){return null}';
    }}],
  });
  const cache = require('../../backend/services/memoryCache');
  cache.clear();
  try {
    const {default:Details} = await server.ssrLoadModule('/src/pages/TourDetails.jsx');
    const {default:Gallery} = await server.ssrLoadModule('/src/components/DetailsGallery.jsx');
    const {default:Card} = await server.ssrLoadModule('/src/components/TourCard.jsx');
    const {loadDetailsOffer} = await server.ssrLoadModule('/src/services/detailsOffer.js');
    const {selectedOfferSnapshot} = await server.ssrLoadModule('/src/utils/selectedOfferSnapshot.js');
    const {offerDetailsLink} = await server.ssrLoadModule('/src/utils/hotTours.js');
    const {toggleDetailsFavorite} = await server.ssrLoadModule('/src/utils/detailsFavorite.js');
    const p = await server.ssrLoadModule('/src/utils/detailsPresentation.js');
    const display = await server.ssrLoadModule('/src/utils/hotelOfferDisplay.js');
    const local = await server.ssrLoadModule('/src/utils/localOfferFilters.js');
    const client = require('../../backend/integrations/hotelbeds/client');
    const catalog = require('../../backend/repositories/providerCatalogRepository');
    const search = require('../../backend/services/searchService');
    const {rate} = require('../../backend/tests/fixtures/hotelbedsSearchQuality');
    const calls = {availability:0,checkrate:0,content:0};
    t.mock.method(client,'availability',async () => {
      calls.availability++;
      return {hotels:{hotels:[{code:101,name:'Offline Grand Hotel',currency:'EUR',rooms:[
        {code:'STD',name:'Standard',rates:[rate('3r-bb','420.91')]},
        {code:'DBL.CLASSIC',name:'  Double   or Twin CLASSIC ',rates:[rate('3r-fb','1139.95',{boardCode:'FB',boardName:'Full Board'})]},
      ]}]}};
    });
    t.mock.method(client,'checkRates',async()=>{calls.checkrate++;throw Error('Forbidden CheckRate');});
    for(const method of ['contentHotels','contentHotelDetails','contentDestinations','contentCountries']) {
      t.mock.method(client,method,async()=>{calls.content++;throw Error('Forbidden Content');});
    }
    t.mock.method(require('../../backend/services/hotelbedsTestAccess'),'assertAvailable',async()=>{});
    t.mock.method(catalog,'findDestinations',async()=>[{code:'DXB',country_code:'AE'}]);
    t.mock.method(catalog,'findHotels',async()=>[{provider_hotel_id:'101'}]);
    t.mock.method(catalog,'findHotelsByIds',async()=>[{
      provider_hotel_id:'101',name:'Offline Grand Hotel',country_name:'AE',city:'DUBAI',destination_code:'DXB',stars:5,
      image_url:'/offline/hotel-1.jpg',images:Array.from({length:6},(_,i)=>`/offline/hotel-${i+1}.jpg`),
      facilities:[{description:'Wi-Fi'}],
    }]);
    t.mock.method(require('../../backend/services/priceHistoryService'),'record',async()=>{});
    t.mock.method(require('../../backend/services/hotelbedsMonitorService'),'track',async()=>{});
    const originalQuery = new URLSearchParams('provider=hotelbeds&countryCode=AE&destinationCode=DXB&checkIn=2030-09-28&nights=7&adults=2&children=0&rooms=1');
    const request = local.providerQuery(originalQuery,true);
    const result = await search.search(JSON.parse(request));
    assert.equal(result.meta.total,1);
    const defaultOffer = local.filterOffers(result.data,originalQuery)[0];
    assert.equal(defaultOffer.price,420.91);
    const filtered = new URLSearchParams(originalQuery);filtered.set('food','FB');
    const selected = local.filterOffers(result.data,filtered)[0];
    const before = JSON.stringify(selected);
    const url = offerDetailsLink(selected);
    const query = '?' + url.split('?')[1];
    const args = {selectedOffer:selected,provider:'hotelbeds',id:'101',search:query,signal:new AbortController().signal};
    const renderDetails = (offer=selected,search=query) => renderToStaticMarkup(React.createElement(MemoryRouter,{
      initialEntries:[{pathname:'/tour/hotelbeds/101',search,state:offer ? {selectedOffer:offer} : null}],
    },React.createElement(Routes,{},React.createElement(Route,{path:'/tour/:provider/:id',element:React.createElement(Details)}))));
    const render = node => renderToStaticMarkup(React.createElement(MemoryRouter,{},node));

    await t.test('BB 420.91 to FB 1139.95 keeps exact signed identity across Card and Details loader',async()=>{
      const loaded = await loadDetailsOffer(args);
      assert.equal(loaded,selected);
      assert.equal(loaded.price,1139.95);assert.equal(loaded.currency,'EUR');assert.equal(loaded.boardCode,'FB');
      assert.equal(loaded.roomCode,'DBL.CLASSIC');assert.equal(loaded.providerHotelId,'101');assert.equal(loaded.nights,7);assert.equal(loaded.adults,2);
      const decoded = require('../../backend/services/offerTokenService').verify(loaded.offerToken);
      for(const key of ['rateKey','roomCode','boardCode','price','currency','providerHotelId','nights','adults','children'])assert.equal(decoded[key],loaded[key]);
      const card = render(React.createElement(Card,{tour:selected}));
      const html = renderDetails();
      for(const markup of [card,html]) {assert.match(markup,/1\s*139,95/);assert.match(markup,/Полный пансион/);assert.doesNotMatch(markup,/420,91/);}
      assert.match(html,/Double or Twin CLASSIC/);assert.match(html,/162,85/);assert.match(html,/за 7 ночей · за всех гостей/);
      assert.equal(url.includes(selected.rateKey),false);assert.equal(url.includes(selected.offerToken),false);
      assert.deepEqual(calls,{availability:1,checkrate:0,content:0});
    });

    await t.test('header, dates, selected stay, safe hotel information and disabled booking',()=>{
      const html = renderDetails();
      assert.match(html,/<h1>Offline Grand Hotel<\/h1>/);assert.match(html,/Dubai, ОАЭ/);assert.doesNotMatch(html,/DUBAI/);
      assert.match(html,/Ваш вариант проживания/);assert.match(html,/2 взрослых/);
      assert.match(html,/28 сентября 2030/);assert.match(html,/5 октября 2030/);
      assert.match(html,/aria-label="Добавить в избранное"/);assert.match(html,/aria-pressed="false"/);
      assert.match(html,/<aside class="details-price-card"/);
      assert.match(html,/<button type="button" class="details-booking" disabled="">Бронирование отключено/);
      assert.equal((html.match(/Hotelbeds TEST/g)||[]).length,1);
      assert.match(html,/Тестовая цена Hotelbeds/);assert.match(html,/Цена получена из тестовой среды/);
      assert.doesNotMatch(html,/Перейти к оформлению|доступен для Booking|free cancellation|mobile-booking-bar/);
      const missing = renderDetails({...selected,stars:0,wifi:false,pool:false,spa:false,amenities:[]});
      assert.match(missing,/Категория не указана/);assert.doesNotMatch(missing,/0 звёзд|<h3>Удобства/);
      assert.deepEqual(p.hotelAmenities({wifi:true,pool:'true',spa:false,amenities:['  Wi-Fi  ',{name:'Fake'}]}),['Wi-Fi']);
      assert.deepEqual(p.hotelAmenities({}),[]);
    });

    await t.test('six thumbnails, active state, local fallback and no gallery provider calls',()=>{
      const images = p.galleryImages(selected);
      assert.equal(images.length,6);
      let active = 0;
      const props = {images,hotelName:selected.name,activeImage:active,onSelect:index=>{active=index;}};
      const tree = Gallery(props);
      tree.props.children[1].props.children[5].props.onClick();
      assert.equal(active,5);
      const html = render(React.createElement(Gallery,{...props,activeImage:active}));
      assert.match(html,/6 \/ 6/);assert.match(html,/Показать фото 6 из 6" aria-pressed="true"/);
      assert.match(html,/alt="Offline Grand Hotel"/);
      const empty = render(React.createElement(Gallery,{...props,images:[]}));
      assert.match(empty,/Фото недоступно/);assert.doesNotMatch(empty,/<img|gallery-counter/);
      assert.deepEqual(p.galleryImages({image:'a',images:['a','b',null,{}]}),['a','b']);
      assert.deepEqual(calls,{availability:1,checkrate:0,content:0});
    });

    await t.test('favorite handler passes same selected offer; back helper and disclosure stay local',async()=>{
      let favorite = false, passed, navigation;
      const toggleFavorite = async offer => {passed=offer;favorite=!favorite;};
      await toggleDetailsFavorite(selected,{hasSession:true,toggleFavorite,navigate:to=>{navigation=to;}});
      assert.equal(passed,selected);assert.equal(favorite,true);
      await toggleDetailsFavorite(selected,{hasSession:true,toggleFavorite,navigate:()=>{}});
      assert.equal(favorite,false);
      await toggleDetailsFavorite(selected,{hasSession:false,toggleFavorite,navigate:to=>{navigation=to;}});
      assert.equal(navigation,'/login');assert.equal(favorite,false);
      await toggleDetailsFavorite(selected,{hasSession:true,toggleFavorite:async()=>{throw Error('AUTH_REQUIRED');},navigate:to=>{navigation=to;}});
      assert.equal(navigation,'/login');
      const origin = p.resultsOrigin({pathname:'/results',search:`?${filtered}&rateKey=hidden&offerToken=hidden`,key:'results-key'});
      assert.equal(origin.search.includes('hidden'),false);
      assert.equal(p.detailsBackTarget(origin,1,query),-1);
      assert.equal(local.providerQuery(new URLSearchParams(origin.search),true),request);
      // Existing Results re-entry uses its original query; current backend cache also avoids Availability.
      await search.search(JSON.parse(local.providerQuery(new URLSearchParams(origin.search),true)));
      const fallback = p.detailsBackTarget(null,0,query);
      assert.ok(fallback.startsWith('/?'));assert.equal(fallback.includes('rateKey'),false);
      assert.equal(new URLSearchParams(fallback.split('?')[1]).get('nights'),'7');
      assert.equal(p.resultsOrigin({pathname:'/favorites',search:'',key:'x'}),null);
      const html=renderDetails();
      assert.match(html,/<details class="details-technical"><summary>Техническая информация/);
      assert.doesNotMatch(html,/<details[^>]* open/);
      assert.doesNotMatch(html.replace(/<details.*?<\/details>/gs,''),/BOOKABLE|Источник цены|Время наблюдения/);
      assert.equal(JSON.stringify(selected),before);
      assert.deepEqual(calls,{availability:1,checkrate:0,content:0});
    });

    await t.test('stale, future, hotel, dates and occupancy mismatches reject without resolver fallback',async()=>{
      const now=Date.parse(selected.observedAt);
      assert.equal(selectedOfferSnapshot(selected,'hotelbeds','101',query,now),selected);
      assert.equal(selectedOfferSnapshot(selected,'hotelbeds','101',query,now+899999),selected);
      for(const time of [now-1,now+900000,now+900001])assert.equal(selectedOfferSnapshot(selected,'hotelbeds','101',query,time),null);
      const cases = [
        {...args,selectedOffer:{...selected,observedAt:new Date(Date.now()-900001).toISOString()}},
        {...args,selectedOffer:{...selected,observedAt:new Date(Date.now()+60000).toISOString()}},
        {...args,id:'102'}, {...args,provider:'mock'},
        ...['departureDate=2031-01-01','checkIn=2031-01-01','checkOut=2031-01-08','nights=1','adults=3','people=3','children=1','childrenAges=8'].map(change=>{
          const params=new URLSearchParams(query);const [key,value]=change.split('=');params.set(key,value);
          return {...args,search:'?'+params};
        }),
      ];
      for(const value of cases)await assert.rejects(()=>loadDetailsOffer(value),{code:'SELECTED_OFFER_STALE'});
      const stale=renderDetails({...selected,observedAt:new Date(Date.now()-900001).toISOString()});
      assert.match(stale,/Выбранный тариф устарел/);assert.match(stale,/Выполните новый поиск/);
      assert.match(stale,/Вернуться к поиску/);assert.doesNotMatch(stale,/1\s*139,95|details-price-card/);
      assert.equal(unexpectedFetch,0);
    });

    await t.test('direct URL keeps one existing local resolver request and preserves error codes',async st=>{
      let fetches=0;
      st.mock.method(globalThis,'fetch',async(url,options)=>{
        fetches++;assert.match(url,/\/offers\/hotelbeds\/101\?/);assert.equal(options.signal,args.signal);
        return {ok:true,status:200,json:async()=>({success:true,data:selected})};
      });
      const loading=renderDetails(null);
      assert.match(loading,/aria-busy="true"/);assert.match(loading,/details-skeleton-gallery/);assert.doesNotMatch(loading,/1\s*139,95/);
      assert.equal(await loadDetailsOffer({...args,selectedOffer:null}),selected);assert.equal(fetches,1);
      for(const code of ['HOTELBEDS_AUTH_BLOCKED','HOTELBEDS_UNKNOWN_BLOCKED','HOTELBEDS_ACCESS_UNAVAILABLE']){
        st.mock.method(globalThis,'fetch',async()=>({ok:false,status:503,json:async()=>({code,message:'safe server message'})}));
        await assert.rejects(()=>loadDetailsOffer({...args,selectedOffer:null}),error=>{
          assert.equal(error.code,code);assert.equal(p.detailsError(error).code,code);assert.equal(p.detailsError(error).title,'Тарифы временно недоступны');return true;
        });
      }
      st.mock.method(globalThis,'fetch',async()=>({ok:false,status:404,json:async()=>({})}));
      await assert.rejects(()=>loadDetailsOffer({...args,selectedOffer:null}),error=>p.detailsError(error).title==='Отель не найден');
      st.mock.method(globalThis,'fetch',async()=>({ok:true,status:200,json:async()=>({success:true,data:{...selected,providerHotelId:'102'}})}));
      await assert.rejects(()=>loadDetailsOffer({...args,selectedOffer:null}),{code:'OFFER_NOT_FOUND'});
      assert.equal(p.detailsError(Error('local')).title,'Не удалось загрузить отель');
      assert.deepEqual(calls,{availability:1,checkrate:0,content:0});
    });

    await t.test('locale helpers retain ISO dates, real labels, pluralization and safe unknown values',()=>{
      assert.equal(p.displayDate('2030-02-30'),'—');
      assert.equal(p.stayDates({checkIn:'2030-09-28',nights:7}).checkOut,'2030-10-05');
      assert.equal(p.stayDates({checkIn:'2030-12-28',nights:7}).checkOut,'2031-01-04');
      assert.equal(p.detailsGuests({adults:1,children:1}),'1 взрослый · 1 ребёнок');
      assert.equal(p.detailsGuests({adults:2,children:2}),'2 взрослых · 2 ребёнка');
      assert.equal(p.detailsGuests({adults:2,children:5}),'2 взрослых · 5 детей');
      for(const [n,label] of [[1,'за 1 ночь'],[2,'за 2 ночи'],[5,'за 5 ночей']])assert.equal(display.stayLabel(n),label);
      assert.equal(p.hotelCategory(0),null);assert.equal(p.hotelCategory(3.5),null);assert.equal(p.hotelCategory(5),5);
      assert.equal(p.hotelLocation({city:'DUBAI',country:'AE',destinationCode:'DXB'}),'Dubai, ОАЭ');
      assert.equal(p.hotelLocation({city:'Al Barsha',country:'AE',destinationCode:'DXB'}),'Al Barsha, ОАЭ');
      assert.equal(display.normalizeBoardDisplay('ZZ',' Supplier   board '),'Supplier board');
      assert.equal(display.normalizeBoardDisplay('ZZ'),'ZZ');
      assert.equal(JSON.stringify(selected),before);
    });

    await t.test('allowlisted display excludes raw candidate secrets and arbitrary conditions',()=>{
      const html=renderDetails({...selected,rateKey:'DO_NOT_RENDER_RATE',offerToken:'DO_NOT_RENDER_TOKEN',
        arbitrary:{credential:'DO_NOT_RENDER_RAW'},taxes:{taxes:[{type:'DO_NOT_RENDER_TAX'}]},
        cancellationPolicies:[{from:'DO_NOT_RENDER_CANCEL'}],images:[],image:null});
      assert.doesNotMatch(html,/DO_NOT_RENDER_|JSON.stringify/);
      assert.match(html,/Подробные условия тарифа будут доступны после повторной проверки/);
      assert.doesNotMatch(html,/бесплатная отмена|Невозвратный|налоги включены/i);
    });

    await t.test('desktop/tablet/mobile layout contracts and no background refresh handlers',async()=>{
      const css=await readFile(new URL('../src/styles/TourDetails.css',import.meta.url),'utf8');
      assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(300px,360px\)/);
      assert.match(css,/@media \(max-width:1000px\)[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
      assert.match(css,/position:static; width:100%/);assert.match(css,/top:var\(--travio-page-top\)/);
      assert.match(css,/overflow-x:auto/);assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/:focus-visible/);
      assert.doesNotMatch(css,/position:fixed/);
      const source=await readFile(new URL('../src/pages/TourDetails.jsx',import.meta.url),'utf8');
      assert.doesNotMatch(source,/setInterval|CheckRate|checkRates|goCheckout|\/checkout|addEventListener/);
      assert.match(source,/loadDetailsOffer/);assert.match(source,/toggleDetailsFavorite\(tour/);
      const gallerySource=await readFile(new URL('../src/components/HotelImage.jsx',import.meta.url),'utf8');
      assert.match(gallerySource,/onError=\{\(\) => setFailedSource\(src\)\}/);
      const long=renderDetails({...selected,name:'VeryLongHotelName'.repeat(30),roomName:'VeryLongRoom'.repeat(30)});
      assert.match(long,/details-header/);assert.match(long,/details-offer-facts/);
    });
    assert.equal(unexpectedFetch,0);
    assert.deepEqual(calls,{availability:1,checkrate:0,content:0});
  } finally {cache.clear();await server.close();}
});
