import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
createRequire(import.meta.url)('../../backend/tests/offlineNetwork.cjs');

test('rendered query nights and TEST/non-Hotelbeds card actions', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false, server: { middlewareMode: true, hmr: false },
    plugins: [{name:'offline-favorites', enforce:'pre', load(id) {
      if (id.replaceAll('\\', '/').endsWith('/context/FavoritesContext.jsx')) return 'export function useFavorites(){return {isFavorite:()=>false,toggleFavorite:async()=>{}}}';
    }}],
    esbuild: { jsx: 'automatic' },
  });
  try {
    const {default: Filters} = await server.ssrLoadModule('/src/components/ResultsFilters.jsx');
    const {default: Card} = await server.ssrLoadModule('/src/components/TourCard.jsx');
    const {default: Options} = await server.ssrLoadModule('/src/components/DestinationOptions.jsx');
    const {searchQuery,catalogEmptyMessage,noRatesMessage} = await server.ssrLoadModule('/src/utils/catalogUx.js');
    const options=renderToStaticMarkup(React.createElement('select',{},React.createElement(Options,{country:'TH',destinations:[{countryCode:'TH',code:'HKT',hotelCount:0},{countryCode:'TH',code:'READY',name:'Offline ready',hotelCount:1},{countryCode:'PT',code:'CEN',hotelCount:10}]})));
    assert.match(options,/<option value="HKT" disabled=""/);assert.match(options,/<option value="READY">/);assert.equal(options.includes('CEN'),false);
    for (const nights of ['1','3','7','3','1']) {
      const query=new URLSearchParams(`provider=hotelbeds&countryCode=PT&destinationCode=CEN&checkIn=2030-04-01&checkOut=2030-04-08&nights=${nights}&adults=2&children=1&childrenAges=8&rooms=1`);
      const restored=searchQuery(query);assert.equal(restored.country,'PT');assert.equal(restored.destinationCode,'CEN');assert.equal(restored.checkOut,'2030-04-08');assert.equal(restored.nights,nights);assert.equal(restored.adults,'2');assert.equal(restored.children,'1');assert.equal(restored.childrenAges,'8');assert.equal(restored.rooms,'1');
    }
    assert.equal(catalogEmptyMessage,'Каталог направления пока не загружен');assert.equal(noRatesMessage,'На выбранные даты доступных тарифов не найдено');
    const {default: HotelImage} = await server.ssrLoadModule('/src/components/HotelImage.jsx');
    const {destinationTitle} = await server.ssrLoadModule('/src/utils/destinationTitle.js');
    const destinationQuery = new URLSearchParams('destinationCode=CEN&country=PT&provider=hotelbeds');
    assert.equal(destinationTitle(destinationQuery,[{code:'CEN',name:'Centre Portugal',countryCode:'PT'}]),'Отели: Centre Portugal');
    assert.equal(destinationTitle(destinationQuery,[]),'Отели выбранного направления');
    assert.equal(destinationTitle(new URLSearchParams('stagingTestHotel=3424')),'Найденные предложения');
    const placeholder=renderToStaticMarkup(React.createElement(HotelImage,{src:null,alt:'Offline hotel'}));
    assert.ok(placeholder.includes('Фото недоступно'));assert.equal(placeholder.includes('<img'),false);
    const render = (component, query) => renderToStaticMarkup(React.createElement(MemoryRouter, {initialEntries:[`/results?nights=${query}`]}, component));
    // Fresh/direct/refresh and history target URLs render the exact selected option.
    for (const nights of ['1','3','7','3','1']) {
      const html = render(React.createElement(Filters), nights);
      const select = html.match(/<select[^>]*name="nights"[^>]*>(.*?)<\/select>/s)[1];
      assert.match(select, new RegExp(`<option value="${nights}" selected=""`));
    }
    const testOffer = {provider:'hotelbeds',priceEnvironment:'test',stagingTestAllowed:true,bookingDisabled:true,rateType:'BOOKABLE',price:119.57,currency:'EUR',name:'Offline hotel',observedAt:new Date().toISOString()};
    const html = render(React.createElement(Card,{tour:testOffer}), '1');
    assert.ok(html.includes('Фото недоступно'));assert.equal(html.includes('unsplash'),false);
    assert.match(html, /disabled=""[^>]*>Бронирование недоступно<\/button>/);
    assert.match(html, /<button(?:(?!disabled).)*>Подробнее<\/button>/);
    assert.ok(html.includes('Тариф Hotelbeds: BOOKABLE'));
    assert.ok(html.includes('Тестовый режим — бронирование отключено'));
    const ordinary = render(React.createElement(Card,{tour:{...testOffer,provider:'mock'}}),'3');
    assert.match(ordinary, /<button(?:(?!disabled).)*>Выбрать →<\/button>/);
    assert.equal(ordinary.includes('Бронирование недоступно'),false);
  } finally { await server.close(); }
});

test('3Q Results presentation, instant controls and mobile accessibility', async t => {
  let network=0;
  t.mock.method(globalThis,'fetch',async()=>{network++;throw Error('Unexpected network');});
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,
    server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'},plugins:[{name:'offline-favorites',enforce:'pre',load(id){
      if(id.replaceAll('\\','/').endsWith('/context/FavoritesContext.jsx'))return 'export function useFavorites(){return {isFavorite:()=>false,toggleFavorite:async()=>{}}}';
    }}]});
  const render=(component,params='')=>renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[`/results?${params}`]},component));
  const base=new URLSearchParams('provider=hotelbeds&countryCode=PT&destinationCode=CEN&checkIn=2030-04-01&checkOut=2030-04-08&nights=7&adults=2&children=1&childrenAges=0&rooms=1');
  try {
    const {default:Header}=await server.ssrLoadModule('/src/components/ResultsHeader.jsx');
    const {default:Toolbar}=await server.ssrLoadModule('/src/components/ResultsToolbar.jsx');
    const {default:Chips}=await server.ssrLoadModule('/src/components/ResultsFilterChips.jsx');
    const {default:Panel}=await server.ssrLoadModule('/src/components/ResultsFilterPanel.jsx');
    const {default:Filters}=await server.ssrLoadModule('/src/components/ResultsFilters.jsx');
    const {default:Card}=await server.ssrLoadModule('/src/components/TourCard.jsx');
    const presentation=await server.ssrLoadModule('/src/utils/resultsPresentation.js');
    const {initialHomeSearch}=await server.ssrLoadModule('/src/utils/homeSearch.js');
    const {providerQuery,resetOfferFilters}=await server.ssrLoadModule('/src/utils/localOfferFilters.js');
    await t.test('human header, stay summary and edit link restore original search only',()=>{
      const html=render(React.createElement(Header,{params:base,destinations:[{countryCode:'PT',code:'CEN',name:'Centre Portugal'}]}));
      assert.match(html,/<h1>Отели: Centre Portugal<\/h1>/);assert.match(html,/1 апреля/);assert.match(html,/7 ночей/);assert.match(html,/2 взрослых · 1 ребёнок/);
      assert.match(html,/Изменить поиск/);assert.match(html,/перелёт не включён/);assert.doesNotMatch(html,/SPRINT|PRODUCT EXPERIENCE/);
      const edited=new URLSearchParams(base);edited.set('food','AI');edited.set('rateKey','not-for-url');
      const restored=new URLSearchParams(presentation.editSearchLink(edited).split('?')[1]);
      for(const [key,value] of base)assert.equal(restored.get(key),value);
      assert.equal(restored.has('food'),false);assert.equal(restored.has('rateKey'),false);
      const form=initialHomeSearch(restored);assert.equal(form.checkIn,'2030-04-01');assert.deepEqual(form.childrenAges,['0']);
      const diagnostic=render(React.createElement(Header,{params:new URLSearchParams('stagingTestHotel=3424'),destinations:[]}));
      assert.match(diagnostic,/<h1>Найденные отели<\/h1>/);assert.doesNotMatch(diagnostic.replace(/<[^>]+>/g,''),/3424|предложения/);
    });
    await t.test('hotel counts distinguish original total and filtered visible rows',()=>{
      for(const [count,label] of [[0,'0 отелей'],[1,'1 отель'],[2,'2 отеля'],[11,'11 отелей'],[21,'21 отель']])assert.equal(presentation.hotelCount(count),label);
      const html=render(React.createElement(Toolbar,{total:3,shown:1,activeCount:2,sort:'priceAsc',local:true,open:false,onSort:()=>{}}));
      assert.match(html,/Найдено 3 отеля/);assert.match(html,/Показано 1 из 3/);assert.match(html,/Фильтры \(2\)/);assert.match(html,/aria-expanded="false"/);assert.doesNotMatch(html,/предложений/);
    });
    await t.test('instant filters and removable chips preserve provider request identity',()=>{
      let query=new URLSearchParams(base);const key=providerQuery(query,true);
      for(const [field,value] of [['food','AI'],['roomType','Superior'],['maxPrice','150'],['stars','4'],['rating','4'],['beachLine','1'],['beachType','sand'],['sort','priceDesc']]){
        query=presentation.changePresentationFilter(query,field,value);assert.equal(providerQuery(query,true),key);
      }
      const items=presentation.activeFilterChips(query,'EUR');assert.equal(items.length,7);
      const html=render(React.createElement(Chips,{items}));assert.match(html,/Убрать фильтр:/);assert.match(html,/до 150 EUR/);
      for(const {key:field} of items){query=presentation.changePresentationFilter(query,field,'');assert.equal(providerQuery(query,true),key);}
      assert.equal(presentation.activeFilterChips(query,'EUR').length,0);assert.equal(providerQuery(resetOfferFilters(query),true),key);
      const controls=render(React.createElement(Filters,{instant:true,currency:'EUR',boards:[{code:'AI'}]}),'food=AI&roomType=Superior');
      assert.match(controls,/<option value="AI" selected=""/);assert.match(controls,/value="Superior"/);assert.match(controls,/Цена за весь период/);assert.doesNotMatch(controls,/Применить|name="nights"/);
      for(const name of ['maxPrice','stars','food','roomType','rating','beachLine'])assert.match(controls,new RegExp(`for="filter-${name}"`));
    });
    await t.test('TOTAL leads, Details is primary, TEST booking disabled and debug collapsed',()=>{
      const html=render(React.createElement(Card,{tour:{provider:'hotelbeds',providerHotelId:'101',name:'Offline hotel',priceEnvironment:'test',stagingTestAllowed:true,bookingDisabled:true,rateType:'BOOKABLE',price:700,currency:'EUR',nights:7,adults:2,boardCode:'AI',roomName:'Superior',observedAt:new Date().toISOString()}}));
      assert.match(html,/<div class="stay-price"><strong>700,00/);assert.match(html,/100,00.*?\/ ночь/);assert.match(html,/за 7 ночей · за всех гостей/);
      assert.match(html,/<button type="button" class="details-btn">Подробнее<\/button>/);assert.match(html,/disabled=""[^>]*>Бронирование недоступно/);
      assert.match(html,/<details class="tour-card-technical"><summary>Техническая информация/);
      const visible=html.replace(/<details.*?<\/details>/gs,'');assert.doesNotMatch(visible,/BOOKABLE|Источник цены|Наблюдение/);
    });
    await t.test('mobile dialog closes by Escape and traps keyboard focus at both ends',()=>{
      let closed=0,prevented=0,focused='';
      const props={open:true,onClose:()=>closed++,shown:3,panelRef:{current:null}};
      const html=render(React.createElement(Panel,props));assert.match(html,/role="dialog" aria-modal="true"/);assert.match(html,/Показать 3 отеля/);
      const dialog=Panel(props).props.children[1];
      dialog.props.onKeyDown({key:'Escape',preventDefault:()=>prevented++});assert.equal(closed,1);
      const first={getClientRects:()=>[{}],focus:()=>focused='first'},last={getClientRects:()=>[{}],focus:()=>focused='last'};
      const event={key:'Tab',currentTarget:{querySelectorAll:()=>[first,last]},preventDefault:()=>prevented++};
      dialog.props.onKeyDown({...event,target:last,shiftKey:false});assert.equal(focused,'first');
      dialog.props.onKeyDown({...event,target:first,shiftKey:true});assert.equal(focused,'last');assert.equal(prevented,3);
      const closedHtml=render(React.createElement(Panel,{...props,open:false}));assert.doesNotMatch(closedHtml,/role="dialog"/);
    });
    await t.test('responsive and error-state wiring retains offline boundaries',async()=>{
      const source=await readFile(new URL('../src/pages/Results.jsx',import.meta.url),'utf8');
      for(const marker of ['TEST_CATALOG_EMPTY','searchFailureMessage','ResultsNotice','FILTER_EMPTY','PROVIDER_EMPTY'])assert.ok(source.includes(marker));
      assert.match(source,/\[requestQuery,valid\]/);assert.doesNotMatch(source,/setError\(err\.message|console\.error/);assert.match(source,/onRetry=\{\(\)=>loadTours\(true\)\}/);assert.match(source,/\[destinationCode,diagnostic\]/);assert.match(source,/document.body.style.overflow='hidden'/);assert.match(source,/filterTrigger.current\?\.focus\(\)/);
      const css=await readFile(new URL('../src/styles/Results.css',import.meta.url),'utf8');
      assert.match(css,/visibility:hidden; overflow:hidden/);assert.match(css,/:focus-visible/);assert.match(css,/max-width:100%/);
      const cards=await readFile(new URL('../src/components/TourCard.css',import.meta.url),'utf8');
      assert.match(cards,/@media\(max-width:800px\)\s*\{\s*\.results-page \.tour-card \{ grid-template-columns:1fr/);assert.match(cards,/overflow-wrap:anywhere/);
    });
    assert.equal(network,0);
  } finally {await server.close();}
});
