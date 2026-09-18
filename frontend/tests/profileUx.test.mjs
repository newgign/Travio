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

test('3T profile account contract, confirmed edits and session privacy offline', async t => {
  const server = await createServer({ root:fileURLToPath(new URL('..',import.meta.url)), configFile:false, server:{middlewareMode:true,hmr:false}, esbuild:{jsx:'automatic'} });
  const previous = { storage:globalThis.localStorage, window:globalThis.window };
  const memory = new Map([['token','fixture-session']]);
  globalThis.localStorage = { getItem:key=>memory.get(key) ?? null, setItem:(key,value)=>memory.set(key,value), removeItem:key=>memory.delete(key) };
  globalThis.window = new EventTarget();
  window.location = { href:'/profile' };
  let user = { id:987654321, full_name:'Анна Тест', email:'fixture@example.test', phone:'+7 (123) 000', role:'admin', created_at:'2026-01-01', preferred_language:'kk', email_notifications:false, booking_reminders:false, password:'PRIVATE_HASH', token:'PRIVATE_TOKEN' };
  let responseStatus = 200, release = null, hold = false;
  const requests = [];
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const path = new URL(url,'http://localhost').pathname.replace(/^\/api/,'');
    const method = options.method || 'GET';
    assert.ok((path==='/auth/profile' && ['GET','PUT'].includes(method)) || (path==='/auth/password' && method==='PUT'), 'Unexpected request');
    requests.push({path,method,body:options.body ? JSON.parse(options.body) : null});
    const status = responseStatus;
    if (hold) await new Promise(resolve=>{release=resolve;});
    let data = {message:'PRIVATE_SQL_STACK'};
    if(status===200) {
      if(path==='/auth/password') data={message:'Пароль изменён'};
      else if(method==='PUT') {user={...user,...JSON.parse(options.body),full_name:JSON.parse(options.body).full_name.trim()};data={user};}
      else data=user;
    }
    return {ok:status===200,status,text:async()=>JSON.stringify(data)};
  });
  try {
    const {createProfileStore}=await server.ssrLoadModule('/src/services/profileStore.js');
    const {ProfileView}=await server.ssrLoadModule('/src/pages/Profile.jsx');
    const session=await server.ssrLoadModule('/src/services/session.js');
    const presentation=await server.ssrLoadModule('/src/utils/profilePresentation.js');
    const render = store => renderToStaticMarkup(React.createElement(MemoryRouter,{},React.createElement(ProfileView,{state:store.getSnapshot(),actions:store})));
    const fresh = () => createProfileStore({token:'fixture-session'});
    const store=fresh();
    await t.test('load uses only own API, skeleton, allowlisted markup and real fields',async()=>{
      assert.match(render(store),/role="status"/);assert.doesNotMatch(render(store),/fixture@example/);
      await store.load();const html=render(store);
      assert.match(html,/Анна Тест/);assert.match(html,/Администратор/);assert.match(html,/fixture@example.test/);
      assert.doesNotMatch(html,/987654321|PRIVATE_HASH|PRIVATE_TOKEN|Платёжный контур|Удалить аккаунт|type="file"/);
      assert.match(html,/id="profile-email"[^>]*readOnly/i);
      assert.match(html,/href="\/favorites"/);assert.match(html,/href="\/my-bookings"/);
      assert.doesNotMatch(memory.get('user'),/PRIVATE_HASH|PRIVATE_TOKEN/);
      assert.equal(store.getSnapshot().dirty,false);
    });
    await t.test('edit/cancel are local; validation follows controller and schema',async()=>{
      const count=requests.length;store.edit('full_name','');await store.save();
      assert.match(render(store),/aria-invalid="true"/);assert.match(render(store),/Укажите имя/);
      store.edit('phone','changed');store.cancel();assert.equal(store.getSnapshot().draft.phone,user.phone);
      assert.equal(store.getSnapshot().dirty,false);assert.equal(requests.length,count);
      assert.ok(presentation.profileErrors({...store.getSnapshot().draft,phone:'x'.repeat(51)}).phone);
      assert.ok(presentation.profileErrors({...store.getSnapshot().draft,full_name:'x'.repeat(256)}).full_name);
    });
    await t.test('save deduplicates and updates confirmed user/session only after response',async()=>{
      let events=0;const unsubscribe=session.subscribeSession(()=>events++);
      store.edit('full_name','  Новое Имя  ');hold=true;
      const count=requests.length;const first=store.save();const second=store.save();assert.equal(first,second);
      await Promise.resolve();assert.equal(requests.length,count+1);
      assert.equal(store.getSnapshot().user.full_name,'Анна Тест');assert.match(memory.get('user'),/Анна Тест/);
      release();await first;hold=false;
      assert.equal(store.getSnapshot().user.full_name,'Новое Имя');assert.equal(store.getSnapshot().dirty,false);
      assert.match(render(store),/Изменения сохранены/);assert.ok(events>0);
      const current=session.readSession(session.sessionSnapshot()).user;
      assert.equal(presentation.accountName(current),'Новое Имя');
      assert.equal(requests.at(-1).body.email_notifications,false);assert.equal(requests.at(-1).body.booking_reminders,false);
      assert.deepEqual(Object.keys(requests.at(-1).body).sort(),['full_name','phone','preferred_language','email_notifications','booking_reminders'].sort());
      unsubscribe();
    });
    await t.test('4xx/5xx and malformed success retain confirmed data and dirty draft',async()=>{
      for(const status of [400,500]) {
        responseStatus=status;store.edit('full_name','Unsaved');await store.save();
        assert.equal(store.getSnapshot().user.full_name,'Новое Имя');assert.equal(store.getSnapshot().draft.full_name,'Unsaved');assert.equal(store.getSnapshot().dirty,true);
        assert.match(render(store),/Не удалось сохранить изменения/);assert.doesNotMatch(render(store),/PRIVATE_SQL_STACK/);
      }
      responseStatus=200;store.cancel();
      const malformed=createProfileStore({token:'fixture-session',api:{getProfile:async()=>user,updateProfile:async()=>({})}});
      await malformed.load();malformed.edit('full_name','Bad');await malformed.save();assert.equal(malformed.getSnapshot().dirty,true);assert.ok(malformed.getSnapshot().saveError);
    });
    await t.test('real password contract, validation, duplicate submit, safe failure and no storage',async()=>{
      const count=requests.length;await store.savePassword();assert.equal(requests.length,count);
      for(const [key,value] of Object.entries({currentPassword:'fixture-current',newPassword:'fixture-new',confirmPassword:'different'}))store.editPassword(key,value);
      await store.savePassword();assert.equal(requests.length,count);
      store.editPassword('confirmPassword','fixture-new');const first=store.savePassword();assert.equal(first,store.savePassword());await first;
      assert.equal(requests.length,count+1);assert.deepEqual(requests.at(-1).body,{currentPassword:'fixture-current',newPassword:'fixture-new'});
      assert.match(render(store),/Пароль изменён/);assert.equal(store.getSnapshot().password.newPassword,'');
      assert.doesNotMatch([...memory.values()].join(''),/fixture-current|fixture-new/);
      for(const key of ['currentPassword','newPassword','confirmPassword'])store.editPassword(key,'fixture-failed');
      responseStatus=400;await store.savePassword();responseStatus=200;
      assert.match(render(store),/Не удалось изменить пароль/);assert.equal(store.getSnapshot().password.currentPassword,'');
      assert.match(render(store),/aria-label="Показать: Текущий пароль"/);
    });
    await t.test('load failure is retryable; 401 removes data and uses login redirect',async()=>{
      responseStatus=500;const failed=fresh();await failed.load();assert.match(render(failed),/Не удалось загрузить данные профиля/);
      responseStatus=200;await failed.load();assert.equal(failed.getSnapshot().status,'ready');
      responseStatus=401;failed.edit('full_name','Expired');await failed.save();
      assert.equal(memory.get('token'),undefined);assert.equal(failed.getSnapshot().user,null);assert.equal(failed.getSnapshot().draft,null);assert.equal(failed.getSnapshot().status,'auth');
      responseStatus=200;memory.set('token','fixture-session');
    });
    await t.test('old session responses never publish into a new login; logout clears session',async()=>{
      const old=fresh();await old.load();old.edit('full_name','Old reply');hold=true;const saving=old.save();await Promise.resolve();
      memory.set('token','new-session');memory.set('user','{"full_name":"New account"}');release();await saving;hold=false;
      assert.equal(memory.get('user'),'{"full_name":"New account"}');
      memory.set('token','fixture-session');const invalidated=fresh();await invalidated.load();invalidated.editPassword('currentPassword','private');invalidated.invalidate();assert.equal(invalidated.getSnapshot().user,null);assert.equal(invalidated.getSnapshot().password.currentPassword,'');
      const count=requests.length;session.logout();assert.equal(requests.length,count);assert.equal(memory.size,0);assert.equal(window.location.href,'/');
    });
    await t.test('Navbar uses same session label; CSS/a11y/privacy boundaries',async()=>{
      const [page,css,shared,nav]=await Promise.all(['src/pages/Profile.jsx','src/styles/Profile.css','src/styles/AccountPages.css','src/components/Navbar.jsx'].map(path=>readFile(new URL('../'+path,import.meta.url),'utf8')));
      assert.match(nav,/accountName\(user\)/);assert.match(nav,/useSession/);assert.match(nav,/onClick=\{logout\}/);
      assert.match(page,/Navigate to="\/login" replace/);assert.match(page,/aria-live="polite"/);
      assert.doesNotMatch(page,/alert\(|console\.|paymentService|notificationService|getTravelerProfiles|JSON.stringify|URLSearchParams/);
      assert.match(css,/1320px/);assert.match(css,/max-width:1024px/);assert.match(css,/max-width:600px/);assert.match(css,/min-width:0/);assert.match(css,/box-sizing:border-box/);assert.match(shared,/:focus-visible/);
      assert.equal(presentation.accountName({email:'fallback@example.test'}),'fallback@example.test');
      assert.equal(presentation.accountInitials({full_name:'Анна Тест'}),'АТ');
    });
  } finally { globalThis.localStorage=previous.storage;globalThis.window=previous.window;await server.close(); }
});

test('3T real profile/update/password controllers perform DB-only account operations',async t=>{
  const pool=require('../../backend/db');const client=require('../../backend/integrations/hotelbeds/client');const bcrypt=require('../../backend/node_modules/bcryptjs');
  const counters={Availability:0,Content:0,Status:0,CheckRate:0,Booking:0,Cancellation:0};
  for(const method of ['availability','contentHotels','contentHotelDetails','contentDestinations','contentCountries','status','checkRates','createBooking','getBooking','listBookings','cancelBooking']) {
    const key=method==='availability'?'Availability':method.startsWith('content')?'Content':method==='checkRates'?'CheckRate':method==='cancelBooking'?'Cancellation':method==='createBooking'?'Booking':'Status';
    t.mock.method(client,method,async()=>{counters[key]++;throw Error('Forbidden provider');});
  }
  const queries=[];const row={id:7,full_name:'Fixture',email:'fixture@example.test',phone:null,role:'user',password:'private-hash'};
  t.mock.method(pool,'query',async(sql,args)=>{queries.push({sql,args});return {rows:sql.includes('COUNT(*)')?[{total:0}]:[row]};});
  t.mock.method(bcrypt,'compare',async()=>true);t.mock.method(bcrypt,'hash',async()=> 'offline-hash');
  const auth=require('../../backend/controllers/authController');let data;
  const res={json:value=>{data=value;return res;},status:()=>res};
  await auth.profile({user:{id:7}},res);assert.equal(data.full_name,'Fixture');assert.equal(data.password,undefined);
  await auth.updateProfile({user:{id:7},body:{full_name:'Updated',phone:'raw phone',preferred_language:'kk',email_notifications:false,booking_reminders:false}},res);
  assert.ok(queries.some(({args})=>args.length===6 && args[0]==='Updated' && args[5]===7));
  await auth.changePassword({user:{id:7},body:{currentPassword:'fixture-current',newPassword:'fixture-new'}},res);assert.equal(data.message,'Пароль изменён');
  assert.deepEqual(counters,{Availability:0,Content:0,Status:0,CheckRate:0,Booking:0,Cancellation:0});
  t.diagnostic('Hotelbeds counters: '+JSON.stringify(counters));
});
