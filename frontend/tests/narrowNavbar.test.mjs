import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import postcss from 'postcss';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const require=createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');
const source=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');

// Deliberately limited cascade evaluator: exact class selectors for the top shortcut.
// This verifies the real conflicting declarations, not browser layout geometry.
function shortcutDisplay(styles,width,kind='desktop-icon') {
  const selectors=new Set(['.icon-btn','.desktop-icon','.desktop-user','.user-box',`.consumer-shell .navbar .nav-right > .${kind}`]);
  let winner={specificity:-1,value:undefined};
  for(const css of styles)postcss.parse(css).walkRules(rule=>{
    for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule') {
      if(parent.name!=='media')return;
      const min=parent.params.match(/min-width:\s*(\d+)px/),max=parent.params.match(/max-width:\s*(\d+)px/);
      if(!min&&!max)return;
      if(min&&width<Number(min[1])||max&&width>Number(max[1]))return;
    }
    for(const selector of rule.selectors) {
      if(!selectors.has(selector))continue;
      if(kind==='desktop-user'&&/icon/.test(selector)||kind==='desktop-icon'&&/user/.test(selector))continue;
      const specificity=(selector.match(/\./g)||[]).length;
      rule.walkDecls('display',decl=>{if(specificity>=winner.specificity)winner={specificity,value:decl.value};});
    }
  });
  return winner.value;
}

test('3W.1 narrow Navbar regression, offline CSS and real component SSR',async t=>{
  let http=0;
  t.mock.method(globalThis,'fetch',async()=>{http++;throw Error('HTTP/provider/payment forbidden');});
  const client=require('../../backend/integrations/hotelbeds/client');
  const counters={status:0,content:0,availability:0,checkrate:0,booking:0,cancellation:0};
  for(const [key,methods] of Object.entries({status:['status','getBooking','listBookings'],content:['contentHotels','contentHotelDetails','contentDestinations','contentCountries'],availability:['availability'],checkrate:['checkRates'],booking:['createBooking'],cancellation:['cancelBooking']}))for(const method of methods)t.mock.method(client,method,async()=>{counters[key]++;throw Error('Forbidden provider');});
  const [nav,consumer,admin,jsx]=await Promise.all(['styles/Navbar.css','styles/Consumer.css','styles/admin.css','components/Navbar.jsx'].map(source));
  await t.test('320/360 override global icon display; wider layouts receive no new declarations',()=>{
    const ast=postcss.parse(consumer),narrow=[];
    ast.walkAtRules('media',rule=>{if(rule.params.replace(/\s/g,'')==='(max-width:360px)'){narrow.push(rule.toString());rule.remove();}});
    assert.equal(narrow.length,1);
    const before=ast.toString();
    for(const width of [320,360]) {
      assert.equal(shortcutDisplay([nav,before,admin],width),'flex','reproduces global admin collision');
      for(const styles of [[nav,consumer,admin],[admin,nav,consumer]]) {
        assert.equal(shortcutDisplay(styles,width),'none');
        assert.equal(shortcutDisplay(styles,width,'desktop-user'),'none');
      }
    }
    for(const width of [375,390,400,440,768,1440])for(const kind of ['desktop-icon','desktop-user'])assert.equal(shortcutDisplay([nav,consumer,admin],width,kind),shortcutDisplay([nav,before,admin],width,kind));
    const fix=narrow[0].replace(/\s+/g,'');
    assert.match(fix,/\.nav-toggle\{display:inline-flex;flex:0044px;min-width:44px;min-height:44px/);
    assert.doesNotMatch(fix,/transform|margin|overflow|font-size|\.logo/);
    assert.match(consumer,/visibility:hidden; opacity:0; pointer-events:none/);
    assert.match(consumer,/\.nav-menu.open \{ visibility:visible/);
  });
  const virtual='\0narrow-navbar-fixture';
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'},plugins:[{
    name:'navbar-own-state-fixture',enforce:'pre',
    resolveId(id){if(id===virtual||id==='../hooks/useSession'||id==='../context/FavoritesContext')return virtual;},
    load(id){if(id===virtual)return 'export const fixture={user:null}; export default function useSession(){return fixture;} export function useFavorites(){return {favorites:[],favoritesKnown:true};}';}
  }]});
  try {
    const {default:Navbar}=await server.ssrLoadModule('/src/components/Navbar.jsx');
    const {fixture}=await server.ssrLoadModule(virtual);
    await t.test('guest/user/admin retain menu routes and actions, unique control ID, no positive tabindex',()=>{
      for(const role of [null,'user','admin']) {
        fixture.user=role?{id:7,role,full_name:'Длинное имя '.repeat(20),email:'fixture@example.test'}:null;
        const html=renderToStaticMarkup(React.createElement(MemoryRouter,{},React.createElement(Navbar)));
        const menu=html.match(/<nav\b[\s\S]*?<\/nav>/)[0];
        for(const path of ['/','/results','/#countries','/#home-search','/contacts','/favorites','/my-bookings'])assert.ok(menu.includes(`href="${path}"`),path);
        assert.equal(menu.includes('href="/profile"'),Boolean(role));
        assert.equal(menu.includes('href="/admin"'),role==='admin');
        assert.equal(menu.includes('Выйти'),Boolean(role));
        for(const path of ['/login','/register'])assert.equal(menu.includes(`href="${path}"`),!role);
        const id=menu.match(/id="([^"]+)"/)[1];assert.ok(html.includes(`aria-controls="${id}"`));
        assert.match(html,/class="nav-toggle "[^>]*aria-expanded="false"/);
        assert.doesNotMatch(html,/tabindex="[1-9]/i);
        assert.equal((html.match(/class="nav-toggle /g)||[]).length,1);
      }
      assert.match(jsx,/event.key === 'Escape'/);assert.match(jsx,/toggleRef.current\?\.focus\(\)/);assert.match(jsx,/onClick=\{logout\}/);
    });
  } finally {await server.close();}
  assert.equal(http,0);assert.deepEqual(Object.values(counters),[0,0,0,0,0,0]);
  t.diagnostic('Hotelbeds '+JSON.stringify(counters)+'; HTTP/payment=0. Width coverage is CSS/source, not browser measurements.');
});
