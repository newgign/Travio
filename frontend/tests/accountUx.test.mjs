import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const require = createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');

test('3S saved account UX and app-only data operations', async t => {
  const server = await createServer({ root:fileURLToPath(new URL('..',import.meta.url)), configFile:false,
    server:{middlewareMode:true,hmr:false}, esbuild:{jsx:'automatic'} });
  const memory = new Map([['token','offline-session'],['user','{"id":7}']]);
  const oldStorage = globalThis.localStorage, oldWindow = globalThis.window;
  globalThis.localStorage = {getItem:key=>memory.get(key) ?? null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  globalThis.window = new EventTarget();
  const requests = [];
  let favoriteFailure = false, bookingFailure = false, removeFailure = false, unauthorized = false, deleted = false;
  const favorite = {provider:'hotelbeds',providerHotelId:'101',name:'Saved hotel',country:'AE',city:'DUBAI',destinationCode:'DXB',stars:5,
    price:420.91,currency:'EUR',roomName:'Stored Room',boardCode:'BB',observedAt:'2020-01-01T00:00:00Z',
    offerToken:'DO_NOT_RENDER_TOKEN',rateKey:'DO_NOT_RENDER_RATE'};
  const booking = {id:12,provider:'hotelbeds',provider_hotel_id:'101',hotel:'Saved booking hotel',country:'AE',city:'DUBAI',
    booking_date:'2030-09-01T10:00:00Z',status:'Новая',provider_status:'local_pending',total_amount:'1139.95',currency:'EUR',
    price:99999,people:2,offer_snapshot:{checkIn:'2030-09-28',checkOut:'2030-10-05',nights:7,adults:2,children:0,
      boardCode:'FB',roomName:'Stored CLASSIC',priceEnvironment:'test',rateKey:'DO_NOT_RENDER_RATE'},
    payment_status:'paid',payment_external_id:'DO_NOT_RENDER_PAYMENT'};
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const path=new URL(url,'http://localhost').pathname.replace(/^\/api/,'');
    const method=options.method || 'GET';
    requests.push([method,path]);
    let status=200,data;
    if(unauthorized) {status=401;data={code:'AUTH_REQUIRED',message:'PRIVATE_ERROR_STACK'};}
    else if(path==='/favorites' && method==='GET') {
      status=favoriteFailure?500:200;data=favoriteFailure?{message:'PRIVATE_ERROR_STACK'}:{success:true,data:deleted?[]:[favorite]};
    } else if(path==='/favorites/hotelbeds/101' && method==='DELETE') {
      status=removeFailure?500:200;data={success:!removeFailure};if(!removeFailure)deleted=true;
    } else if(path==='/bookings/me' && method==='GET') {
      status=bookingFailure?500:200;data=bookingFailure?{message:'PRIVATE_ERROR_STACK'}:[booking];
    } else throw Error('Forbidden network path: '+method+' '+path);
    return {ok:status<400,status,text:async()=>JSON.stringify(data)};
  });
  const render = element => renderToStaticMarkup(React.createElement(MemoryRouter,{},element));
  try {
    const {FavoritesView}=await server.ssrLoadModule('/src/pages/Favorites.jsx');
    const {MyBookingsView}=await server.ssrLoadModule('/src/pages/MyBookings.jsx');
    const {default:Card}=await server.ssrLoadModule('/src/components/PersistedBookingCard.jsx');
    const {createAccountListStore}=await server.ssrLoadModule('/src/services/accountListStore.js');
    const api=await server.ssrLoadModule('/src/services/savedAccountData.js');
    const p=await server.ssrLoadModule('/src/utils/savedAccountPresentation.js');
    const {hotelCount}=await server.ssrLoadModule('/src/utils/resultsPresentation.js');
    const store = loadData => createAccountListStore({loadData,ownerToken:'offline-session',readToken:()=>memory.get('token')});
    const renderFavorites = (state,extra={}) => render(React.createElement(FavoritesView,{favorites:state.items,status:state.status,...extra}));
    const renderBookings = (state,extra={}) => render(React.createElement(MyBookingsView,{bookings:state.items,status:state.status,...extra}));

    await t.test('saved price and own GET/DELETE never create a current offer or provider resolver',async()=>{
      const favorites=store(api.readFavorites);await favorites.load();
      const html=renderFavorites(favorites.getSnapshot());
      assert.match(html,/Сохранённые отели для будущих поездок/);assert.match(html,/Сохранено 1 отель/);
      assert.match(html,/Последняя сохранённая цена/);assert.match(html,/420,91/);
      assert.match(html,/Сохранённый вариант/);assert.match(html,/Stored Room/);assert.match(html,/Завтрак/);
      assert.doesNotMatch(html,/Актуальная цена|DO_NOT_RENDER|\/tour\/|selectedOffer|Бронировать/);
      assert.match(html,/Посмотреть отель/);assert.match(html,/#home-search/);
      assert.match(html,/aria-label="Удалить из избранного: Saved hotel"/);
      const link=p.savedSearchLink(favorite);assert.equal(link.includes('2020'),false);assert.equal(link.includes('420'),false);
      await favorites.mutate(api.favoriteKey(favorite),()=>api.removeSavedFavorite(favorite),items=>items.filter(item=>api.favoriteKey(item)!==api.favoriteKey(favorite)));
      assert.equal(favorites.getSnapshot().items.length,0);
      assert.deepEqual(requests.slice(-2),[['GET','/favorites'],['DELETE','/favorites/hotelbeds/101']]);
      assert.equal(hotelCount(2),'2 отеля');assert.equal(hotelCount(5),'5 отелей');
      deleted=false;
    });

    await t.test('failed remove keeps row, retry succeeds, duplicate pending remove is one DELETE',async()=>{
      const favorites=store(api.readFavorites);await favorites.load();
      removeFailure=true;
      await assert.rejects(()=>favorites.mutate('hotelbeds:101',()=>api.removeSavedFavorite(favorite),()=>[]));
      assert.equal(favorites.getSnapshot().items.length,1);assert.deepEqual(favorites.getSnapshot().pending,[]);
      removeFailure=false;
      let release,actions=0;
      const action=async()=>{actions++;await new Promise(resolve=>{release=resolve;});return api.removeSavedFavorite(favorite);};
      const first=favorites.mutate('hotelbeds:101',action,()=>[]);
      const second=favorites.mutate('hotelbeds:101',action,()=>[]);
      await Promise.resolve();
      assert.equal(first,second);assert.equal(actions,1);assert.equal(favorites.getSnapshot().items.length,1);
      release();await first;assert.equal(favorites.getSnapshot().items.length,0);deleted=false;
    });

    await t.test('bookings own GET, persisted details and local filtering/sorting issue no extra HTTP',async()=>{
      const bookings=store(api.readBookings);await bookings.load();const count=requests.length;
      const html=renderBookings(bookings.getSnapshot());
      assert.match(html,/Мои бронирования/);assert.match(html,/Ваши заявки/);assert.match(html,/Заявка создана/);
      assert.match(html,/Тестовая запись/);assert.match(html,/Сумма заявки/);assert.match(html,/1\s*139,95/);
      assert.match(html,/<details class="booking-persisted-details"><summary>Детали/);
      assert.match(html,/Stored CLASSIC/);assert.match(html,/Полный пансион/);
      assert.doesNotMatch(html,/DO_NOT_RENDER|99\s*999|Оплачено|Синхронизировать|Отменить через|\/provider\/|\/voucher/);
      const rows=[booking,{...booking,id:13,booking_date:'2030-10-01',provider_status:'CANCELLED'},{...booking,id:14,provider_status:'confirmation_unknown'},
        {...booking,id:15,provider_status:'CONFIRMED'},{...booking,id:16,provider_status:'RATE_EXPIRED'}];
      const source=JSON.stringify(rows);
      assert.equal(p.sortedBookings(rows)[0].id,13);
      assert.deepEqual(p.sortedBookings(rows,'cancelled').map(x=>x.id),[13]);
      assert.deepEqual(p.sortedBookings(rows,'other').map(x=>x.id),[16]);
      assert.equal(p.sortedBookings(rows,'active').length,3);assert.equal(JSON.stringify(rows),source);
      const filtered=renderBookings({items:rows,status:'ready'});assert.match(filtered,/Фильтры записей/);
      assert.doesNotMatch(html,/Фильтры записей/);
      assert.equal(requests.length,count);
    });

    await t.test('every actual local/provider status and unknown use explicit consumer semantics',()=>{
      const locals={'Новая':'На рассмотрении','Подтверждена':'Подтверждено','Отменена':'Отменено'};
      const providers={LOCAL_PENDING:'Заявка создана',CONFIRMING:'Ожидает подтверждения',CONFIRMATION_UNKNOWN:'Требует сверки',
        CONFIRMATION_FAILED:'Не подтверждено',RATE_EXPIRED:'Тариф недоступен',CONFIRMED:'Подтверждено',MODIFIED:'Подтверждено с изменениями',CANCELLED:'Отменено',CANCELED:'Отменено'};
      assert.deepEqual(Object.keys(p.localBookingStatuses).sort(),Object.keys(locals).sort());
      assert.deepEqual(Object.keys(p.providerBookingStatuses).sort(),Object.keys(providers).sort());
      for(const [status,label] of Object.entries(locals))assert.equal(p.bookingStatus({provider:'legacy',status}).label,label);
      for(const [status,label] of Object.entries(providers)){
        const row={...booking,status:'Подтверждена',provider_status:status.toLowerCase()};
        assert.equal(p.bookingStatus(row).label,label);
        assert.ok(render(React.createElement(Card,{booking:row})).includes(label));
      }
      assert.equal(p.bookingStatus({...booking,status:'Подтверждена',provider_status:'UNRECOGNIZED'}).label,'Статус неизвестен');
      assert.equal(p.bookingStatus({status:'PENDING'}).label,'Статус неизвестен');
      assert.equal(p.bookingStatus({status:'REFUNDED'}).label,'Статус неизвестен');
      assert.equal(p.bookingStatus({status:'__proto__'}).label,'Статус неизвестен');
      assert.equal(p.refundLabel({refund_status:'constructor'}),'');
      assert.equal(p.refundLabel({refund_status:'not_requested'}),'');
      assert.match(p.refundLabel({refund_status:'refunded',gateway_provider:'sandbox'}),/без движения денег/);
    });

    await t.test('amount uses persisted total/quote, TEST only with evidence, unknown amounts are absent',()=>{
      assert.equal(p.bookingAmount({...booking,total_amount:null,quoted_amount:null}),null);
      assert.equal(p.bookingAmount({...booking,total_amount:null,quoted_amount:'420.91',quoted_currency:'EUR'}).label,'Сумма при создании заявки');
      assert.equal(p.bookingAmount({...booking,currency:null}),null);
      assert.equal(p.testBooking({provider:'hotelbeds'}),false);
      assert.equal(p.testBooking({provider:'legacy'}),false);
      assert.equal(p.testBooking({provider:'mock'}),true);
      assert.equal(p.testBooking({gateway_provider:'sandbox'}),true);
      assert.equal(p.testBooking({provider:'hotelbeds',payment_status:'test'}),true);
      const html=render(React.createElement(Card,{booking:{...booking,total_amount:null,offer_snapshot:{},provider_status:'UNKNOWN'}}));
      assert.doesNotMatch(html,/Тестовая запись|1\s*139,95|99\s*999|Оплачено/);assert.match(html,/Статус неизвестен/);
    });

    await t.test('empty, loading, errors and auth are separate; retries are app-only',async()=>{
      const count=requests.length;
      for(const [view,items] of [[FavoritesView,'favorites'],[MyBookingsView,'bookings']]){
        const empty=render(React.createElement(view,{[items]:[],status:'ready'}));
        assert.match(empty,items==='favorites'?/В избранном пока ничего нет/:/У вас пока нет бронирований/);
        assert.match(empty,/href="\/#home-search"/);assert.match(empty,/Найти отели/);
        const loading=render(React.createElement(view,{[items]:[],status:'loading'}));assert.match(loading,/role="status"/);assert.match(loading,/account-skeleton/);
        const auth=render(React.createElement(view,{[items]:[],status:'auth'}));assert.match(auth,/Войдите в аккаунт/);assert.doesNotMatch(auth,/пока ничего нет|пока нет бронирований/);
      }
      assert.equal(requests.length,count);
      const favorites=store(api.readFavorites);await favorites.load();favoriteFailure=true;await favorites.load();
      assert.equal(favorites.getSnapshot().status,'error');assert.equal(favorites.getSnapshot().items.length,0);
      const error=renderFavorites(favorites.getSnapshot(),{onRetry:favorites.load});assert.match(error,/role="alert"/);assert.match(error,/Не удалось загрузить избранное/);
      assert.doesNotMatch(error,/PRIVATE_ERROR_STACK|Saved hotel/);favoriteFailure=false;await favorites.load();assert.equal(favorites.getSnapshot().status,'ready');
      const bookings=store(api.readBookings);bookingFailure=true;await bookings.load();
      assert.match(renderBookings(bookings.getSnapshot()),/Не удалось загрузить бронирования/);bookingFailure=false;
      const authStore=store(async()=>{throw Object.assign(Error('private'),{code:'AUTH_REQUIRED'});});
      await authStore.load();assert.equal(authStore.getSnapshot().status,'auth');
      unauthorized=true;await favorites.load();assert.equal(memory.has('token'),false);
      unauthorized=false;memory.set('token','offline-session');memory.set('user','{"id":7}');
    });

    await t.test('old session responses cannot populate, remove from, or log out a newer session',async()=>{
      let finish;
      const old=store(()=>new Promise(resolve=>{finish=resolve;}));const load=old.load();
      await Promise.resolve();
      memory.set('token','new-session');finish([favorite]);await load;assert.equal(old.getSnapshot().items.length,0);
      memory.set('token','offline-session');
      const favorites=store(api.readFavorites);await favorites.load();
      let reject;
      const remove=favorites.mutate('hotelbeds:101',()=>new Promise((resolve,fail)=>{reject=fail;}),()=>[]);
      await Promise.resolve();
      memory.set('token','new-session');reject(Object.assign(Error('AUTH_REQUIRED'),{status:401}));await remove;
      assert.equal(favorites.getSnapshot().items.length,1);assert.equal(memory.get('token'),'new-session');
      memory.set('token','offline-session');
      const stale=store(()=>new Promise(resolve=>{finish=resolve;}));const pending=stale.load();await Promise.resolve();stale.invalidate();finish([favorite]);await pending;
      assert.equal(stale.getSnapshot().items.length,0);
      const guest=createAccountListStore({loadData:()=>{throw Error('Must not load');},ownerToken:null,readToken:()=>null});
      await guest.load();assert.equal(guest.getSnapshot().status,'guest');
    });

    await t.test('late initial list cannot resurrect removal; synchronous failures remain retryable',async()=>{
      let finish,loads=0;
      const favorites=store(()=>{loads++;return loads===1 ? new Promise(resolve=>{finish=resolve;}) : Promise.resolve([]);});
      const initial=favorites.load();await Promise.resolve();
      await favorites.mutate('hotelbeds:101',async()=>({success:true}),()=>[]);
      finish([favorite]);await initial;await favorites.load();
      assert.equal(favorites.getSnapshot().status,'ready');assert.equal(favorites.getSnapshot().items.length,0);
      let fail=true;
      const retry=store(()=>{if(fail)throw Error('failure');return [];});
      await retry.load();assert.equal(retry.getSnapshot().status,'error');fail=false;await retry.load();assert.equal(retry.getSnapshot().status,'ready');
    });

    await t.test('a session change before dispatch prevents mutation under a new account',async()=>{
      const favorites=store(async()=>[favorite]);await favorites.load();let actions=0;
      const operation=favorites.mutate('hotelbeds:101',async()=>{actions++;},()=>[]);
      memory.set('token','different-account');await operation;
      assert.equal(actions,0);memory.set('token','offline-session');
    });

    await t.test('SSR/CSS contracts, no dangerous action imports and no secret/raw display',async()=>{
      const root=new URL('../src/',import.meta.url);
      const [favorites,bookings,card,context,nav,css,favCss,bookingCss]=await Promise.all([
        'pages/Favorites.jsx','pages/MyBookings.jsx','components/PersistedBookingCard.jsx','context/FavoritesContext.jsx','components/Navbar.jsx',
        'styles/AccountPages.css','styles/Favorites.css','styles/MyBookings.css',
      ].map(path=>readFile(new URL(path,root),'utf8')));
      assert.doesNotMatch(favorites,/TourCard|toggleFavorite/);
      assert.doesNotMatch(bookings+card,/syncProviderBooking|cancelProviderBooking|simulateProviderCancellation|confirmProviderBooking|downloadBookingVoucher|selectedOfferSnapshot/);
      assert.doesNotMatch(card,/JSON.stringify|offerToken|rateKey|payment_external_id/);
      assert.match(context,/removeSavedFavorite/);assert.match(nav,/favoritesKnown \? favorites.length : 0/);
      assert.match(css,/1320px/);assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/:focus-visible/);
      assert.match(favCss,/repeat\(3,minmax\(0,1fr\)\)/);assert.match(favCss,/@media\(max-width:700px\)/);
      assert.match(bookingCss,/@media\(max-width:800px\)/);assert.match(bookingCss,/grid-template-columns:minmax\(0,1fr\)/);
      const protectedRoute=await readFile(new URL('components/ProtectedRoute.jsx',root),'utf8');
      assert.match(protectedRoute,/Navigate to="\/login" replace/);
      const allowed=new Set(['GET /favorites','DELETE /favorites/hotelbeds/101','GET /bookings/me']);
      assert.ok(requests.every(([method,path])=>allowed.has(method+' '+path)));
    });
  } finally {
    globalThis.localStorage=oldStorage;globalThis.window=oldWindow;await server.close();
  }
});

test('3S actual read/delete controllers are DB-only and scoped to authenticated user',async t=>{
  const pool=require('../../backend/db');
  const client=require('../../backend/integrations/hotelbeds/client');
  const providerCalls={Availability:0,Content:0,Status:0,CheckRate:0,Booking:0,Cancellation:0};
  for(const method of ['availability','checkRates','contentHotels','contentHotelDetails','contentDestinations','contentCountries','status','createBooking','getBooking','listBookings','cancelBooking']) {
    const category=method==='availability'?'Availability':method.startsWith('content')?'Content':method==='checkRates'?'CheckRate':method==='cancelBooking'?'Cancellation':method==='createBooking'?'Booking':'Status';
    t.mock.method(client,method,async()=>{providerCalls[category]++;throw Error('Forbidden provider');});
  }
  const statements=[];
  t.mock.method(pool,'query',async(sql,args)=>{
    statements.push([sql,args]);
    if(sql.includes('DELETE FROM favorites'))return {rows:[{id:1}]};
    if(sql.includes('FROM favorites'))return {rows:[{id:1,provider:'hotelbeds',provider_hotel_id:'101',hotel_data:{name:'Stored',price:420.91,currency:'EUR'},created_at:'2030-01-01'}]};
    return {rows:[{id:2,status:'Новая'}]};
  });
  const favorites=require('../../backend/controllers/favoriteController');
  const bookings=require('../../backend/controllers/bookingController');
  let result;
  const res={json:value=>{result=value;return res;},status:()=>res};
  await favorites.getFavorites({user:{id:7}},res);assert.equal(result.data[0].price,420.91);
  await favorites.deleteFavorite({user:{id:7},params:{provider:'hotelbeds',hotelId:'101'}},res);assert.equal(result.success,true);
  await bookings.getMyBookings({user:{id:7}},res);assert.equal(result[0].status,'Новая');
  assert.equal(statements.length,3);assert.ok(statements.every(([,args])=>args[0]===7));
  assert.deepEqual(providerCalls,{Availability:0,Content:0,Status:0,CheckRate:0,Booking:0,Cancellation:0});
  t.diagnostic('Hotelbeds counters: '+JSON.stringify(providerCalls));
});
