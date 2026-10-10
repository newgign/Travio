import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
createRequire(import.meta.url)('../../backend/tests/offlineNetwork.cjs');

test('legacy password upgrade transient browser flow', async t => {
  const vite = await createServer({ root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'} });
  const previous = {window:globalThis.window,sessionStorage:globalThis.sessionStorage,localStorage:globalThis.localStorage};
  const saved = new Map();
  const storage = {getItem:key=>saved.get(key)??null,setItem:()=>assert.fail('upgrade must not persist'),removeItem:key=>saved.delete(key)};
  globalThis.window = new EventTarget(); window.location = {href:'/login'};
  globalThis.sessionStorage = storage; globalThis.localStorage = storage;
  const capability = 'SYNTHETIC_UPGRADE_CAPABILITY', requests = [];
  let status = 200, failure = false, hold = false, release;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.method,'POST'); assert.equal(options.redirect,'error'); assert.equal(options.headers.Authorization,undefined);
    requests.push({url,body:JSON.parse(options.body)});
    if(url.endsWith('/auth/login')) return {ok:false,status:409,json:async()=>({code:'PASSWORD_UPDATE_REQUIRED',passwordUpdateToken:capability})};
    assert.ok(url.endsWith('/auth/legacy-password-update'));
    if(hold) await new Promise(resolve=>{release=resolve;});
    if(failure) throw Error('PRIVATE_NETWORK_DETAIL');
    return {ok:status===200,status,json:async()=>({code:'PASSWORD_UPDATED',reauthenticationRequired:true})};
  });
  try {
    const {createAuthFormStore} = await vite.ssrLoadModule('/src/services/authFormStore.js');
    const {AuthView} = await vite.ssrLoadModule('/src/components/AuthPage.jsx');
    const render = store=>renderToStaticMarkup(React.createElement(MemoryRouter,{},React.createElement(AuthView,{mode:'login',state:store.getSnapshot(),actions:store})));
    const fresh = async()=>{
      status=200;failure=false;hold=false;
      const store=createAuthFormStore({mode:'login',onSuccess:()=>assert.fail('upgrade never establishes session')});
      store.edit('email','fixture@example.test');store.edit('password','x'.repeat(80));await store.submit();return store;
    };
    const fill = (store,password='new-password',confirmation=password)=>{store.edit('password',password);store.edit('confirmPassword',confirmation);};
    await t.test('verified409 opens only new/confirm UI and clears old credential',async()=>{
      const store=await fresh(),html=render(store);
      assert.equal(store.getSnapshot().upgrade,true);assert.equal(store.getSnapshot().form.password,'');
      assert.match(html,/Обновить пароль/);assert.match(html,/confirmPassword/);assert.doesNotMatch(html,/auth-email|current-password|x{72}/);
      assert.doesNotMatch(html,new RegExp(capability));assert.doesNotMatch(JSON.stringify(store.getSnapshot()),new RegExp(capability));
      assert.equal(saved.size,0);assert.equal(window.location.href,'/login');
    });
    for(const [password,confirmation] of [['new-password','different'],['short','short'],['a'.repeat(73),'a'.repeat(73)],['é'.repeat(37),'é'.repeat(37)]])
      await t.test(`local validation ${password.length}/${confirmation.length}`,async()=>{const store=await fresh();fill(store,password,confirmation);const count=requests.length;await store.submitUpgrade();assert.equal(requests.length,count);assert.ok(store.getSnapshot().error);});
    await t.test('72UTF8 bytes accepted, only capability+password sent; success clears and requires login',async()=>{
      const store=await fresh();fill(store,'é'.repeat(36));await store.submitUpgrade();
      assert.deepEqual(requests.at(-1).body,{passwordUpdateToken:capability,newPassword:'é'.repeat(36)});
      assert.equal(store.getSnapshot().upgrade,false);assert.equal(store.getSnapshot().form.password,'');assert.match(render(store),/Пароль обновлён|Вход в аккаунт/);
      const count=requests.length;await store.submitUpgrade();assert.equal(requests.length,count);assert.equal(saved.size,0);
    });
    await t.test('cancel discards capability without dispatch',async()=>{const store=await fresh();store.cancelUpgrade();const count=requests.length;await store.submitUpgrade();assert.equal(requests.length,count);assert.equal(store.getSnapshot().upgrade,false);});
    await t.test('expired/invalid401 returns ordinary login and discards capability',async()=>{const store=await fresh();fill(store);status=401;await store.submitUpgrade();assert.equal(store.getSnapshot().upgrade,false);assert.match(store.getSnapshot().error,/истёк/);const count=requests.length;await store.submitUpgrade();assert.equal(requests.length,count);});
    for(const mode of ['network','503']) await t.test(`fixed ${mode} failure no persistence`,async()=>{const store=await fresh();fill(store);failure=mode==='network';status=503;await store.submitUpgrade();assert.equal(store.getSnapshot().upgrade,true);assert.equal(store.getSnapshot().form.password,'');assert.doesNotMatch(render(store),/PRIVATE_|SYNTHETIC_UPGRADE/);assert.equal(saved.size,0);store.cancelUpgrade();});
    await t.test('duplicate submit single request; cancel ignores late result',async()=>{const store=await fresh();fill(store);hold=true;const count=requests.length,first=store.submitUpgrade();assert.equal(store.submitUpgrade(),first);await Promise.resolve();assert.equal(requests.length,count+1);store.cancelUpgrade();release();await first;assert.equal(store.getSnapshot().message,'');assert.equal(store.getSnapshot().upgrade,false);});
    await t.test('unmount clears transient capability',async()=>{const store=await fresh(),disconnect=store.connect();disconnect();const count=requests.length;await store.submitUpgrade();assert.equal(requests.length,count);assert.equal(store.getSnapshot().upgrade,false);});
  } finally { Object.assign(globalThis,previous);await vite.close(); }
});
