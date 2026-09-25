import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, matchRoutes } from 'react-router-dom';
const require = createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');
const source = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');
const compact = value => value.replace(/\s+/g, '');

test('3W consumer baseline: SSR/source/CSS evidence, not browser geometry', async t => {
  let http = 0;
  t.mock.method(globalThis, 'fetch', async () => { http++; throw Error('HTTP/payment forbidden'); });
  const client = require('../../backend/integrations/hotelbeds/client');
  const counters = { status:0, content:0, availability:0, checkrate:0, booking:0, cancellation:0 };
  for (const [key, methods] of Object.entries({status:['status','getBooking','listBookings'],content:['contentHotels','contentHotelDetails','contentDestinations','contentCountries'],availability:['availability'],checkrate:['checkRates'],booking:['createBooking'],cancellation:['cancelBooking']})) {
    for (const method of methods) t.mock.method(client, method, async () => { counters[key]++; throw Error('Provider forbidden'); });
  }
  const server = await createServer({root:fileURLToPath(new URL('..', import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
  const render = (Component, props = {}, path = '/') => renderToStaticMarkup(React.createElement(MemoryRouter, {initialEntries:[path]}, React.createElement(Component, props)));
  try {
    const {default:Shell} = await server.ssrLoadModule('/src/components/ConsumerShell.jsx');
    const {HelpView} = await server.ssrLoadModule('/src/pages/Help.jsx');
    const {ContactsView} = await server.ssrLoadModule('/src/pages/Contacts.jsx');
    const {NotFoundView} = await server.ssrLoadModule('/src/pages/NotFound.jsx');
    const {default:Footer} = await server.ssrLoadModule('/src/components/Footer.jsx');
    const {AuthView} = await server.ssrLoadModule('/src/components/AuthPage.jsx');
    const {AccountEmpty,AccountLoading,AccountError} = await server.ssrLoadModule('/src/components/AccountStates.jsx');
    const {default:Gallery} = await server.ssrLoadModule('/src/components/DetailsGallery.jsx');
    const css = compact(await source('styles/Consumer.css'));
    await t.test('short-page shell grows main, natural Footer, excludes legacy/Admin', () => {
      for (const path of ['/','/results','/tour/hotelbeds/1','/favorites','/my-bookings','/profile','/login','/register','/help/booking','/contacts','/abc123']) assert.match(render(Shell,{},path), /class="consumer-shell"/);
      for (const path of ['/admin','/admin/bookings','/checkout/1','/voucher/1','/my-bookings/1']) {
        assert.equal(render(Shell,{children:React.createElement('main',{},'legacy')},path),'<main>legacy</main>');
      }
      for (const [View,props] of [[HelpView,{topic:'booking'}],[ContactsView,{}],[NotFoundView,{}]]) {
        const html=render(Shell,{children:React.createElement(React.Fragment,{},React.createElement(View,props),React.createElement(Footer))});
        assert.equal((html.match(/<main\b/g)||[]).length,1);assert.equal((html.match(/<h1\b/g)||[]).length,1);
        assert.ok(html.indexOf('</main>')<html.indexOf('<footer'));
      }
      assert.match(css,/min-height:100vh;min-height:100dvh;display:flex;flex-direction:column/);
      assert.match(css,/>main\{flex:1\s*0\s*auto;min-width:0/);
      assert.match(css,/>\.home-page>\.footer\{margin-top:auto/);
      assert.match(css,/>\.results-page,\.consumer-shell>\.auth-page\{min-height:0/);
      assert.doesNotMatch(css,/position:fixed|overflow-x:hidden|width:100vw/);
    });
    await t.test('Navbar closed menu focus isolation, Escape/return, narrow and short screens', async () => {
      const nav=await source('components/Navbar.jsx'),base=compact(await source('styles/Navbar.css'));
      assert.match(nav,/aria-controls=\{menuId\}/);assert.match(nav,/id=\{menuId\}/);assert.match(nav,/event.key === 'Escape'/);assert.match(nav,/toggleRef.current\?\.focus\(\)/);
      assert.match(nav,/favoritesKnown \? favorites.length : 0/);assert.match(nav,/accountName\(user\)/);assert.match(nav,/onClick=\{logout\}/);assert.match(nav,/user\?\.role === "admin"/);
      assert.match(base,/text-overflow:ellipsis/);assert.match(base,/width:min\(86vw,360px\)/);
      assert.match(css,/@media\(max-width:1040px\)/);assert.match(css,/visibility:hidden;opacity:0;pointer-events:none;overflow-y:auto/);
      assert.match(css,/\.nav-menu.open\{visibility:visible;opacity:1;pointer-events:auto/);assert.match(css,/@media\(max-width:520px\)/);
      assert.doesNotMatch(nav,/tabIndex=\{?[1-9]/);
    });
    await t.test('Footer route/contact integrity and deterministic 4/2/1 columns', async () => {
      const app=await source('App.jsx'),html=render(Footer);
      const routes=[...app.matchAll(/path="([^"]+)"/g)].map(match=>({path:match[1]}));
      for(const [,href] of html.matchAll(/href="([^"]+)"/g)) {
        if(/^(tel:|mailto:)/.test(href))continue;
        assert.notEqual(matchRoutes(routes,href.split('#')[0])[0].route.path,'*',href);
      }
      assert.match(html,/mailto:/);assert.match(html,/tel:/);
      for(const columns of ['repeat(4,minmax(0,1fr))','repeat(2,minmax(0,1fr))','minmax(0,1fr)']) assert.ok(css.includes('grid-template-columns:'+columns));
      assert.match(css,/\.footer-columna\{min-height:44px/);
      assert.match(compact(await source('components/Footer.css')),/overflow-wrap:anywhere/);
    });
    await t.test('containers, tokens, wrapping and disabled/focus baseline scoped to consumer', () => {
      for(const token of ['width','article-width','radius','border','surface','muted','primary','background','shadow','focus']) assert.ok(css.includes('--consumer-'+token+':'));
      assert.match(css,/box-sizing:border-box/);assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/:focus-visible/);
      assert.match(css,/:disabled\{background:#f1f5f9/);assert.match(css,/min-width:0/);
      assert.doesNotMatch(css,/(?:^|\})body\{|width:100vw/);
    });
    await t.test('Home mobile guest panel normal flow and touch targets preserved', async () => {
      const home=compact(await source('components/HomeSearch.css'));
      assert.match(home,/@media\(max-width:600px\)/);assert.match(home,/position:static/);assert.match(home,/grid-template-columns:1fr/);
      assert.match(css,/\.home-guest-rowbutton\{width:44px;height:44px/);
      assert.match(css,/\.home-child-ageselect\{width:100%;min-width:0/);
      assert.match(await source('components/GuestPanel.jsx'),/aria-expanded|aria-label/);
    });
    await t.test('Results drawer/card and Details gallery/sticky retain their boundaries', async () => {
      const results=compact(await source('styles/Results.css')),details=compact(await source('styles/TourDetails.css'));
      assert.match(results,/@media\(max-width:800px\)/);assert.match(results,/width:min\(92vw,390px\)/);assert.match(results,/overscroll-behavior:contain/);
      assert.match(await source('components/ResultsFilterPanel.jsx'),/Escape/);
      assert.match(css,/top:var\(--travio-page-top\)/);assert.match(css,/\.tour-card-actions\{min-width:0/);
      assert.match(details,/@media\(max-width:1000px\)/);assert.match(details,/grid-template-columns:minmax\(0,1fr\)/);assert.match(details,/@media\(max-height:700px\)/);assert.match(details,/overflow-x:auto/);
      const html=render(Gallery,{images:['/a.jpg','/b.jpg'],hotelName:'Очень длинное имя '.repeat(30),activeImage:1,onSelect:()=>{}});
      assert.match(html,/2 \/ 2/);assert.match(html,/aria-pressed="true"/);assert.doesNotMatch(html,/rateKey|offerToken|rawProvider/);
      assert.match(await source('pages/TourDetails.jsx'),/className="details-booking" disabled/);
    });
    await t.test('Account/Auth/Help stack safely and preserve accessible states', async () => {
      const {default:Filters}=await server.ssrLoadModule('/src/components/ResultsFilters.jsx');
      for(const instant of [false,true]) {
        const html=render(Filters,{instant});
        const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
        const labels=[...html.matchAll(/\bfor="([^"]+)"/g)].map(x=>x[1]);
        assert.equal(ids.length,7);assert.equal(new Set(ids).size,ids.length);
        for(const id of ids)assert.ok(labels.includes(id),'Unlabelled filter '+id);
      }
      for(const [file,breakpoints] of [['styles/Profile.css',[1024,600]],['styles/AccountPages.css',[600]],['styles/Auth.css',[600,360]],['styles/Help.css',[1000,600]]]) {
        const value=compact(await source(file));for(const width of breakpoints)assert.ok(value.includes(`@media(max-width:${width}px)`),file);
        assert.match(value,/box-sizing:border-box|min-width:0/);
      }
      for(const favorites of [true,false]) assert.match(render(AccountEmpty,{favorites}),/href="\/#home-search"/);
      assert.match(render(AccountLoading,{label:'Загрузка'}),/role="status"/);assert.match(render(AccountError,{title:'Ошибка',onRetry:()=>{}}),/role="alert"/);
      for(const mode of ['login','register']) {
        const html=render(AuthView,{mode,state:{form:{email:'',password:'',full_name:'',phone:'',confirmPassword:''},errors:{},pending:false},actions:{edit:()=>{}}});
        const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length);
        for(const [,id] of html.matchAll(/\bfor="([^"]+)"/g))assert.ok(ids.includes(id));
        assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.match(html,/type="password"/);assert.match(html,/aria-live="polite"/);assert.match(html,/type="submit"/);
        assert.doesNotMatch(html,/offerToken|rateKey|passwordHash|accessToken/);
      }
    });
    await t.test('reduced motion and clarified factual privacy; no new services or URL handling', async () => {
      assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/animation:none!important;transition:none!important;scroll-behavior:auto!important/);
      const privacy=render(HelpView,{topic:'privacy'});
      assert.match(privacy,/не устанавливает сроки хранения данных и не утверждает, что передача данных третьим лицам исключена/);
      assert.doesNotMatch(privacy,/не содержит гарантий о передаче|GDPR/);
      const shell=await source('components/ConsumerShell.jsx');assert.doesNotMatch(shell,/fetch|useEffect|setTimeout|setInterval|navigate|searchParams/);
      assert.equal(http,0);assert.deepEqual(Object.values(counters),[0,0,0,0,0,0]);
    });
    t.diagnostic('Hotelbeds '+JSON.stringify(counters)+'; all HTTP/payment=0. SSR/source/CSS only; behavioral regressions run separately.');
  } finally { await server.close(); }
});
