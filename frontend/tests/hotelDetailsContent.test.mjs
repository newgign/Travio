import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import postcss from 'postcss';
createRequire(import.meta.url)('../../backend/tests/offlineNetwork.cjs');

test('5B Details content, exact selection and no external network',async t=>{
  let network=0;
  t.mock.method(globalThis,'fetch',async()=>{network++;throw Error('External network forbidden');});
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'},define:{'import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED':'"true"'},plugins:[{name:'offline-details',enforce:'pre',load(id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/context/FavoritesContext.jsx'))return 'export function useFavorites(){return {isFavorite:()=>true,toggleFavorite:async()=>{}}}';
    if(['/components/Navbar.jsx','/components/Footer.jsx'].some(value=>path.endsWith(value)))return 'export default function Empty(){return null}';
  }}]});
  const source=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');
  const render=node=>renderToStaticMarkup(React.createElement(MemoryRouter,{},node));
  try {
    const {default:Details}=await server.ssrLoadModule('/src/pages/TourDetails.jsx');
    const {default:Gallery}=await server.ssrLoadModule('/src/components/DetailsGallery.jsx');
    const {default:Image}=await server.ssrLoadModule('/src/components/HotelImage.jsx');
    const {default:Price}=await server.ssrLoadModule('/src/components/StayPrice.jsx');
    const p=await server.ssrLoadModule('/src/utils/detailsPresentation.js');
    const {loadDetailsOffer,watchDetailsExpiry}=await server.ssrLoadModule('/src/services/detailsOffer.js');
    const {offerDetailsLink}=await server.ssrLoadModule('/src/utils/hotTours.js');
    const {toggleDetailsFavorite}=await server.ssrLoadModule('/src/utils/detailsFavorite.js');
    const {createResultsSearch}=await server.ssrLoadModule('/src/services/resultsSearch.js');
    const {providerQuery,filterOffers}=await server.ssrLoadModule('/src/utils/localOfferFilters.js');
    const offer={provider:'hotelbeds',providerHotelId:'3424',name:'Grand Kaptan',stars:5,city:'Alanya',country:'TR',destinationCode:'AYT',address:'Fixture street 12',description:'Stored catalog description.\nSecond paragraph.',amenities:['Wi-Fi','Pool','Wi-Fi'],roomName:'Side Sea View',roomCode:'DBL.SV',boardCode:'AI',boardName:'All Inclusive',checkIn:'2030-10-05',checkOut:'2030-10-12',nights:7,adults:2,children:1,childrenAges:'8',occupancy:{rooms:1},price:1014.42,currency:'EUR',observedAt:new Date().toISOString(),priceEnvironment:'test',stagingTestAllowed:true,bookingDisabled:true,image:'/fixture/1.jpg',images:['/fixture/1.jpg','/fixture/2.jpg','/fixture/3.jpg'],rateComments:'Exact selected rate comment.',cancellationPolicies:[{from:'2030-10-03T12:00:00+03:00',amount:'150.50'}]};
    const before=JSON.stringify(offer);
    const origin={pathname:'/results',key:'results-origin',search:'?provider=hotelbeds&countryCode=TR&destinationCode=AYT&checkIn=2030-10-05&nights=7&adults=2&children=1&childrenAges=8&rooms=1&hotelName=Grand&sort=priceDesc&food=AI'};
    const details=(value=offer)=>renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[{pathname:'/tour/hotelbeds/3424',search:'?'+offerDetailsLink(value).split('?')[1],state:{selectedOffer:value,resultsOrigin:origin}}]},React.createElement(Routes,{},React.createElement(Route,{path:'/tour/:provider/:id',element:React.createElement(Details)}))));
    const html=details();
    const fields=[['hotel name',/<h1>Grand Kaptan<\/h1>/],['category',/Категория отеля: 5 звёзд/],['location',/Alanya, Турция/],['TEST disclosure',/Hotelbeds TEST/],['room',/Side Sea View/],['board',/Всё включено/],['check-in',/5 октября 2030/],['check-out',/12 октября 2030/],['nights',/7 ночей/],['adults',/2 взрослых/],['children',/1 ребёнок/],['one room',/1 номер/],['total',/1\s*014,42/],['currency',/€/],['per-night',/144,92.*?\/ ночь/],['booking disabled',/class="details-booking" disabled="">Бронирование отключено/],['payments unavailable',/Оплата недоступна/],['favorite selected',/aria-pressed="true" aria-label="Удалить из избранного"/]];
    for(const [name,pattern] of fields)await t.test(name,()=>assert.match(html,pattern));
    await t.test('main image is eager with alt and thumbnail images lazy',()=>{
      assert.match(html,/loading="eager" decoding="async"[^>]*alt="Grand Kaptan"/);assert.equal((html.match(/loading="lazy"/g)||[]).length,3);assert.match(html,/1 \/ 3/);
    });
    await t.test('six-image cap and source deduplication',()=>{
      assert.equal(p.galleryImages({...offer,images:Array.from({length:20},(_,i)=>`/fixture/${i}.jpg`)}).length,6);
      assert.deepEqual(p.galleryImages({image:' /a.jpg ',images:['/a.jpg',null,{},'data:image/png;base64,unused']}),['/a.jpg']);
    });
    await t.test('thumbnail click changes selected image without fetch',()=>{
      let selected=0;const tree=Gallery({images:offer.images,hotelName:offer.name,activeImage:0,onSelect:index=>selected=index});
      tree.props.children[1].props.children[2].props.onClick();assert.equal(selected,2);
      const markup=render(React.createElement(Gallery,{images:offer.images,hotelName:offer.name,activeImage:selected,onSelect:()=>{}}));assert.match(markup,/3 \/ 3/);assert.match(markup,/Показать фото 3 из 3" aria-pressed="true"/);assert.equal(network,0);
    });
    await t.test('gallery Arrow/Home/End controls select and move focus',()=>{
      let selected=-1,focused=-1,prevented=0;const props={images:offer.images,hotelName:offer.name,activeImage:0,onSelect:i=>selected=i};
      const nodes=Gallery(props).props.children[1].props.children;
      const buttons=offer.images.map((_,i)=>({focus:()=>focused=i}));
      for(const [index,key,target] of [[0,'ArrowRight',1],[0,'ArrowLeft',2],[1,'Home',0],[0,'End',2]]){
        nodes[index].props.onKeyDown({key,preventDefault:()=>prevented++,currentTarget:{parentElement:{querySelectorAll:()=>buttons}}});assert.equal(selected,target);assert.equal(focused,target);
      }
      nodes[0].props.onKeyDown({key:'Tab'});assert.equal(prevented,4);
    });
    await t.test('empty gallery has neutral image fallback',()=>{
      const markup=render(React.createElement(Gallery,{images:[],hotelName:'No images',activeImage:0,onSelect:()=>{}}));assert.match(markup,/role="img" aria-label="Фото недоступно"/);assert.doesNotMatch(markup,/<img|details-thumbnails|gallery-counter/);
    });
    await t.test('invalid active index is clamped to a real image',()=>{
      for(const activeImage of [-5,NaN,500]){const markup=render(React.createElement(Gallery,{images:offer.images,hotelName:offer.name,activeImage,onSelect:()=>{}}));assert.doesNotMatch(markup,/NaN|undefined|Фото недоступно/);}
    });
    await t.test('failed image has local fallback wiring without remote substitute',async()=>{
      assert.match(render(React.createElement(Image,{src:null,alt:'Hotel'})),/Фото недоступно/);
      const code=await source('components/HotelImage.jsx');assert.match(code,/failedSource === src/);assert.match(code,/onError=\{\(\) => setFailedSource\(src\)\}/);assert.doesNotMatch(code,/fetch|https:\/\//);
    });
    await t.test('description uses stored content and preserves paragraph breaks',()=>{assert.match(html,/Stored catalog description/);assert.match(html,/Second paragraph/);assert.equal(p.hotelDescription(offer),offer.description);});
    await t.test('missing description is factual fallback',()=>{assert.match(details({...offer,description:null}),/Описание отеля пока недоступно/);assert.equal(p.hotelDescription({description:{content:'Not a string'}}),'Описание отеля пока недоступно.');});
    await t.test('explicit source paragraphs separate charges from prose without translation or truncation',()=>{
      const description='  WIFI AMOUNT (EXCEPT LOBBY) : 1 HOUR = 1 EUR / 1 DAY = 3 EUR / 22 EUR\r\n \r\nIdeally located in the prime touristic area.  ';
      const paragraphs=p.hotelDescriptionParagraphs({description});
      assert.deepEqual(paragraphs,['WIFI AMOUNT (EXCEPT LOBBY) : 1 HOUR = 1 EUR / 1 DAY = 3 EUR / 22 EUR','Ideally located in the prime touristic area.']);
      const markup=details({...offer,description});
      for(const paragraph of paragraphs)assert.ok(markup.includes(`<p class="details-description">${paragraph}</p>`));
      assert.doesNotMatch(markup,/EURIdeally|Дополнительная информация|Идеально расположен/);
      assert.equal(network,0);
    });
    await t.test('description normalizes whitespace without guessing boundaries in a single raw string',()=>{
      assert.equal(p.hotelDescription({description:' \tWIFI\u00a0  AMOUNT\t:  22 EURIdeally located. Next sentence. '}),'WIFI AMOUNT : 22 EURIdeally located. Next sentence.');
      assert.deepEqual(p.hotelDescriptionParagraphs({description:'22 EURIdeally located. Next sentence.'}),['22 EURIdeally located. Next sentence.']);
      assert.deepEqual(p.hotelDescriptionParagraphs({description:'First\r\nline\r\n\r\n\r\nSecond'}),['First\nline','Second']);
    });
    await t.test('source blank-line boundaries survive mapper, catalog parameters, candidate and selected Details',async()=>{
      const require=createRequire(import.meta.url);
      const mapper=require('../../backend/services/hotelbedsContentMapper');
      const repository=require('../../backend/repositories/providerCatalogRepository');
      const provider=require('../../backend/sources/hotelbeds');
      const generator=require('../../backend/services/offerService');
      const publicCandidate=require('../../backend/services/hotelbedsPublicCandidate');
      const tokens=require('../../backend/services/offerTokenService');
      const fragments=['WIFI AMOUNT : 2 WEEKS = 22 EUR','Ideally located <b>provider text</b>.'];
      // Synthetic source fixture, not evidence of Grand Kaptan's actual raw_data.
      const raw={code:3424,name:{content:'Grand Kaptan'},countryCode:'TR',destinationCode:'AYT',
        description:{content:`  ${fragments[0]}\r\n \r\nIdeally\t located <b>provider text</b>.  `},
        remarks:{content:'PRIVATE_REMARK'},interestPoints:[{description:'PRIVATE_INTEREST'}],
        facilities:[{description:{content:'PRIVATE_FACILITY'},indYesOrNo:false}],debug:'PRIVATE_DEBUG'};
      const beforeRaw=JSON.stringify(raw), mapped=mapper.mapHotel(raw);
      assert.equal(mapped.description,raw.description.content.trim());
      let writes=0;
      // Execute the actual repository method with an in-memory SQL boundary only.
      const stored=await repository.upsertHotel(mapped,{query:async(sql,values)=>{
        writes++;
        assert.match(sql,/description,/);assert.match(sql,/raw_data,/);
        assert.equal(values[14],mapped.description);
        assert.deepEqual(JSON.parse(values[23]),raw);
        return {rows:[{provider_hotel_id:values[1],name:values[7],description:values[14],raw_data:JSON.parse(values[23])}]};
      }});
      assert.equal(writes,1);
      const availability={code:3424,currency:'EUR',rooms:[{code:offer.roomCode,name:offer.roomName,rates:[{
        rateKey:'offline-boundary-rate',rateType:'BOOKABLE',net:String(offer.price),boardCode:offer.boardCode,
        boardName:offer.boardName,rooms:1,adults:2,children:1,paymentType:'AT_WEB',packaging:false,rateClass:'NOR'}]}]};
      const normalized=provider.normalizeHotel(availability,offer,stored);
      assert.equal(normalized.description,mapped.description);
      const generated=generator.generateOffer({...normalized,priceEnvironment:'test',stagingTestAllowed:true,bookingDisabled:true},offer);
      const candidate=publicCandidate(generated);
      assert.equal(candidate.description,mapped.description);
      assert.doesNotMatch(JSON.stringify(candidate),/PRIVATE_|raw_data|rawData|interestPoints/);
      const identity=['provider','providerHotelId','rateKey','roomCode','roomName','boardCode','price','currency','checkIn','checkOut','nights','adults','children','childrenAges','occupancy'];
      for(const field of identity)assert.deepEqual(candidate[field],generated[field]);
      const snapshot=JSON.stringify(candidate), signedFields=tokens.compactOffer(candidate);
      const selected=filterOffers([{...candidate,candidateOffers:[candidate]}],new URLSearchParams('food=AI'))[0];
      assert.equal(selected,candidate);
      assert.equal(await loadDetailsOffer({selectedOffer:selected,provider:'hotelbeds',id:'3424',search:'?'+offerDetailsLink(selected).split('?')[1]}),candidate);
      assert.deepEqual(p.hotelDescriptionParagraphs(candidate),fragments);
      const markup=details(candidate);
      const paragraphs=[...markup.matchAll(/<p class="details-description">(.*?)<\/p>/gs)].map(match=>match[1]);
      assert.deepEqual(paragraphs,[fragments[0],'Ideally located &lt;b&gt;provider text&lt;/b&gt;.']);
      assert.doesNotMatch(markup,/<b>provider|PRIVATE_|Идеально|Дополнительная информация/);
      assert.equal(JSON.stringify(candidate),snapshot);assert.deepEqual(tokens.compactOffer(candidate),signedFields);
      assert.equal(JSON.stringify(raw),beforeRaw);assert.equal(network,0);
    });
    await t.test('single upstream raw description stays a single legacy paragraph without EUR or punctuation heuristics',()=>{
      const require=createRequire(import.meta.url);
      const mapper=require('../../backend/services/hotelbedsContentMapper');
      const publicCandidate=require('../../backend/services/hotelbedsPublicCandidate');
      for(const description of ['WIFI AMOUNT : 2 WEEKS = 22 EURIdeally located. Next sentence.', '10 USDGreat view!Another sentence']){
        const mapped=mapper.mapHotel({code:3424,description:{content:description}});
        assert.equal(mapped.description,description);
        const candidate=publicCandidate({...offer,description:mapped.description,rawData:{private:'HIDDEN'}});
        assert.deepEqual(p.hotelDescriptionParagraphs(candidate),[description]);
        const markup=details({...candidate,rateComments:null});
        assert.ok(markup.includes(`<p class="details-description">${description}</p>`));
        assert.equal((markup.match(/<p class="details-description">/g)||[]).length,1);
        assert.doesNotMatch(markup,/HIDDEN/);
      }
      assert.equal(network,0);
    });
    await t.test('paragraph markup stays escaped and object descriptions remain safe fallbacks',()=>{
      const markup=details({...offer,description:'<script>bad()</script>\n\n<img src=x onerror=bad()>'});
      assert.match(markup,/<p class="details-description">&lt;script&gt;/);
      assert.match(markup,/<p class="details-description">&lt;img/);
      assert.doesNotMatch(markup,/<script|<img src="x"/);
      for(const description of [{content:'private'},['private'],null,42]){
        assert.deepEqual(p.hotelDescriptionParagraphs({description}),['Описание отеля пока недоступно.']);
        assert.doesNotMatch(details({...offer,description}),/private|\[object Object\]/);
      }
    });
    await t.test('description paragraphs have spacing and wrap without clipping content',async()=>{
      const css=postcss.parse(await source('styles/TourDetails.css'));
      const rule=selector=>css.nodes.find(node=>node.selector===selector);
      assert.ok(rule('.details-section .details-description + .details-description').nodes.some(node=>node.prop==='margin-top' && node.value==='16px'));
      assert.ok(rule('.details-section p').nodes.some(node=>node.prop==='overflow-wrap' && node.value==='anywhere'));
      assert.ok(rule('.details-section p').nodes.some(node=>node.prop==='line-height' && Number(node.value)>=1.5));
    });
    await t.test('cancellation date is readable with original offset, amount and timestamp preserved',()=>{
      const cancellationPolicies=[{from:'2026-09-29T23:59:00+03:00',amount:'150.50',currency:'USD'}];
      const saved=JSON.stringify(cancellationPolicies);
      const value=p.rateConditions({...offer,cancellationPolicies}).policies[0];
      assert.equal(value.from,cancellationPolicies[0].from);
      assert.equal(value.fromLabel,'29 сентября 2026, 23:59:00 (+03:00)');
      assert.match(value.amount,/150,50/);assert.match(value.amount,/\$/);assert.doesNotMatch(value.amount,/€/);
      assert.ok(details({...offer,cancellationPolicies}).includes(`<time dateTime="${value.from}">${value.fromLabel}</time>`));
      assert.equal(JSON.stringify(cancellationPolicies),saved);
      assert.equal(network,0);
    });
    await t.test('cancellation clock and date never convert through browser local timezone',()=>{
      const original=process.env.TZ;
      try {
        for(const zone of ['Pacific/Honolulu','Asia/Tokyo','UTC']){
          process.env.TZ=zone;
          assert.equal(p.cancellationDateLabel('2026-09-29T00:01:02.123+03:00'),'29 сентября 2026, 00:01:02.123 (+03:00)');
          assert.equal(p.cancellationDateLabel('2026-09-29T23:59-07:30'),'29 сентября 2026, 23:59 (-07:30)');
        }
      } finally {if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
    });
    await t.test('UTC, date-only and absent timezone remain explicit without invented offsets',()=>{
      assert.equal(p.cancellationDateLabel('2026-09-29T23:59Z'),'29 сентября 2026, 23:59 UTC (Z)');
      assert.equal(p.cancellationDateLabel('2026-09-29'),'29 сентября 2026');
      assert.equal(p.cancellationDateLabel('2026-09-29T23:59'),'29 сентября 2026, 23:59 (часовой пояс не указан)');
    });
    await t.test('malformed cancellation dates are omitted and zero penalty never promises free cancellation',()=>{
      for(const from of ['2026-02-30T23:59+03:00','2026-09-29T24:00+03:00','2026-09-29T23:59+03:99','invalid',{},null]){
        assert.equal(p.cancellationDateLabel(from),'');
        const markup=details({...offer,cancellationPolicies:[{from,amount:'0',currency:'EUR'}]});
        assert.doesNotMatch(markup,/details-policies|Invalid Date|Бесплатная отмена|free cancellation/i);
      }
      const markup=details({...offer,cancellationPolicies:[{from:'2026-09-29T23:59+03:00',amount:0,currency:'EUR'}]});
      assert.match(markup,/0,00/);assert.doesNotMatch(markup,/Бесплатная отмена|free cancellation/i);
      assert.equal(network,0);
    });
    await t.test('provider HTML is escaped as text, never executed',()=>{
      const markup=details({...offer,description:'<script>alert(1)</script><img src=x onerror=evil()>',rateComments:'<b>Rate text</b>'});assert.match(markup,/&lt;script&gt;/);assert.match(markup,/&lt;b&gt;Rate text/);assert.doesNotMatch(markup,/<script|<img src="x"|<b>Rate text/);
    });
    await t.test('normalized facilities are factual, deduplicated and expandable',()=>{
      const names=Array.from({length:12},(_,i)=>'Facility '+i);const markup=details({...offer,amenities:names});assert.match(markup,/Показать все удобства \(12\)/);for(const name of names)assert.ok(markup.includes(name));
      assert.deepEqual(p.hotelAmenities({amenities:[' Wi-Fi ','Wi-Fi'],pool:false}),['Wi-Fi']);assert.doesNotMatch(markup,/Airport shuttle|Бесплатный/);
    });
    await t.test('no facilities means no empty amenities grid or invented flags',()=>{
      const markup=details({...offer,amenities:[],wifi:false,pool:false});assert.doesNotMatch(markup,/details-amenities|<h3>Удобства/);assert.deepEqual(p.hotelAmenities({pool:'true',amenities:[{}]}),[]);
    });
    await t.test('address renders only when present, no external map',()=>{
      assert.match(html,/Адрес: <\/strong>Fixture street 12/);assert.doesNotMatch(details({...offer,address:null}),/details-address/);assert.doesNotMatch(html,/<iframe|maps\.google|mapbox/);
    });
    await t.test('missing city falls back to known destination, not invented address',()=>{assert.equal(p.hotelLocation({country:'TR',destinationCode:'AYT'}),'Antalya, Турция');assert.equal(p.hotelLocation({}), '');});
    await t.test('missing category and optional content do not crash',()=>{
      const markup=details({...offer,name:null,stars:null,city:null,address:null,description:null,amenities:null,images:null,image:null});
      assert.match(markup,/<h1>Отель/);assert.match(markup,/Категория не указана/);assert.match(markup,/Side Sea View/);assert.match(markup,/Всё включено/);assert.doesNotMatch(markup,/NaN|undefined|Invalid Date/);
    });
    await t.test('safe formatters handle malformed scalar content without React object errors',()=>{
      assert.doesNotThrow(()=>details({...offer,name:{},roomName:{},boardName:{},boardCode:{},description:{},address:{},destinationCode:{},city:null}));
      assert.doesNotThrow(()=>p.stayDates({checkIn:'2030-10-05',nights:1e100}));assert.equal(p.displayDate('2030-02-30'),'—');
    });
    await t.test('missing price is unavailable and never NaN or fabricated zero',()=>{
      for(const price of [null,undefined,NaN,'']){const markup=render(React.createElement(Price,{offer:{...offer,price}}));assert.match(markup,/Цена недоступна/);assert.doesNotMatch(markup,/NaN|undefined|0,00/);}
    });
    await t.test('currency is exact offer currency, no EUR conversion',()=>{
      const markup=details({...offer,currency:'USD',cancellationPolicies:[]});assert.match(markup,/\$/);assert.doesNotMatch(markup,/€|EUR/);assert.match(markup,/1\s*014,42/);
    });
    await t.test('one-night price omits redundant per-night line',()=>{assert.doesNotMatch(render(React.createElement(Price,{offer:{...offer,nights:1}})),/\/ ночь/);});
    await t.test('conditions use exact selected comments and penalties only',()=>{
      assert.match(html,/Exact selected rate comment/);assert.match(html,/2030-10-03T12:00:00\+03:00/);assert.match(html,/150,50/);assert.match(html,/без изменения часового пояса/);assert.doesNotMatch(html,/Бесплатная отмена|Невозвратный/);
    });
    await t.test('absent conditions keep existing explicit verification fallback',()=>{
      const markup=details({...offer,rateComments:null,cancellationPolicies:[]});assert.match(markup,/Подробные условия тарифа будут доступны после повторной проверки перед оформлением/);assert.doesNotMatch(markup,/details-policies|Штрафы при отмене/);
    });
    await t.test('malformed policy data and arbitrary keys are never displayed',()=>{
      const markup=details({...offer,rateComments:{raw:'SECRET'},cancellationPolicies:[{from:'SECRET'},{from:'2030-02-30T12:00:00',amount:12},{from:'2030-10-01T99:00:00',amount:12},{from:'2030-10-01',amount:NaN},{from:'2030-10-01',amount:-1}],raw:{secret:'SECRET'}});assert.doesNotMatch(markup,/SECRET|details-policies|NaN/);
    });
    await t.test('zero penalty is data, not an invented free-cancellation promise',()=>{
      const value=p.rateConditions({...offer,cancellationPolicies:[{from:'2030-10-01',amount:0}]});assert.equal(value.policies.length,1);assert.match(value.policies[0].amount,/0,00/);assert.doesNotMatch(details({...offer,cancellationPolicies:[{from:'2030-10-01',amount:0}]}),/Бесплатная отмена/i);
    });
    await t.test('favorite preserves object and updates using existing action',async()=>{
      let selected,active=false;await toggleDetailsFavorite(offer,{hasSession:true,toggleFavorite:async value=>{selected=value;active=!active;},navigate:()=>{}});assert.equal(selected,offer);assert.equal(active,true);
    });
    await t.test('favorite pending guard blocks rapid duplicate calls, then releases',async()=>{
      let calls=0,resolve;const pending={current:false};const options={hasSession:true,pending,navigate:()=>{},toggleFavorite:()=>{calls++;return new Promise(done=>resolve=done);}};
      const first=toggleDetailsFavorite(offer,options);assert.equal(pending.current,true);await toggleDetailsFavorite(offer,options);assert.equal(calls,1);resolve();await first;assert.equal(pending.current,false);
    });
    await t.test('favorite failures release lock and render fixed errors only',async()=>{
      const pending={current:false};await assert.rejects(toggleDetailsFavorite(offer,{hasSession:true,pending,navigate:()=>{},toggleFavorite:async()=>{throw Error('private-url');}}));assert.equal(pending.current,false);
      const code=await source('pages/TourDetails.jsx');assert.match(code,/catch \{ setFavoriteError\('Не удалось обновить избранное/);assert.doesNotMatch(code,/setFavoriteError\(err/);assert.match(code,/if\(pendingFavorite.current\)return/);
    });
    await t.test('unknown errors cannot leak raw code into data attributes',()=>{assert.equal(p.detailsError({code:'SECRET',message:'SECRET'}).code,'DETAILS_LOCAL_ERROR');assert.doesNotMatch(JSON.stringify(p.detailsError(Error('SECRET'))),/SECRET/);});
    await t.test('stale selection renders safe state and no current price',()=>{
      const markup=details({...offer,observedAt:new Date(Date.now()-900001).toISOString()});assert.match(markup,/Выбранный тариф устарел/);assert.match(markup,/Вернуться к результатам/);assert.doesNotMatch(markup,/details-price-card|1\s*014,42/);
    });
    await t.test('stale selected offer never resolves another candidate',async()=>{
      await assert.rejects(loadDetailsOffer({selectedOffer:{...offer,observedAt:new Date(Date.now()-900001).toISOString()},provider:'hotelbeds',id:'3424',search:'?'+offerDetailsLink(offer).split('?')[1]}),{code:'SELECTED_OFFER_STALE'});assert.equal(network,0);
    });
    await t.test('open Details expires with shared freshness, cancels timer and never fetches',()=>{
      const now=Date.parse(offer.observedAt)+1000;let delay,callback,cancelled,expired=0;
      const stop=watchDetailsExpiry(offer,()=>expired++,{now:()=>now,schedule:(fn,ms)=>{callback=fn;delay=ms;return 7;},cancel:id=>cancelled=id});assert.equal(delay,899000);callback();assert.equal(expired,1);stop();assert.equal(cancelled,7);assert.equal(network,0);
    });
    await t.test('Results -> Details preserves every exact candidate field and no fetch',async()=>{
      const selected=filterOffers([offer],new URLSearchParams(origin.search))[0];assert.equal(selected,offer);
      const loaded=await loadDetailsOffer({selectedOffer:selected,provider:'hotelbeds',id:'3424',search:'?'+offerDetailsLink(selected).split('?')[1]});assert.equal(loaded,offer);assert.equal(JSON.stringify(offer),before);assert.equal(network,0);
    });
    await t.test('Details -> Back keeps name/filter/sort and fresh cache without repeat request',async()=>{
      let calls=0;const load=createResultsSearch(async()=>{calls++;return {data:[offer]};});const query=providerQuery(new URLSearchParams(origin.search),true);const initial=await load(query);
      const back=p.resultsOrigin(origin);assert.equal(p.detailsBackTarget(back,1,''),-1);assert.match(back.search,/hotelName=Grand/);assert.match(back.search,/sort=priceDesc/);assert.match(back.search,/food=AI/);assert.equal(await load(providerQuery(new URLSearchParams(back.search),true)),initial);assert.equal(calls,1);
    });
    await t.test('local content rendering needs no extra resolver or Content request',async()=>{
      for(let i=0;i<3;i++)assert.match(details(),/Stored catalog description/);assert.equal(network,0);
      for(const path of ['pages/TourDetails.jsx','components/DetailsGallery.jsx','utils/detailsPresentation.js'])assert.doesNotMatch(await source(path),/contentHotels|contentHotelDetails|checkRates|\.availability\(|dangerouslySetInnerHTML/);
    });
    await t.test('heading hierarchy, native disclosure and semantic disabled action',()=>{
      assert.equal((html.match(/<h1>/g)||[]).length,1);for(const label of ['Ваш вариант проживания','Об отеле','Расположение','Условия тарифа','Стоимость проживания'])assert.ok(html.includes(label));assert.match(html,/<details class="details-technical"><summary>/);assert.match(html,/type="button" class="details-booking" disabled/);
    });
    await t.test('mobile DOM places offer and price before long content',()=>{assert.ok(html.indexOf('selected-stay-title')<html.indexOf('details-price-card'));assert.ok(html.indexOf('details-price-card')<html.indexOf('hotel-info-title'));});
    await t.test('responsive rules at 320/390/768/1440 preserve fit and visible focus',async()=>{
      const css=await source('styles/TourDetails.css');const root=postcss.parse(css);assert.ok(root.nodes.length>0);
      for(const width of [320,390,768,1440]){
        if(width<=1000)assert.match(css,/@media \(max-width:1000px\)[\s\S]*?position:static; width:100%/);
        else assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(300px,360px\)/);
        if(width<=600)assert.match(css,/@media \(max-width:600px\)/);
      }
      for(const pattern of [/overflow-x:auto/,/overflow-wrap:anywhere/,/:focus-visible/,/aspect-ratio:16\/10/,/object-fit:cover/])assert.match(css,pattern);assert.doesNotMatch(css,/position:fixed/);
    });
    await t.test('long hotel, room, address and policies render without invalid values',()=>{
      const markup=details({...offer,name:'Hotel'.repeat(100),roomName:'Room'.repeat(100),address:'Address'.repeat(100)});assert.doesNotMatch(markup,/undefined|NaN|Invalid Date/);assert.match(markup,/details-address/);
    });
    await t.test('no network and no mutation of selected snapshot',()=>{assert.equal(network,0);assert.equal(JSON.stringify(offer),before);});
    await t.test('critical missing or inconsistent fields reject without resolver substitution',async()=>{
      const invalid=[{roomName:null,roomCode:null},{boardName:null,boardCode:null},{price:null},{currency:null},{checkIn:null},{checkOut:null},{nights:NaN},{nights:6},{adults:0},{children:null},{occupancy:{rooms:2}},{occupancy:{rooms:0}},{occupancy:{rooms:1,adults:3}},{childrenAges:'18'},{childrenAges:'8,9'}];
      for(const change of invalid){
        const value={...offer,...change};
        assert.doesNotMatch(details(value),/details-price-card|NaN|undefined|Invalid Date/);
        await assert.rejects(loadDetailsOffer({selectedOffer:value,provider:'hotelbeds',id:'3424',search:'?'+offerDetailsLink(value).split('?')[1]}),{code:'SELECTED_OFFER_STALE'});
      }
      assert.equal(network,0);
    });
    await t.test('public selected candidate carries only existing content and allowlisted policy fields',()=>{
      const publicCandidate=createRequire(import.meta.url)('../../backend/services/hotelbedsPublicCandidate.js');
      const selected=publicCandidate({...offer,raw:'SECRET',cancellationPolicies:[{...offer.cancellationPolicies[0],secret:'SECRET'}]});
      for(const key of ['description','address','amenities','rateComments'])assert.deepEqual(selected[key],offer[key]);
      assert.deepEqual(selected.cancellationPolicies,offer.cancellationPolicies);
      assert.doesNotMatch(JSON.stringify(selected),/SECRET/);
      assert.match(details(selected),/Stored catalog description/);
      const malformed=publicCandidate({...offer,description:{secret:'SECRET'},address:[],rateComments:{},amenities:[{},'Real facility'],cancellationPolicies:[null,{from:{secret:'SECRET'},amount:NaN}]});
      assert.equal(malformed.description,undefined);assert.equal(malformed.address,undefined);assert.equal(malformed.rateComments,undefined);
      assert.deepEqual(malformed.amenities,['Real facility']);assert.doesNotMatch(JSON.stringify(malformed),/SECRET/);
    });
  } finally {await server.close();}
});
