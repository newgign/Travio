import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const require = createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');

test('3U auth forms, session lifecycle, safe return and app-only HTTP', async t => {
  const server = await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
  const previous={storage:globalThis.localStorage,window:globalThis.window};
  const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  globalThis.window=new EventTarget();window.location={href:'/login'};
  const user={id:987654321,full_name:'Fixture User',email:'fixture@example.test',phone:null,role:'user',password:'PRIVATE_HASH',internal:'PRIVATE_INTERNAL'};
  const requests=[],navigations=[];
  let status=200,body=null,hold=false,release,networkFailure=false;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const path=new URL(url,'http://localhost').pathname.replace(/^\/api/,'');
    assert.ok(['/auth/login','/auth/register'].includes(path));assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,undefined);
    requests.push({path,payload:JSON.parse(options.body),signal:options.signal});
    if(hold)await new Promise(resolve=>{release=resolve;});
    if(networkFailure)throw Error('PRIVATE_NETWORK');
    return {ok:status>=200&&status<300,status,json:async()=>body??(path==='/auth/login'?{user,token:'fixture-token'}:{user,message:'created'})};
  });
  try {
    const {createAuthFormStore}=await server.ssrLoadModule('/src/services/authFormStore.js');
    const {AuthView}=await server.ssrLoadModule('/src/components/AuthPage.jsx');
    const p=await server.ssrLoadModule('/src/utils/authPresentation.js');
    const session=await server.ssrLoadModule('/src/services/session.js');
    const profile=await server.ssrLoadModule('/src/utils/profilePresentation.js');
    const fresh=(mode='login',returnTo='/profile')=>createAuthFormStore({mode,returnTo,onSuccess:(...args)=>navigations.push(args)});
    const fill=(store,mode='login')=>{for(const [key,value] of Object.entries({email:' Fixture@example.test ',password:'fixture-password',...(mode==='register'?{full_name:'Fixture User',phone:'+7 raw',confirmPassword:'fixture-password'}:{})}))store.edit(key,value);};
    const render=(store,mode='login')=>renderToStaticMarkup(React.createElement(MemoryRouter,{},React.createElement(AuthView,{mode,state:store.getSnapshot(),actions:store})));

    await t.test('login/register markup, hidden passwords, labels and no fabricated features',()=>{
      const html=render(fresh());assert.match(html,/Вход в аккаунт/);assert.match(html,/type="password"/);assert.match(html,/autoComplete="current-password"/);
      assert.match(html,/for="auth-email"/);assert.match(html,/href="\/register"/);assert.match(html,/aria-label="Показать: Пароль"/);
      assert.doesNotMatch(html,/PRIVATE_|987654321|JWT|Забыли пароль|Google|Apple|TEST|Бронировать/);
      const registration=render(fresh('register'),'register');assert.match(registration,/Телефон \(необязательно\)/);assert.match(registration,/autoComplete="new-password"/);assert.match(registration,/href="\/login"/);
      assert.deepEqual(p.authFields('register'),['full_name','email','phone','password','confirmPassword']);
    });
    await t.test('validation blocks POST and focus targets first invalid field',async()=>{
      const store=fresh(),count=requests.length;await store.submit();assert.deepEqual(Object.keys(store.getSnapshot().errors),['email','password']);
      store.edit('email','bad-email');store.edit('password','valid');await store.submit();assert.equal(requests.length,count);assert.match(render(store),/aria-invalid="true"/);
      let focused;const form={elements:{namedItem:name=>({focus:()=>{focused=name;}})}};p.focusAuthError(form,store.getSnapshot().errors,'login');assert.equal(focused,'email');
      const register=fresh('register');fill(register,'register');register.edit('password','1234567');register.edit('confirmPassword','different');await register.submit();assert.equal(requests.length,count);
      assert.ok(register.getSnapshot().errors.password);assert.ok(register.getSnapshot().errors.confirmPassword);
      assert.ok(p.authValidation('register',{...register.getSnapshot().form,full_name:'x'.repeat(256),phone:'x'.repeat(51)}).full_name);
    });
    await t.test('one login POST, confirmed allowlisted session, event/Navbar contract, replace return',async()=>{
      const store=fresh();const disconnect=store.connect();fill(store);hold=true;let events=0;const unsubscribe=session.subscribeSession(()=>events++);
      const count=requests.length,first=store.submit();assert.equal(first,store.submit());await Promise.resolve();assert.equal(requests.length,count+1);assert.equal(memory.size,0);
      assert.deepEqual(requests.at(-1).payload,{email:'Fixture@example.test',password:'fixture-password'});
      release();await first;hold=false;
      assert.equal(memory.get('token'),'fixture-token');assert.ok(events>0);assert.doesNotMatch(memory.get('user'),/PRIVATE_|fixture-password/);
      assert.equal(profile.accountName(session.readSession(session.sessionSnapshot()).user),'Fixture User');
      assert.deepEqual(navigations.at(-1),['/profile',{replace:true}]);assert.equal(store.getSnapshot().form.password,'');
      assert.doesNotMatch(render(store),/fixture-token|PRIVATE_HASH/);unsubscribe();disconnect();session.logout();
    });
    await t.test('safe HTTP/network errors and malformed success never replace old session',async()=>{
      memory.set('token','old-token');memory.set('user','{"full_name":"Old"}');
      for(const code of [401,400,500]) {status=code;const store=fresh();fill(store);await store.submit();assert.equal(memory.get('token'),'old-token');assert.match(render(store),/role="alert"/);assert.doesNotMatch(render(store),/PRIVATE_|old-token/);assert.equal(store.getSnapshot().error,p.authError('login',code));}
      status=200;networkFailure=true;const network=fresh();fill(network);await network.submit();assert.equal(network.getSnapshot().error,p.authError('login'));networkFailure=false;
      for(const malformed of [{},{token:'',user},{token:'x',user:{...user,role:'superadmin'}},{token:'x',user:{...user,phone:{secret:'x'}}}]) {body=malformed;const store=fresh();fill(store);await store.submit();assert.ok(store.getSnapshot().error);assert.equal(memory.get('token'),'old-token');}
      body=null;session.logout();
    });
    await t.test('strict return allowlist rejects URLs, encoding, query, fragments and unauthorized admin',()=>{
      for(const path of ['/profile','/favorites','/my-bookings'])assert.equal(p.authReturnPath(path,'user'),path);
      for(const value of ['https://evil.example','//evil.example','javascript:alert(1)','/\\evil','/%2f%2fevil','/profile?email=x','/profile#x','/admin','/admin/bookings','/checkout/hotelbeds/1',{},null])assert.equal(p.authReturnPath(value,'user'),'/');
      assert.equal(p.authReturnPath('/admin','admin'),'/admin');assert.equal(p.authReturnPath('/admin/bookings','admin'),'/admin/bookings');assert.equal(p.authReturnPath(undefined,'admin'),'/');
    });
    await t.test('register validation/409/success uses no session and never sends confirmation/role',async()=>{
      const store=fresh('register','/favorites');fill(store,'register');status=409;await store.submit();assert.equal(store.getSnapshot().error,'Аккаунт с таким email уже существует.');assert.equal(memory.size,0);
      status=201;fill(store,'register');hold=true;const count=requests.length;const first=store.submit();assert.equal(first,store.submit());await Promise.resolve();release();await first;hold=false;
      assert.equal(requests.length,count+1);assert.deepEqual(Object.keys(requests.at(-1).payload).sort(),['email','full_name','password','phone']);
      assert.equal(memory.size,0);assert.deepEqual(navigations.at(-1),['/login',{replace:true,state:{registered:true,returnTo:'/favorites'}}]);
      assert.equal(store.getSnapshot().form.password,'');assert.equal(store.getSnapshot().form.confirmPassword,'');
      body={message:'created'};const malformed=fresh('register');fill(malformed,'register');await malformed.submit();assert.ok(malformed.getSnapshot().error);body=null;status=200;
    });
    await t.test('late login after guest logout, newer login, unmount and register navigation is discarded',async()=>{
      for(const scenario of ['logout','new-login','unmount','register']) {
        const mode=scenario==='register'?'register':'login';const store=fresh(mode);fill(store,mode);hold=true;
        const count=navigations.length;const pending=store.submit();await Promise.resolve();const finishOld=release;
        if(scenario==='logout')session.logout();
        else if(scenario==='new-login'){hold=false;const newer=fresh('login','/my-bookings');fill(newer);await newer.submit();}
        else store.invalidate();
        finishOld();await pending;hold=false;
        assert.equal(navigations.length,count+(scenario==='new-login'?1:0));
        if(scenario!=='new-login')assert.equal(memory.size,0);
        else assert.equal(navigations.at(-1)[0],'/my-bookings');
        session.logout();
      }
      const store=fresh();const disconnect=store.connect();fill(store);hold=true;const pending=store.submit();await Promise.resolve();const finish=release;
      window.dispatchEvent(new Event('storage'));assert.equal(requests.at(-1).signal.aborted,true);finish();await pending;hold=false;assert.equal(memory.size,0);disconnect();
    });
    await t.test('source accessibility/redirect/session wiring and responsive 320–390px contracts',async()=>{
      const [view,css,protectedRoute,account,nav,profilePage,bookings]=await Promise.all(['components/AuthPage.jsx','styles/Auth.css','components/ProtectedRoute.jsx','components/AccountStates.jsx','components/Navbar.jsx','pages/Profile.jsx','pages/MyBookings.jsx'].map(path=>readFile(new URL('../src/'+path,import.meta.url),'utf8')));
      assert.match(view,/focusAuthError\(event.currentTarget/);assert.match(view,/role="alert"/);assert.match(view,/aria-live="polite"/);assert.match(view,/type="button"/);assert.match(view,/aria-pressed=\{visible\}/);
      assert.doesNotMatch(view,/alert\(|console\.|localStorage|JSON.stringify|URLSearchParams/);
      assert.match(protectedRoute,/returnTo: authOrigin\(location.pathname\)/);assert.match(account,/returnTo: authOrigin/);
      assert.match(profilePage,/returnTo: '\/profile'/);assert.match(bookings,/returnTo: '\/my-bookings'/);
      assert.match(nav,/accountName\(user\)/);assert.match(nav,/to="\/register"/);assert.match(nav,/onClick=\{logout\}/);
      for(const rule of [/max-width:500px/,/max-width:1024px/,/max-width:600px/,/max-width:360px/,/min-width:0/,/box-sizing:border-box/,/overflow-wrap:anywhere/,/:focus-visible/])assert.match(css,rule);
    });
  } finally {globalThis.localStorage=previous.storage;globalThis.window=previous.window;await server.close();}
});

test('3U real login/register controllers remain DB/crypto-only with six zero provider counters',async t=>{
  const pool=require('../../backend/db'),client=require('../../backend/integrations/hotelbeds/client');
  const bcrypt=require('../../backend/node_modules/bcryptjs'),jwt=require('../../backend/node_modules/jsonwebtoken');
  const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='offline-auth-fixture-only';
  const counters={status:0,content:0,availability:0,checkrate:0,booking:0,cancellation:0};
  for(const method of ['availability','contentHotels','contentHotelDetails','contentDestinations','contentCountries','status','checkRates','createBooking','getBooking','listBookings','cancelBooking']) {
    const key=method==='availability'?'availability':method.startsWith('content')?'content':method==='checkRates'?'checkrate':method==='cancelBooking'?'cancellation':method==='createBooking'?'booking':'status';
    t.mock.method(client,method,async()=>{counters[key]++;throw Error('Forbidden provider');});
  }
  const row={id:7,full_name:'Fixture',email:'fixture@example.test',role:'user',password:'PRIVATE_HASH'};
  let duplicate=false,valid=true;const queries=[];
  t.mock.method(pool,'query',async(sql,args)=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT id FROM users')?(duplicate?[{id:7}]:[]):[row]};});
  t.mock.method(bcrypt,'compare',async()=>valid);t.mock.method(bcrypt,'hash',async()=> 'offline-hash');t.mock.method(jwt,'sign',()=> 'fixture-token');
  const auth=require('../../backend/controllers/authController');let data,status=200;
  const res={json:value=>{data=value;return res;},status:value=>{status=value;return res;}};
  try {
    await auth.login({body:{email:' Fixture@example.test ',password:'fixture-password'}},res);assert.equal(data.token,'fixture-token');assert.equal(data.user.password,undefined);assert.equal(queries.at(-1).args[0],'fixture@example.test');
    valid=false;await auth.login({body:{email:'fixture@example.test',password:'bad'}},res);assert.equal(status,401);assert.equal(data.message,'Неверный email или пароль');
    await auth.register({body:{full_name:'Fixture',email:'fixture@example.test',phone:'raw',password:'1234567'}},res);assert.equal(status,400);
    duplicate=true;await auth.register({body:{full_name:'Fixture',email:'fixture@example.test',password:'fixture-password'}},res);assert.equal(status,409);
    duplicate=false;await auth.register({body:{full_name:'Fixture',email:'fixture@example.test',phone:'raw',password:'fixture-password',role:'admin'}},res);assert.equal(status,201);assert.equal(data.token,undefined);assert.equal(data.user.role,'user');assert.equal(queries.at(-1).args.length,4);
    assert.deepEqual(counters,{status:0,content:0,availability:0,checkrate:0,booking:0,cancellation:0});t.diagnostic('Hotelbeds counters: '+JSON.stringify(counters));
  } finally {if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});
