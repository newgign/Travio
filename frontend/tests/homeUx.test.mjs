import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
createRequire(import.meta.url)('../../backend/tests/offlineNetwork.cjs');

test('3P Home offline UX, URL contract and responsive semantics',async t=>{
  let unexpectedNetwork=0;
  t.mock.method(globalThis,'fetch',async()=>{unexpectedNetwork++;throw Error('Network forbidden');});
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},define:{'import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED':'"true"'},esbuild:{jsx:'automatic'}});
  const rows=[{countryCode:'TR',code:'AYT',hotelCount:2},{countryCode:'AE',code:'DXB',hotelCount:2},{countryCode:'EG',code:'SSH',hotelCount:2},{countryCode:'TH',code:'HKT',hotelCount:2},{countryCode:'PT',code:'CEN',hotelCount:2}];
  const render=(Component,props={},url='/')=>renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[url]},React.createElement(Component,props)));
  try {
    const {default:Hero}=await server.ssrLoadModule('/src/components/HeroBanner.jsx');
    const {default:Search}=await server.ssrLoadModule('/src/components/HomeSearch.jsx');
    const {default:Guest}=await server.ssrLoadModule('/src/components/GuestPanel.jsx');
    const {default:Popular}=await server.ssrLoadModule('/src/components/PopularDestinations.jsx');
    const {default:Hot}=await server.ssrLoadModule('/src/components/HotToursSection.jsx');
    const {default:Advantages}=await server.ssrLoadModule('/src/components/Advantages.jsx');
    const {default:Faq}=await server.ssrLoadModule('/src/components/FaqSection.jsx');
    const {default:Footer}=await server.ssrLoadModule('/src/components/Footer.jsx');
    const {buildHomeSearch,initialHomeSearch,changeGuestCount,destinationKey}=await server.ssrLoadModule('/src/utils/homeSearch.js');
    const form={...initialHomeSearch(new URLSearchParams()),destination:destinationKey(rows[0]),checkIn:'2030-04-01'};
    const now=new Date('2029-01-01');
    await t.test('hero has five primary controls, nights and no checkout/board/stars/children field',()=>{
      const html=render(Hero,{destinations:rows,catalogState:'ready'});
      assert.match(html,/Найдите отель для следующего путешествия/);assert.match(html,/Сравнивайте доступные варианты, питание и цены в одном месте/);
      for(const field of ['destination','checkIn','nights','guests'])assert.match(html,new RegExp(`name="${field}"`));
      for(const field of ['children','food','stars','checkOut'])assert.equal(html.includes(`name="${field}"`),false);
      assert.match(html,/type="submit"[^>]*>Найти отели/);assert.match(html,/14 ночей/);assert.equal(html.includes('21 ночь'),false);
      for(const id of ['home-destination','home-checkIn','home-nights','home-guests'])assert.ok(html.includes(`for="${id}"`) && html.includes(`id="${id}"`));
      assert.match(html,/aria-expanded="false"/);assert.match(html,/реальное бронирование и оплата отключены/);
      assert.equal(html.includes('3424'),false);assert.equal(html.includes('provider=hotelbeds'),false);
    });
    await t.test('catalog loading uses only local API; codes survive edits and Results navigation',async()=>{
      const {loadHomeCatalog}=await server.ssrLoadModule('/src/services/homeCatalog.js');
      const calls=[];const result=await loadHomeCatalog(undefined,async(url)=>{calls.push(url);return {ok:true,json:async()=>({destinations:rows})};});
      assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/catalog/test-options'));
      let changed={...form};
      for(const row of result){
        changed={...changed,destination:destinationKey(row),nights:'14'};
        changed=changeGuestCount(changed,'adults',1);
        const built=buildHomeSearch(changed,result,false,now);const params=new URLSearchParams(built.url.split('?')[1]);
        assert.equal(params.get('countryCode'),row.countryCode);assert.equal(params.get('destinationCode'),row.code);
        assert.equal(params.get('nights'),'14');assert.equal(params.get('checkIn'),'2030-04-01');assert.equal(params.get('rooms'),'1');
        const validate=createRequire(import.meta.url)('../../backend/services/stagingTestSearch.js');
        const validated=validate({...Object.fromEntries(params),stagingTestHotel:'3424'},{stagingTestAllowed:true,environment:'test'},now.getTime());
        assert.equal(validated.checkOut,'2030-04-15');assert.equal(validated.nights,14);
        assert.equal(params.has('checkOut'),false);assert.equal(params.has('offerToken'),false);
        assert.equal(initialHomeSearch(params).destination,changed.destination);
      }
      assert.equal(calls.length,1);assert.equal(unexpectedNetwork,0);
      assert.ok(buildHomeSearch(form,[],false,now).errors.destination);
      assert.ok(buildHomeSearch(form,[{...rows[0],hotelCount:0}],false,now).errors.destination);
    });
    await t.test('guests enforce bounds and require ages, including age zero; no accidental submit',()=>{
      let current={...form};
      for(let i=0;i<10;i++)current=changeGuestCount(current,'adults',1);
      assert.equal(current.adults,6);
      for(let i=0;i<10;i++)current=changeGuestCount(current,'adults',-1);
      assert.equal(current.adults,1);
      for(let i=0;i<10;i++)current=changeGuestCount(current,'children',1);
      assert.equal(current.children,3);assert.ok(buildHomeSearch(current,rows,false,now).errors.guests);
      current={...current,childrenAges:['0','6','17']};
      assert.equal(new URLSearchParams(buildHomeSearch(current,rows,false,now).url.split('?')[1]).get('childrenAges'),'0,6,17');
      const html=render(Guest,{form:current,onChange:()=>{},onClose:()=>{}});
      assert.equal((html.match(/Возраст ребёнка/g)||[]).length,3);
      assert.equal((html.match(/<button/g)||[]).length,(html.match(/type="button"/g)||[]).length);
      assert.match(html,/aria-label="Увеличить число детей" disabled=""/);
      // Invoke the real panel event callback, without a browser/test-renderer dependency.
      const nodes=[];const visit=node=>{if(Array.isArray(node))node.forEach(visit);else if(node?.props){nodes.push(node);visit(node.props.children);}};
      visit(Guest({form:current,onChange:value=>{current=value;},onClose:()=>{}}));
      nodes.find(node=>node.props['aria-label']==='Уменьшить число детей').props.onClick();
      assert.equal(current.children,2);assert.deepEqual(current.childrenAges,['0','6']);
      for(const bad of [{adults:0},{adults:7},{children:4},{children:1,childrenAges:['18']},{children:1,childrenAges:['']},{children:1,childrenAges:['bad']}])assert.ok(buildHomeSearch({...form,...bad},rows,false,now).errors.guests);
    });
    await t.test('dates/nights validation and explicit diagnostic URL preserve contract',()=>{
      for(const checkIn of ['','invalid','2028-01-01','2030-02-30','2029-01-01'])assert.ok(buildHomeSearch({...form,checkIn},rows,false,now).errors.checkIn);
      for(const nights of [0,15,21,1.5])assert.ok(buildHomeSearch({...form,nights},rows,false,now).errors.nights);
      for(const nights of [1,2,7,14])assert.ok(buildHomeSearch({...form,nights},rows,false,now).url);
      const url=buildHomeSearch(form,[],true,now).url;assert.match(url,/stagingTestHotel=3424/);assert.equal(url.includes('destinationCode'),false);
      const html=render(Search,{destinations:rows,catalogState:'ready'},'/?stagingTestHotel=3424');assert.match(html,/TEST \/ diagnostic/);
      for(const nights of [1,7,3,1])assert.match(render(Search,{destinations:rows,catalogState:'ready'},`/?nights=${nights}`),new RegExp(`value="${nights}" selected=""`));
    });
    await t.test('catalog cards only, balanced five-card hook, local fallback and skeleton',()=>{
      const html=render(Popular,{destinations:rows,catalogState:'ready'});
      assert.equal((html.match(/class="destination-card"/g)||[]).length,5);assert.match(html,/class="destination-grid"/);
      assert.match(html,/countryCode=PT&amp;destinationCode=CEN/);assert.match(html,/Направление путешествия/);
      assert.equal(html.includes('https://'),false);assert.equal(html.includes('HRG'),false);assert.equal(html.includes('AUH'),false);
      const empty=render(Popular,{destinations:[],catalogState:'ready'});assert.equal(empty.includes('<a '),false);
      const unavailable=render(Popular,{destinations:[{...rows[0],hotelCount:0}],catalogState:'ready'});assert.equal(unavailable.includes('<a '),false);
      const loading=render(Popular);assert.equal((loading.match(/destination-skeleton/g)||[]).length,5);assert.match(loading,/role="status"/);
    });
    await t.test('empty/unconfirmed Hot Deals hidden; real evidence fixture renders',()=>{
      assert.equal(render(Hot),'');assert.equal(render(Hot,{tours:[{provider:'hotelbeds',priceEnvironment:'test',price:100}]}),'');
      const html=render(Hot,{tours:[{offerId:'fixture',provider:'hotelbeds',providerHotelId:'1',name:'Confirmed fixture',priceEnvironment:'live',price:100,currency:'EUR',discountEvidence:{source:'price_history',originalPrice:120,observedAt:'2030-01-01'}}]});
      assert.match(html,/Горящие предложения/);assert.match(html,/Confirmed fixture/);
    });
    await t.test('four benefits, honest accessible FAQ and existing footer destinations',()=>{
      const benefits=render(Advantages);assert.equal((benefits.match(/class="adv-card"/g)||[]).length,4);assert.equal((benefits.match(/<svg/g)||[]).length,4);
      for(const title of ['Удобный поиск','Понятные цены','Гибкие фильтры','Все детали в одном месте'])assert.ok(benefits.includes(title));
      const faq=render(Faq);assert.equal((faq.match(/aria-expanded="false"/g)||[]).length,4);assert.equal((faq.match(/hidden=""/g)||[]).length,4);
      assert.match(faq,/Как работает поиск/);assert.match(faq,/Что означает тестовая цена/);assert.match(faq,/Реальное бронирование и оплата сейчас отключены/);
      assert.equal(faq.includes('Как забронировать тур'),false);
      const footer=render(Footer);for(const path of ['/','/results','/favorites','/my-bookings','/#faq','/help/booking','/help/cancellation','/help/privacy'])assert.ok(footer.includes(`href="${path}"`));
    });
    await t.test('3P.1 background clips independently; dropdown bounds fit below/above viewport',async()=>{
      const html=render(Hero,{destinations:rows,catalogState:'ready'});
      assert.match(html,/class="hero hero-unclipped"/);assert.match(html,/class="hero-visual"[^>]*aria-hidden="true"/);assert.match(html,/class="hero-overlay hero-interactive"/);
      const css=await readFile(new URL('../src/styles/HeroBanner.css',import.meta.url),'utf8');
      assert.match(css,/\.app \.hero\.hero-unclipped\s*\{[^}]*overflow:visible;[^}]*z-index:2/);
      assert.match(css,/\.hero-visual\s*\{[^}]*border-radius:inherit;[^}]*overflow:hidden/);
      assert.match(css,/\.hero-overlay\.hero-interactive\s*\{[^}]*overflow:visible/);
      const panelCss=await readFile(new URL('../src/components/HomeSearch.css',import.meta.url),'utf8');
      assert.match(panelCss,/\.home-guest-floating\s*\{[^}]*overflow-y:auto/);
      assert.match(panelCss,/@media\(max-width:600px\)\s*\{ \.home-guest-floating \{ max-height:none; overflow:visible/);
      const {guestPanelLayout}=await server.ssrLoadModule('/src/utils/guestPanelLayout.js');
      const parent={top:350,bottom:430};
      const below=guestPanelLayout({top:378,bottom:430},parent,900);
      assert.equal(below.top,'88px');assert.equal(below.bottom,'auto');assert.equal(below.maxHeight,'454px');
      const above=guestPanelLayout({top:650,bottom:702},{top:622,bottom:702},760);
      assert.equal(above.top,'auto');assert.equal(above.bottom,'60px');assert.equal(above.maxHeight,'634px');
      for(const viewport of [320,600,900])for(const anchorTop of [10,100,280]){
        const parent={top:anchorTop-28,bottom:anchorTop+52};
        const result=guestPanelLayout({top:anchorTop,bottom:anchorTop+52},parent,viewport);
        const maxHeight=parseFloat(result.maxHeight);
        const top=result.top==='auto'?parent.bottom-parseFloat(result.bottom)-maxHeight:parent.top+parseFloat(result.top);
        assert.ok(top>=8);assert.ok(top+maxHeight<=viewport-8);
      }
      const guests=render(Guest,{form:{...form,children:3,childrenAges:['0','6','17']},onChange:()=>{},onClose:()=>{}});
      assert.match(guests,/home-guest-floating/);assert.match(guests,/>Готово<\/button>/);
    });
    await t.test('desktop/tablet/mobile CSS contracts and no provider entrypoints in Home',async()=>{
      const css=await readFile(new URL('../src/components/HomeSearch.css',import.meta.url),'utf8');
      assert.match(css,/grid-template-columns:minmax\(190px/);assert.match(css,/@media\(max-width:1100px\)/);assert.match(css,/repeat\(2,minmax\(0,1fr\)\)/);assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/grid-template-columns:1fr/);assert.match(css,/position:static/);assert.match(css,/:focus-visible/);
      const grid=await readFile(new URL('../src/styles/HomeCollections.css',import.meta.url),'utf8');assert.match(grid,/justify-content:center/);assert.match(grid,/aspect-ratio:3\/4/);
      for(const path of ['components/HomeSearch.jsx','components/GuestPanel.jsx','pages/Home.jsx','services/homeCatalog.js']) {
        const source=await readFile(new URL(`../src/${path}`,import.meta.url),'utf8');
        assert.doesNotMatch(source,/checkRates|\.availability\(|contentHotels|\/search\?|\/status/);
      }
      assert.equal(unexpectedNetwork,0);
    });
  } finally {await server.close();}
});
