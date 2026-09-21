import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route, matchRoutes } from 'react-router-dom';
import postcss from 'postcss';
const require = createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');
const source = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');
const zero = () => ({ Availability:0, Content:0, Status:0, CheckRate:0, Booking:0, Cancellation:0 });

test('3X release integration: real helpers/services and SSR, no browser acceptance claim', async t => {
  Object.assign(process.env, {
    ACTIVE_PROVIDER:'hotelbeds', HOTELBEDS_ENV:'test', HOTELBEDS_ENABLED:'true', HOTELBEDS_STAGING_TEST_ENABLED:'true',
    HOTELBEDS_READ_ONLY:'true', HOTELBEDS_BOOKING_ENABLED:'false', HOTELBEDS_LIVE_BOOKING_ENABLED:'false',
    PRODUCTION_SALES_ENABLED:'false', REAL_CHARGES_ENABLED:'false', REAL_REFUNDS_ENABLED:'false',
    PAYMENTS_MODE:'disabled', PAYMENTS_PROVIDER:'none', HOT_DEALS_MONITOR_ENABLED:'false', HOTELBEDS_CONTENT_SYNC_ENABLED:'false',
    HOTELBEDS_BASE_URL:'https://api.test.hotelbeds.com', HOTELBEDS_CONTENT_BASE_URL:'https://api.test.hotelbeds.com',
    HOTELBEDS_BOOKING_BASE_URL:'https://api-mtls.test.hotelbeds.com',
  });
  process.env.OFFER_TOKEN_SECRET = require('crypto').randomBytes(32).toString('hex');
  const counters = zero();
  let http = 0, payment = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    http++; if (/payment|stripe|refund|charge/i.test(String(url))) payment++;
    throw Error('Unexpected HTTP; own APIs use injected offline fixtures');
  });
  const client = require('../../backend/integrations/hotelbeds/client');
  for (const [key, methods] of Object.entries({ Availability:['availability'], Content:['contentHotels','contentHotelDetails','contentDestinations','contentCountries'], Status:['status','getBooking','listBookings'], CheckRate:['checkRates'], Booking:['createBooking'], Cancellation:['cancelBooking'] })) {
    for (const method of methods) t.mock.method(client, method, async () => { counters[key]++; throw Error('Forbidden provider call'); });
  }
  const server = await createServer({
    root:fileURLToPath(new URL('..', import.meta.url)), configFile:false, server:{middlewareMode:true,hmr:false}, esbuild:{jsx:'automatic'},
    define:{'import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED':'"true"'},
    plugins:[{name:'3x-own-account-state',enforce:'pre',load(id) {
      const path=id.replaceAll('\\','/');
      if(path.endsWith('/hooks/useSession.js')) return 'export default function useSession(){return {token:"fixture",user:{id:7,full_name:"Администратор",role:"admin"}}}';
      if(path.endsWith('/context/FavoritesContext.jsx')) return 'export function useFavorites(){return {favorites:[],favoritesStatus:"ready",favoritesKnown:true,pendingFavorites:[],isFavorite:()=>false,toggleFavorite:async()=>{},loadFavorites:async()=>{},removeFavorite:async()=>{}}}';
    }}],
  });
  const render = (View, props={}, entry='/') => renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[entry]},React.createElement(View,props)));
  const load = path => server.ssrLoadModule('/src/' + path);
  const cache = require('../../backend/services/memoryCache'); cache.clear();
  try {
    const {default:Shell}=await load('components/ConsumerShell.jsx');
    const {default:Boundary}=await load('components/ConsumerErrorBoundary.jsx');
    const {consumerTitle}=await load('utils/consumerTitle.js');
    const {HelpView}=await load('pages/Help.jsx');
    const {ContactsView}=await load('pages/Contacts.jsx');
    const {NotFoundView}=await load('pages/NotFound.jsx');
    const {default:Footer}=await load('components/Footer.jsx');
    const {default:Navbar}=await load('components/Navbar.jsx');
    const {FavoritesView}=await load('pages/Favorites.jsx');
    const {MyBookingsView}=await load('pages/MyBookings.jsx');
    const {ProfileView}=await load('pages/Profile.jsx');
    const {AuthView}=await load('components/AuthPage.jsx');
    const {createProfileStore}=await load('services/profileStore.js');
    const {helpArticles}=await load('content/helpContent.js');
    const {default:Details}=await load('pages/TourDetails.jsx');
    const {default:Gallery}=await load('components/DetailsGallery.jsx');
    const {default:Card}=await load('components/TourCard.jsx');
    const {default:Header}=await load('components/ResultsHeader.jsx');
    const {loadDetailsOffer}=await load('services/detailsOffer.js');
    const {selectedOfferSnapshot}=await load('utils/selectedOfferSnapshot.js');
    const {offerDetailsLink}=await load('utils/hotTours.js');
    const {toggleDetailsFavorite}=await load('utils/detailsFavorite.js');
    const presentation=await load('utils/detailsPresentation.js');
    const local=await load('utils/localOfferFilters.js');
    const home=await load('utils/homeSearch.js');
    const app=await source('App.jsx');
    const routes=[...app.matchAll(/path="([^"]+)"/g)].map(m=>({path:m[1]}));
    const paths=['/','/results','/tour/hotelbeds/101','/favorites','/my-bookings','/profile','/login','/register','/help',...Object.keys(helpArticles).map(x=>'/help/'+x),'/contacts'];
    const profile=createProfileStore({token:'fixture',readToken:()=> 'fixture',publish:()=>{},api:{getProfile:async()=>({id:7,full_name:'Администратор',email:'long'.repeat(30)+'@example.test',role:'admin'})}});
    await profile.load();
    const navMarkup=()=>render(Navbar)+render(Footer)+render(HelpView)+Object.keys(helpArticles).map(topic=>render(HelpView,{topic})).join('')+render(ContactsView)+render(NotFoundView)+render(ProfileView,{state:profile.getSnapshot(),actions:profile});

    await t.test('A/B/I/J pure route/navigation fixture: all six provider counters zero',()=>{
      for(const path of paths) {
        assert.notEqual(matchRoutes(routes,path)[0].route.path,'*',path);
        assert.match(render(Shell,{},path),/consumer-shell/);
      }
      for(const path of ['/unknown/path','/tour/a/b/c','/admin/missing'])assert.equal(matchRoutes(routes,path)[0].route.path,'*');
      assert.match(app,/path="\*" element=\{<NotFound/);
      assert.match(render(NotFoundView),/Страница не найдена/);
      for(const [,href] of navMarkup().matchAll(/href="([^"]+)"/g)) {
        if(/^(tel:|mailto:)/.test(href))continue;
        const path=href.split(/[?#]/)[0] || '/';
        assert.notEqual(matchRoutes(routes,path)[0].route.path,'*',href);
        if(path.startsWith('/help/'))assert.ok(Object.hasOwn(helpArticles,path.slice(6)));
      }
      for(const path of ['/admin','/admin/bookings','/checkout/1','/voucher/1','/my-bookings/1'])assert.equal(render(Shell,{children:React.createElement('main',{},'legacy')},path),'<main>legacy</main>');
      assert.deepEqual(counters,zero()); assert.equal(http,0); assert.equal(payment,0);
      t.diagnostic('Pure navigation SSR/helper fixture: '+JSON.stringify(counters)+'; payment=0');
    });
    await t.test('K safe boundary fallback, same-route failure stable and route-key recovery',async()=>{
      const child=React.createElement('p',{},'Recovered');
      const instance=new Boundary({resetKey:'one',children:child});
      instance.state={...instance.state,...Boundary.getDerivedStateFromError(Error('PRIVATE_STACK'))};
      const html=renderToStaticMarkup(instance.render());
      assert.match(html,/Что-то пошло не так/); assert.match(html,/Обновите страницу или вернитесь на главную/);assert.match(html,/href="\/"/);
      assert.doesNotMatch(html,/PRIVATE_STACK|componentStack|Error:/);
      assert.equal(Boundary.getDerivedStateFromProps({resetKey:'one'},instance.state),null);
      instance.state={...instance.state,...Boundary.getDerivedStateFromProps({resetKey:'two'},instance.state)};
      assert.equal(instance.render(),child);
      instance.state={...instance.state,...Boundary.getDerivedStateFromError(Error('still broken'))};
      assert.equal(instance.state.failed,true);assert.equal(Boundary.getDerivedStateFromProps({resetKey:'two'},instance.state),null);
      const code=await source('components/ConsumerErrorBoundary.jsx');assert.doesNotMatch(code,/fetch|console\.|stack|setTimeout|setInterval|Sentry/);
      assert.match(await source('components/ConsumerShell.jsx'),/resetKey=\{`\$\{key\}:\$\{pathname\}:\$\{search\}`\}/);
    });
    await t.test('L safe titles, destination identity and resolved hotel, malicious inputs use fallback',async()=>{
      const expected={'/':'Asedeliya — поиск отелей','/results':'Отели — Asedeliya','/favorites':'Избранное — Asedeliya','/my-bookings':'Мои бронирования — Asedeliya','/profile':'Личный кабинет — Asedeliya','/login':'Вход — Asedeliya','/register':'Регистрация — Asedeliya','/help':'Помощь — Asedeliya','/contacts':'Контакты — Asedeliya','/unknown':'Страница не найдена — Asedeliya'};
      for(const [path,title] of Object.entries(expected))assert.equal(consumerTitle(path),title);
      const params=new URLSearchParams('destinationCode=AYT&countryCode=TR&hotelName=PRIVATE&title=<script>');
      assert.equal(consumerTitle('/results',{params,destinations:[{countryCode:'TR',code:'AYT'}]}),'Отели: Antalya — Asedeliya');
      assert.equal(consumerTitle('/results',{params,destinations:[{countryCode:'AE',code:'AYT'}]}),'Отели — Asedeliya');
      assert.equal(consumerTitle('/results',{params:new URLSearchParams('destinationCode=<script>&countryCode=PRIVATE')}),'Отели — Asedeliya');
      assert.equal(consumerTitle('/tour/hotelbeds/101',{hotelName:' Grand   Kaptan '}),'Grand Kaptan — Asedeliya');
      for(const hotelName of ['<script>evil</script>','bad\u202Etext',{},null,''])assert.equal(consumerTitle('/tour/hotelbeds/101',{hotelName}),'Отель — Asedeliya');
      assert.equal(consumerTitle('/tour/hotelbeds/101'),'Отель — Asedeliya');
      for(const path of ['/help/missing','/help/__proto__','/help/constructor'])assert.equal(consumerTitle(path),'Страница не найдена — Asedeliya');
      const meta=await source('components/ConsumerMetadata.jsx');assert.match(meta,/document.title = title/);assert.doesNotMatch(meta,/innerHTML|fetch|location.search/);
      assert.match(await source('pages/Results.jsx'),/params=\{searchParams\} destinations=\{destinations\}/);
      assert.match(await source('pages/TourDetails.jsx'),/hotelName=\{hotelName\}/);
    });

    const rows=[{countryCode:'TR',code:'AYT',hotelCount:1}];
    const form={...home.initialHomeSearch(new URLSearchParams()),destination:home.destinationKey(rows[0]),checkIn:'2030-09-28',nights:'7',adults:2,children:2,childrenAges:['0','8']};
    const built=home.buildHomeSearch(form,rows,false,new Date('2029-01-01'));
    const params=new URLSearchParams(built.url.split('?')[1]);
    await t.test('C Home canonical query -> Results header -> provider query without losing occupancy',()=>{
      assert.deepEqual(built.errors,{});assert.ok(built.url.startsWith('/results?'));
      assert.equal([...params.keys()].length,new Set(params.keys()).size);
      for(const [key,value] of Object.entries({provider:'hotelbeds',countryCode:'TR',destinationCode:'AYT',checkIn:'2030-09-28',nights:'7',rooms:'1',adults:'2',children:'2',childrenAges:'0,8'}))assert.equal(params.get(key),value);
      assert.equal(params.has('checkOut'),false);assert.equal(params.has('departureDate'),false);
      assert.deepEqual(home.initialHomeSearch(params),form);
      const query=JSON.parse(local.providerQuery(params,true));
      assert.equal(query.country,'TR');assert.equal(query.childrenAges,'0,8');assert.equal(query.rooms,'1');
      const html=render(Header,{params,destinations:rows});assert.match(html,/Antalya/);assert.match(html,/28 сентября/);assert.match(html,/7 ночей/);assert.match(html,/2 взрослых/);assert.match(html,/2 ребёнка/);
      assert.deepEqual(counters,zero());
    });
    const {rate}=require('../../backend/tests/fixtures/hotelbedsSearchQuality');
    t.mock.method(client,'availability',async()=>{
      counters.Availability++;
      return {hotels:{hotels:[{code:101,name:'Grand Kaptan',currency:'EUR',rooms:[
        {code:'STD',name:'Standard',rates:[rate('3x-cheap','420.91',{children:2})]},
        {code:'FAMILY',name:'Family Room',rates:[rate('3x-selected','1139.95',{children:2,boardCode:'FB',boardName:'Full Board'})]},
      ]}]}};
    });
    const catalog=require('../../backend/repositories/providerCatalogRepository');
    t.mock.method(require('../../backend/services/hotelbedsTestAccess'),'assertAvailable',async()=>{});
    t.mock.method(catalog,'findDestinations',async()=>[{code:'AYT',country_code:'TR'}]);
    t.mock.method(catalog,'findHotels',async()=>[{provider_hotel_id:'101'}]);
    t.mock.method(catalog,'findHotelsByIds',async()=>[{provider_hotel_id:'101',name:'Grand Kaptan',country_name:'TR',city:'ANTALYA',destination_code:'AYT',stars:5,image_url:'/offline/1.jpg',images:['/offline/1.jpg','/offline/2.jpg']}]);
    t.mock.method(require('../../backend/services/priceHistoryService'),'record',async()=>{});
    t.mock.method(require('../../backend/services/hotelbedsMonitorService'),'track',async()=>{});
    const search=require('../../backend/services/searchService');
    const result=await search.search(JSON.parse(local.providerQuery(params,true)));
    const filtered=new URLSearchParams(params);filtered.set('food','FB');filtered.set('sort','priceDesc');filtered.set('roomType','Family');
    const selected=local.filterOffers(result.data,filtered)[0];assert.ok(selected,'selected family candidate exists');
    const original=JSON.stringify(selected);
    const url=offerDetailsLink(selected), query='?'+url.split('?')[1];
    const origin=presentation.resultsOrigin({pathname:'/results',search:'?'+filtered,key:'3x-results'});
    const entry={pathname:'/tour/hotelbeds/101',search:query,state:{selectedOffer:selected,resultsOrigin:origin}};
    const renderDetails=(state=entry.state)=>renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[{...entry,state}]},React.createElement(Routes,{},React.createElement(Route,{path:'/tour/:provider/:id',element:React.createElement(Details)}))));
    const args={selectedOffer:selected,provider:'hotelbeds',id:'101',search:query};
    await t.test('D/E/F exact signed candidate, origin/filter/sort, fresh forward/reload snapshot',async()=>{
      assert.equal(local.filterOffers(result.data,params)[0].price,420.91);
      assert.equal(selected.price,1139.95);assert.equal(selected.roomCode,'FAMILY');assert.equal(selected.boardCode,'FB');
      assert.equal(selected.nights,7);assert.equal(selected.adults,2);assert.equal(selected.children,2);assert.equal(String(selected.childrenAges),'0,8');
      assert.equal(selected.checkIn,'2030-09-28');assert.equal(selected.checkOut,'2030-10-05');assert.equal(selected.currency,'EUR');
      const signed=require('../../backend/services/offerTokenService').verify(selected.offerToken);
      for(const key of ['providerHotelId','roomCode','boardCode','rateKey','price','currency','nights','adults','children','childrenAges','checkIn','checkOut'])assert.deepEqual(signed[key],selected[key],key);
      assert.equal(await loadDetailsOffer(args),selected);
      const restored=JSON.parse(JSON.stringify(entry.state));
      assert.deepEqual(await loadDetailsOffer({...args,selectedOffer:restored.selectedOffer}),selected);
      assert.equal(selectedOfferSnapshot(selected,'hotelbeds','101',query,Date.parse(selected.observedAt)+899999),selected);
      assert.equal(presentation.detailsBackTarget(origin,1,query),-1);
      for(const [key,value] of filtered)assert.equal(new URLSearchParams(origin.search).get(key),value);
      assert.equal(local.providerQuery(filtered,true),local.providerQuery(params,true));
      await search.search(JSON.parse(local.providerQuery(new URLSearchParams(origin.search),true)));
      assert.equal(counters.Availability,1,'Back uses existing backend cache');
      assert.match(render(Card,{tour:selected},'/results?'+filtered),/1\s*139,95/);
      assert.match(renderDetails(),/Grand Kaptan/);assert.match(renderDetails(),/Family Room/);assert.match(renderDetails(),/Полный пансион/);
      assert.equal(url.includes(selected.offerToken),false);assert.equal(url.includes(selected.rateKey),false);
      assert.match(await source('components/TourCard.jsx'),/state: \{ selectedOffer: tour, resultsOrigin: resultsOrigin\(location\) \}/);
    });
    await t.test('G rejected/stale snapshot never invokes alternate resolver; direct URL only existing resolver',async st=>{
      for(const patch of [{observedAt:new Date(Date.now()-900001).toISOString()},{providerHotelId:'102'},{observedAt:new Date(Date.now()+60000).toISOString()}])await assert.rejects(()=>loadDetailsOffer({...args,selectedOffer:{...selected,...patch}}),{code:'SELECTED_OFFER_STALE'});
      for(const change of ['childrenAges=1,9','nights=1','checkOut=2031-01-01','adults=3']) {
        const changed=new URLSearchParams(query);const [key,value]=change.split('=');changed.set(key,value);
        await assert.rejects(()=>loadDetailsOffer({...args,search:'?'+changed}),{code:'SELECTED_OFFER_STALE'});
      }
      assert.match(renderDetails({selectedOffer:{...selected,observedAt:'2000-01-01'}}),/Выбранный тариф устарел/);
      assert.match(renderDetails(null),/Загружаем выбранный отель/);
      assert.equal(http,0);
      let resolver=0;
      st.mock.method(globalThis,'fetch',async address=>{resolver++;assert.match(address,/\/offers\/hotelbeds\/101\?/);return {ok:true,json:async()=>({success:true,data:selected})};});
      assert.equal(await loadDetailsOffer({...args,selectedOffer:null}),selected);assert.equal(resolver,1);
      assert.equal(presentation.detailsError({code:'OFFER_NOT_FOUND'}).title,'Отель не найден');
      assert.equal(presentation.detailsError({code:'HOTELBEDS_AUTH_BLOCKED'}).title,'Тарифы временно недоступны');
    });
    await t.test('H/M/N/O gallery/disclosure/favorite mock -> Back -> account/help/404, no extra provider or payment',async()=>{
      let active=0;
      const props={images:presentation.galleryImages(selected),hotelName:selected.name,activeImage:0,onSelect:index=>{active=index;}};
      Gallery(props).props.children[1].props.children[1].props.onClick();assert.equal(active,1);
      assert.match(render(Gallery,{...props,activeImage:active}),/2 \/ 2/);
      assert.match(renderDetails(),/<details class="details-technical"><summary>/);
      let saved;
      await toggleDetailsFavorite(selected,{hasSession:true,toggleFavorite:async offer=>{saved=offer;},navigate:()=>assert.fail('Unexpected login')});
      assert.equal(saved,selected);
      const fav=render(FavoritesView,{favorites:[saved],status:'ready'});
      assert.match(fav,/Последняя сохранённая цена/);assert.match(fav,/Текущая стоимость может отличаться/);assert.match(fav,/Откроется новый поиск/);
      for(const [View,key] of [[FavoritesView,'favorites'],[MyBookingsView,'bookings']]) {
        const markup=status=>render(View,{[key]:[],status});
        assert.match(markup('loading'),/role="status"/);assert.match(markup('error'),/role="alert"/);assert.match(markup('auth'),/Войдите в аккаунт/);
        assert.match(markup('ready'),/пока/);assert.doesNotMatch(markup('ready'),/Подтверждено|Оплачено/);
      }
      assert.match(render(ProfileView,{state:{...profile.getSnapshot(),status:'loading'},actions:profile}),/Загружаем профиль/);
      assert.match(render(ProfileView,{state:{...profile.getSnapshot(),status:'error'},actions:profile}),/Не удалось загрузить данные профиля/);
      const markup=renderDetails()+fav+navMarkup()+render(MyBookingsView,{bookings:[],status:'ready'})+render(AuthView,{mode:'login',state:{form:{email:'',password:''},errors:{},pending:false},actions:{}});
      assert.doesNotMatch(markup,/rateKey|offerToken|componentStack|PRIVATE_STACK|api-mtls|BEGIN PRIVATE KEY/);
      assert.equal(markup.includes(selected.rateKey),false);assert.equal(markup.includes(selected.offerToken),false);
      assert.equal(JSON.stringify(selected),original);
      assert.deepEqual(counters,{...zero(),Availability:1});assert.equal(http,0);assert.equal(payment,0);
      t.diagnostic('One initial MOCKED Availability, then SSR/handlers/cache: '+JSON.stringify(counters)+'; payment=0');
    });
    await t.test('session/account isolation and safe login return, no personal data in URL',async()=>{
      const {authReturnPath}=await load('utils/authPresentation.js');
      for(const path of ['/profile','/favorites','/my-bookings'])assert.equal(authReturnPath(path,'user'),path);
      for(const path of ['https://evil.test','//evil.test','/profile?email=private','/admin'])assert.equal(authReturnPath(path,'user'),'/');
      const {createAccountListStore}=await load('services/accountListStore.js');
      let token='old',release;
      const store=createAccountListStore({ownerToken:'old',readToken:()=>token,loadData:()=>new Promise(resolve=>{release=resolve;})});
      const pending=store.load();await Promise.resolve();token='new';release([selected]);await pending;
      assert.deepEqual(store.getSnapshot().items,[]);
      assert.match(await source('components/ProtectedRoute.jsx'),/state=\{\{ returnTo: authOrigin\(location.pathname\) \}\}/);
      assert.match(await source('services/session.js'),/localStorage.removeItem\("token"\)/);
      assert.match(await source('components/Navbar.jsx'),/accountName\(user\)/);
      assert.doesNotMatch(built.url+url,/email|password|token|signature|rateKey/i);
    });
    await t.test('P responsive CSS applicability at 320/360/390/440/768/1024/1440; no geometry claim',async()=>{
      const consumer=await source('styles/Consumer.css'),profileCss=await source('styles/Profile.css');
      const css=consumer+profileCss;
      for(const width of [320,360,390,440,768,1024,1440]) {
        const active=[];
        postcss.parse(css).walkRules(rule=>{
          for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule') {
            if(parent.name!=='media')return;
            const max=parent.params.match(/max-width:\s*(\d+)px/),min=parent.params.match(/min-width:\s*(\d+)px/);
            if(!max&&!min)return;if(max&&width>+max[1]||min&&width<+min[1])return;
          }
          active.push(rule.toString());
        });
        const rules=active.join('');assert.match(rules,/:focus-visible/);assert.match(rules,/overflow-wrap:anywhere/);
        assert.equal(/\.consumer-shell \.profile-page \.profile-summary > div:last-child\s*\{[^}]*flex-basis:100%/.test(rules),width<=360);
        assert.equal(rules.includes('.consumer-shell .navbar .nav-right > .desktop-icon'),width<=360);
      }
      assert.match(profileCss,/word-break:normal; overflow-wrap:break-word/);
      assert.doesNotMatch(css,/body\s*\{[^}]*overflow-x:\s*hidden/);
      assert.match(consumer,/visibility:hidden; opacity:0; pointer-events:none/);
      assert.match(await source('components/Navbar.jsx'),/aria-expanded=\{menuOpen\}/);
      assert.doesNotMatch(navMarkup(),/tabindex="[1-9]/);
      const large=render(Card,{tour:{...selected,name:'Длинное название '.repeat(30),roomName:'Большой семейный номер '.repeat(30),price:999999999.99}});
      assert.match(large,/999\s*999\s*999,99/);assert.match(large,/Большой семейный номер/);
    });
  } finally { cache.clear();await server.close(); }
});
