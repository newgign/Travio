import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import postcss from 'postcss';

const source = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');
const noop = () => {};
const render = (View, props = {}) => renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(View, props)));
function labels(html) {
  for (const [tag] of html.matchAll(/<(?:input|select)\b[^>]*>/g)) {
    if (/type="checkbox"/.test(tag)) continue; // Profile checkboxes use enclosing labels.
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`for="${id}"`), tag);
  }
}
function buttons(html) {
  for (const [tag] of html.matchAll(/<button\b[^>]*>/g)) assert.match(tag, /type="(?:button|submit)"/);
}

test('5I targeted consumer accessibility and browser-safe source contracts, offline', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw Error('Network forbidden'); });
  const server = await createServer({ root:fileURLToPath(new URL('..', import.meta.url)), configFile:false, server:{middlewareMode:true,hmr:false}, esbuild:{jsx:'automatic'} });
  const load = path => server.ssrLoadModule('/src/' + path);
  try {
    const {AuthView} = await load('components/AuthPage.jsx');
    const {ProfileView} = await load('pages/Profile.jsx');
    const {default:HomeSearch} = await load('components/HomeSearch.jsx');
    const {default:GuestPanel} = await load('components/GuestPanel.jsx');
    const {default:Faq} = await load('components/FaqSection.jsx');
    const {RouteLoading} = await load('components/RouteBoundary.jsx');
    const {AccountError,AccountLoading} = await load('components/AccountStates.jsx');
    const {default:Notice} = await load('components/ResultsNotice.jsx');
    const {default:Toolbar} = await load('components/ResultsToolbar.jsx');
    const {default:Filters} = await load('components/LocalResultsFilters.jsx');
    const {default:HotelImage} = await load('components/HotelImage.jsx');
    const {default:CollectionImage} = await load('components/CollectionImage.jsx');
    const {default:Gallery} = await load('components/DetailsGallery.jsx');
    const {default:Cards} = await load('components/TestDestinationCards.jsx');
    const {FavoritesView} = await load('pages/Favorites.jsx');
    const {MyBookingsView} = await load('pages/MyBookings.jsx');
    const {BookingDetailsView} = await load('pages/BookingDetails.jsx');
    const nav = await source('components/Navbar.jsx');
    const authState = {form:{full_name:'',email:'',phone:'',password:'',confirmPassword:''},errors:{},pending:false,error:''};
    const auth = (mode='login', patch={}) => render(AuthView,{mode,state:{...authState,...patch},actions:{edit:noop,submit:noop,getSnapshot:()=>authState}});
    const profileState = {status:'ready',user:{id:7,full_name:'Fixture',email:'fixture@example.test',role:'user'},draft:{full_name:'Fixture',phone:'',preferred_language:'ru',email_notifications:false,booking_reminders:false},errors:{},password:{currentPassword:'',newPassword:'',confirmPassword:''},passwordErrors:{}};
    const profile = patch => render(ProfileView,{state:{...profileState,...patch},actions:{}});

    await t.test('login inputs have labels and email/current-password autocomplete',()=>{const html=auth();labels(html);assert.match(html,/type="email" autoComplete="email"/i);assert.match(html,/autoComplete="current-password"/i);});
    await t.test('registration labels and both new-password autocomplete values',()=>{const html=auth('register');labels(html);assert.equal((html.match(/autoComplete="new-password"/gi)||[]).length,2);});
    await t.test('auth field errors reference rendered text and invalid state',()=>{const html=auth('login',{errors:{email:'Укажите email'}});assert.match(html,/aria-invalid="true" aria-describedby="auth-email-error"/);assert.match(html,/id="auth-email-error">Укажите email/);});
    await t.test('auth submits natively; visibility toggles cannot submit',()=>{const html=auth();buttons(html);assert.match(html,/type="submit"/);assert.match(html,/aria-label="Показать: Пароль" aria-pressed="false"/);});
    await t.test('auth pending exposes busy/disabled and status',()=>{const html=auth('login',{pending:true});assert.match(html,/aria-busy="true"/);assert.match(html,/type="submit" disabled/);assert.match(html,/role="status"/);});
    await t.test('Home search labels date/selects and native submit',()=>{const html=render(HomeSearch);labels(html);buttons(html);assert.match(html,/type="date"/);assert.match(html,/aria-label="Поиск отелей"/);assert.match(html,/aria-controls="home-guest-panel"/);});
    await t.test('guest outputs name counts; child age has label and buttons explicit',()=>{const html=render(GuestPanel,{form:{adults:2,children:1,childrenAges:['7']},onChange:noop,onClose:noop});labels(html);buttons(html);assert.match(html,/<output aria-live="polite" aria-label="Количество взрослых">2/);assert.match(html,/<output aria-live="polite" aria-label="Количество детей">1/);assert.match(html,/aria-label="Количество номеров"/);});
    await t.test('guest min/max buttons retain disabled boundaries',()=>{const html=render(GuestPanel,{form:{adults:1,children:3,childrenAges:['1','2','3']},onChange:noop,onClose:noop});assert.match(html,/aria-label="Уменьшить число взрослых" disabled/);assert.match(html,/aria-label="Увеличить число детей" disabled/);});
    await t.test('Profile personal/security fields labelled and separate forms',()=>{const html=profile();labels(html);buttons(html);assert.equal((html.match(/<form /g)||[]).length,2);assert.match(html,/autoComplete="current-password"/i);assert.equal((html.match(/autoComplete="new-password"/gi)||[]).length,2);assert.match(html,/<label class="profile-check"><input type="checkbox"/);});
    await t.test('Profile field errors are associated without merging password errors',()=>{const html=profile({errors:{full_name:'Укажите имя'},passwordErrors:{newPassword:'Проверьте пароль'}});assert.match(html,/aria-describedby="profile-full_name-error"/);assert.match(html,/id="profile-full_name-error"/);assert.match(html,/aria-describedby="profile-newPassword-error"/);assert.match(html,/id="profile-newPassword-error"/);});
    await t.test('Profile saving disables submit and marks only personal form busy',()=>{const html=profile({dirty:true,saving:true,passwordBusy:false});assert.match(html,/aria-busy="true"/);assert.match(html,/type="submit" disabled="">Сохраняем/);assert.match(html,/aria-busy="false"/);});
    await t.test('mobile toggle has state, control target and accessible name',()=>{assert.match(nav,/aria-expanded=\{menuOpen\}/);assert.match(nav,/aria-controls=\{menuId\}/);assert.match(nav,/id=\{menuId\}/);assert.match(nav,/Закрыть меню.*Открыть меню/);assert.match(nav,/ref=\{toggleRef\} type="button"/);});
    await t.test('opening menu focuses its first native link after render',()=>{assert.match(nav,/useEffect\(\(\) => \{\s*if \(menuOpen\) menuRef.current\?\.querySelector\('a\[href\]'\)\?\.focus\(\);\s*\}, \[menuOpen\]\)/);assert.match(nav,/<nav ref=\{menuRef\}/);assert.doesNotMatch(nav,/tabIndex=\{?[1-9]/);});
    await t.test('Escape and backdrop close restore toggle; route key closes menu',()=>{assert.match(nav,/event.key === 'Escape'[\s\S]*setMenuOpen\(false\);\s*toggleRef.current\?\.focus\(\)/);assert.match(nav,/className="nav-backdrop" onClick=\{\(\) => \{ setMenuOpen\(false\); toggleRef.current\?\.focus\(\); \}\}/);assert.match(nav,/menuLocation === location.key/);});
    await t.test('closed mobile menu hidden from keyboard; open menu scrolls on short screens',async()=>{const css=await source('styles/Consumer.css');assert.match(css,/visibility:hidden; opacity:0; pointer-events:none; overflow-y:auto/);assert.match(css,/\.nav-menu.open \{ visibility:visible/);assert.match(css,/height:100vh; height:100dvh/);});
    await t.test('FAQ native buttons connect to labelled hidden answers',()=>{const html=render(Faq);buttons(html);for(const [,id] of html.matchAll(/aria-controls="([^"]+)"/g))assert.ok(html.includes(`id="${id}"`));assert.match(html,/aria-expanded="false"/);assert.match(html,/role="region" aria-labelledby="faq-question-0" hidden/);});
    await t.test('FAQ focus ring is inset within clipped card and wins shared rule specificity',async()=>{const css=postcss.parse(await source('components/FaqSection.css'));let offset;css.walkRules('.faq-section .faq-question:focus-visible',rule=>rule.walkDecls('outline-offset',d=>{offset=d.value;}));assert.equal(offset,'-4px');assert.match(css.toString(),/outline:3px solid/);});
    await t.test('route loading provides single main/heading/status and never focuses',async()=>{const html=render(RouteLoading);assert.equal((html.match(/role="status"/g)||[]).length,1);assert.match(html,/<main/);assert.match(html,/<h1>Загрузка страницы/);assert.doesNotMatch(await source('components/RouteBoundary.jsx'),/focus\(|autoFocus|fetch\(/);});
    await t.test('account loading and retry have appropriate native status/alert controls',()=>{assert.match(render(AccountLoading,{label:'Загрузка'}),/role="status"/);const html=render(AccountError,{title:'Не удалось загрузить',onRetry:noop});assert.match(html,/role="alert"/);assert.match(html,/<button type="button"/);assert.doesNotMatch(html,/disabled/);assert.match(render(AccountError,{title:'Ошибка'}),/disabled/);});
    await t.test('results safe error and empty announcements differ, retry explicit',()=>{const props={params:new URLSearchParams(),onRetry:noop};const html=render(Notice,{...props,state:'ERROR',error:Error('RAW_SQL https://internal.invalid')});assert.match(html,/role="alert"/);buttons(html);assert.doesNotMatch(html,/RAW_SQL|internal.invalid/);assert.match(render(Notice,{...props,state:'PROVIDER_EMPTY'}),/role="status"/);});
    await t.test('results toolbar and local filters label every select/input',()=>{for(const html of [render(Toolbar,{total:0,shown:0,sort:'default',onSort:noop,onOpen:noop}),render(Filters,{currency:'EUR'})]){labels(html);buttons(html);}});
    await t.test('Favorites and MyBookings unknown states remain accessible loading, not empty',()=>{for(const html of [render(FavoritesView,{favorites:[],status:'unknown'}),render(MyBookingsView,{bookings:[],status:'unknown'})]){assert.match(html,/role="status"/);assert.doesNotMatch(html,/пока ничего нет|пока нет бронирований/);}});
    await t.test('BookingDetails unavailable state retains semantic return link',()=>{const html=render(BookingDetailsView,{status:'ready',data:{notFound:true}});assert.match(html,/href="\/my-bookings"/);assert.match(html,/Запись не найдена или недоступна/);});
    await t.test('meaningful images retain alt and neutral missing-photo fallback',()=>{assert.match(render(HotelImage,{src:'/fixture.png',alt:'Отель'}),/alt="Отель"/);assert.match(render(HotelImage),/role="img" aria-label="Фото недоступно"/);assert.match(render(CollectionImage),/Фото недоступно/);});
    await t.test('gallery thumbnails are decorative inside labelled native controls',()=>{const html=render(Gallery,{images:['/a.png','/b.png'],hotelName:'Отель',onSelect:noop});buttons(html);assert.match(html,/aria-label="Показать фото 1 из 2"/);assert.equal((html.match(/alt=""/g)||[]).length,2);assert.match(html,/loading="eager"/);});
    await t.test('destination CTA remains a real link; Portugal fallback makes no photo claim',()=>{const html=render(Cards,{destinations:[{countryCode:'PT',code:'CEN',name:'Centre Portugal',hotelCount:1}]});assert.match(html,/<a /);assert.match(html,/destination-art-fallback/);assert.doesNotMatch(html,/<img|onclick=/i);});
    await t.test('consumer links do not introduce unsafe blank targets',async()=>{for(const file of ['components/Navbar.jsx','components/Footer.jsx','pages/Help.jsx','pages/Contacts.jsx']){const code=await source(file);for(const [tag] of code.matchAll(/<(?:a|Link)\b[^>]*target="_blank"[^>]*>/g))assert.match(tag,/rel="[^"]*noopener/);}});
    await t.test('focus outlines retained for auth, search, accounts and navbar',async()=>{for(const file of ['styles/Auth.css','components/HomeSearch.css','styles/AccountPages.css','styles/Navbar.css'])assert.match(await source(file),/:focus-visible[^}]*outline:3px/);});
    await t.test('320/390 narrow forms retain wrapping and menu viewport bounds',async()=>{const [auth,profile,navCss]=await Promise.all(['styles/Auth.css','styles/Profile.css','styles/Navbar.css'].map(source));assert.match(auth,/max-width:360px[^]*flex-wrap:wrap/);assert.match(profile,/max-width:600px[^]*flex-wrap:wrap/);assert.match(navCss,/width: min\(86vw, 360px\)/);assert.match(auth,/overflow-wrap:anywhere/);});
    await t.test('768/1440 breakpoints preserved; touched FAQ CSS adds no width/overflow workaround',async()=>{const faq=await source('components/FaqSection.css'),navCss=await source('styles/Navbar.css');assert.match(faq,/max-width:768px/);assert.match(navCss,/min-width:1041px/);assert.doesNotThrow(()=>postcss.parse(faq));assert.doesNotMatch(faq,/width:100vw|overflow-x:hidden|outline:none/);});
    await t.test('protected-route and lazy provider ordering retained',async()=>{const guard=await source('components/ProtectedRoute.jsx'),app=await source('App.jsx'),main=await source('main.jsx');assert.match(guard,/status\)\) return <SessionStatus/);assert.match(guard,/adminOnly && user.role !== "admin"/);assert.match(app,/<ProtectedRoute>[\s\S]*<Profile/);assert.match(main,/<SessionBoundary>[\s\S]*<FavoritesProvider>[\s\S]*<BrowserRouter>/);assert.match(app,/const AdminPanel = lazy/);});
    await t.test('booking/payment disabled copy retained and audit renders cause zero network',async()=>{assert.match(await source('pages/TourDetails.jsx'),/disabled>Бронирование отключено/);assert.match(await source('pages/BookingDetails.jsx'),/disabled>Бронирование отключено/);assert.equal(requests,0);});
  } finally { await server.close(); }
});
