import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { build, createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup, renderToPipeableStream } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import postcss from 'postcss';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');
const pages = ['Help','Contacts','Results','Favorites','TourDetails','Login','Register','Checkout','MyBookings','BookingDetails','Profile','Voucher','AdminPanel'];

test('5H route imports, auth boundaries, images and real build graph offline', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw Error('All network forbidden in 5H'); });
  const previous = { storage:globalThis.sessionStorage, window:globalThis.window, evaluated:globalThis.__performanceEvaluated };
  const memory = new Map();
  globalThis.sessionStorage = { getItem:key=>memory.get(key)??null, setItem:(key,value)=>memory.set(key,String(value)), removeItem:key=>memory.delete(key) };
  globalThis.window = new EventTarget(); window.location = { href:'/' };
  globalThis.__performanceEvaluated = [];
  const server = await createServer({ root, configFile:false, server:{middlewareMode:true,hmr:false}, esbuild:{jsx:'automatic'},
    define:{'import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED':'"true"'},
    plugins:[{name:'offline-route-evaluation',enforce:'pre',transform(code,id) {
      const match = id.replaceAll('\\','/').match(/\/src\/pages\/(\w+)\.jsx$/);
      if (match) return `globalThis.__performanceEvaluated.push(${JSON.stringify(match[1])});\n${code}`;
    }}],
  });
  const load = path => server.ssrLoadModule('/src/' + path);
  const render = node => renderToStaticMarkup(React.createElement(MemoryRouter,{},node));
  // Streaming SSR resolves actual React.lazy imports; effects are intentionally not browser-mounted.
  function stream(node) {
    return new Promise((resolve,reject) => {
      const output = new PassThrough(); let html = '';
      output.on('data',chunk=>{html+=chunk;}); output.on('end',()=>resolve(html)); output.on('error',reject);
      const result = renderToPipeableStream(node,{onAllReady(){result.pipe(output);},onError:reject});
    });
  }
  try {
    const {default:App} = await load('App.jsx');
    const {default:SessionBoundary} = await load('components/SessionBoundary.jsx');
    const {FavoritesProvider,createFavoritesStore} = await load('context/FavoritesContext.jsx');
    const session = await load('services/session.js');
    const {default:ProtectedRoute} = await load('components/ProtectedRoute.jsx');
    const {default:RouteBoundary,RouteLoading} = await load('components/RouteBoundary.jsx');
    const {default:ErrorBoundary} = await load('components/ConsumerErrorBoundary.jsx');
    const appSource = await source('App.jsx');
    const login = (id=7,role='user') => session.establishSession('offline-5h', {id,role,email:'fixture@example.test',full_name:'Fixture'}, session.beginAuthAttempt());
    const tree = entry => React.createElement(SessionBoundary,{},React.createElement(FavoritesProvider,{},React.createElement(MemoryRouter,{initialEntries:[entry]},React.createElement(App))));
    const route = entry => stream(tree(entry));
    await t.test('App evaluation leaves all thirteen route modules unloaded',()=>{for(const name of pages)assert.ok(!globalThis.__performanceEvaluated.includes(name),name);assert.equal(requests,0);});
    for (const name of pages) await t.test(`${name} uses a module-scope lazy import, not eager page import`,()=>{
      assert.ok(appSource.includes(`const ${name} = lazy(() => import("./pages/${name}"));`));
      assert.doesNotMatch(appSource,new RegExp(`import ${name} from`));
    });
    await t.test('Home renders immediately without loading other route code',async()=>{const html=await route('/');assert.match(html,/Найдите отель/);assert.match(html,/Centre Portugal|Направления по странам/);assert.doesNotMatch(html,/Загрузка страницы/);for(const name of pages)assert.ok(!globalThis.__performanceEvaluated.includes(name));});
    for(const [path,name] of [['/profile','Profile'],['/my-bookings','MyBookings'],['/my-bookings/12','BookingDetails'],['/bookings','MyBookings'],['/bookings/12','BookingDetails'],['/checkout/12','Checkout'],['/checkout/hotelbeds/12','Checkout'],['/voucher/12','Voucher'],['/admin','AdminPanel'],['/admin/bookings','AdminPanel']])await t.test(`guest ${path} never evaluates protected lazy ${name}`,async()=>{session.logout();const html=await route(path);assert.ok(!globalThis.__performanceEvaluated.includes(name));assert.doesNotMatch(html,/Fixture|PRIVATE|Загрузка страницы/);});
    await t.test('restored unvalidated session gates even lazy Favorites before evaluation',async()=>{memory.set('token','offline-5h');memory.set('user',JSON.stringify({id:7,role:'admin'}));assert.equal(session.validatedSessionSnapshot().status,'unknown');const html=await route('/favorites');assert.match(html,/Проверяем сессию/);assert.ok(!globalThis.__performanceEvaluated.includes('Favorites'));assert.doesNotMatch(html,/Fixture|PRIVATE/);session.logout();});
    await t.test('normal user cannot evaluate admin module',async()=>{login();await route('/admin');assert.ok(!globalThis.__performanceEvaluated.includes('AdminPanel'));session.logout();});
    await t.test('protected lazy factory does not run before identity check',()=>{let imports=0;const Private=React.lazy(()=>{imports++;return Promise.resolve({default:()=>React.createElement('p',{},'PRIVATE')});});const html=render(React.createElement(RouteBoundary,{},React.createElement(ProtectedRoute,{},React.createElement(Private))));assert.equal(imports,0);assert.doesNotMatch(html,/PRIVATE/);});
    await t.test('suspended route presents non-private accessible loading',()=>{const Slow=React.lazy(()=>new Promise(()=>{}));const html=render(React.createElement(RouteBoundary,{},React.createElement(Slow)));assert.match(html,/Загрузка страницы/);assert.match(html,/role="status"/);assert.doesNotMatch(html,/Fixture|offline-5h|PRIVATE/);});
    await t.test('fallback has one main and heading, no fake progress or side effects',async()=>{const html=renderToStaticMarkup(React.createElement(RouteLoading));assert.equal((html.match(/<main/g)||[]).length,1);assert.equal((html.match(/<h1/g)||[]).length,1);assert.doesNotMatch(html,/\d+%|<img|<input/);assert.doesNotMatch(await source('components/RouteBoundary.jsx'),/fetch|useEffect|setInterval|setTimeout|focus\(|error\.message/);});
    await t.test('existing error boundary discards lazy rejection internals and resets on navigation',()=>{const props={resetKey:'one',children:React.createElement('p',{},'OK')};const boundary=new ErrorBoundary(props);boundary.state={...boundary.state,...ErrorBoundary.getDerivedStateFromError(Error('SECRET https://internal.invalid/chunk.js STACK'))};const html=renderToStaticMarkup(boundary.render());assert.match(html,/Что-то пошло не так/);assert.match(html,/href="\/"/);assert.doesNotMatch(html,/SECRET|internal.invalid|STACK/);assert.equal(ErrorBoundary.getDerivedStateFromProps(props,boundary.state),null);assert.equal(ErrorBoundary.getDerivedStateFromProps({...props,resetKey:'two'},boundary.state).failed,false);});
    await t.test('route error and Suspense boundaries cover legacy/admin routes too',async()=>{assert.match(appSource,/<RouteBoundary>[\s\S]*<Routes>[\s\S]*path="\/admin"[\s\S]*<\/Routes>[\s\S]*<\/RouteBoundary>/);assert.match(await source('components/RouteBoundary.jsx'),/<ConsumerErrorBoundary[\s\S]*<Suspense/);});
    for(const [path,name,pattern] of [['/results','Results',/Найдите подходящий отель/],['/tour/hotelbeds/12','TourDetails',/Загружаем|Загрузка|details-page/],['/login','Login',/Вход в аккаунт/],['/register','Register',/Создать аккаунт/],['/help','Help',/Помощь|Темы помощи/],['/contacts','Contacts',/Контакты/],['/favorites','Favorites',/Войдите в аккаунт/]])await t.test(`${path} lazy page resolves offline without data side effects`,async()=>{session.logout();const html=await route(path);assert.ok(globalThis.__performanceEvaluated.includes(name));assert.match(html,pattern);assert.equal(requests,0);});
    for(const [path,name] of [['/profile','Profile'],['/my-bookings','MyBookings'],['/my-bookings/12','BookingDetails'],['/checkout/12','Checkout'],['/voucher/12','Voucher']])await t.test(`authorized ${path} resolves only after identity exists`,async()=>{login();await route(path);assert.ok(globalThis.__performanceEvaluated.includes(name));assert.equal(requests,0);session.logout();});
    await t.test('authorized admin retains bookings tab route',async()=>{login(7,'admin');const html=await route('/admin/bookings');assert.ok(globalThis.__performanceEvaluated.includes('AdminPanel'));assert.match(html,/Бронирования/);assert.equal(requests,0);session.logout();});
    await t.test('known lazy page then logout still closes access',async()=>{const html=await route('/profile');assert.doesNotMatch(html,/Fixture|Личный кабинет|profile-field/);assert.equal(session.validatedSessionSnapshot().status,'guest');});
    await t.test('unknown URL keeps existing 404',async()=>assert.match(await route('/not-a-route'),/Страница не найдена/));
    await t.test('same module is not evaluated again on route revisit',async()=>{const before=globalThis.__performanceEvaluated.filter(x=>x==='Results').length;await route('/results');assert.equal(globalThis.__performanceEvaluated.filter(x=>x==='Results').length,before);});
    await t.test('root providers stay outside router and route boundaries',async()=>{const main=await source('main.jsx');assert.match(main,/<SessionBoundary>[\s\S]*<FavoritesProvider>[\s\S]*<BrowserRouter>/);assert.doesNotMatch(main,/lazy|Suspense/);assert.doesNotMatch(appSource,/FavoritesProvider|SessionBoundary/);assert.doesNotMatch(await source('components/RouteBoundary.jsx'),/<Suspense[^>]*key=/);});
    await t.test('Favorites store is not remounted by importing a route and logout invalidates it',async()=>{login();const store=createFavoritesStore({token:'offline-5h',userId:7,loadData:async()=>[{id:12}]});const disconnect=store.connect();await store.load();await load('pages/Help.jsx');assert.equal(store.getSnapshot().items.length,1);session.logout();assert.deepEqual(store.getSnapshot().items,[]);disconnect();});
    await t.test('booking cache survives route import and cannot cross logout',async()=>{login();const {bookingHistory}=await load('services/bookingHistory.js');const h=bookingHistory('offline-5h',7);h.setGroup('active');await load('pages/BookingDetails.jsx');assert.equal(bookingHistory('offline-5h',7),h);assert.equal(h.getGroup(),'active');session.logout();assert.equal(h.getGroup(),'all');login(8);assert.notEqual(bookingHistory('offline-5h',8),h);session.logout();});
    await t.test('Profile stays page-owned with existing session invalidation',async()=>{const page=await source('pages/Profile.jsx');assert.match(page,/createProfileStore/);assert.match(page,/store.connect\(\)/);assert.match(await source('services/profileStore.js'),/takeRestoredProfile\(token\)/);});
    await t.test('Home submit and Results search cache retain shared intent module',async()=>{assert.match(await source('components/HomeSearch.jsx'),/beginResultsSearch\(result.url\)/);assert.match(await source('pages/Results.jsx'),/resultsSearchGeneration\(\)/);const before=await load('services/resultsSearch.js');await load('pages/Results.jsx');const after=await load('services/resultsSearch.js');assert.equal(before.loadResultsSearch,after.loadResultsSearch);});
    await t.test('selected-offer navigation state is not replaced by loading boundary',async()=>{assert.match(await source('components/TourCard.jsx'),/state: \{ selectedOffer: tour, resultsOrigin:/);assert.match(await source('pages/TourDetails.jsx'),/location.state\?\.selectedOffer/);assert.doesNotMatch(await source('components/RouteBoundary.jsx'),/Navigate|navigate|location.state|URLSearchParams/);});
    const {default:HotelImage}=await load('components/HotelImage.jsx');
    const {default:CollectionImage}=await load('components/CollectionImage.jsx');
    const {default:Cards}=await load('components/TestDestinationCards.jsx');
    const {default:Gallery}=await load('components/DetailsGallery.jsx');
    for(const [name,View] of [['hotel',HotelImage],['collection',CollectionImage]])await t.test(`${name} image uses asynchronous decoding and retains lazy/alt semantics`,()=>{const html=renderToStaticMarkup(React.createElement(View,{src:'/offline.png',alt:'Fixture hotel',loading:'lazy'}));assert.match(html,/decoding="async"/);assert.match(html,/loading="lazy"/);assert.match(html,/alt="Fixture hotel"/);});
    await t.test('main details image remains eager; thumbnails stay lazy and async',()=>{const html=renderToStaticMarkup(React.createElement(Gallery,{hotelName:'Hotel',images:['/a.png','/b.png']}));assert.equal((html.match(/loading="eager"/g)||[]).length,1);assert.equal((html.match(/loading="lazy"/g)||[]).length,2);assert.equal((html.match(/decoding="async"/g)||[]).length,3);});
    await t.test('Home mapped destination images stay local/lazy/async',()=>{const html=render(React.createElement(Cards,{destinations:[{countryCode:'TR',code:'AYT',hotelCount:1}]}));assert.match(html,/turkey\.png/);assert.match(html,/loading="lazy" decoding="async"/);assert.doesNotMatch(html,/https?:/);});
    await t.test('Centre Portugal artwork remains CSS-only',()=>{const html=render(React.createElement(Cards,{destinations:[{countryCode:'PT',code:'CEN',name:'Centre Portugal',hotelCount:1}]}));assert.match(html,/destination-art-fallback/);assert.doesNotMatch(html,/<img/);});
    await t.test('missing hotel/collection images retain neutral fallbacks',()=>{for(const View of [HotelImage,CollectionImage]){const html=renderToStaticMarkup(React.createElement(View,{alt:'Hotel'}));assert.match(html,/Фото недоступно/);assert.doesNotMatch(html,/<img/);}});
    await t.test('failure handlers stay local with no emergency URL',async()=>{for(const file of ['HotelImage','CollectionImage','TestDestinationCards']){const code=await source(`components/${file}.jsx`);assert.match(code,/onError=/);assert.doesNotMatch(code,/https?:|fetch\(|currentTarget.src/);}});
    await t.test('Hero stays eager in Home dependency graph with decorative CSS image',async()=>{assert.match(appSource,/import Home from/);const hero=await source('components/HeroBanner.jsx');assert.match(hero,/backgroundImage:/);assert.match(hero,/aria-hidden="true"/);assert.doesNotMatch(hero,/loading="lazy"|IntersectionObserver|useEffect/);});
    for(const width of [320,390,768,1440])await t.test(`${width}px fallback uses existing responsive account layout without new CSS`,async()=>{const css=await source('styles/AccountPages.css');assert.doesNotThrow(()=>postcss.parse(css));assert.match(css,/width:min\(1320px,calc\(100% - 48px\)\)/);assert.match(css,/max-width:600px/);assert.match(css,/width:calc\(100% - 28px\)/);assert.match(renderToStaticMarkup(React.createElement(RouteLoading)),/class="account-page"/);});
    await t.test('header/footer are shared by Home and lazy pages unchanged',async()=>{for(const path of ['pages/Home.jsx','pages/Results.jsx','pages/Favorites.jsx','pages/Profile.jsx']){const code=await source(path);assert.match(code,/<Navbar/);assert.match(code,/<Footer/);}});
    await t.test('no speculative prefetch, polling, service worker or provider operation in route boundary',async()=>{const code=appSource+await source('components/RouteBoundary.jsx');assert.doesNotMatch(code,/fetch\(|setInterval|serviceWorker|prefetch|preload|checkRate|createBooking|payBooking|cancelBooking/);});
    await t.test('Home still loads catalog only and does not auto search',async()=>{assert.doesNotMatch(await source('pages/Home.jsx'),/special-offers|loadResultsSearch|loadDetailsOffer/);assert.doesNotMatch(await source('services/homeCatalog.js'),/special-offers|availability|checkRate|payment/);});
    await t.test('build configuration does not suppress warning or force vendor buckets',async()=>{const config=await readFile(new URL('../vite.config.js',import.meta.url),'utf8');assert.doesNotMatch(config,/chunkSizeWarningLimit|manualChunks|codeSplitting|onwarn|logLevel|minify/);});
    await t.test('package contains no new analyzer or prefetch dependency',async()=>{const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));assert.doesNotMatch(Object.keys({...pkg.dependencies,...pkg.devDependencies}).join(' '),/analyzer|visualizer|loadable|quicklink/);});

    // Build in memory using existing Vite configuration; inspect actual imports, not file-name guesses.
    const previousNodeEnv=process.env.NODE_ENV;
    let result;
    try {
      process.env.NODE_ENV='production';
      result=await build({root,logLevel:'silent',define:{'import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED':'"true"'},build:{write:false}});
    } finally {
      if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;
    }
    const output=(Array.isArray(result)?result[0]:result).output;
    const chunks=output.filter(x=>x.type==='chunk');
    const entry=chunks.find(x=>x.isEntry);
    const byName=new Map(chunks.map(x=>[x.fileName,x]));
    const initial=new Set();
    const visit=name=>{if(initial.has(name))return;initial.add(name);for(const next of byName.get(name)?.imports||[])visit(next);};visit(entry.fileName);
    const initialModules=[...initial].flatMap(name=>Object.keys(byName.get(name)?.modules||{})).map(x=>x.replaceAll('\\','/'));
    await t.test('actual build creates hashed dynamic chunks without any over 500 kB',()=>{assert.ok(chunks.length>1);assert.ok(entry.dynamicImports.length>0);for(const chunk of chunks){assert.match(chunk.fileName,/-[\w-]+\.js$/);assert.ok(Buffer.byteLength(chunk.code)<500000,chunk.fileName);}});
    await t.test('entry and full static JS closure both reduce baseline payload',()=>{assert.ok(Buffer.byteLength(entry.code)<502850);const total=[...initial].reduce((sum,name)=>sum+Buffer.byteLength(byName.get(name).code),0);assert.ok(total<502850);t.diagnostic(`entry bytes=${Buffer.byteLength(entry.code)}, initial static JS bytes=${total}, JS chunks=${chunks.length}`);});
    for(const name of pages)await t.test(`production initial graph excludes ${name} implementation`,()=>{assert.ok(!initialModules.some(id=>id.endsWith(`/pages/${name}.jsx`)),name);assert.ok(chunks.some(chunk=>Object.keys(chunk.modules).some(id=>id.replaceAll('\\','/').endsWith(`/pages/${name}.jsx`))));});
    await t.test('global providers and Home stay in initial graph',()=>{for(const id of ['/pages/Home.jsx','/context/FavoritesContext.jsx','/components/SessionBoundary.jsx','/services/session.js'])assert.ok(initialModules.some(x=>x.endsWith(id)),id);});
    await t.test('global stylesheet remains single and complete before lazy routes resolve',()=>{const css=output.filter(x=>x.type==='asset'&&x.fileName.endsWith('.css'));assert.equal(css.length,1);for(const selector of ['.admin-layout','.checkout-page','.account-page','.destination-art-fallback','.consumer-shell'])assert.ok(String(css[0].source).includes(selector),selector);});
    await t.test('Home CSS data/TEST and disabled-sales disclosures survive splitting',async()=>{session.logout();const html=await route('/');assert.match(html,/Тестовый поиск/);assert.match(html,/реальное бронирование и оплата отключены/);assert.doesNotMatch(html,/Предложения со снижением цены/);});
    await t.test('all import/render/build checks made zero network requests',()=>assert.equal(requests,0));
  } finally {
    await server.close();
    globalThis.sessionStorage=previous.storage;globalThis.window=previous.window;globalThis.__performanceEvaluated=previous.evaluated;
  }
});
