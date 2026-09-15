import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fileURLToPath} from 'node:url';
import {createHotelbedsAdminStore} from '../src/services/hotelbedsAdminStore.js';

const plan={scopes:[{scopeId:'AE:DXB',countryCode:'AE',destinationCode:'DXB',label:'Dubai',hotelCount:11,cap:20,remaining:9,state:'READY',nextFrom:12,nextTo:20,nextCount:9,complete:false,manualImportAvailable:true}],totals:{scopes:1,hotels:11,remaining:9},priorityReason:'меньше локально загруженных отелей',contentAccessState:'READY',maxRequestsPerImport:3,cooldown:{state:'READY',remainingMs:0},observed:{today:7,last24h:9,breakdown:{content:{today:5,last24h:6},availability:{today:2,last24h:3},status:{today:0,last24h:0},checkrate:{today:0,last24h:0}}}};
const content={hotels:11,destinations:1,countries:1,limits:{destinations:1,requests:3,retries:0,timeoutMs:12000}};

test('3N rendered planner/preflight explains envelope, unknown quota and blocked/complete states',async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
  try {
    const {ContentPlanView}=await server.ssrLoadModule('/src/components/admin/HotelbedsContentStatus.jsx');
    let imports=0,selections=0;
    const render=p=>renderToStaticMarkup(React.createElement(ContentPlanView,{data:content,plan:p,scopeId:'AE:DXB',onImport:()=>imports++,setScopeId:()=>selections++}));
    const html=render(plan);
    for(const text of ['Dubai','12–20','COUNT: 9','Максимум Content requests: 3','Официальный остаток квоты Hotelbeds неизвестен','НЕ официальный остаток квоты','duplicates','metadata window #2'])assert.ok(html.includes(text),text);
    assert.doesNotMatch(html,/quotaRemaining|safe requests left|50\s*-/);
    for(const state of ['AUTH_BLOCKED','UNKNOWN_BLOCKED']){
      const blocked=render({...plan,contentAccessState:state,scopes:[{...plan.scopes[0],manualImportAvailable:false,unavailableReason:state}]});
      assert.match(blocked,new RegExp('Import unavailable: '+state));assert.match(blocked,/<button type="button" disabled="">Импортировать/);
    }
    const complete=render({...plan,scopes:[{...plan.scopes[0],hotelCount:20,remaining:0,nextCount:0,nextFrom:null,nextTo:null,complete:true,state:'COMPLETE',manualImportAvailable:false,unavailableReason:'COMPLETE'}]});
    assert.match(complete,/<button type="button" disabled="">IMPORT COMPLETE/);assert.match(complete,/Максимум Content requests: 0/);
    assert.equal(imports,0);assert.equal(selections,0);
  } finally {await server.close();}
});

test('3N opening/refreshing sources uses only local GETs; invalid selection cannot import',async()=>{
  const calls=[];
  const store=createHotelbedsAdminStore(async(url,options)=>{calls.push([url,options?.method || 'GET']);return url.endsWith('catalog-plan')?plan:{};});
  assert.equal(calls.length,0);await store.refresh();await store.refresh();await store.importScope('arbitrary');
  assert.equal(calls.length,6);assert.ok(calls.every(([url,method])=>url.startsWith('/admin/providers/hotelbeds/') && method==='GET'));
});

test('3N failure refreshes all sources once without retries; refresh failure disables stale plan',async()=>{
  const calls=[];let failRead=false;
  const store=createHotelbedsAdminStore(async(url,options)=>{
    calls.push([url,options?.method || 'GET']);
    if(options?.method==='POST'){failRead=true;throw Error('offline import failure');}
    if(failRead)throw Error('local DB unavailable');
    return url.endsWith('catalog-plan')?plan:{};
  });
  await store.refresh();await store.importScope('AE:DXB');await store.importScope('AE:DXB');
  assert.equal(calls.filter(([,method])=>method==='POST').length,1);
  assert.equal(calls.filter(([,method])=>method==='GET').length,6);
  assert.equal(store.getSnapshot().plan,null);assert.equal(store.getSnapshot().busy,false);
});

test('3N superseded local refresh cannot overwrite newer persisted data',async()=>{
  const pending=[];let first=true;
  const store=createHotelbedsAdminStore(async url=>{
    if(first)return new Promise(resolve=>pending.push(()=>resolve({old:true})));
    return url.endsWith('catalog-plan')?plan:{fresh:true};
  });
  const old=store.refresh();first=false;await store.refresh();pending.forEach(resolve=>resolve());await old;
  assert.equal(store.getSnapshot().plan,plan);assert.equal(store.getSnapshot().access.fresh,true);
});
