import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import postcss from 'postcss';
createRequire(import.meta.url)('../../backend/tests/offlineNetwork.cjs');

test('5A search experience: offline behavior, exact offers and explicit refresh',async t=>{
  let external=0;
  t.mock.method(globalThis,'fetch',async()=>{external++;throw Error('Forbidden external request');});
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'},define:{'import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED':'"true"'},plugins:[{name:'offline-context',enforce:'pre',load(id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/context/FavoritesContext.jsx'))return 'export function useFavorites(){return {isFavorite:()=>true,toggleFavorite:async()=>{}}}';
    if(['/components/Navbar.jsx','/components/Footer.jsx'].some(value=>path.endsWith(value)))return 'export default function Empty(){return null}';
  }}]});
  const render=(Component,props={},url='/')=>renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[url]},React.createElement(Component,props)));
  const source=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');
  try {
    const {validateResultsSearch,resultsState,searchFailureMessage}=await server.ssrLoadModule('/src/utils/searchExperience.js');
    const {buildHomeSearch,initialHomeSearch,destinationKey}=await server.ssrLoadModule('/src/utils/homeSearch.js');
    const {providerQuery,filterOffers,resetOfferFilters}=await server.ssrLoadModule('/src/utils/localOfferFilters.js');
    const {activeFilterChips,editSearchLink,changePresentationFilter}=await server.ssrLoadModule('/src/utils/resultsPresentation.js');
    const {createResultsSearch,resultsFreshUntil}=await server.ssrLoadModule('/src/services/resultsSearch.js');
    const {selectedOfferSnapshot,offerFreshUntil}=await server.ssrLoadModule('/src/utils/selectedOfferSnapshot.js');
    const {resultsOrigin,detailsBackTarget}=await server.ssrLoadModule('/src/utils/detailsPresentation.js');
    const {offerDetailsLink}=await server.ssrLoadModule('/src/utils/hotTours.js');
    const {loadDetailsOffer}=await server.ssrLoadModule('/src/services/detailsOffer.js');
    const {formatMoney}=await server.ssrLoadModule('/src/utils/money.js');
    const {default:Card}=await server.ssrLoadModule('/src/components/TourCard.jsx');
    const {default:Notice}=await server.ssrLoadModule('/src/components/ResultsNotice.jsx');
    const {default:Toolbar}=await server.ssrLoadModule('/src/components/ResultsToolbar.jsx');
    const {default:Results}=await server.ssrLoadModule('/src/pages/Results.jsx');
    const {default:Guest}=await server.ssrLoadModule('/src/components/GuestPanel.jsx');
    const {default:Filters}=await server.ssrLoadModule('/src/components/LocalResultsFilters.jsx');
    const params=new URLSearchParams('provider=hotelbeds&countryCode=TR&destinationCode=AYT&checkIn=2035-10-05&nights=7&adults=2&children=0&rooms=1');
    const key=providerQuery(params,true), now=Date.now();
    const row={countryCode:'TR',code:'AYT',hotelCount:3};
    const form={...initialHomeSearch(params),destination:destinationKey(row)};
    const make=(id,price,name)=>({provider:'hotelbeds',providerHotelId:id,name,price,currency:'EUR',nights:7,adults:2,children:0,childrenAges:[],occupancy:{rooms:1},checkIn:'2035-10-05',checkOut:'2035-10-12',country:'TR',destinationCode:'AYT',city:'Alanya',roomName:'Side Sea View',boardCode:'AI',stars:5,priceEnvironment:'test',stagingTestAllowed:true,bookingDisabled:true,observedAt:new Date(now).toISOString()});
    const original=[make('3424',1014.42,'Grand Kaptan'),make('2',700,'Other Hotel'),make('3',1400,'Grand Bay')];
    const before=JSON.stringify(original);
    await t.test('valid submit serializes complete search identity',()=>{
      const built=buildHomeSearch(form,[row]);assert.deepEqual(built.errors,{});
      assert.deepEqual(Object.fromEntries(new URLSearchParams(built.url.split('?')[1])),Object.fromEntries(params));
      assert.equal(validateResultsSearch(params).state,'VALID');
    });
    const invalid=[['missing destination','destinationCode',''],['malformed destination','destinationCode','../bad'],['malformed country','countryCode','TR/path'],['invalid provider','provider','live'],['malformed date','checkIn','tomorrow'],['impossible date','checkIn','2035-02-30'],['past date','checkIn','2000-01-01'],['nights zero','nights','0'],['nights negative','nights','-1'],['nights fractional','nights','1.5'],['adults zero','adults','0'],['children negative','children','-1'],['children excessive','children','4'],['rooms zero','rooms','0'],['rooms multiple','rooms','2'],['rooms malformed','rooms','one'],['child age count mismatch','children','1'],['unexpected child age','childrenAges','8']];
    for(const [name,field,value] of invalid)await t.test(`${name} blocks before request`,async()=>{
      const query=new URLSearchParams(params);query.set(field,value);assert.equal(validateResultsSearch(query).state,'INITIAL');
      let calls=0;const load=createResultsSearch(async()=>{calls++;return {data:original};});
      await assert.rejects(load(providerQuery(query,true)),{code:'INVALID_SEARCH'});
      assert.equal(calls,0);
    });
    await t.test('request boundary independently rejects rooms multiple',async()=>{
      let calls=0;const load=createResultsSearch(async()=>{calls++;return {data:original};});
      const query=new URLSearchParams(params);query.set('rooms','2');
      await assert.rejects(load(providerQuery(query,true)),{code:'INVALID_SEARCH'});assert.equal(calls,0);
    });
    await t.test('missing rooms safely defaults to one; explicit one valid',()=>{
      const query=new URLSearchParams(params);query.delete('rooms');assert.equal(validateResultsSearch(query).state,'VALID');assert.equal(providerQuery(query,true),key);
      assert.equal(validateResultsSearch(params).state,'VALID');
    });
    await t.test('child ages 0 and 17 valid, malformed/out of range rejected',()=>{
      const query=new URLSearchParams(params);query.set('children','2');query.set('childrenAges','0,17');assert.equal(validateResultsSearch(query).state,'VALID');
      for(const ages of ['0','0,18','0,-1','0,NaN','0,']){query.set('childrenAges',ages);assert.equal(validateResultsSearch(query).state,'INITIAL');}
    });
    await t.test('refresh restores form including children and edit search',()=>{
      const query=new URLSearchParams(params);query.set('children','1');query.set('childrenAges','8');query.set('hotelName','Grand');
      const restored=new URLSearchParams(editSearchLink(query).split('?')[1]);assert.equal(restored.has('hotelName'),false);
      assert.deepEqual(initialHomeSearch(restored),{...form,children:1,childrenAges:['8']});assert.equal(validateResultsSearch(restored).state,'VALID');
    });
    await t.test('malformed and duplicate queries fail safely without allocation',()=>{
      const query=new URLSearchParams(params);query.append('adults','0');assert.equal(validateResultsSearch(query).state,'INITIAL');
      assert.equal(initialHomeSearch(new URLSearchParams('children=Infinity')).childrenAges.length,0);
      query.delete('adults');query.set('adults','2');query.set('people','3');assert.equal(validateResultsSearch(query).state,'INITIAL');
      assert.doesNotThrow(()=>validateResultsSearch(new URLSearchParams('%FF=%EF%BF%BD')));
    });
    await t.test('canonical identity ignores order aliases and unknown query fields',()=>{
      const query=new URLSearchParams('destinationCode=AYT&country=TR&departureDate=2035-10-05&people=2&debug=bad');
      assert.equal(providerQuery(query,true),key);
    });
    await t.test('rooms presentation is fixed with no misleading step buttons',()=>{
      const html=render(Guest,{form,onChange:()=>{},onClose:()=>{}});assert.match(html,/Сейчас доступен поиск одного номера/);assert.match(html,/Количество номеров">1/);assert.doesNotMatch(html,/число номеров/);
      assert.ok(buildHomeSearch({...form,rooms:2},[row]).errors.guests);
    });
    await t.test('loading renders existing skeleton and invalid URL renders form',()=>{
      const html=render(Results,{},'/results?'+params);assert.match(html,/data-search-state="LOADING"/);assert.match(html,/aria-label="Загрузка отелей"/);assert.equal((html.match(/class="result-skeleton"/g)||[]).length,3);
      const invalid=render(Results,{},'/results?'+params+'&rooms=2');assert.match(invalid,/data-search-state="INITIAL"/);assert.match(invalid,/<form/);assert.doesNotMatch(invalid,/class="result-skeleton"/);
    });
    await t.test('provider empty has change-search and no filter reset',()=>{
      const html=render(Notice,{state:'PROVIDER_EMPTY',params});assert.match(html,/По вашему запросу отели не найдены/);assert.match(html,/Изменить поиск/);assert.doesNotMatch(html,/Сбросить фильтры|role="alert"/);
      assert.equal(resultsState({valid:true,count:0,rawCount:0}),'PROVIDER_EMPTY');
    });
    await t.test('filter empty has distinct message and reset callback',()=>{
      let resets=0;const props={state:'FILTER_EMPTY',params,onReset:()=>resets++};
      assert.match(render(Notice,props),/По заданным фильтрам ничего не найдено/);
      Notice(props).props.children.find(node=>node?.type==='button').props.onClick();assert.equal(resets,1);
      assert.equal(resultsState({valid:true,count:0,rawCount:3}),'FILTER_EMPTY');
    });
    await t.test('error output is fixed and retry is explicit',()=>{
      let retries=0;const props={state:'ERROR',params,error:new Error('https://private.invalid/password SECRET'),onRetry:()=>retries++};
      const html=render(Notice,props);assert.ok(html.includes(searchFailureMessage));assert.doesNotMatch(html,/private|SECRET|password|Error:/);assert.equal(retries,0);
      Notice(props).props.children.find(node=>node?.type==='button').props.onClick();assert.equal(retries,1);assert.match(html,/Изменить поиск/);
    });
    await t.test('local name filter is trimmed and case insensitive',()=>{
      assert.deepEqual(filterOffers(original,new URLSearchParams('hotelName=  gRaNd  ')).map(x=>x.providerHotelId),['3424','3']);
      assert.deepEqual(filterOffers(original,new URLSearchParams('hotelName=   ')),original);
    });
    await t.test('name combines with candidate filters and explicit sort',()=>{
      assert.deepEqual(filterOffers(original,new URLSearchParams('hotelName=Grand&food=AI&maxPrice=1200&sort=priceDesc')).map(x=>x.providerHotelId),['3424']);
    });
    await t.test('name has labelled control, chip and clear',()=>{
      const query=changePresentationFilter(params,'hotelName','Grand');const html=render(Filters,{currency:'EUR',boards:[{code:'AI'}]},'/results?'+query);
      assert.match(html,/for="filter-hotelName"/);assert.match(html,/id="filter-hotelName"/);assert.match(html,/type="search"/);
      assert.equal(activeFilterChips(query,'EUR')[0].label,'Название: Grand');assert.equal(changePresentationFilter(query,'hotelName','').has('hotelName'),false);
    });
    await t.test('default preserves original order and reset restores it',()=>{
      const query=new URLSearchParams('hotelName=Grand&sort=priceDesc');assert.deepEqual(filterOffers(original,resetOfferFilters(query)),original);
      assert.deepEqual(filterOffers(original,new URLSearchParams('sort=default')),original);
    });
    await t.test('price ascending and descending use selected prices',()=>{
      assert.deepEqual(filterOffers(original,new URLSearchParams('sort=priceAsc')).map(x=>x.price),[700,1014.42,1400]);
      assert.deepEqual(filterOffers(original,new URLSearchParams('sort=priceDesc')).map(x=>x.price),[1400,1014.42,700]);
    });
    await t.test('filters and sorts never mutate original array or candidates',()=>{assert.equal(JSON.stringify(original),before);assert.notEqual(filterOffers(original,new URLSearchParams()),original);});
    await t.test('counts describe loaded subset without duplicate unfiltered count',()=>{
      const plain=render(Toolbar,{total:3,shown:3,activeCount:0,sort:'default',onSort:()=>{}});assert.match(plain,/Найдено 3 отеля/);assert.doesNotMatch(plain,/Показано/);assert.match(plain,/Среди загруженных результатов/);
      assert.match(render(Toolbar,{total:3,shown:1,activeCount:1,sort:'default',onSort:()=>{}}),/Показано 1 из 3 после фильтров/);
    });
    for(const [name,pattern] of [['TEST badge',/Hotelbeds TEST/],['room',/Side Sea View/],['board',/Всё включено/],['total currency',/1.014,42.*?€/],['per night',/144,92.*?\/ ночь/],['disabled booking',/disabled=""[^>]*>Бронирование недоступно/],['favorite semantics',/aria-pressed="true" aria-label="Удалить из избранного"/],['image and location',/Alanya, Турция/]])await t.test(`card ${name}`,()=>{assert.match(render(Card,{tour:original[0]}),pattern);});
    await t.test('formatter rejects invalid values and respects currency precision',()=>{
      for(const value of [null,undefined,NaN,Infinity,''])assert.equal(formatMoney(value,'EUR'),'Цена недоступна');
      assert.match(formatMoney(120,'USD'),/\$/);assert.doesNotMatch(formatMoney(120,'JPY'),/,00/);
    });
    await t.test('long name, image alt and semantic buttons',()=>{
      const html=render(Card,{tour:{...original[0],image:'/offline-hotel.jpg',name:'Long name '.repeat(100)}});assert.doesNotMatch(html,/undefined|NaN/);assert.match(html,/<h3>Long name/);assert.match(html,/alt="Long name/);assert.match(html,/type="button" class="details-btn"/);
    });
    await t.test('exact Grand Kaptan candidate reaches Details without fetch',async()=>{
      const offer=original[0],search=offerDetailsLink(offer).split('?')[1];assert.equal(selectedOfferSnapshot(offer,'hotelbeds','3424',search),offer);
      assert.equal(await loadDetailsOffer({selectedOffer:offer,provider:'hotelbeds',id:'3424',search}),offer);assert.equal(external,0);
      assert.equal(selectedOfferSnapshot(offer,'hotelbeds','3424',search+'&rooms=2'),null);
    });
    await t.test('Details Back retains query, name, filters and sort',()=>{
      const query=new URLSearchParams(params);query.set('hotelName','Grand');query.set('food','AI');query.set('sort','priceDesc');
      const origin=resultsOrigin({pathname:'/results',search:'?'+query,key:'results-entry'});assert.deepEqual(Object.fromEntries(new URLSearchParams(origin.search)),Object.fromEntries(query));assert.equal(detailsBackTarget(origin,2,''),-1);
    });
    await t.test('fresh cache retains same objects and deduplicates pending calls',async()=>{
      let calls=0;const result={data:original};const load=createResultsSearch(async()=>{calls++;return result;},()=>now);
      const a=load(key),b=load(key);assert.equal(a,b);assert.equal(await a,result);assert.equal(await load(key),result);assert.equal(calls,1);
    });
    await t.test('filter and sort edits reuse search identity with no additional request',async()=>{
      let calls=0;const load=createResultsSearch(async()=>{calls++;return {data:original};},()=>now);await load(key);
      for(const [field,value] of [['hotelName','Grand'],['hotelName','Grand K'],['sort','priceAsc'],['sort','priceDesc'],['food','AI']]){
        const query=changePresentationFilter(params,field,value);assert.equal(providerQuery(query,true),key);filterOffers((await load(providerQuery(query,true))).data,query);
      }
      assert.equal(calls,1);
    });
    await t.test('stale cache blocks automatic calls; explicit retry refreshes',async()=>{
      let clock=now,calls=0;const load=createResultsSearch(async()=>{calls++;return {data:original.map(o=>({...o,observedAt:new Date(clock).toISOString()}))};},()=>clock);
      await load(key);clock+=900000;await assert.rejects(load(key),{code:'RESULTS_STALE'});assert.equal(calls,1);
      await load(key,{retry:true});assert.equal(calls,2);assert.match(render(Notice,{state:'ERROR',stale:true,params}),/Обновить результаты/);
    });
    await t.test('freshness uses earliest candidate; unknown/future timestamps fail closed',()=>{
      assert.equal(resultsFreshUntil({data:[{...original[0],candidateOffers:[{observedAt:new Date(now-1000).toISOString()}]}]},now),now+899000);
      assert.equal(offerFreshUntil({observedAt:'invalid'},now),0);assert.equal(offerFreshUntil({observedAt:new Date(now+1).toISOString()},now),0);
    });
    await t.test('manual new search bypasses old cache for same identity',async()=>{
      let calls=0;const load=createResultsSearch(async()=>({data:[{...original[0],price:++calls}]}),()=>now);
      const first=await load(key);load.begin(key);const next=await load(key);assert.equal(calls,2);assert.notEqual(first,next);assert.equal(first.data[0].price,1);
    });
    await t.test('different search identity never returns another result set',async()=>{
      let calls=0;const load=createResultsSearch(async()=>({data:[{...original[0],price:++calls}]}),()=>now);await load(key);
      const query=new URLSearchParams(params);query.set('nights','3');assert.equal((await load(providerQuery(query,true))).data[0].price,2);
    });
    await t.test('failed request waits for explicit retry and exposes no raw UI text',async()=>{
      let calls=0;const load=createResultsSearch(async()=>{calls++;throw Error('PRIVATE');},()=>now);
      await assert.rejects(load(key));await assert.rejects(load(key),{code:'RESULTS_STALE'});assert.equal(calls,1);
      await assert.rejects(load(key,{retry:true}));assert.equal(calls,2);assert.doesNotMatch(render(Notice,{state:'ERROR',params}),/PRIVATE/);
    });
    await t.test('empty result is not reused as evidence of a fresh offer',async()=>{
      let calls=0;const load=createResultsSearch(async()=>{calls++;return {data:[]};},()=>now);assert.deepEqual((await load(key)).data,[]);await assert.rejects(load(key),{code:'RESULTS_STALE'});assert.equal(calls,1);
    });
    await t.test('responsive CSS parses and contains bounds for 320/390/768/1440',async()=>{
      const css=await source('styles/Results.css'),card=await source('components/TourCard.css'),home=await source('components/HomeSearch.css');
      for(const width of [320,390,768,1440]){
        for(const value of [css,card,home])assert.doesNotThrow(()=>postcss.parse(value));
        assert.ok(width<=800?css.includes('max-width: 800px'):css.includes('min-width:801px'));
      }
      assert.match(css,/:focus-visible/);assert.match(css,/max-width:100%/);assert.match(card,/overflow-wrap:anywhere/);assert.match(home,/grid-template-columns:1fr/);
    });
    await t.test('effect depends on search identity only, no persistent cache or automatic retry',async()=>{
      const page=await source('pages/Results.jsx'),cache=await source('services/resultsSearch.js');
      assert.match(page,/\[requestQuery,valid\]/);assert.match(page,/if \(!valid\)/);assert.match(page,/onRetry=\{\(\)=>loadTours\(true\)\}/);assert.doesNotMatch(page,/err\.message|console\.error/);
      assert.doesNotMatch(cache,/localStorage|sessionStorage|setInterval|60000/);assert.match(await source('components/HomeSearch.jsx'),/beginResultsSearch\(result.url\)/);
      assert.equal(external,0);
    });
  } finally {await server.close();}
});
